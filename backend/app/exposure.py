"""POST /exposure: how much the week's maintenance could cost if the GPU price moves against you.

Re-costs the SAME schedule (optimized or ASAP) at the forecast's low and high daily prices. The price
band is from real GetDeploying volatility (app/market.py); SLA, failure-risk and overheat rates are
ASSUMED (config.py). Nothing here changes the planner or its numbers.
"""
import threading
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from . import planner, prices, stubs
from .schemas import Mode

router = APIRouter(tags=["exposure"])
_LOCK = threading.Lock()

LABELS = {"market": "GPU price risk (real price band)", "contract": "SLA credits (ASSUMED rate)",
          "failure": "risk of waiting (ASSUMED)", "overheat": "overheat outages (ASSUMED rate)"}


class ExposureRequest(BaseModel):
    mode: Mode = "cloud"


def _recost(plan, tasks, mode: str, key: str) -> float:
    with _LOCK:
        orig = prices.DAILY_PRICE[:]
        try:
            prices.DAILY_PRICE[:] = [f[key] for f in prices.FORECAST]
            return sum(prices.slot_cost(tasks[i.task_id], i.start_hour, mode).total for i in plan.items)
        finally:
            prices.DAILY_PRICE[:] = orig


def exposure(mode: str = "cloud") -> dict[str, Any]:
    tasks_list = stubs.seeded_backlog()
    tasks = {t.id: t for t in tasks_list}
    out = {}
    for strategy in ("optimized", "asap"):
        plan = planner.make_plan(tasks_list, mode, strategy)
        expected = sum(i.total for i in plan.items)
        low, high = _recost(plan, tasks, mode, "low"), _recost(plan, tasks, mode, "high")
        out[strategy] = {
            "expected": round(expected, 2), "price_low": round(low, 2), "price_high": round(high, 2),
            "price_exposure": round(high - expected, 2), "overheat_cost": round(plan.overheat_cost, 2),
            "worst_case": round(high + plan.overheat_cost, 2),
            "breakdown": {"market": round(sum(i.downtime_cost for i in plan.items), 2),
                          "contract": round(sum(i.sla_cost for i in plan.items), 2),
                          "failure": round(sum(i.risk_cost for i in plan.items), 2),
                          "overheat": round(plan.overheat_cost, 2)},
            "labels": LABELS,
        }
    return {"mode": mode, "simulated_week": True, "plans": out}


@router.post("/exposure")
def post_exposure(req: ExposureRequest | None = None) -> dict[str, Any]:
    return exposure((req or ExposureRequest()).mode)
