"""Price curve + cost model: GET /prices, GET /cost. Owner: Loki (took over Fawaz's lane).

Source of truth for prices, utilization and `slot_cost`; app/stubs.py re-exports these names so
the planner (`from .stubs import ... slot_cost`) is unchanged. Every number is ASSUMED or SEEDED
(see config.py / HACK.md "Assumptions"), not real data.

Cost of running `task` from `start_hour` (all $):
    planned   = downtime + sla
      downtime = sum over task hours of GPUs_offline x utilization(hour) x price(day)
      sla      = downtime x CONTRACTED_SHARE x SLA_PENALTY      (cloud mode only; 0 in private)
    p         = min(1, risk_growth_per_day x days waited since Mon 00:00)
    unplanned = planned_reference x UNPLANNED_COST_MULTIPLIER x (1 + EMERGENCY_PREMIUM)
      planned_reference = the same task at week-average price x utilization
    expected  = (1 - p) x planned + p x unplanned
              = planned + risk,   with   risk = p x (unplanned - planned)
So downtime + sla + risk == expected cost (no double counting of the planned work).
"""
import random
from dataclasses import dataclass

from fastapi import APIRouter, HTTPException

from .config import (CONTRACTED_SHARE, DAILY_BAND, DAILY_PRICE, EMERGENCY_PREMIUM, GPU_TYPE,
                     GPUS_PER_RACK, HORIZON_DAYS, HOURS, SEED, SLA_PENALTY, UNPLANNED_COST_MULTIPLIER,
                     UTIL_BAND, UTIL_DIP)
from .schemas import CostBreakdown as CostResponse
from .schemas import Mode, Task

router = APIRouter(tags=["prices"])

PRICE_BAND = DAILY_BAND


# ---- prices ------------------------------------------------------------------
def price(day: int) -> float:
    return DAILY_PRICE[day]


def prices(days: int = HORIZON_DAYS) -> list[dict]:
    """Daily forecast with +/- band. Keys match what main.py's /prices and the frontend use."""
    return [
        {"day": d, "gpu": GPU_TYPE, "price": DAILY_PRICE[d],
         "low": round(DAILY_PRICE[d] * (1 - PRICE_BAND), 3),
         "high": round(DAILY_PRICE[d] * (1 + PRICE_BAND), 3)}
        for d in range(max(0, min(days, len(DAILY_PRICE))))
    ]


# ---- utilization -------------------------------------------------------------
def _seeded_utilization() -> list[float]:
    """Hourly share of GPUs busy: UTIL_BAND with short UTIL_DIP dips at job boundaries (seeded)."""
    rng = random.Random(SEED)
    util = [round(rng.uniform(*UTIL_BAND), 3) for _ in range(HOURS)]
    hour = rng.randint(3, 9)
    while hour < HOURS:
        for h in range(hour, min(hour + rng.randint(2, 4), HOURS)):
            util[h] = round(rng.uniform(*UTIL_DIP), 3)
        hour += rng.randint(8, 16)
    return util


UTILIZATION = _seeded_utilization()


def utilization(hour: int) -> float:
    return UTILIZATION[hour]


# ---- cost model --------------------------------------------------------------
@dataclass(frozen=True)
class CostBreakdown:
    downtime: float
    sla: float
    risk: float

    @property
    def total(self) -> float:
        return self.downtime + self.sla + self.risk


def _sla_factor(mode: Mode) -> float:
    return CONTRACTED_SHARE * SLA_PENALTY if mode == "cloud" else 0.0


def _avg_hourly_value() -> float:
    return (sum(DAILY_PRICE) / len(DAILY_PRICE)) * (sum(UTILIZATION) / len(UTILIZATION))


def failure_chance(task: Task, start_hour: int) -> float:
    return min(1.0, task.risk_growth_per_day * start_hour / 24)


def slot_cost(task: Task, start_hour: int, mode: Mode) -> CostBreakdown:
    """Expected $ cost of running `task` from `start_hour` (see module docstring)."""
    gpus = len(task.racks_affected) * GPUS_PER_RACK
    sla_factor = _sla_factor(mode)
    downtime = sum(gpus * utilization(h) * price(h // 24)
                   for h in range(start_hour, start_hour + task.duration_hrs))
    sla = downtime * sla_factor
    planned = downtime + sla
    planned_reference = gpus * task.duration_hrs * _avg_hourly_value() * (1 + sla_factor)
    unplanned = planned_reference * UNPLANNED_COST_MULTIPLIER * (1 + EMERGENCY_PREMIUM)
    risk = failure_chance(task, start_hour) * (unplanned - planned)
    return CostBreakdown(downtime=downtime, sla=sla, risk=risk)


# ---- endpoints ---------------------------------------------------------------
@router.get("/prices")
def get_prices(days: int = HORIZON_DAYS) -> list[dict]:
    return prices(days)   # main.py registers its own /prices first (same data), so that one wins


@router.get("/cost", response_model=CostResponse)
def get_cost(task_id: str, start_hour: int, mode: Mode = "cloud") -> CostResponse:
    from .backlog import task_lookup  # lazy: avoid import cycles
    task = task_lookup().get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"unknown task_id '{task_id}'")
    if not 0 <= start_hour <= HOURS - task.duration_hrs:
        raise HTTPException(status_code=422, detail=f"start_hour must be 0..{HOURS - task.duration_hrs}")
    c = slot_cost(task, start_hour, mode)
    return CostResponse(task_id=task_id, start_hour=start_hour, mode=mode,
                        downtime_cost=round(c.downtime, 2), risk_cost=round(c.risk, 2),
                        sla_cost=round(c.sla, 2), total=round(c.total, 2))
