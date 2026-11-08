"""Shared JSON contract: Task and Plan.

Time is measured in hours from Monday 00:00 of the planning week (0..167).
All money is in US dollars.
"""

from typing import Literal

from pydantic import BaseModel, Field

HOURS_IN_WEEK = 168
DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

Mode = Literal["cloud", "private"]
Strategy = Literal["optimized", "asap"]


def hour_label(hour: int) -> str:
    """0 -> 'Mon 00:00', 38 -> 'Tue 14:00', 168 -> 'Sun 24:00' (end of week)."""
    if hour == HOURS_IN_WEEK:
        return "Sun 24:00"
    return f"{DAY_NAMES[hour // 24]} {hour % 24:02d}:00"


class Window(BaseModel):
    """A task may only run entirely inside one of its windows: [start_hour, end_hour)."""

    start_hour: int = Field(ge=0, le=HOURS_IN_WEEK)
    end_hour: int = Field(ge=0, le=HOURS_IN_WEEK)


class Task(BaseModel):
    id: str
    name: str
    equipment: str
    duration_hrs: int = Field(gt=0, le=HOURS_IN_WEEK)
    racks_affected: list[str] = Field(min_length=1)
    zone: str  # cooling zone; two tasks in one zone may not overlap
    risk_growth_per_day: float = Field(ge=0, le=1)  # failure chance added per day of waiting
    allowed_windows: list[Window] = Field(
        default_factory=lambda: [Window(start_hour=0, end_hour=HOURS_IN_WEEK)]
    )


class PlanItem(BaseModel):
    task_id: str
    name: str
    zone: str
    start_hour: int
    end_hour: int
    start_label: str
    end_label: str
    gpus_offline: int
    downtime_cost: float  # lost revenue (cloud) or replacement rental cost (private)
    sla_cost: float  # SLA credits owed; always 0 in private mode
    risk_cost: float  # expected cost of an unplanned failure caused by waiting
    total: float


class Unscheduled(BaseModel):
    task_id: str
    reason: str


class OverheatHour(BaseModel):
    """One zone-hour over the thermal limit in the hall sim, priced as an unplanned outage."""

    hour: int
    zone: str
    temp_c: float
    gpus_lost: int  # GPUs still running in that zone that hour (assumed lost to the overheat)
    cost: float


class Plan(BaseModel):
    mode: Mode
    strategy: Strategy
    total_cost: float  # sum of item totals + overheat_cost
    items: list[PlanItem]
    unscheduled: list[Unscheduled] = []
    # Optional (added): overheats the hall sim finds in this plan. Always empty for "optimized".
    overheat_cost: float = 0.0
    overheats: list[OverheatHour] = []


class PlanRequest(BaseModel):
    mode: Mode = "cloud"
    strategy: Strategy = "optimized"
    # Omit to plan the seeded backlog. Phase 2 (Nemotron) passes the backlog plus new tasks.
    tasks: list[Task] | None = None
