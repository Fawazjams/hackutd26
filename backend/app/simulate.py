"""POST /simulate. Owner: Loki. Hour-by-hour hall state for a plan + rule violations.

Pure functions (`simulate_plan`, `find_conflicts`, `active_tasks_by_hour`) are importable by the
planner so the optimizer can reject plans that conflict or overheat. Fully deterministic: the only
randomness is a fixed per-hour/per-zone noise table drawn from SEED.
"""
import random
from fastapi import APIRouter
from .backlog import task_lookup
from .config import (BASE_ZONE_TEMP_C, COOLING_EQUIPMENT, COOLING_LOSS_C, COOLING_LOSS_NO_BACKUP_C,
                     COOLING_ZONES, HOURS, NEIGHBOR_LOAD_C, OFFLINE_COOLING_C, OVERHEAT_C, SEED,
                     TEMP_NOISE_C, THERMAL_RESPONSE, ZONE_NEIGHBORS, ZONE_RACKS)
from .schemas import HourState, Plan, SimResult, Task, Violation

router = APIRouter(tags=["simulate"])

# Fixed noise table: same values every run, independent of the plan.
_rng = random.Random(SEED)
_NOISE = [{z: _rng.uniform(-TEMP_NOISE_C, TEMP_NOISE_C) for z in COOLING_ZONES} for _ in range(HOURS)]


def is_cooling_task(task: Task) -> bool:
    return task.equipment.upper().startswith(COOLING_EQUIPMENT)


def active_tasks_by_hour(plan: Plan, tasks: dict[str, Task]) -> list[list[Task]]:
    """For each hour 0..HOURS-1, the known tasks running that hour ([start_hour, end_hour))."""
    active: list[list[Task]] = [[] for _ in range(HOURS)]
    for s in plan.items:
        t = tasks.get(s.task_id)
        if t is None:
            continue
        for h in range(max(0, s.start_hour), min(HOURS, s.end_hour)):
            active[h].append(t)
    return active


def _in_window(task: Task, start: int, end: int) -> bool:
    if not task.allowed_windows:
        return 0 <= start and end <= HOURS
    return any(w.start_hour <= start and end <= w.end_hour for w in task.allowed_windows)


def _schedule_violations(plan: Plan, tasks: dict[str, Task]) -> list[Violation]:
    out = []
    for s in plan.items:
        t = tasks.get(s.task_id)
        if t is None:
            out.append(Violation(hour=s.start_hour, kind="unknown_task",
                                 detail=f"{s.task_id} is not in the backlog or the given tasks"))
        elif s.end_hour <= s.start_hour or not _in_window(t, s.start_hour, s.end_hour):
            out.append(Violation(hour=s.start_hour, kind="window",
                                 detail=f"{t.id} ({t.name}) at hours {s.start_hour}-{s.end_hour} "
                                        f"is outside its allowed windows"))
    return out


def _zone_conflicts(active: list[list[Task]]) -> list[Violation]:
    out = []
    for h, running in enumerate(active):
        by_zone: dict[str, list[str]] = {}
        for t in running:
            by_zone.setdefault(t.zone, []).append(t.id)
        for zone in sorted(by_zone):
            ids = sorted(by_zone[zone])
            if len(ids) > 1:
                out.append(Violation(hour=h, kind="zone_conflict",
                                     detail=f"{', '.join(ids)} overlap in cooling zone {zone}"))
    return out


def _sort(vs: list[Violation]) -> list[Violation]:
    return sorted(vs, key=lambda v: (v.hour, v.kind, v.detail))


def find_conflicts(plan: Plan, tasks: dict[str, Task] | None = None) -> list[Violation]:
    """Cheap check (no thermal model): window, unknown_task and zone_conflict violations.
    `tasks` = id -> Task (default: the seeded backlog; pass backlog.task_lookup(extra) for new tasks)."""
    tasks = tasks if tasks is not None else task_lookup()
    return _sort(_schedule_violations(plan, tasks) + _zone_conflicts(active_tasks_by_hour(plan, tasks)))


def _target_temp(hour: int, zone: str, offline: set[str], cooling_down: set[str]) -> float:
    racks = ZONE_RACKS[zone]
    online_share = sum(r not in offline for r in racks) / len(racks)
    temp = BASE_ZONE_TEMP_C + _NOISE[hour][zone] - OFFLINE_COOLING_C * (1 - online_share)
    neighbors_down = any(n in cooling_down for n in ZONE_NEIGHBORS[zone])
    if zone in cooling_down:
        temp += (COOLING_LOSS_NO_BACKUP_C if neighbors_down else COOLING_LOSS_C) * online_share
    elif neighbors_down:
        temp += NEIGHBOR_LOAD_C
    return temp


def simulate_plan(plan: Plan, tasks: dict[str, Task] | None = None) -> SimResult:
    """Full hourly sim: racks offline, zone temps (with thermal inertia) and all violations."""
    tasks = tasks if tasks is not None else task_lookup()
    active = active_tasks_by_hour(plan, tasks)
    violations = _schedule_violations(plan, tasks) + _zone_conflicts(active)

    hours: list[HourState] = []
    temps: dict[str, float] = {}
    for h, running in enumerate(active):
        offline = {r for t in running for r in t.racks_affected}
        cooling_down = {t.zone for t in running if is_cooling_task(t)}
        for z in COOLING_ZONES:
            target = _target_temp(h, z, offline, cooling_down)
            temps[z] = target if h == 0 else temps[z] + THERMAL_RESPONSE * (target - temps[z])
            if temps[z] > OVERHEAT_C:
                violations.append(Violation(hour=h, kind="overheat",
                                            detail=f"zone {z} at {temps[z]:.1f} C > {OVERHEAT_C:.0f} C limit"))
        hours.append(HourState(hour=h, racks_offline=sorted(offline),
                               zone_temps_c={z: round(temps[z], 2) for z in COOLING_ZONES}))
    return SimResult(hours=hours, violations=_sort(violations))


@router.post("/simulate", response_model=SimResult)
def simulate(plan: Plan) -> SimResult:
    return simulate_plan(plan)
