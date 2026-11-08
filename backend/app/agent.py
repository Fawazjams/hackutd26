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
from pydantic import ValidationError

from .config import COOLING_ZONES, HOURS, ZONE_RACKS
from .demo_requests import match_demo
from .schemas import AgentRequest, AgentResponse, Plan, PlanRequest, Task, Violation

router = APIRouter(tags=["agent"])

load_dotenv(Path(__file__).resolve().parents[1] / ".env")  # backend/.env, gitignored

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
DEFAULT_MODEL = "nvidia/llama-3.3-nemotron-super-49b-v1.5"
MAX_STEPS = 8
DEFAULT_RISK_GROWTH = 0.01  # ASSUMED: per-day failure-chance growth when the request doesn't say
DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

# ---------------------------------------------------------------- equipment catalog (ASSUMED)
# Zone i (Z1..Z4) owns racks ZONE_RACKS[zone]. Cooling units derate the first half of their zone
# (matches backlog T1 CRAC-2 -> 10-14, T6 CDU-3 -> 24-27); PDU rows power the second half
# (matches T2 PDU row B -> 15-19). Align these names with the frontend's equipment IDs.


def _catalog() -> dict[str, dict[str, Any]]:
    cat: dict[str, dict[str, Any]] = {}
    for i, z in enumerate(COOLING_ZONES):
        racks = ZONE_RACKS[z]
        half = len(racks) // 2
        n, row = i + 1, "ABCD"[i] if i < 4 else str(i + 1)
        cat[f"CRAC-{n}"] = {"zone": z, "racks": racks[:half], "cooling": True}
        cat[f"CDU-{n}"] = {"zone": z, "racks": racks[4:8], "cooling": True}
        cat[f"PDU row {row}"] = {"zone": z, "racks": racks[half:], "cooling": False}
        cat[f"Fiber spine {n}"] = {"zone": z, "racks": racks[2:7], "cooling": False}
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


def _validate_task(args: dict[str, Any], state: AgentState) -> Task | str:
    args = dict(args)
    args.setdefault("id", f"R{len(state.tasks) + 1}")
    args.setdefault("risk_growth_per_day", DEFAULT_RISK_GROWTH)
    args.setdefault("allowed_windows", [])
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


def _plan(state: AgentState, strategy: str, mode: str = "gpu_cloud") -> Plan:
    from . import planner  # lazy: picks up Nandhan's real optimizer
    plan = planner.make_plan(PlanRequest(mode=mode, strategy=strategy, extra_tasks=state.tasks))
    plan = plan.model_copy(update={"tasks": list(state.tasks)})
    state.plans[strategy] = plan
    return plan


def _simulate(state: AgentState) -> list[Violation]:
    from . import simulate
    plan = state.plans.get("optimized") or _plan(state, "optimized")
    state.violations = simulate.simulate_plan(plan).violations
    return state.violations


def _plan_summary(plan: Plan) -> dict[str, Any]:
    return {"strategy": plan.strategy, "mode": plan.mode, "total_cost": round(plan.total_cost, 2),
            "schedule": [{"task_id": s.task_id, "start": fmt_hour(s.start_hour), "end": fmt_hour(s.end_hour),
                          "start_hour": s.start_hour, "end_hour": s.end_hour, "cost": round(s.cost.total, 2)}
                         for s in plan.schedule]}


def run_tool(state: AgentState, name: str, args: dict[str, Any]) -> Any:
    """Execute one tool deterministically. Errors come back as {"error": ...} for the LLM to fix."""
    try:
        if name == "get_backlog":
            from .backlog import BACKLOG
            return [t.model_dump() for t in BACKLOG]
        if name == "get_prices":
            from . import prices
            return [p.model_dump() for p in prices.get_prices(days=int(args.get("days", 7)))]
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
            return {"ok": True, "task": t.model_dump()}
        if name == "make_plan":
            return _plan_summary(_plan(state, args.get("strategy", "optimized"), args.get("mode", "gpu_cloud")))
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
        "racks_affected": {"type": "array", "items": {"type": "integer"}},
        "zone": {"type": "string"},
        "risk_growth_per_day": {"type": "number", "description": "optional, default 0.01"},
        "allowed_windows": {"type": "array", "items": {"type": "object", "properties": {
            "start_hour": {"type": "integer"}, "end_hour": {"type": "integer"}}}}},
        ["name", "equipment", "duration_hrs", "racks_affected", "zone"]),
    _fn("make_plan", "Schedule the backlog plus added tasks. strategy 'optimized' or 'asap'.", {
        "strategy": {"type": "string", "enum": ["optimized", "asap"]},
        "mode": {"type": "string", "enum": ["gpu_cloud", "private"]}}),
    _fn("simulate", "Run the hall simulation on the latest optimized plan; returns violations "
        "(zone conflicts, overheating, window breaks).", {}),
]

