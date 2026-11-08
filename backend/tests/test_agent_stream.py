"""POST /request/stream: NDJSON events as the agent works (start, thinking, tool, explaining, done)."""
import json

import pytest
from fastapi.testclient import TestClient

from app import agent
from app.agent import ScriptedLLM, run_request
from app.demo_requests import match_demo
from app.main import app

from .test_agent import UPS_TASK_ARGS, UPS_TEXT, call, happy_script, msg

client = TestClient(app)


@pytest.fixture(autouse=True)
def no_real_llm(monkeypatch):
    monkeypatch.setattr(agent, "get_llm", lambda: None)


def use_llm(monkeypatch, make_llm):
    monkeypatch.setattr(agent, "get_llm", make_llm)


def stream(text):
    r = client.post("/request/stream", json={"text": text})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/x-ndjson")
    assert r.headers["cache-control"] == "no-cache" and r.headers["x-accel-buffering"] == "no"
    return [json.loads(line) for line in r.text.splitlines() if line.strip()]


def tools(events):
    return [e for e in events if e["type"] == "tool"]


def test_happy_path_event_order_and_labels(monkeypatch):
    use_llm(monkeypatch, happy_script)
    ev = stream(UPS_TEXT)
    assert ev[0] == {"type": "start", "text": UPS_TEXT, "llm": True, "kind": "request"}
    assert ev[-1]["type"] == "done"
    types = [e["type"] for e in ev]
    assert types.index("explaining") == len(ev) - 2          # explanation runs last, right before done
    assert [e["step"] for e in ev if e["type"] == "thinking"] == [1, 2, 3, 4, 5, 6]
    assert types[1] == "thinking" and types[2] == "tool"      # think, then the tool it chose
    resp = ev[-1]["response"]
    assert [e["label"] for e in tools(ev)] == resp["tool_calls"]
    assert resp["tool_calls"] == ["lookup_equipment", "day_windows", "add_task", "make_plan", "simulate",
                                  "guardrail:make_plan[asap]"]
    by = {e["label"]: (e["by"], e["name"]) for e in tools(ev)}
    assert by["lookup_equipment"] == ("nemotron", "lookup_equipment")
    assert by["guardrail:make_plan[asap]"] == ("code", "make_plan")


def test_tool_event_payloads(monkeypatch):
    use_llm(monkeypatch, happy_script)
    ev = {e["label"]: e for e in tools(stream(UPS_TEXT))}
    assert ev["lookup_equipment"]["args"] == {"name": "UPS-B"}
    assert ev["lookup_equipment"]["result"]["zone"] == "Z4"
    assert ev["day_windows"]["result"]["windows"] == UPS_TASK_ARGS["allowed_windows"]
    plan = ev["make_plan"]["result"]
    assert plan["strategy"] == "optimized" and "R1" in [s["task_id"] for s in plan["schedule"]]
    assert set(plan["schedule"][0]) == {"task_id", "start", "end", "start_hour", "end_hour", "cost"}
    assert ev["guardrail:make_plan[asap]"]["result"]["strategy"] == "asap"


def test_done_matches_post_request(monkeypatch):
    use_llm(monkeypatch, happy_script)
    streamed = stream(UPS_TEXT)[-1]["response"]
    plain = client.post("/request", json={"text": UPS_TEXT}).json()
    assert streamed == plain


def test_backlog_and_prices_are_counted_not_dumped(monkeypatch):
    use_llm(monkeypatch, lambda: ScriptedLLM([msg(call("get_backlog"), call("get_prices", {"days": 7}, "c2")),
                                              msg(content="done")]))
    ev = {e["name"]: e for e in tools(stream("what's on the backlog"))}
    assert ev["get_backlog"]["result"] == {"count": 6}
    assert ev["get_prices"]["result"] == {"count": 7}


def test_pin_does_not_fire_on_a_correct_parse(monkeypatch):
    """Exact rehearsed task, default risk 0.01 (the text never mentions risk): Nemotron's parse stands."""
    use_llm(monkeypatch, happy_script)
    ev = stream(UPS_TEXT)
    labels = [e["label"] for e in tools(ev)]
    assert "guardrail:pinned_demo_task" not in labels
    assert ev[-1]["response"]["task"] == match_demo(UPS_TEXT).model_dump(mode="json")


def test_pin_fires_and_streams_when_parse_is_wrong(monkeypatch):
    friday_only = dict(UPS_TASK_ARGS, allowed_windows=[{"start_hour": 96, "end_hour": 120}])  # dropped Wed
    use_llm(monkeypatch, lambda: ScriptedLLM([msg(call("add_task", friday_only)), msg(content="done")]))
    ev = stream(UPS_TEXT)
    pin = next(e for e in tools(ev) if e["name"] == "pinned_demo_task")
    assert pin["label"] == "guardrail:pinned_demo_task" and pin["by"] == "code"
    assert pin["result"]["task"] == pin["args"] == match_demo(UPS_TEXT).model_dump(mode="json")
    assert [e["label"] for e in tools(ev)] == ev[-1]["response"]["tool_calls"]


def test_offline_fallback_streams_code_steps():
    ev = stream(UPS_TEXT)
    assert ev[0]["llm"] is False
    assert not any(e["type"] == "thinking" for e in ev)
    t = tools(ev)
    assert [e["label"] for e in t] == ["fallback:add_task", "fallback:make_plan[optimized]",
                                       "fallback:simulate", "fallback:make_plan[asap]"]
    assert all(e["by"] == "code" for e in t)
    assert t[0]["args"] == match_demo(UPS_TEXT).model_dump(mode="json")
    assert t[0]["result"]["ok"] is True
    assert ev[-1]["response"]["tool_calls"] == [e["label"] for e in t]


def test_llm_error_event_has_no_key(monkeypatch):
    monkeypatch.setenv("NVIDIA_API_KEY", "nvapi-secret123")

    class Boom:
        def chat(self, messages, tools):
            raise RuntimeError("401 bad key nvapi-secret123")
    use_llm(monkeypatch, Boom)
    ev = stream(UPS_TEXT)
    err = next(e for e in tools(ev) if e["label"] == "llm_error")
    assert err["by"] == "code" and err["name"] == "llm_error"
    assert err["result"]["error"].startswith("RuntimeError: ") and "secret123" not in json.dumps(ev)
    assert "fallback:add_task" in ev[-1]["response"]["tool_calls"]


def test_unscripted_offline_still_ends_with_done():
    ev = stream("replace the moon")
    assert [e["type"] for e in ev] == ["start", "done"]
    assert ev[-1]["response"]["task"] is None


def test_crash_streams_error_last(monkeypatch):
    def boom(state, prefix):
        raise ValueError("planner exploded")
    monkeypatch.setattr(agent, "_finish_pipeline", boom)
    ev = stream(UPS_TEXT)
    assert ev[0]["type"] == "start"
    assert ev[-1] == {"type": "error", "message": "ValueError: planner exploded"}
    assert not any(e["type"] == "done" for e in ev)


def test_broken_listener_never_breaks_the_agent():
    def bad(event):
        raise RuntimeError("socket closed")
    assert run_request(UPS_TEXT, None, on_event=bad) == run_request(UPS_TEXT, None)
