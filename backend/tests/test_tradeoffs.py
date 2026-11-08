"""Nemotron decides between priced options: compare_slots / choose_slot, and the stalled-run nudge."""
import json

import pytest
from fastapi.testclient import TestClient

from app import agent, planner
from app.agent import AgentState, ScriptedLLM, run_request, run_tool
from app.backlog import BACKLOG
from app.demo_requests import match_demo
from app.main import app
from app.schemas import Task, Window

from .test_agent import UPS_TASK_ARGS, UPS_TEXT, call, msg

client = TestClient(app)


@pytest.fixture(autouse=True)
def no_real_llm(monkeypatch):
    monkeypatch.setattr(agent, "get_llm", lambda: None)


def ups_state():
    st = AgentState(text=UPS_TEXT)
    run_tool(st, "add_task", match_demo(UPS_TEXT).model_dump())
    return st


def test_compare_slots_shape_order_dedup():
    out = run_tool(ups_state(), "compare_slots", {"task_id": "R1"})
    assert set(out) == {"task_id", "options", "cheapest_safe_start_hour"} and out["task_id"] == "R1"
    labels = [o["label"] for o in out["options"]]
    order = ["cheapest safe", "earliest allowed", "ASAP (business hours)", "wait 1 day"]
    assert labels == [x for x in order if x in labels] and labels[0] == "cheapest safe"
    starts = [o["start_hour"] for o in out["options"]]
    assert len(starts) == len(set(starts))                      # deduplicated by start_hour
    for o in out["options"]:
        assert set(o) == {"label", "start_hour", "end_hour", "start", "end", "task_cost", "week_total",
                          "violations", "safe"}
        assert o["end_hour"] - o["start_hour"] == 3 and o["start"].count(":") == 1
    assert out["cheapest_safe_start_hour"] == out["options"][0]["start_hour"]
    assert out["options"][1]["start_hour"] == planner.feasible_starts(match_demo(UPS_TEXT))[0]


def test_option_week_total_equals_planning_with_that_slot():
    task = match_demo(UPS_TEXT)
    out = run_tool(ups_state(), "compare_slots", {"task_id": "R1"})
    for o in out["options"]:
        pinned = task.model_copy(update={"allowed_windows": [Window(start_hour=o["start_hour"], end_hour=o["end_hour"])]})
        plan = planner.make_plan(BACKLOG + [pinned], "cloud", "optimized")
        assert o["week_total"] == round(plan.total_cost, 2)
        from app.prices import slot_cost
        assert o["task_cost"] == round(slot_cost(task, o["start_hour"], "cloud").total, 2)


def test_choose_slot_pins_and_keeps_operator_windows():
    st = ups_state()
    out = run_tool(st, "compare_slots", {"task_id": "R1"})
    alt = out["options"][1]                                     # earliest allowed: safe, not cheapest
    assert alt["safe"]
    r = run_tool(st, "choose_slot", {"task_id": "R1", "start_hour": alt["start_hour"], "reason": "asked for early"})
    assert r["ok"] is True and r["start_hour"] == alt["start_hour"] and r["reason"] == "asked for early"
    assert r["week_total"] == alt["week_total"]
    assert r["vs_cheapest"] == round(alt["week_total"] - out["options"][0]["week_total"], 2)
    assert st.tasks[-1].allowed_windows == [Window(start_hour=alt["start_hour"], end_hour=alt["end_hour"])]
    assert st.as_requested(st.tasks[-1]) == match_demo(UPS_TEXT)   # ASAP/pin checks still see the request
    plan = run_tool(st, "make_plan", {"strategy": "optimized"})
    assert next(s for s in plan["schedule"] if s["task_id"] == "R1")["start_hour"] == alt["start_hour"]
    assert plan["total_cost"] == alt["week_total"]


def test_choose_slot_outside_windows_is_refused():
    st = ups_state()
    r = run_tool(st, "choose_slot", {"task_id": "R1", "start_hour": 10})   # Mon: not Wed/Fri
    assert "error" in r and "outside" in r["error"]
    assert st.tasks[-1] == match_demo(UPS_TEXT)


def test_choose_slot_refuses_an_overheating_slot():
    """CRAC-3 (Z3) on top of the CRAC-2 job next door (Z2, frozen in place): no backup cooling."""
    base_plan = planner.make_plan(BACKLOG, "cloud", "optimized")
    t1 = next(i for i in base_plan.items if i.task_id == "T1")
    base = agent.freeze_before(BACKLOG, base_plan, t1.end_hour)
    st = AgentState(text="x", base=base)
    crac3 = Task(id="R1", name="CRAC-3 fan swap", equipment="CRAC-3", duration_hrs=3,
                 racks_affected=["C01", "C02", "C03", "C04", "C05"], zone="Z3", risk_growth_per_day=0.01,
                 allowed_windows=[Window(start_hour=t1.start_hour, end_hour=168)])
    run_tool(st, "add_task", crac3.model_dump())
    out = run_tool(st, "compare_slots", {"task_id": "R1"})
    early = next(o for o in out["options"] if o["start_hour"] == t1.start_hour)
    assert early["safe"] is False
    r = run_tool(st, "choose_slot", {"task_id": "R1", "start_hour": t1.start_hour})
    assert "error" in r and "not safe" in r["error"]
    assert st.tasks[-1] == crac3 and "R1" not in st.choice           # nothing pinned
    ok = run_tool(st, "choose_slot", {"task_id": "R1", "start_hour": out["cheapest_safe_start_hour"]})
    assert ok["ok"] is True and ok["vs_cheapest"] == 0.0


