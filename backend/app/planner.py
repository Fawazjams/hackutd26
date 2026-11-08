"""Maintenance planner: ASAP baseline and cost optimizer.

Rules both strategies obey:
  - a task runs entirely inside one of its allowed windows
  - two tasks in the same cooling zone never overlap
The optimized plan also never overheats: every slot it takes is checked against
the hall thermal sim (simulate.simulate_plan) for the whole plan so far, and the
cheapest slot that keeps every zone under the limit wins. ASAP skips this check
on purpose; it is the naive baseline.

ASAP baseline: the "just do it now" plan. In backlog order, each task takes the
earliest slot that starts during business hours (Mon-Fri, 09:00-17:00).

Optimized: 1) greedy - most urgent task first (fastest-growing failure risk),
each takes its cheapest open slot; 2) improve - repeatedly lift each task out and
drop it back in its cheapest open slot until nothing gets cheaper. The improve
step is also run starting from the ASAP plan when that plan is thermally clean;
the cheaper clean result wins.

Overheats are priced: for every zone-hour the hall sim puts over the limit, the GPUs
still running in that zone count as an unplanned outage for that hour, at the same
assumed rate the risk model uses (UNPLANNED_MULTIPLIER x (1 + EMERGENCY_PREMIUM) x
planned cost). Only ASAP can have these; they are added to its total_cost.

Everything is deterministic: ties go to the earliest hour, then task id.
"""

from collections.abc import Callable

from .config import OVERHEAT_C, ZONE_RACKS
from .models import (
    HOURS_IN_WEEK, Mode, OverheatHour, Plan, PlanItem, PlanRequest, Strategy, Task, Unscheduled,
    hour_label,
)
from .simulate import is_cooling_task, simulate_plan
from .stubs import (
    CONTRACTED_SHARE, EMERGENCY_PREMIUM, GPUS_PER_RACK, SLA_CREDIT_RATE, UNPLANNED_MULTIPLIER,
    CostBreakdown, price, seeded_backlog, slot_cost, utilization,
)

CostFn = Callable[[Task, int, Mode], CostBreakdown]
Schedule = dict[str, int]  # task_id -> start_hour

BUSINESS_START, BUSINESS_END = 9, 17
MAX_IMPROVE_ROUNDS = 50
EPS = 1e-9


def feasible_starts(task: Task) -> list[int]:
    starts: set[int] = set()
    for w in task.allowed_windows:
        last = min(w.end_hour, HOURS_IN_WEEK) - task.duration_hrs
        starts.update(range(max(w.start_hour, 0), last + 1))
    return sorted(starts)


def is_business_hour_start(hour: int) -> bool:
    return hour // 24 < 5 and BUSINESS_START <= hour % 24 < BUSINESS_END


def _overlaps(a: Task, a_start: int, b: Task, b_start: int) -> bool:
    return a_start < b_start + b.duration_hrs and b_start < a_start + a.duration_hrs


def _conflicts(task: Task, start: int, schedule: Schedule, by_id: dict[str, Task]) -> bool:
    return any(
        other_id != task.id
        and by_id[other_id].zone == task.zone
        and _overlaps(task, start, by_id[other_id], other_start)
        for other_id, other_start in schedule.items()
    )


