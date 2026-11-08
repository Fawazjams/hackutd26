"""Autonomous incident: an alarm fires, Nemotron triages and schedules the repair with no operator."""
import json

import pytest
from fastapi.testclient import TestClient

from app import agent, planner, simulate
from app.agent import ScriptedLLM, freeze_before, run_incident
from app.backlog import BACKLOG
from app.demo_requests import match_demo
from app.incidents import INCIDENTS, alarm_text, expected_task, get_incident
from app.main import app

from .test_agent import UPS_TEXT, call, msg

client = TestClient(app)
INC = get_incident("INC1")


@pytest.fixture(autouse=True)
def no_real_llm(monkeypatch):
    monkeypatch.setattr(agent, "get_llm", lambda: None)


def stream(body):
    r = client.post("/incident/stream", json=body)
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/x-ndjson")
    return [json.loads(x) for x in r.text.splitlines() if x.strip()]


def tools(ev):
    return [e for e in ev if e["type"] == "tool"]


@pytest.mark.parametrize("now", [10, 40, 62, 100])
def test_freeze_before_keeps_the_past_and_starts_nothing_new_before_now(now):
    plan = planner.make_plan(BACKLOG, "cloud", "optimized")
    frozen = freeze_before(BACKLOG, plan, now)
    after = planner.make_plan(frozen, "cloud", "optimized")
    old = {i.task_id: i.start_hour for i in plan.items}
    new = {i.task_id: i.start_hour for i in after.items}
    for tid, s in old.items():
        if s < now:
            assert new[tid] == s                                      # the past never moves
    assert all(s >= now for tid, s in new.items() if old.get(tid, now) >= now)


def test_incident_is_schedulable_and_options_differ():
    base, _ = agent.incident_week(INC)
    st = agent.AgentState(text="x", base=base, id_prefix="I")
    agent.run_tool(st, "add_task", expected_task("INC1").model_dump())
    out = agent.run_tool(st, "compare_slots", {"task_id": "I1"})
    assert out["cheapest_safe_start_hour"] is not None and out["cheapest_safe_start_hour"] >= INC["hour"]
    assert len({o["task_cost"] for o in out["options"]}) >= 2
    assert all(o["start_hour"] >= INC["hour"] for o in out["options"])


def test_get_incidents():
    r = client.get("/incidents").json()
    assert r == INCIDENTS and r[0]["id"] == "INC1" and "expected_task" not in r[0]
    assert "week hour 62" in alarm_text(INC) and "end_hour 168" in alarm_text(INC)


def incident_script():
    args = expected_task("INC1").model_dump(exclude={"id"})
    return ScriptedLLM([
        msg(call("lookup_equipment", {"name": "CRAC-3"})),
        msg(call("add_task", args)),
        msg(call("compare_slots", {"task_id": "I1"})),
        msg(call("choose_slot", {"task_id": "I1", "start_hour": 62, "reason": "cheapest safe, fix now"})),
        msg(call("make_plan", {"strategy": "optimized"})),
        msg(call("simulate")),
        msg(content="Scheduled."),
        {"role": "assistant", "content": "", "tool_calls": []},
    ])


def test_incident_stream_scripted_happy_path(monkeypatch):
    monkeypatch.setattr(agent, "get_llm", incident_script)
    ev = stream({"incident_id": "INC1"})
    assert ev[0]["type"] == "start" and ev[0]["kind"] == "incident" and ev[0]["incident"] == INC
    assert ev[0]["llm"] is True and ev[0]["text"] == alarm_text(INC)
    resp = ev[-1]["response"]
    assert ev[-1]["type"] == "done" and resp["task"]["id"] == "I1"
    item = next(i for i in resp["plan"]["items"] if i["task_id"] == "I1")
    assert item["start_hour"] >= 62
    by = {e["label"]: e["by"] for e in tools(ev)}
    assert by["compare_slots"] == "nemotron" and by["choose_slot"] == "nemotron"
    assert "guardrail:pinned_demo_task" not in resp["tool_calls"]
    assert [e["label"] for e in tools(ev)] == resp["tool_calls"]
    assert "Alarm (simulated telemetry) at Wed 14:00" in resp["explanation"]
    assert "Nemotron compared" in resp["explanation"]
    # the past is frozen: every backlog job sits where the week's optimized plan had it
    week = {i.task_id: i.start_hour for i in planner.make_plan(BACKLOG, "cloud", "optimized").items}
    for i in resp["plan"]["items"]:
        if week.get(i["task_id"], 999) < 62:
            assert i["start_hour"] == week[i["task_id"]]
    assert resp["asap_plan"]["strategy"] == "asap"
    ids = lambda p: {i["task_id"] for i in p["items"]} | {u["task_id"] for u in p["unscheduled"]}
    assert ids(resp["asap_plan"]) == ids(resp["plan"])


def test_incident_offline_fallback():
    ev = stream({"incident_id": "INC1"})
    assert ev[0]["llm"] is False and ev[0]["kind"] == "incident"
    resp = ev[-1]["response"]
    assert resp["tool_calls"][:3] == ["fallback:add_task", "fallback:compare_slots", "fallback:choose_slot"]
    assert all(e["by"] == "code" for e in tools(ev))
    assert resp["task"] == expected_task("INC1").model_dump(mode="json")
    choose = next(e for e in tools(ev) if e["name"] == "choose_slot")
    item = next(i for i in resp["plan"]["items"] if i["task_id"] == "I1")
    assert item["start_hour"] == choose["result"]["start_hour"] >= 62
    lookup = {t.id: t for t in agent.incident_week(INC)[0]} | {"I1": expected_task("INC1")}
    from app.schemas import Plan
    assert simulate.simulate_plan(Plan(**resp["plan"]), lookup).violations == []


def test_incident_unknown_id_is_404():
    r = client.post("/incident/stream", json={"incident_id": "NOPE"})
    assert r.status_code == 404


def test_incident_is_deterministic():
    assert stream({"incident_id": "INC1"}) == stream({"incident_id": "INC1"})
    assert run_incident("INC1", None) == run_incident("INC1", None)


def test_incident_with_extra_tasks_keeps_them():
    ups = match_demo(UPS_TEXT)
    ev = stream({"incident_id": "INC1", "extra_tasks": [ups.model_dump(mode="json")]})
    plan = ev[-1]["response"]["plan"]
    ids = {i["task_id"] for i in plan["items"]}
    assert {"R1", "I1"} <= ids
