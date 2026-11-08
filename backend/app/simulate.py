"""POST /simulate. Owner: Loki. Stub: replace with hourly hall state + violations."""
from fastapi import APIRouter
from .schemas import Plan, SimResult

router = APIRouter(tags=["simulate"])


@router.post("/simulate", response_model=SimResult)
def simulate(plan: Plan) -> SimResult:
    # TODO(Loki): per-hour racks offline, zone temps, zone_conflict / overheat violations
    return SimResult(hours=[], violations=[])
