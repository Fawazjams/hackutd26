"""POST /request. Owner: Loki (phase 2). Nemotron parses text -> Task, calls our tools, explains.

Rule 1 (CLAUDE.md): the LLM never computes numbers. Hours come from `day_windows`, racks/zones
from `lookup_equipment`, costs/schedules from the planner, temps/violations from the simulator.
The explanation is a code-built facts block; Nemotron may only rephrase it, and any number it
writes that isn't in the facts makes us fall back to the facts text verbatim.
"""
import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from dotenv import load_dotenv
from fastapi import APIRouter
from pydantic import BaseModel, ValidationError

from .config import COOLING_ZONES, HOURS, OVERHEAT_C, ZONE_NEIGHBORS, ZONE_RACKS
from .demo_requests import match_demo
from .schemas import AgentRequest, AgentResponse, Mode, Plan, PlanRequest, Task, Violation, Window

router = APIRouter(tags=["agent"])

load_dotenv(Path(__file__).resolve().parents[1] / ".env")  # backend/.env, gitignored

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
DEFAULT_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b"  # only model that chained 3 tools in scripts/nemotron_check.py
MAX_STEPS = 8
MAX_AVOID_TRIES = 6
THERMAL_TAIL_HRS = 3  # violations this many hours after a job ends still count as caused by it (thermal inertia)
DEFAULT_RISK_GROWTH = 0.01  # ASSUMED: per-day failure-chance growth when the request doesn't say
DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

# ---------------------------------------------------------------- equipment catalog (ASSUMED)
# Zone i (Z1..Z4) = row A..D, racks "A01".."A10" etc. Cooling units derate the first half of their
# zone (matches backlog T1 CRAC-2 -> B01-B05, T6 CDU-3 -> C05-C08); PDU rows power the second half
# (matches T2 PDU row B -> B06-B10).


def _catalog() -> dict[str, dict[str, Any]]:
    cat: dict[str, dict[str, Any]] = {}
    for i, z in enumerate(COOLING_ZONES):
        racks = ZONE_RACKS[z]
        half = len(racks) // 2
        n, row = i + 1, "ABCD"[i] if i < 4 else str(i + 1)
        cat[f"CRAC-{n}"] = {"zone": z, "racks": racks[:half], "cooling": True}
        cat[f"CDU-{n}"] = {"zone": z, "racks": racks[4:8], "cooling": True}
        cat[f"PDU row {row}"] = {"zone": z, "racks": racks[half:], "cooling": False}
        cat[f"PDU-{row}"] = cat[f"PDU row {row}"]                      # alias (frontend/stub naming)
        cat[f"Fiber spine {n}"] = {"zone": z, "racks": racks[2:7], "cooling": False}
        cat[f"Fiber trunk {row}"] = cat[f"Fiber spine {n}"]            # alias
    last = COOLING_ZONES[-1]
    cat["UPS-A"] = {"zone": last, "racks": ZONE_RACKS[last], "cooling": False}
    cat["UPS-B"] = {"zone": last, "racks": ZONE_RACKS[last], "cooling": False}
    return cat


EQUIPMENT = _catalog()


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def lookup_equipment(name: str) -> dict[str, Any]:
    key = _norm(name)
    # longest catalog name contained in the query wins ("UPS-B battery" -> UPS-B)
    for eq in sorted(EQUIPMENT, key=lambda e: -len(_norm(e))):
        if _norm(eq) == key or _norm(eq) in key:
            return {"equipment": eq, **EQUIPMENT[eq]}
    return {"error": f"unknown equipment '{name}'", "known": sorted(EQUIPMENT)}


def day_windows(days: list[Any], start_hour_of_day: int = 0, end_hour_of_day: int = 24) -> dict[str, Any]:
    """Day names/indices -> week-hour windows (Mon 00:00 = hour 0)."""
    if not 0 <= start_hour_of_day < end_hour_of_day <= 24:
        return {"error": "need 0 <= start_hour_of_day < end_hour_of_day <= 24"}
    idx = []
    for d in days:
        if isinstance(d, int) or (isinstance(d, str) and d.isdigit()):
            i = int(d)
        else:
            i = next((k for k, n in enumerate(DAY_NAMES) if str(d).strip().lower().startswith(n.lower())), -1)
        if not 0 <= i < 7:
            return {"error": f"bad day '{d}'; use Mon..Sun or 0..6"}
        idx.append(i)
    return {"windows": [{"start_hour": i * 24 + start_hour_of_day, "end_hour": i * 24 + end_hour_of_day}
                        for i in sorted(set(idx))]}