def full_script(start_hour=None, explanation=""):
    def compare_then_choose():
        return [msg(call("compare_slots", {"task_id": "R1"})),
                msg(call("choose_slot", {"task_id": "R1", "start_hour": start_hour or 50, "reason": "cheapest safe"}))]
    return ScriptedLLM([
        msg(call("lookup_equipment", {"name": "UPS-B"})),
        msg(call("day_windows", {"days": ["Wed", "Fri"]})),
        msg(call("add_task", UPS_TASK_ARGS)),
        *compare_then_choose(),
        msg(call("make_plan", {"strategy": "optimized"})),
        msg(call("simulate")),
        msg(content="Done."),
        {"role": "assistant", "content": explanation, "tool_calls": []},
    ])


def test_llm_choice_shows_in_trace_and_facts():
    cmp = run_tool(ups_state(), "compare_slots", {"task_id": "R1"})
    cheapest = cmp["options"][0]
    r = run_request(UPS_TEXT, full_script(cheapest["start_hour"]))
    assert r.tool_calls[:7] == ["lookup_equipment", "day_windows", "add_task", "compare_slots", "choose_slot",
                                "make_plan", "simulate"]
    assert "guardrail:pinned_demo_task" not in r.tool_calls
    assert r.task == match_demo(UPS_TEXT)
    assert f"Nemotron compared {len(cmp['options'])} slots and chose {cheapest['start']} to {cheapest['end']} " \
           f"(cheapest safe was {cheapest['start']}, +$0.00)." in r.explanation
    assert next(i for i in r.plan.items if i.task_id == "R1").start_hour == cheapest["start_hour"]


def test_explanation_rewrite_still_guarded():
    r = run_request(UPS_TEXT, full_script(explanation="Saved $999,999.99."))
    assert "999" not in r.explanation and r.explanation.startswith("New task R1")


def test_unsafe_choice_goes_back_to_llm():
    """The LLM can never select an unsafe slot: the error comes back as the tool result."""
    llm = ScriptedLLM([msg(call("add_task", UPS_TASK_ARGS)),
                       msg(call("choose_slot", {"task_id": "R1", "start_hour": 5}, "bad")),
                       msg(content="ok")])
    r = run_request(UPS_TEXT, llm)
    err = json.loads([m for m in llm.received[2] if m["role"] == "tool"][-1]["content"])
    assert "error" in err
    assert "Nemotron compared" not in r.explanation


# ---- nudge ----

def stalled_script():
    return ScriptedLLM([
        msg(call("lookup_equipment", {"name": "UPS-B"})),
        msg(content="UPS-B is in zone Z4."),          # stalls: no tool call, no task
        msg(call("add_task", UPS_TASK_ARGS)),
        msg(content="Done."),
        {"role": "assistant", "content": "", "tool_calls": []},
    ])


def test_nudge_recovers_a_stalled_run():
    llm = stalled_script()
    r = run_request("Swap UPS-B batteries, 3 hours, Wed or Fri", llm)
    assert r.tool_calls[:3] == ["lookup_equipment", "guardrail:nudge", "add_task"]
    assert r.task is not None and r.task.equipment == "UPS-B"
    assert llm.received[2][-1]["role"] == "user" and "add_task" in llm.received[2][-1]["content"]


def test_nudge_only_once():
    llm = ScriptedLLM([msg(call("lookup_equipment", {"name": "UPS-B"})), msg(content="hm"), msg(content="still no")])
    r = run_request("unscripted thing", llm)
    assert r.tool_calls.count("guardrail:nudge") == 1 and r.task is None


def test_nudge_streams_as_code_event(monkeypatch):
    monkeypatch.setattr(agent, "get_llm", stalled_script)
    r = client.post("/request/stream", json={"text": "Swap UPS-B batteries, 3 hours, Wed or Fri"})
    ev = [json.loads(x) for x in r.text.splitlines() if x.strip()]
    nudge = next(e for e in ev if e["type"] == "tool" and e["name"] == "nudge")
    assert nudge["by"] == "code" and nudge["label"] == "guardrail:nudge" and nudge["result"]["message"]
    assert [e["label"] for e in ev if e["type"] == "tool"] == ev[-1]["response"]["tool_calls"]
