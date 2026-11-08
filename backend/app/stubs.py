"""TEMPORARY stand-ins so the planner can be built before the other parts land.

- prices, utilization, cost  -> replace with Fawaz's price curve + cost model (/prices, /cost)
- seeded_backlog             -> replace with Loki's backlog (/backlog)

Every number here is ASSUMED or SEEDED (see HACK.md "Assumptions"), not real data.
The planner only depends on `slot_cost(task, start_hour, mode)` and the Task model,
so swapping these out should not require planner changes.
"""

import random
from dataclasses import dataclass

from .models import HOURS_IN_WEEK, Mode, Task, Window

# ---- Assumptions (HACK.md) -------------------------------------------------
GPUS_PER_RACK = 32
CONTRACTED_SHARE = 0.70  # cloud mode: share of capacity pre-sold under contract
SLA_CREDIT_RATE = 0.10  # credit owed on missed contracted hours
UNPLANNED_MULTIPLIER = 3.0  # unplanned failure = 3x planned downtime...
EMERGENCY_PREMIUM = 0.20  # ...plus 20% emergency premium

# Seeded daily H100 $/GPU-hr, starting at the Silicon Data public index level ($3.04).
# NOT a live feed. Shape is invented: midweek pricier, weekend cheaper.
DAILY_PRICE = [3.04, 3.11, 3.22, 3.15, 2.93, 2.78, 2.84]
PRICE_BAND = 0.10  # +/-10% forecast band


def price(day: int) -> float:
    return DAILY_PRICE[day]


def prices(days: int = 7) -> list[dict]:
    return [
        {
            "day": d,
            "gpu": "H100",
            "price": DAILY_PRICE[d],
            "low": round(DAILY_PRICE[d] * (1 - PRICE_BAND), 3),
            "high": round(DAILY_PRICE[d] * (1 + PRICE_BAND), 3),
        }
        for d in range(min(days, len(DAILY_PRICE)))
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


# ---- Seeded backlog (hall: rows A-D x 10 racks x 32 H100 = 1,280 GPUs) ------
def _racks(row: str, first: int, last: int) -> list[str]:
    return [f"{row}{i:02d}" for i in range(first, last + 1)]


def _days_window(days: list[int], start: int, end: int) -> list[Window]:
    return [Window(start_hour=d * 24 + start, end_hour=d * 24 + end) for d in days]


def seeded_backlog() -> list[Task]:
    return [
        Task(
            id="T1", name="CRAC-2 compressor replacement", equipment="CRAC-2",
            duration_hrs=6, racks_affected=_racks("A", 1, 8), zone="Z1",
            risk_growth_per_day=0.02,
        ),
        Task(
            id="T2", name="PDU breaker swaps (row B)", equipment="PDU-B",
            duration_hrs=4, racks_affected=_racks("B", 1, 6), zone="Z2",
            risk_growth_per_day=0.01,
        ),
        Task(
            id="T3", name="GPU firmware rollout (row C)", equipment="GPU firmware",
            duration_hrs=3, racks_affected=_racks("C", 1, 10), zone="Z3",
            risk_growth_per_day=0.005,
        ),
        Task(
            id="T4", name="UPS-A battery test", equipment="UPS-A",
            duration_hrs=3, racks_affected=_racks("A", 5, 10), zone="Z1",
            risk_growth_per_day=0.008,
            # vendor on site Tue/Thu 08:00-18:00 only
            allowed_windows=_days_window([1, 3], 8, 18),
        ),
        Task(
            id="T5", name="Fiber re-cabling (row D)", equipment="Fiber trunk D",
            duration_hrs=5, racks_affected=_racks("D", 1, 4), zone="Z4",
            risk_growth_per_day=0.005,
        ),
        Task(
            id="T6", name="CDU-3 coolant pump seal", equipment="CDU-3",
            duration_hrs=4, racks_affected=_racks("C", 1, 4), zone="Z3",
            risk_growth_per_day=0.012,
        ),
    ]
