import pytest
from fastapi.testclient import TestClient

from app import agent, planner
from app.agent import ScriptedLLM, build_handoff
from app.backlog import BACKLOG
from app.demo_requests import DEMO_REQUESTS
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def no_real_llm(monkeypatch):
    monkeypatch.setattr(agent, "get_llm", lambda: None)


def test_one_item_per_scheduled_task_and_deterministic():
    a = client.post("/handoff", json={}).json()
    b = client.post("/handoff", json={}).json()
    assert a == b
    plan = planner.make_plan(BACKLOG, "cloud", "optimized")
    assert [i["task_id"] for i in a["items"]] == [i.task_id for i in plan.items]
    assert a["total_cost"] == plan.total_cost and a["llm_used"] is False


def test_brief_numbers_equal_item_numbers():
    d = build_handoff()
    for i in d["items"]:
        assert f"${i['cost']:,.2f}" in d["shift_brief"]
        assert f"{i['peak_zone_temp_c']:.1f} C" in d["shift_brief"]
        assert i["start_label"] in d["shift_brief"] and i["racks_label"] in d["shift_brief"]
        if i["delay_1d"]:
            assert f"${i['delay_1d']['cost_if_delayed_1d']:,.2f}" in d["shift_brief"]
    assert f"${d['total_cost']:,.2f}" in d["shift_brief"]


def test_private_mode_and_extra_task():
    ups = next(iter(DEMO_REQUESTS.values())).model_copy(deep=True)
    d = client.post("/handoff", json={"mode": "private", "extra_tasks": [ups.model_dump()]}).json()
    assert "private mode" in d["shift_brief"]
    assert ups.id in [i["task_id"] for i in d["items"]]


def test_watch_flags_neighbor_cooling_and_overheat(monkeypatch):
    # The thermal-aware planner won't let the pinned clash overheat; make it blind to heat from
    # R1 so the handoff has an overheat to flag.
    from tests.test_agent import ignore_heat_from_new_task, neighbor_cooling_scenario
    ignore_heat_from_new_task(monkeypatch)
    task, clash, _ = neighbor_cooling_scenario()
    pinned = task.model_copy(update={"allowed_windows": task.allowed_windows[:1]})  # only the clashing slot
    d = build_handoff("cloud", [pinned])
    item = next(i for i in d["items"] if i["task_id"] == "R1")
    assert any(w.startswith("neighbor cooling down") for w in item["watch"])
    assert any("over 32 C" in w for w in item["watch"])
    assert item["peak_zone_temp_c"] > item["temp_limit_c"]


def test_llm_rewrite_kept_only_without_invented_numbers(monkeypatch):
    base = build_handoff()["shift_brief"]
    first_line = base.splitlines()[0]
    monkeypatch.setattr(agent, "get_llm", lambda: ScriptedLLM([{"content": first_line, "tool_calls": []}]))
    ok = client.post("/handoff", json={}).json()
    assert ok["llm_used"] is True and ok["shift_brief"] == first_line

    monkeypatch.setattr(agent, "get_llm", lambda: ScriptedLLM([{"content": "Budget is $999,999.99.", "tool_calls": []}]))
    bad = client.post("/handoff", json={}).json()
    assert bad["llm_used"] is False and bad["shift_brief"] == base