def fmt_hour(h: int) -> str:
    return "next Mon 00:00" if h >= HOURS else f"{DAY_NAMES[h // 24]} {h % 24:02d}:00"


# ---------------------------------------------------------------- tool state + dispatch


@dataclass
class AgentState:
    text: str
    tasks: list[Task] = field(default_factory=list)
    plans: dict[str, Plan] = field(default_factory=dict)       # strategy -> latest plan
    violations: list[Violation] | None = None
    tool_calls: list[str] = field(default_factory=list)
    llm_used: bool = False
    excluded: dict[str, list[list[int]]] = field(default_factory=dict)  # task id -> week-hour ranges removed by avoid_violations
    requested: dict[str, Task] = field(default_factory=dict)  # task as the operator asked for it (before avoid_violations)

    def as_requested(self, t: Task) -> Task:
        return self.requested.get(t.id, t)


def _validate_task(args: dict[str, Any], state: AgentState) -> Task | str:
    args = dict(args)
    args.setdefault("id", f"R{len(state.tasks) + 1}")
    args.setdefault("risk_growth_per_day", DEFAULT_RISK_GROWTH)
    if not args.get("allowed_windows"):
        args.pop("allowed_windows", None)  # none given = any time (models.Task default: whole week)
    try:
        t = Task(**args)
    except ValidationError as e:
        return f"invalid task: {e.errors(include_url=False)}"
    if t.zone not in ZONE_RACKS:
        return f"invalid task: zone must be one of {COOLING_ZONES}"
    bad = [r for r in t.racks_affected if r not in ZONE_RACKS[t.zone]]
    if not t.racks_affected or bad:
        return f"invalid task: racks_affected must be non-empty and inside {t.zone} {ZONE_RACKS[t.zone]}"
    for w in t.allowed_windows:
        if w.end_hour > HOURS or w.end_hour - w.start_hour < t.duration_hrs:
            return f"invalid task: window {w.start_hour}-{w.end_hour} must be within 0-{HOURS} and fit {t.duration_hrs}h"
    return t


def _plan(state: AgentState, strategy: str, mode: str = "cloud") -> Plan:
    from . import planner  # lazy: Nandhan's optimizer
    from .backlog import BACKLOG
    known = {t.id for t in state.tasks}
    # ASAP baseline uses the tasks as requested; only the optimized plan sees avoid_violations narrowing.
    new = [state.as_requested(t) for t in state.tasks] if strategy == "asap" else list(state.tasks)
    tasks = [t for t in BACKLOG if t.id not in known] + new
    plan = planner.make_plan(PlanRequest(mode=mode, strategy=strategy, tasks=tasks))
    state.plans[strategy] = plan
    return plan


def _simulate(state: AgentState) -> list[Violation]:
    from . import simulate
    from .backlog import task_lookup
    plan = state.plans.get("optimized") or _plan(state, "optimized")
    state.violations = simulate.simulate_plan(plan, task_lookup(state.tasks)).violations
    return state.violations


_ZONE_RE = re.compile(r"\bZ\d+\b")


def _violation_zone(v: Violation) -> str | None:
    m = _ZONE_RE.search(v.detail)
    return m.group(0) if m else None


def _related_zones(zone: str) -> set[str]:
    return {zone, *ZONE_NEIGHBORS.get(zone, [])}


def _runs(hours: list[int]) -> list[list[int]]:
    """Sorted hours -> [[start, end_exclusive], ...] contiguous ranges."""
    out: list[list[int]] = []
    for h in hours:
        if out and out[-1][1] == h:
            out[-1][1] = h + 1
        else:
            out.append([h, h + 1])
    return out


def _subtract_hours(windows: list[Window], bad: set[int], duration: int) -> list[Window]:
    """Allowed windows minus `bad` hours, keeping only pieces long enough for the task."""
    keep = []
    for w in windows:
        for a, b in _runs([h for h in range(w.start_hour, w.end_hour) if h not in bad]):
            if b - a >= duration:
                keep.append(Window(start_hour=a, end_hour=b))
    return keep


