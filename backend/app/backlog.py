"""GET /backlog. Owner: Loki. Seeded 7-day maintenance backlog (all values ASSUMED, see HACK.md).

Hours count from Mon 00:00 (0..167). Designed conflicts:
- T1 + T2 share zone Z2 (zone_conflict if they overlap); T4 + T5 share Z4.
- T1 (CRAC-2) and T6 (CDU-3) are cooling outages in neighboring zones: overlapping them
  removes backup cooling and overheats Z2/Z3.
"""
from fastapi import APIRouter
from .config import HORIZON_DAYS
from .schemas import Task, Window

router = APIRouter(tags=["backlog"])


def _daily(days: list[int], start: int, end: int) -> list[Window]:
    """Same clock window (start..end hour of day) on each listed day (0 = Mon)."""
    return [Window(start_hour=d * 24 + start, end_hour=d * 24 + end) for d in days]


WEEKDAYS = list(range(5))

BACKLOG: list[Task] = [
    Task(id="T1", name="CRAC-2 compressor replacement", equipment="CRAC-2", duration_hrs=6,
         racks_affected=list(range(10, 15)), zone="Z2", risk_growth_per_day=0.015,
         allowed_windows=[Window(start_hour=8, end_hour=HORIZON_DAYS * 24)]),   # parts arrive Mon 08:00
    Task(id="T2", name="PDU breaker swaps, row B", equipment="PDU row B", duration_hrs=4,
         racks_affected=list(range(15, 20)), zone="Z2", risk_growth_per_day=0.010,
         allowed_windows=[]),
    Task(id="T3", name="GPU firmware rollout", equipment="GPU firmware", duration_hrs=3,
         racks_affected=list(range(0, 8)), zone="Z1", risk_growth_per_day=0.005,
         allowed_windows=[]),
    Task(id="T4", name="UPS battery test", equipment="UPS-A", duration_hrs=2,
         racks_affected=list(range(30, 40)), zone="Z4", risk_growth_per_day=0.020,
         allowed_windows=_daily([1, 3], 8, 17)),                                 # vendor: Tue/Thu 08-17
    Task(id="T5", name="Fiber re-cabling", equipment="Fiber spine 4", duration_hrs=5,
         racks_affected=list(range(32, 37)), zone="Z4", risk_growth_per_day=0.008,
         allowed_windows=[]),
    Task(id="T6", name="CDU coolant flush", equipment="CDU-3", duration_hrs=4,
         racks_affected=list(range(24, 28)), zone="Z3", risk_growth_per_day=0.012,
         allowed_windows=_daily(WEEKDAYS, 8, 20)),                               # weekdays 08-20
]


def task_lookup(extra: list[Task] | None = None) -> dict[str, Task]:
    """id -> Task for the seeded backlog, overridden/extended by `extra` (e.g. Nemotron-added tasks)."""
    tasks = {t.id: t for t in BACKLOG}
    for t in extra or []:
        tasks[t.id] = t
    return tasks


@router.get("/backlog", response_model=list[Task])
def get_backlog() -> list[Task]:
    return BACKLOG
