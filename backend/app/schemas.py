"""Shared contracts. PROPOSAL: agree on these as a team, then change carefully (add optional fields, don't rename)."""
from typing import Literal
from pydantic import BaseModel, Field

Mode = Literal["gpu_cloud", "private"]
Strategy = Literal["optimized", "asap"]


class Window(BaseModel):
    start_hour: int = Field(ge=0, description="hours from start of week (Mon 00:00 = 0)")
    end_hour: int = Field(gt=0, description="exclusive; task must finish by this hour")


class Task(BaseModel):
    id: str
    name: str
    equipment: str                      # e.g. "CRAC-2", "PDU row B"
    duration_hrs: int = Field(gt=0)
    racks_affected: list[int]           # rack indices 0..NUM_RACKS-1
    zone: str                           # cooling zone, e.g. "Z2"
    risk_growth_per_day: float          # added failure probability per day waited, e.g. 0.01
    allowed_windows: list[Window] = []  # empty = any time


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


class ScheduledTask(BaseModel):
    task_id: str
    start_hour: int
    end_hour: int
    cost: CostBreakdown


class Plan(BaseModel):
    mode: Mode
    strategy: Strategy
    schedule: list[ScheduledTask]
    total_cost: float


class PlanRequest(BaseModel):
    mode: Mode = "gpu_cloud"
    strategy: Strategy = "optimized"
    extra_tasks: list[Task] = []        # phase 2: tasks Nemotron adds


class HourState(BaseModel):
    hour: int
    racks_offline: list[int]
    zone_temps_c: dict[str, float]


class Violation(BaseModel):
    hour: int
    kind: str      # e.g. "zone_conflict", "overheat", "window"
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
