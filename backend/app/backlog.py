"""GET /backlog. Owner: Loki. Stub with one example task; seed the real 5-6."""
from fastapi import APIRouter
from .schemas import Task, Window

router = APIRouter(tags=["backlog"])

BACKLOG: list[Task] = [
    # TODO(Loki): CRAC-2, PDU row B, GPU firmware, UPS battery test, fiber re-cabling, +1.
    # At least two must share a cooling zone.
    Task(id="T1", name="CRAC-2 compressor replacement", equipment="CRAC-2", duration_hrs=6,
         racks_affected=list(range(10, 20)), zone="Z2", risk_growth_per_day=0.015,
         allowed_windows=[Window(start_hour=8, end_hour=168)]),
]


@router.get("/backlog", response_model=list[Task])
def get_backlog() -> list[Task]:
    return BACKLOG