SYSTEM_PROMPT = """/no_think
You are the maintenance-planning agent for a GPU data center hall. Turn the operator's request into
ONE new maintenance task and get it scheduled. Workflow:
1. lookup_equipment(name) to get zone and racks.
2. day_windows(days, start_hour_of_day, end_hour_of_day) if the request limits days/times.
3. add_task with the zone, racks and windows exactly as the tools returned them.
4. make_plan(strategy="optimized"), then simulate. If simulate reports violations, call make_plan again.
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
        call("make_plan", {"strategy": "optimized"})
        call("simulate", {})
    if "asap" not in state.plans:
        call("make_plan", {"strategy": "asap"})


def build_facts(state: AgentState) -> dict[str, Any]:
    """Every number shown to the user comes from here (tools' outputs), never from the LLM."""
    t = state.tasks[-1]
    opt, asap = state.plans["optimized"], state.plans["asap"]
    s = next((x for x in opt.schedule if x.task_id == t.id), None)
    savings = asap.total_cost - opt.total_cost
    vs = state.violations or []
    return {
        "task_id": t.id, "task": t.name, "equipment": t.equipment, "zone": t.zone,
        "racks": f"{min(t.racks_affected)}-{max(t.racks_affected)}", "duration_hrs": t.duration_hrs,
        "windows": [f"{fmt_hour(w.start_hour)} to {fmt_hour(w.end_hour)}" for w in t.allowed_windows] or ["any time"],
        "scheduled": f"{fmt_hour(s.start_hour)} to {fmt_hour(s.end_hour)}" if s else "not scheduled",
        "optimized_total": round(opt.total_cost, 2), "asap_total": round(asap.total_cost, 2),
        "savings": round(savings, 2),
        "savings_pct": round(100 * savings / asap.total_cost, 1) if asap.total_cost > 0 else 0.0,
        "violations": len(vs), "violation_kinds": sorted({v.kind for v in vs}),
    }


def facts_text(f: dict[str, Any]) -> str:
    lines = [
        f"New task {f['task_id']}: {f['task']} ({f['equipment']}, zone {f['zone']}, racks {f['racks']}, "
        f"{f['duration_hrs']} h; allowed {', '.join(f['windows'])}).",
        f"Optimized plan runs it {f['scheduled']}.",
        f"Week total: optimized ${f['optimized_total']:,.2f} vs ASAP ${f['asap_total']:,.2f}, "
        f"saving ${f['savings']:,.2f} ({f['savings_pct']}%).",
        "Simulation: no cooling-zone conflicts or overheating." if not f["violations"] else
        f"Simulation: {f['violations']} violation(s) remain ({', '.join(f['violation_kinds'])}); needs review.",
    ]
    return " ".join(lines)


_NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")


def _numbers(text: str) -> set[float]:
    return {float(n.replace(",", "")) for n in _NUM.findall(text)}


def explain(state: AgentState, llm: LLM | None) -> str:
    base = facts_text(build_facts(state))
    if llm is None:
        return base
    try:
        msg = llm.chat([{"role": "system", "content": EXPLAIN_PROMPT},
                        {"role": "user", "content": f"FACTS: {base}"}], None)
        text = re.sub(r"<think>.*?</think>", "", msg.get("content") or "", flags=re.S).strip()
    except Exception:
        return base
    allowed = _numbers(base) | _numbers(state.text)
    if not text or not _numbers(text) <= allowed:
        return base  # LLM invented or altered a number: show the code-built facts instead
    return text


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
    if not state.tasks:
        cached = match_demo(text)
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
    return AgentResponse(task=state.tasks[-1], plan=state.plans["optimized"],
                         explanation=explain(state, llm), tool_calls=state.tool_calls)


@router.post("/request", response_model=AgentResponse)
def handle_request(req: AgentRequest) -> AgentResponse:
    return run_request(req.text, get_llm())
