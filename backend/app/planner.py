"""POST /plan. Owner: Nandhan. Stub: ASAP = each task at its earliest allowed hour."""
from fastapi import APIRouter
from .backlog import BACKLOG
from .schemas import CostBreakdown, Plan, PlanRequest, ScheduledTask

router = APIRouter(tags=["plan"])


@router.post("/plan", response_model=Plan)
def make_plan(req: PlanRequest) -> Plan:
    # TODO(Nandhan): real ASAP baseline (business hours) + optimizer (greedy or OR-Tools)
    schedule = []
    for t in BACKLOG + req.extra_tasks:
        start = t.allowed_windows[0].start_hour if t.allowed_windows else 0
        cost = CostBreakdown(task_id=t.id, start_hour=start, mode=req.mode,
                             downtime_cost=0, risk_cost=0, sla_cost=0, total=0)
        schedule.append(ScheduledTask(task_id=t.id, start_hour=start,
                                      end_hour=start + t.duration_hrs, cost=cost))
    return Plan(mode=req.mode, strategy=req.strategy, schedule=schedule,
                total_cost=sum(s.cost.total for s in schedule))