def _avoid_violations(state: AgentState, mode: str = "cloud") -> dict[str, Any]:
    """Code-side re-plan: for each NEW task implicated in a violation (same or neighbor zone, during or
    just after its slot), remove the offending hours from its allowed windows, re-plan, re-simulate.
    Backlog tasks are never edited. Deterministic; the LLM only decides to call this."""
    from .backlog import task_lookup
    from .simulate import is_cooling_task
    plan, vs = _plan(state, "optimized", mode), _simulate(state)
    tries, stuck = 0, []
    while vs and tries < MAX_AVOID_TRIES:
        tries += 1
        by_item = {i.task_id: i for i in plan.items}
        lookup = task_lookup(state.tasks)
        new_tasks, changed = [], False
        for t in state.tasks:
            it = by_item.get(t.id)
            zones = _related_zones(t.zone)
            rel = [] if it is None else [
                v for v in vs if _violation_zone(v) in zones
                and it.start_hour <= v.hour < it.end_hour + THERMAL_TAIL_HRS]
            if not rel:
                new_tasks.append(t)
                continue
            bad = set(range(it.start_hour, it.end_hour)) | {v.hour for v in rel}
            for o in plan.items:
                ot = lookup.get(o.task_id)
                if o.task_id == t.id or ot is None:
                    continue
                if o.start_hour < it.end_hour and it.start_hour < o.end_hour and (
                        ot.zone == t.zone or (is_cooling_task(ot) and ot.zone in zones)):
                    bad |= set(range(o.start_hour, o.end_hour))
            windows = _subtract_hours(t.allowed_windows, bad, t.duration_hrs)
            if not windows:
                stuck.append(t.id)
                new_tasks.append(t)
                continue
            state.requested.setdefault(t.id, t)
            state.excluded.setdefault(t.id, []).extend(_runs(sorted(bad)))
            new_tasks.append(t.model_copy(update={"allowed_windows": windows}))
            changed = True
        if not changed:
            break
        state.tasks = new_tasks
        plan, vs = _plan(state, "optimized", mode), _simulate(state)
    out = _plan_summary(plan)
    out["avoid_violations"] = {"tries": tries, "excluded_hours": state.excluded,
                               "violations_after": len(vs), "no_safe_window": stuck}
    return out


def _plan_summary(plan: Plan) -> dict[str, Any]:
    return {"strategy": plan.strategy, "mode": plan.mode, "total_cost": round(plan.total_cost, 2),
            "schedule": [{"task_id": s.task_id, "start": s.start_label, "end": s.end_label,
                          "start_hour": s.start_hour, "end_hour": s.end_hour, "cost": s.total}
                         for s in plan.items],
            "unscheduled": [u.model_dump() for u in plan.unscheduled]}


def run_tool(state: AgentState, name: str, args: dict[str, Any]) -> Any:
    """Execute one tool deterministically. Errors come back as {"error": ...} for the LLM to fix."""
    try:
        if name == "get_backlog":
            from .backlog import BACKLOG
            return [t.model_dump() for t in BACKLOG]
        if name == "get_prices":
            from . import stubs  # same seeded curve GET /prices serves
            return stubs.prices(int(args.get("days", 7)))
        if name == "lookup_equipment":
            return lookup_equipment(str(args.get("name", "")))
        if name == "day_windows":
            return day_windows(args.get("days", []), int(args.get("start_hour_of_day", 0)),
                               int(args.get("end_hour_of_day", 24)))
        if name == "add_task":
            t = _validate_task(args, state)
            if isinstance(t, str):
                return {"error": t}
            state.tasks = [x for x in state.tasks if x.id != t.id] + [t]
            state.requested.pop(t.id, None)
            state.excluded.pop(t.id, None)
            return {"ok": True, "task": t.model_dump()}
        if name == "make_plan":
            if args.get("avoid_violations"):
                return _avoid_violations(state, args.get("mode", "cloud"))
            return _plan_summary(_plan(state, args.get("strategy", "optimized"), args.get("mode", "cloud")))
        if name == "simulate":
            vs = _simulate(state)
            return {"violations": len(vs), "first": [v.model_dump() for v in vs[:5]]}
        return {"error": f"unknown tool '{name}'"}
    except Exception as e:  # never crash the loop on a tool error
        return {"error": f"{type(e).__name__}: {e}"}