class _Planner:
    def __init__(self, tasks: list[Task], mode: Mode, cost_fn: CostFn):
        ids = [t.id for t in tasks]
        if len(ids) != len(set(ids)):
            raise ValueError("task ids must be unique")
        self.tasks = tasks
        self.by_id = {t.id: t for t in tasks}
        self.mode = mode
        self.starts = {t.id: feasible_starts(t) for t in tasks}
        # Precompute every (task, start) cost once; the search only does lookups.
        self.costs: dict[str, dict[int, CostBreakdown]] = {
            t.id: {s: cost_fn(t, s, mode) for s in self.starts[t.id]} for t in tasks
        }
        self.by_cost = {
            tid: sorted(c, key=lambda s, c=c: (c[s].total, s)) for tid, c in self.costs.items()
        }
        self._heat_cache: dict[frozenset, bool] = {}

    def _simulate(self, schedule: Schedule):
        items = [
            PlanItem.model_construct(task_id=tid, start_hour=s,
                                     end_hour=s + self.by_id[tid].duration_hrs)
            for tid, s in sorted(schedule.items())
        ]
        return simulate_plan(Plan.model_construct(items=items), self.by_id)

    def overheats(self, schedule: Schedule) -> bool:
        """True if the hall thermal sim reports any overheat for this schedule."""
        key = frozenset(schedule.items())
        if key not in self._heat_cache:
            sim = self._simulate(schedule)
            self._heat_cache[key] = any(v.kind == "overheat" for v in sim.violations)
        return self._heat_cache[key]

    def overheat_hours(self, schedule: Schedule) -> list[OverheatHour]:
        """Every zone-hour over the limit, priced as an unplanned outage of its running GPUs."""
        if not self.overheats(schedule):
            return []
        sla_factor = CONTRACTED_SHARE * SLA_CREDIT_RATE if self.mode == "cloud" else 0.0
        outage_rate = UNPLANNED_MULTIPLIER * (1 + EMERGENCY_PREMIUM) * (1 + sla_factor)
        out = []
        for hs in self._simulate(schedule).hours:
            offline = set(hs.racks_offline)
            for zone, temp in sorted(hs.zone_temps_c.items()):
                if temp <= OVERHEAT_C:
                    continue
                gpus = sum(r not in offline for r in ZONE_RACKS[zone]) * GPUS_PER_RACK
                cost = gpus * utilization(hs.hour) * price(hs.hour // 24) * outage_rate
                out.append(OverheatHour(hour=hs.hour, zone=zone, temp_c=temp,
                                        gpus_lost=gpus, cost=round(cost, 2)))
        return out

    def asap_start(self, task: Task, schedule: Schedule) -> int | None:
        """Earliest business-hours start with no same-zone overlap. No thermal check."""
        return next(
            (s for s in self.starts[task.id]
             if is_business_hour_start(s) and not _conflicts(task, s, schedule, self.by_id)),
            None,
        )

    def best_start(self, task: Task, schedule: Schedule) -> int | None:
        """Cheapest start with no same-zone overlap that keeps the whole plan from overheating."""
        # Shortcut: in the sim, taking racks offline only ever lowers zone temps; only cooling
        # outages raise them. So a non-cooling task added to a plan that is already clean
        # can't cause an overheat, and needs no per-slot sim.
        safe_anywhere = not is_cooling_task(task) and not self.overheats(schedule)
        for s in self.by_cost[task.id]:  # cheapest first; the sim only runs on candidates
            if _conflicts(task, s, schedule, self.by_id):
                continue
            if safe_anywhere or not self.overheats({**schedule, task.id: s}):
                return s
        return None

    def total(self, schedule: Schedule) -> float:
        return sum(self.costs[tid][s].total for tid, s in schedule.items())

    def asap(self) -> Schedule:
        schedule: Schedule = {}
        for task in self.tasks:  # backlog order
            start = self.asap_start(task, schedule)
            if start is not None:
                schedule[task.id] = start
        return schedule

    def greedy(self) -> Schedule:
        schedule: Schedule = {}
        for task in sorted(self.tasks, key=lambda t: (-t.risk_growth_per_day, t.id)):
            start = self.best_start(task, schedule)
            if start is not None:
                schedule[task.id] = start
        return schedule

    def improve(self, schedule: Schedule) -> Schedule:
        schedule = dict(schedule)
        for _ in range(MAX_IMPROVE_ROUNDS):
            changed = False
            for task in self.tasks:
                current = schedule.pop(task.id, None)
                best = self.best_start(task, schedule)
                if best is None:
                    if current is not None:
                        schedule[task.id] = current
                    continue
                if current is None or (
                    self.costs[task.id][best].total < self.costs[task.id][current].total - EPS
                ):
                    schedule[task.id] = best
                    changed = changed or best != current
                else:
                    schedule[task.id] = current
            if not changed:
                break
        return schedule

    def optimized(self) -> Schedule:
        # greedy+improve is thermally clean by construction (every placement is checked).
        # Improving from ASAP is only tried when ASAP is itself clean: from an overheating
        # start it can't reach a clean plan, and costs hundreds of sim runs to find that out.
        # So when ASAP is clean, optimized never costs more than ASAP; when ASAP overheats,
        # the optimized plan is the safe one.
        options = [self.improve(self.greedy())]
        asap = self.asap()
        if not self.overheats(asap):
            from_asap = self.improve(asap)
            if not self.overheats(from_asap):
                options.append(from_asap)
        # Prefer scheduling more tasks, then lower cost.
        return min(options, key=lambda s: (-len(s), round(self.total(s), 6)))

    def to_plan(self, schedule: Schedule, strategy: Strategy) -> Plan:
        items = []
        for tid, start in sorted(schedule.items(), key=lambda kv: (kv[1], kv[0])):
            task, c = self.by_id[tid], self.costs[tid][start]
            end = start + task.duration_hrs
            items.append(PlanItem(
                task_id=tid, name=task.name, zone=task.zone,
                start_hour=start, end_hour=end,
                start_label=hour_label(start), end_label=hour_label(end),
                gpus_offline=len(task.racks_affected) * GPUS_PER_RACK,
                downtime_cost=round(c.downtime, 2), sla_cost=round(c.sla, 2),
                risk_cost=round(c.risk, 2), total=round(c.total, 2),
            ))
        unscheduled = [
            Unscheduled(task_id=t.id, reason=self._why_unscheduled(t, strategy))
            for t in self.tasks if t.id not in schedule
        ]
        overheats = self.overheat_hours(schedule)
        overheat_cost = sum(o.cost for o in overheats)
        return Plan(
            mode=self.mode, strategy=strategy,
            total_cost=round(self.total(schedule) + overheat_cost, 2),
            items=items, unscheduled=unscheduled,
            overheat_cost=round(overheat_cost, 2), overheats=overheats,
        )

    def _why_unscheduled(self, task: Task, strategy: Strategy) -> str:
        if not self.starts[task.id]:
            return "no allowed window is long enough for this task"
        if strategy == "asap" and not any(is_business_hour_start(s) for s in self.starts[task.id]):
            return "no business-hours start inside its allowed windows"
        return ("every allowed slot clashes with another task in the same cooling zone "
                "or overheats a zone")


def make_plan(tasks: "list[Task] | PlanRequest", mode: Mode | None = None,
              strategy: Strategy | None = None, cost_fn: CostFn = slot_cost) -> Plan:
    """make_plan(PlanRequest) or make_plan(tasks, mode, strategy)."""
    if isinstance(tasks, PlanRequest):
        req = tasks
        tasks = req.tasks if req.tasks is not None else seeded_backlog()
        mode, strategy = req.mode, req.strategy
    if mode is None or strategy is None:
        raise ValueError("mode and strategy are required")
    planner = _Planner(tasks, mode, cost_fn)
    schedule = planner.optimized() if strategy == "optimized" else planner.asap()
    return planner.to_plan(schedule, strategy)
