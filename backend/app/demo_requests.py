"""Rehearsed /request demo inputs -> the Task Nemotron should produce. Owner: Loki.

Used as a fallback when Nemotron is unavailable (no key, rate limit, network): if the request text
matches one of these (case/punctuation-insensitive), the agent uses the cached Task and runs the
same deterministic tool pipeline, so the demo still works. All task details are ASSUMED.
"""
import re

from .schemas import Task, Window


def _days(days: list[int], start: int = 0, end: int = 24) -> list[Window]:
    return [Window(start_hour=d * 24 + start, end_hour=d * 24 + end) for d in days]


DEMO_REQUESTS: dict[str, Task] = {
    # Shares zone Z4 with T4 (UPS-A test) and T5 (fiber): planner must keep them apart.
    "UPS-B battery swap, 3 hrs, vendor only Wed or Fri": Task(
        id="R1", name="UPS-B battery swap", equipment="UPS-B", duration_hrs=3,
        racks_affected=list(range(30, 40)), zone="Z4", risk_growth_per_day=0.02,
        allowed_windows=_days([2, 4])),
    # Cooling outage in Z4, neighbor of Z3 where T6 (CDU-3) runs: overlap would overheat.
    "CRAC-4 filter and belt service, 4 hours, weekdays 8am to 6pm": Task(
        id="R2", name="CRAC-4 filter and belt service", equipment="CRAC-4", duration_hrs=4,
        racks_affected=list(range(30, 35)), zone="Z4", risk_growth_per_day=0.012,
        allowed_windows=_days([0, 1, 2, 3, 4], 8, 18)),
    # Shares zone Z3 with T6 (CDU-3 flush).
    "PDU row C breaker inspection, 2 hours, weekend only": Task(
        id="R3", name="PDU row C breaker inspection", equipment="PDU row C", duration_hrs=2,
        racks_affected=list(range(25, 30)), zone="Z3", risk_growth_per_day=0.01,
        allowed_windows=_days([5, 6])),
}


def normalize(text: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text.lower()).split())


_BY_NORMALIZED = {normalize(k): v for k, v in DEMO_REQUESTS.items()}


def match_demo(text: str) -> Task | None:
    """Cached Task for a rehearsed request, or None."""
    task = _BY_NORMALIZED.get(normalize(text))
    return task.model_copy(deep=True) if task else None