def _fn(name: str, desc: str, props: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    return {"type": "function", "function": {"name": name, "description": desc, "parameters": {
        "type": "object", "properties": props, "required": required or []}}}


TOOLS = [
    _fn("get_backlog", "List the seeded maintenance backlog tasks.", {}),
    _fn("get_prices", "Daily GPU price forecast ($/GPU-hr) for the week.", {"days": {"type": "integer"}}),
    _fn("lookup_equipment", "Find the cooling zone and racks affected by a piece of equipment "
        "(e.g. 'UPS-B', 'CRAC-4', 'PDU row C'). Always use this instead of guessing racks.",
        {"name": {"type": "string"}}, ["name"]),
    _fn("day_windows", "Convert allowed days + time of day into week-hour windows. Always use this "
        "instead of computing hours yourself.",
        {"days": {"type": "array", "items": {"type": "string"}, "description": "e.g. ['Wed','Fri']"},
         "start_hour_of_day": {"type": "integer", "description": "0-23, default 0"},
         "end_hour_of_day": {"type": "integer", "description": "1-24, default 24"}}, ["days"]),
    _fn("add_task", "Add the requested maintenance task to this week's plan.", {
        "name": {"type": "string"}, "equipment": {"type": "string"},
        "duration_hrs": {"type": "integer"},
        "racks_affected": {"type": "array", "items": {"type": "string"}, "description": "rack ids, e.g. ['D01','D02']"},
        "zone": {"type": "string"},
        "risk_growth_per_day": {"type": "number", "description": "optional, default 0.01"},
        "allowed_windows": {"type": "array", "items": {"type": "object", "properties": {
            "start_hour": {"type": "integer"}, "end_hour": {"type": "integer"}}}}},
        ["name", "equipment", "duration_hrs", "racks_affected", "zone"]),
    _fn("make_plan", "Schedule the backlog plus added tasks. strategy 'optimized' or 'asap'. Set "
        "avoid_violations=true after simulate reported violations: the new task is moved away from the "
        "hours that overheat or conflict, then re-planned and re-simulated.", {
        "strategy": {"type": "string", "enum": ["optimized", "asap"]},
        "mode": {"type": "string", "enum": ["cloud", "private"]},
        "avoid_violations": {"type": "boolean", "description": "re-plan around simulate violations"}}),
    _fn("simulate", "Run the hall simulation on the latest optimized plan; returns violations "
        "(zone conflicts, overheating, window breaks).", {}),
]

SYSTEM_PROMPT = """/no_think
You are the maintenance-planning agent for a GPU data center hall. Turn the operator's request into
ONE new maintenance task and get it scheduled. Workflow:
1. lookup_equipment(name) to get zone and racks.
2. day_windows(days, start_hour_of_day, end_hour_of_day) if the request limits days/times.
3. add_task with the zone, racks and windows exactly as the tools returned them.
4. make_plan(strategy="optimized"), then simulate.
5. If simulate reports violations, call make_plan with avoid_violations=true, then simulate again.
Never invent or compute numbers (hours, racks, costs); only copy numbers that tools returned or the
operator wrote. When done, reply with one short sentence."""

EXPLAIN_PROMPT = """/no_think
Rewrite the FACTS for a data-center operations lead in 2-4 plain sentences. Use ONLY numbers that
appear in the FACTS, copied exactly (same digits, same $ formatting). Do not add any other numbers."""


# ---------------------------------------------------------------- LLM clients


class LLM(Protocol):
    def chat(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None) -> dict[str, Any]: ...


class NemotronClient:
    """build.nvidia.com, OpenAI-compatible API."""

    def __init__(self, api_key: str, model: str | None = None):
        from openai import OpenAI
        self.model = model or os.getenv("NEMOTRON_MODEL", DEFAULT_MODEL)
        self.client = OpenAI(base_url=NVIDIA_BASE_URL, api_key=api_key, timeout=30, max_retries=1)

    def chat(self, messages, tools):
        kw: dict[str, Any] = {"model": self.model, "messages": messages, "temperature": 0, "max_tokens": 1024}
        if tools:
            kw.update(tools=tools, tool_choice="auto")
        m = self.client.chat.completions.create(**kw).choices[0].message
        return {"role": "assistant", "content": m.content or "",
                "tool_calls": [{"id": c.id, "type": "function",
                                "function": {"name": c.function.name, "arguments": c.function.arguments or "{}"}}
                               for c in (m.tool_calls or [])]}


class ScriptedLLM:
    """Test double: replays canned assistant messages and records what it was sent."""

    def __init__(self, responses: list[dict[str, Any]]):
        self.responses = list(responses)
        self.received: list[list[dict[str, Any]]] = []

    def chat(self, messages, tools):
        self.received.append([dict(m) for m in messages])
        if not self.responses:
            return {"role": "assistant", "content": "", "tool_calls": []}
        return self.responses.pop(0)


def get_llm() -> LLM | None:
    key = os.getenv("NVIDIA_API_KEY", "").strip()
    return NemotronClient(key) if key else None


# ---------------------------------------------------------------- loop, guardrails, explanation


def _run_llm_loop(state: AgentState, llm: LLM) -> None:
    messages: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT},
                                      {"role": "user", "content": state.text}]
    for _ in range(MAX_STEPS):
        msg = llm.chat(messages, TOOLS)
        calls = msg.get("tool_calls") or []
        messages.append({"role": "assistant", "content": msg.get("content") or "",
                         **({"tool_calls": calls} if calls else {})})
        if not calls:
            return
        for c in calls:
            name = c["function"]["name"]
            try:
                args = json.loads(c["function"].get("arguments") or "{}") or {}
            except json.JSONDecodeError as e:
                result: Any = {"error": f"arguments were not valid JSON: {e}"}
            else:
                result = run_tool(state, name, args)
                if name == "make_plan" and args.get("avoid_violations"):
                    name += "[avoid_violations]"
            state.tool_calls.append(name)
            messages.append({"role": "tool", "tool_call_id": c.get("id", name), "content": json.dumps(result)})


