"""Simulated alarms for the autonomous-incident demo (POST /incident/stream). Owner: Loki.

Every value here is ASSUMED / invented for the demo: there is no real telemetry feed. The alarm text
Nemotron receives is built by code from these dicts, so every number it can copy is ours.
`EXPECTED_TASKS` is the Task a correct triage produces; like demo_requests.match_demo it is the
offline fallback and the pin check for a wrong parse.
"""
from typing import Any

from .config import HOURS
from .schemas import Task, Window

INCIDENTS: list[dict[str, Any]] = [
    {"id": "INC1", "hour": 62, "label": "Wed 14:00", "title": "CRAC-3 vibration alarm",   # ASSUMED
     "equipment": "CRAC-3", "zone": "Z3",
     "detail": "Compressor vibration 3.1x baseline on CRAC-3. Vendor: 3 h repair, crew on site from now; "
               "failure risk grows 4% per day until fixed.",
     "source": "simulated telemetry"},
]

_BY_ID = {i["id"]: i for i in INCIDENTS}


def _expected(incident_id: str, name: str, duration: int, risk: float) -> Task:
    from .agent import lookup_equipment  # lazy: agent imports this module lazily too
    inc = _BY_ID[incident_id]
    eq = lookup_equipment(inc["equipment"])
    return Task(id="I1", name=name, equipment=eq["equipment"], duration_hrs=duration,
                racks_affected=eq["racks"], zone=eq["zone"], risk_growth_per_day=risk,
                allowed_windows=[Window(start_hour=inc["hour"], end_hour=HOURS)])


EXPECTED_TASKS: dict[str, Task] = {
    "INC1": _expected("INC1", "CRAC-3 compressor repair", 3, 0.04),   # ASSUMED: 3 h, +4%/day risk
}


def get_incident(incident_id: str) -> dict[str, Any] | None:
    return _BY_ID.get(incident_id)


def expected_task(incident_id: str) -> Task:
    return EXPECTED_TASKS[incident_id].model_copy(deep=True)


def alarm_text(inc: dict[str, Any]) -> str:
    """The message Nemotron gets instead of an operator request. Hour numbers are spelled out so the
    model copies them instead of computing them."""
    t = EXPECTED_TASKS[inc["id"]]
    return (f"ALARM ({inc['source']}) at {inc['label']} (week hour {inc['hour']}): {inc['title']} on "
            f"{inc['equipment']}, zone {inc['zone']}. {inc['detail']} "
            f"Task fields: equipment {inc['equipment']}, duration_hrs {t.duration_hrs}, "
            f"risk_growth_per_day {t.risk_growth_per_day}, allowed window start_hour {inc['hour']} "
            f"end_hour {HOURS}. Nothing before week hour {inc['hour']} can change. "
            "No operator is on the console: triage it, decide when to repair, and schedule it.")
