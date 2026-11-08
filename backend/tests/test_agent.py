import json

import pytest
from fastapi.testclient import TestClient

from app import agent
from app.agent import ScriptedLLM, day_windows, lookup_equipment, run_request
from app.demo_requests import DEMO_REQUESTS, match_demo
from app.main import app

client = TestClient(app)
UPS_TEXT = "UPS-B battery swap, 3 hrs, vendor only Wed or Fri"


def call(name, args=None, cid=None):
    return {"id": cid or f"c_{name}", "type": "function",
            "function": {"name": name, "arguments": json.dumps(args or {})}}


def msg(*calls, content=""):
    return {"role": "assistant", "content": content, "tool_calls": list(calls)}


UPS_TASK_ARGS = {"name": "UPS-B battery swap", "equipment": "UPS-B", "duration_hrs": 3,
                 "racks_affected": [f"D{i:02d}" for i in range(1, 11)], "zone": "Z4",
                 "allowed_windows": [{"start_hour": 48, "end_hour": 72}, {"start_hour": 96, "end_hour": 120}]}


def happy_script(explanation="Scheduled the UPS-B swap."):
    return ScriptedLLM([
        msg(call("lookup_equipment", {"name": "UPS-B"})),
        msg(call("day_windows", {"days": ["Wed", "Fri"]})),
        msg(call("add_task", UPS_TASK_ARGS)),
        msg(call("make_plan", {"strategy": "optimized"})),
        msg(call("simulate")),
        msg(content="Done."),
        {"role": "assistant", "content": explanation, "tool_calls": []},  # explain() call
    ])


@pytest.fixture(autouse=True)
def no_real_llm(monkeypatch):
    """No network in tests: the endpoint sees no Nemotron unless a test injects one."""
    monkeypatch.setattr(agent, "get_llm", lambda: None)


# ---- deterministic helpers ----

def test_day_windows_and_lookup():
    assert day_windows(["Wed", "Friday"])["windows"] == [{"start_hour": 48, "end_hour": 72},
                                                         {"start_hour": 96, "end_hour": 120}]
    assert day_windows([0], 8, 18)["windows"] == [{"start_hour": 8, "end_hour": 18}]
    assert "error" in day_windows(["Funday"])
    assert "error" in day_windows(["Mon"], 18, 8)
    ups = lookup_equipment("UPS-B battery")
    assert ups["equipment"] == "UPS-B" and ups["zone"] == "Z4" and ups["racks"] == [f"D{i:02d}" for i in range(1, 11)]
    assert lookup_equipment("crac 2")["racks"] == ["B01", "B02", "B03", "B04", "B05"]   # matches backlog T1
    assert lookup_equipment("CDU-3")["racks"] == ["C05", "C06", "C07", "C08"]          # matches backlog T6
    assert lookup_equipment("PDU row B")["racks"] == ["B06", "B07", "B08", "B09", "B10"]  # matches backlog T2
    assert lookup_equipment("PDU-B")["racks"] == lookup_equipment("PDU row B")["racks"]  # frontend alias
    assert "error" in lookup_equipment("flux capacitor")


# ---- LLM loop ----

def test_tool_call_sequence_recorded():
    llm = happy_script()
    r = run_request(UPS_TEXT, llm)
    assert r.tool_calls[:5] == ["lookup_equipment", "day_windows", "add_task", "make_plan", "simulate"]
    assert "guardrail:make_plan[asap]" in r.tool_calls
    assert r.task.id == "R1" and r.task.zone == "Z4"
    assert "R1" in [s.task_id for s in r.plan.items]
    assert r.explanation == "Scheduled the UPS-B swap."


def test_add_task_validation_error_goes_back_to_llm():
    bad = dict(UPS_TASK_ARGS, zone="Z9")
    llm = ScriptedLLM([msg(call("add_task", bad, "c1")), msg(call("add_task", UPS_TASK_ARGS, "c2")),
                       msg(content="ok"), {"role": "assistant", "content": "fine", "tool_calls": []}])
    r = run_request(UPS_TEXT, llm)
    tool_msgs = [m for m in llm.received[1] if m["role"] == "tool"]
    assert tool_msgs and "error" in json.loads(tool_msgs[0]["content"])
    assert tool_msgs[0]["tool_call_id"] == "c1"
    assert r.task is not None and r.task.zone == "Z4"


def test_racks_outside_zone_rejected():
    llm = ScriptedLLM([msg(call("add_task", dict(UPS_TASK_ARGS, racks_affected=["A01", "A02"])))])
    run_request("unscripted thing", llm)
    content = json.loads([m for m in llm.received[1] if m["role"] == "tool"][0]["content"])
    assert "inside Z4" in content["error"]


def test_explanation_with_invented_number_falls_back_to_facts():
    r = run_request(UPS_TEXT, happy_script(explanation="This saves $123,456.78 this week."))
    assert "123" not in r.explanation
    assert r.explanation.startswith("New task R1")


def test_explanation_numbers_match_tool_numbers():
    r = run_request(UPS_TEXT, None)
    from app import planner
    from app.backlog import BACKLOG
    opt = planner.make_plan(BACKLOG + [r.task], "cloud", "optimized")
    asap = planner.make_plan(BACKLOG + [r.task], "cloud", "asap")
    assert f"${opt.total_cost:,.2f}" in r.explanation
    assert f"${asap.total_cost:,.2f}" in r.explanation
    assert f"${asap.total_cost - opt.total_cost:,.2f}" in r.explanation


def test_llm_crash_falls_back_to_rehearsed_task():
    class Boom:
        def chat(self, messages, tools):
            raise RuntimeError("429 rate limited")
    r = run_request(UPS_TEXT, Boom())
    assert r.task == match_demo(UPS_TEXT)
    assert "llm_error" in r.tool_calls and "fallback:add_task" in r.tool_calls


# ---- fallback / endpoint ----

def test_no_key_means_no_llm(monkeypatch):
    monkeypatch.undo()  # use the real get_llm
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)
    assert agent.get_llm() is None


@pytest.mark.parametrize("text", list(DEMO_REQUESTS))
def test_demo_requests_offline(text):
    r = run_request(text, None)
    expected = DEMO_REQUESTS[text]
    assert r.task == expected
    assert expected.id in [s.task_id for s in r.plan.items]
    assert r.tool_calls[0] == "fallback:add_task"
    assert expected.name in r.explanation


def test_demo_match_is_normalized():
    assert match_demo("  ups-b BATTERY swap 3 hrs vendor only wed or fri!! ") is not None
    assert match_demo("replace the moon") is None


def test_unscripted_offline_is_graceful():
    r = run_request("replace the moon", None)
    assert r.task is None and r.plan is None
    assert "offline" in r.explanation


def test_request_endpoint_deterministic():
    a = client.post("/request", json={"text": UPS_TEXT})
    b = client.post("/request", json={"text": UPS_TEXT})
    assert a.status_code == 200
    assert a.json() == b.json()
    assert a.json()["task"]["equipment"] == "UPS-B"