def _finish_pipeline(state: AgentState, prefix: str) -> None:
    """Code-enforced: make sure we have optimized + asap plans and a sim of the optimized plan.
    If the sim shows violations, re-plan once and re-simulate (the planner may route around them)."""
    def call(name: str, args: dict[str, Any]) -> None:
        run_tool(state, name, args)
        state.tool_calls.append(f"{prefix}{name}" + (f"[{args['strategy']}]" if "strategy" in args else ""))

    if "optimized" not in state.plans:
        call("make_plan", {"strategy": "optimized"})
    if state.violations is None:
        call("simulate", {})
    if state.violations:
        run_tool(state, "make_plan", {"strategy": "optimized", "avoid_violations": True})
        state.tool_calls.append(f"{prefix}make_plan[avoid_violations]")
        call("simulate", {})
    if "asap" not in state.plans:
        call("make_plan", {"strategy": "asap"})


def build_facts(state: AgentState) -> dict[str, Any]:
    """Every number shown to the user comes from here (tools' outputs), never from the LLM."""
    t = state.as_requested(state.tasks[-1])
    opt, asap = state.plans["optimized"], state.plans["asap"]
    s = next((x for x in opt.items if x.task_id == t.id), None)
    why = next((u.reason for u in opt.unscheduled if u.task_id == t.id), "")
    savings = asap.total_cost - opt.total_cost
    vs = state.violations or []
    return {
        "task_id": t.id, "task": t.name, "equipment": t.equipment, "zone": t.zone,
        "racks": f"{min(t.racks_affected)}-{max(t.racks_affected)}", "duration_hrs": t.duration_hrs,
        "windows": [f"{fmt_hour(w.start_hour)} to {fmt_hour(w.end_hour)}" for w in t.allowed_windows] or ["any time"],
        "scheduled": f"{fmt_hour(s.start_hour)} to {fmt_hour(s.end_hour)}" if s else f"not scheduled ({why})",
        "optimized_total": round(opt.total_cost, 2), "asap_total": round(asap.total_cost, 2),
        "savings": round(savings, 2),
        "savings_pct": round(100 * savings / asap.total_cost, 1) if asap.total_cost > 0 else 0.0,
        "violations": len(vs), "violation_kinds": sorted({v.kind for v in vs}),
        "replanned": [f"{fmt_hour(a)} to {fmt_hour(b)}" for a, b in state.excluded.get(t.id, [])],
    }


