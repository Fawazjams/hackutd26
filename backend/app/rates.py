"""GET /prices/hourly: how one day's hourly downtime rate is built. Owner: Nandhan.

The market price is daily (real GetDeploying history -> our daily forecast). Within a day the
rate per GPU-hour still changes hour by hour, because only busy GPUs earn: the rate is
    market price(day) x share of GPUs busy(hour) [x (1 + contracted share x SLA credit), GPU-cloud mode]
The busy share is ASSUMED (seeded); we deliberately don't invent hourly price swings (HACK.md).
"""
from fastapi import APIRouter, HTTPException

from . import prices as P
from .config import CONTRACTED_SHARE, HORIZON_DAYS, SLA_PENALTY
from . import market
from .market import source_note
from .schemas import Mode

router = APIRouter(tags=["prices"])


@router.get("/prices/hourly")
def hourly(day: int = 0, mode: Mode = "cloud") -> dict:
    if not 0 <= day < HORIZON_DAYS:
        raise HTTPException(status_code=422, detail=f"day must be 0..{HORIZON_DAYS - 1}")
    price = P.price(day)
    sla = CONTRACTED_SHARE * SLA_PENALTY if mode == "cloud" else 0.0
    rows = []
    for h in range(24):
        u = P.utilization(day * 24 + h)
        rows.append({"hour": h, "label": f"{h:02d}:00", "utilization": round(u, 4),
                     "rate": round(price * u * (1 + sla), 4)})
    rates = [r["rate"] for r in rows]
    fc = P.FORECAST[day]
    return {
        "day": day, "date": fc.get("date"), "gpu": fc.get("gpu", "H100"), "mode": mode,
        "market_price": price, "low": fc["low"], "high": fc["high"],
        "sla_factor": round(sla, 4), "contracted_share": CONTRACTED_SHARE, "sla_credit": SLA_PENALTY,
        "avg_rate": round(sum(rates) / 24, 4), "min_rate": min(rates), "max_rate": max(rates),
        "hours": rows,
        "source": source_note("h100"),
        "assumed": "share of GPUs busy each hour (seeded); SLA terms in GPU-cloud mode",
    }


@router.get("/prices/history")
def history(gpu: str = "h100") -> dict:
    """Real weekly GetDeploying series (CC BY 4.0) plus our 7-day daily forecast."""
    try:
        weeks = market.weekly_history(gpu)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return {
        "gpu": gpu.upper(),
        "weeks": weeks,
        "forecast": list(market.daily_forecast(gpu, 7)),
        "source": market.source_note(gpu),
        "credit": {"name": "GetDeploying, GPU rental price history", "url": "https://getdeploying.com/gpus",
                   "license": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/"},
    }
