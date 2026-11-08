"""TEMPORARY stand-ins so the planner can be built before the other parts land.

- prices, utilization, cost  -> replace with Fawaz's price curve + cost model (/prices, /cost)
- seeded_backlog             -> returns Loki's backlog (app/backlog.py)

Prices come from real market data (app/market.py). Every other number here is ASSUMED
or SEEDED (see HACK.md "Assumptions"), not real data.
The planner only depends on `slot_cost(task, start_hour, mode)` and the Task model,
so swapping these out should not require planner changes.
"""

import random
from dataclasses import dataclass

from . import market
from .models import HOURS_IN_WEEK, Mode, Task

# ---- Assumptions (HACK.md) -------------------------------------------------
GPUS_PER_RACK = 32
CONTRACTED_SHARE = 0.70  # cloud mode: share of capacity pre-sold under contract
SLA_CREDIT_RATE = 0.10  # credit owed on missed contracted hours
UNPLANNED_MULTIPLIER = 3.0  # unplanned failure = 3x planned downtime...
EMERGENCY_PREMIUM = 0.20  # ...plus 20% emergency premium

# Daily H100 $/GPU-hr for the planning week: forecast from REAL weekly market data
# (GetDeploying, ON_DEMAND median across providers; see app/market.py). The history is
# real; the day-by-day forecast on top of it is our model. A snapshot, not a live feed.
FORECAST = market.daily_forecast("h100", 7)
DAILY_PRICE = [f["price"] for f in FORECAST]


def price(day: int) -> float:
    return DAILY_PRICE[day]


def prices(days: int = 7) -> list[dict]:
    note = market.source_note("h100")
    return [
        {**f, "source": note["source"], "as_of": note["as_of"]}
        for f in FORECAST[: max(0, min(days, len(FORECAST)))]
    ]


def _seeded_utilization() -> list[float]:
    """Hourly share of GPUs busy: 90-98% with short dips to 85-88% at job boundaries."""
    rng = random.Random(42)
    util = [round(rng.uniform(0.90, 0.98), 3) for _ in range(HOURS_IN_WEEK)]
    hour = rng.randint(3, 9)
    while hour < HOURS_IN_WEEK:
        for h in range(hour, min(hour + rng.randint(2, 4), HOURS_IN_WEEK)):
            util[h] = round(rng.uniform(0.85, 0.88), 3)
        hour += rng.randint(8, 16)
    return util


UTILIZATION = _seeded_utilization()


def utilization(hour: int) -> float:
    return UTILIZATION[hour]


# ---- Cost model ------------------------------------------------------------
@dataclass(frozen=True)
class CostBreakdown:
    downtime: float
    sla: float
    risk: float

    @property
    def total(self) -> float:
        return self.downtime + self.sla + self.risk


def _avg_hourly_value() -> float:
    return (sum(DAILY_PRICE) / len(DAILY_PRICE)) * (sum(UTILIZATION) / len(UTILIZATION))


def slot_cost(task: Task, start_hour: int, mode: Mode) -> CostBreakdown:
    """$ cost of running `task` from `start_hour` (planned downtime + SLA + risk of waiting)."""
    gpus = len(task.racks_affected) * GPUS_PER_RACK
    sla_factor = CONTRACTED_SHARE * SLA_CREDIT_RATE if mode == "cloud" else 0.0

    downtime = sum(
        gpus * utilization(h) * price(h // 24)
        for h in range(start_hour, start_hour + task.duration_hrs)
    )
    sla = downtime * sla_factor

    # Expected cost of waiting: chance it fails before we get to it x cost of that failure.
    days_waited = start_hour / 24
    failure_chance = min(1.0, task.risk_growth_per_day * days_waited)
    planned_reference = gpus * task.duration_hrs * _avg_hourly_value() * (1 + sla_factor)
    unplanned_cost = planned_reference * UNPLANNED_MULTIPLIER * (1 + EMERGENCY_PREMIUM)
    risk = failure_chance * unplanned_cost

    return CostBreakdown(downtime=downtime, sla=sla, risk=risk)


# ---- Seeded backlog: now Loki's real backlog (app/backlog.py) -----------------
def seeded_backlog() -> list[Task]:
    from .backlog import BACKLOG  # lazy: backlog imports schemas -> models
    return [t.model_copy(deep=True) for t in BACKLOG]