def facts_text(f: dict[str, Any]) -> str:
    lines = [
        f"New task {f['task_id']}: {f['task']} ({f['equipment']}, zone {f['zone']}, racks {f['racks']}, "
        f"{f['duration_hrs']} h; allowed {', '.join(f['windows'])}).",
        f"Optimized plan runs it {f['scheduled']}." + (
            f" Re-planned to avoid overheating/conflicts: kept it out of {', '.join(f['replanned'])}."
            if f.get("replanned") else ""),
        f"Week total: optimized ${f['optimized_total']:,.2f} vs ASAP ${f['asap_total']:,.2f}, "
        f"saving ${f['savings']:,.2f} ({f['savings_pct']}%).",
        "Simulation: no cooling-zone conflicts or overheating." if not f["violations"] else
        f"Simulation: {f['violations']} violation(s) remain ({', '.join(f['violation_kinds'])}); needs review.",
    ]
    return " ".join(lines)


_NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")


def _numbers(text: str) -> set[float]:
    return {float(n.replace(",", "")) for n in _NUM.findall(text)}


def guarded_rewrite(llm: LLM | None, prompt: str, base: str, extra_allowed: str = "") -> tuple[str, bool]:
    """Let the LLM reword `base`; keep its text only if every number in it appears in base/extra.
    Returns (text, llm_text_used)."""
    if llm is None:
        return base, False
    try:
        msg = llm.chat([{"role": "system", "content": prompt},
                        {"role": "user", "content": f"FACTS: {base}"}], None)
        text = re.sub(r"<think>.*?</think>", "", msg.get("content") or "", flags=re.S).strip()
    except Exception:
        return base, False
    if not text or not _numbers(text) <= (_numbers(base) | _numbers(extra_allowed)):
        return base, False  # LLM invented or altered a number: show the code-built facts instead
    return text, True


def explain(state: AgentState, llm: LLM | None) -> str:
    return guarded_rewrite(llm, EXPLAIN_PROMPT, facts_text(build_facts(state)), state.text)[0]


def run_request(text: str, llm: LLM | None) -> AgentResponse:
    state = AgentState(text=text)
    if llm is not None:
        try:
            _run_llm_loop(state, llm)
            state.llm_used = True
        except Exception:
            state.tool_calls.append("llm_error")
            llm = None

    prefix = "guardrail:"
    cached = match_demo(text)
    # Rehearsed demo request: pin the known-correct Task so the demo is identical every run
    # (live test: Nemotron sometimes dropped one of "Wed or Fri").
    if state.tasks and cached is not None:
        got = state.as_requested(state.tasks[-1]).model_dump(exclude={"id", "name"})
        if got != cached.model_dump(exclude={"id", "name"}):
            state = AgentState(text=text, tool_calls=state.tool_calls, llm_used=state.llm_used)
            run_tool(state, "add_task", cached.model_dump())
            state.tool_calls.append("guardrail:pinned_demo_task")
    if not state.tasks:
        if cached is None:
            why = "couldn't turn that request into a task" if state.llm_used else \
                  "Nemotron is offline and this isn't a rehearsed request"
            return AgentResponse(task=None, plan=None, tool_calls=state.tool_calls,
                                 explanation=f"Sorry, the agent {why}. Try naming the equipment, "
                                             "duration and allowed days, e.g. 'UPS-B battery swap, 3 hrs, vendor only Wed or Fri'.")
        state = AgentState(text=text, tool_calls=state.tool_calls)
        run_tool(state, "add_task", cached.model_dump())
        state.tool_calls.append("fallback:add_task")
        prefix, llm = "fallback:", None

    _finish_pipeline(state, prefix)
    return AgentResponse(task=state.as_requested(state.tasks[-1]), plan=state.plans["optimized"],
                         explanation=explain(state, llm), tool_calls=state.tool_calls)


@router.post("/request", response_model=AgentResponse)
def handle_request(req: AgentRequest) -> AgentResponse:
    return run_request(req.text, get_llm())


# ---------------------------------------------------------------- shift handoff (NMC² "unclear handoff")

HANDOFF_PROMPT = """/no_think
Rewrite the FACTS as a crisp shift-handoff brief for the incoming data-center operations crew: one line
per job, in time order, keep every job, keep the watch items. Use ONLY numbers that appear in the FACTS,
copied exactly (same digits, same $ formatting). Do not add any other numbers."""


class HandoffRequest(BaseModel):
    mode: Mode = "cloud"
    extra_tasks: list[Task] = []   # e.g. a task the /request agent just added


def _money(x: float) -> str:
    return f"${x:,.2f}"


def _rack_span(racks: list[str]) -> str:
    return racks[0] if len(racks) == 1 else f"{min(racks)}-{max(racks)}"


