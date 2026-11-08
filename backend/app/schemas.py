"""Shared contracts. Task / Plan / PlanRequest come from models.py (Nandhan's contract, which the
frontend and its cached fallback plans are built on); this module re-exports them and adds the
shapes for /cost, /simulate and /request. Change carefully: add optional fields, don't rename.
"""
from pydantic import BaseModel

from .models import (  # noqa: F401  (re-exported)
    HOURS_IN_WEEK, Mode, OverheatHour, Plan, PlanItem, PlanRequest, Strategy, Task, Unscheduled, Window,
    hour_label,
)


class DayPrice(BaseModel):
    day: int
    gpu_type: str
    price: float   # $/GPU-hr
    low: float
    high: float


class CostBreakdown(BaseModel):
    task_id: str
    start_hour: int
    mode: Mode
    downtime_cost: float
    risk_cost: float
    sla_cost: float
    total: float


class HourState(BaseModel):
    hour: int
    racks_offline: list[str]          # rack ids, e.g. "B03"
    zone_temps_c: dict[str, float]


class Violation(BaseModel):
    hour: int
    kind: str      # "zone_conflict", "overheat", "window", "unknown_task"
    detail: str


class SimResult(BaseModel):
    hours: list[HourState]
    violations: list[Violation]


class AgentRequest(BaseModel):
    text: str


class AgentResponse(BaseModel):
    task: Task | None
    plan: Plan | None
    explanation: str
    tool_calls: list[str] = []   # shown in the demo to prove multi-step tool use