def build_handoff(mode: str = "cloud", extra_tasks: list[Task] | None = None) -> dict[str, Any]:
    """Code-built shift handoff for the optimized week. Every number comes from planner/cost/sim code."""
    from . import planner, simulate
    from .backlog import BACKLOG
    from .stubs import slot_cost  # same cost function the planner uses by default
    extra = list(extra_tasks or [])
    known = {t.id for t in extra}
    tasks = [t for t in BACKLOG if t.id not in known] + extra
    lookup = {t.id: t for t in tasks}
    plan = planner.make_plan(tasks, mode, "optimized")
    sim = simulate.simulate_plan(plan, lookup)

    items = []
    for it in plan.items:
        t = lookup[it.task_id]
        zones = _related_zones(t.zone)
        hours = range(it.start_hour, min(it.end_hour, HOURS))
        peak = max(sim.hours[h].zone_temps_c[t.zone] for h in hours) if hours else None
        now = slot_cost(t, it.start_hour, mode).total
        later = it.start_hour + 24
        if later in planner.feasible_starts(t):
            delayed = slot_cost(t, later, mode).total
            delay = {"cost_if_delayed_1d": round(delayed, 2), "delay_change": round(delayed - now, 2)}
        else:
            delay = None
        watch = []
        for o in plan.items:
            ot = lookup.get(o.task_id)
            if o.task_id == t.id or ot is None or not (o.start_hour < it.end_hour and it.start_hour < o.end_hour):
                continue
            if ot.zone == t.zone:
                watch.append(f"zone conflict: {o.task_id} ({ot.name}) also in {t.zone}")
            elif simulate.is_cooling_task(ot) and ot.zone in zones:
                watch.append(f"neighbor cooling down: {o.task_id} ({ot.equipment}, {ot.zone}) overlaps")
        hot = [v for v in sim.violations if v.kind == "overheat" and _violation_zone(v) == t.zone
               and it.start_hour <= v.hour < it.end_hour + THERMAL_TAIL_HRS]
        if hot:
            watch.append(f"{t.zone} over {OVERHEAT_C:.0f} C for {len(hot)} h")
        items.append({
            "task_id": t.id, "name": t.name, "equipment": t.equipment, "zone": t.zone,
            "racks": t.racks_affected, "racks_label": _rack_span(t.racks_affected),
            "start_hour": it.start_hour, "end_hour": it.end_hour,
            "start_label": it.start_label, "end_label": it.end_label,
            "cost": it.total, "delay_1d": delay,
            "peak_zone_temp_c": round(peak, 1) if peak is not None else None,
            "temp_limit_c": OVERHEAT_C, "watch": watch,
        })

    lines = [f"Shift handoff ({mode} mode, optimized plan): {len(items)} jobs, week total {_money(plan.total_cost)}."]
    for i in items:
        d = i["delay_1d"]
        delay_txt = ("delay 1 day: n/a (no allowed slot)" if d is None else
                     f"delay 1 day: {_money(d['cost_if_delayed_1d'])} "
                     f"({'+' if d['delay_change'] >= 0 else '-'}{_money(abs(d['delay_change']))})")
        temp_txt = ("" if i["peak_zone_temp_c"] is None else
                    f" Peak {i['zone']} temp {i['peak_zone_temp_c']:.1f} C (limit {OVERHEAT_C:.0f} C).")
        lines.append(f"{i['start_label']} to {i['end_label']}: {i['task_id']} {i['name']} ({i['equipment']}, "
                     f"{i['zone']}, racks {i['racks_label']}). Cost {_money(i['cost'])}; {delay_txt}.{temp_txt}"
                     + (f" Watch: {'; '.join(i['watch'])}." if i["watch"] else " Watch: nothing flagged."))
    for u in plan.unscheduled:
        lines.append(f"NOT SCHEDULED: {u.task_id} ({u.reason}).")
    return {"shift_brief": "\n".join(lines), "items": items, "total_cost": plan.total_cost,
            "unscheduled": [u.model_dump() for u in plan.unscheduled], "llm_used": False}


@router.post("/handoff")
def handoff(req: HandoffRequest) -> dict[str, Any]:
    data = build_handoff(req.mode, req.extra_tasks)
    data["shift_brief"], data["llm_used"] = guarded_rewrite(get_llm(), HANDOFF_PROMPT, data["shift_brief"])
    return data
