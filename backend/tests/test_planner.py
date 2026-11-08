import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import Task, Window
from app.planner import is_business_hour_start, make_plan
from app.stubs import seeded_backlog

MODES = ["cloud", "private"]


def _assert_valid(plan, tasks):
    by_id = {t.id: t for t in tasks}
    for item in plan.items:
        task = by_id[item.task_id]
        assert item.end_hour - item.start_hour == task.duration_hrs
        assert any(
            w.start_hour <= item.start_hour and item.end_hour <= w.end_hour
            for w in task.allowed_windows
        ), f"{item.task_id} outside its allowed windows"
    for a in plan.items:
        for b in plan.items:
            if a.task_id < b.task_id and a.zone == b.zone:
                assert a.end_hour <= b.start_hour or b.end_hour <= a.start_hour, (
                    f"{a.task_id} and {b.task_id} overlap in cooling zone {a.zone}"
                )


@pytest.mark.parametrize("mode", MODES)
def test_optimized_beats_asap(mode):
    tasks = seeded_backlog()
    asap = make_plan(tasks, mode, "asap")
    opt = make_plan(tasks, mode, "optimized")
    assert not asap.unscheduled and not opt.unscheduled
    assert opt.total_cost < asap.total_cost


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("strategy", ["asap", "optimized"])
def test_plans_respect_windows_and_zones(mode, strategy):
    tasks = seeded_backlog()
    _assert_valid(make_plan(tasks, mode, strategy), tasks)


def test_asap_starts_in_business_hours():
    plan = make_plan(seeded_backlog(), "cloud", "asap")
    assert all(is_business_hour_start(i.start_hour) for i in plan.items)


def test_same_answer_every_run():
    runs = [make_plan(seeded_backlog(), "cloud", "optimized").model_dump() for _ in range(3)]
    assert runs[0] == runs[1] == runs[2]


def test_private_mode_has_no_sla_cost():
    plan = make_plan(seeded_backlog(), "private", "optimized")
    assert all(i.sla_cost == 0 for i in plan.items)


def test_new_vendor_restricted_task_lands_in_its_window():
    # The phase-2 demo request: "UPS-B battery swap, 3 hrs, vendor only Wed or Fri"
    new = Task(
        id="T7", name="UPS-B battery swap", equipment="UPS-B", duration_hrs=3,
        racks_affected=["B07", "B08"], zone="Z2", risk_growth_per_day=0.01,
        allowed_windows=[Window(start_hour=48, end_hour=72), Window(start_hour=96, end_hour=120)],
    )
    tasks = seeded_backlog() + [new]
    plan = make_plan(tasks, "cloud", "optimized")
    _assert_valid(plan, tasks)
    item = next(i for i in plan.items if i.task_id == "T7")
    assert item.start_label.split()[0] in {"Wed", "Fri"}


def test_impossible_task_is_reported_not_dropped_silently():
    impossible = Task(
        id="TX", name="Too long", equipment="X", duration_hrs=10,
        racks_affected=["A01"], zone="Z9", risk_growth_per_day=0.01,
        allowed_windows=[Window(start_hour=0, end_hour=5)],
    )
    plan = make_plan(seeded_backlog() + [impossible], "cloud", "optimized")
    assert [u.task_id for u in plan.unscheduled] == ["TX"]


def test_duplicate_ids_rejected():
    t = seeded_backlog()[0]
    with pytest.raises(ValueError):
        make_plan([t, t], "cloud", "optimized")


def test_plan_endpoint():
    client = TestClient(app)
    asap = client.post("/plan", json={"mode": "cloud", "strategy": "asap"}).json()
    opt = client.post("/plan", json={"mode": "cloud", "strategy": "optimized"}).json()
    assert opt["total_cost"] < asap["total_cost"]
    assert len(opt["items"]) == 6
    t = seeded_backlog()[0].model_dump()
    assert client.post("/plan", json={"tasks": [t, t]}).status_code == 422


# ---- thermal awareness -------------------------------------------------------
from app.backlog import BACKLOG  # noqa: E402
from app.simulate import simulate_plan  # noqa: E402
from app.stubs import CostBreakdown  # noqa: E402


def _overheats(plan, tasks):
    return [v for v in simulate_plan(plan, {t.id: t for t in tasks}).violations
            if v.kind == "overheat"]


@pytest.mark.parametrize("mode", MODES)
def test_optimized_never_overheats(mode):
    tasks = seeded_backlog()
    assert _overheats(make_plan(tasks, mode, "optimized"), tasks) == []


def test_asap_baseline_still_overheats():
    # The demo contrast: the naive plan stacks CRAC-2 and CDU-3 on Monday morning.
    tasks = seeded_backlog()
    assert _overheats(make_plan(tasks, "cloud", "asap"), tasks)


def test_thermal_check_separates_neighbor_cooling_outages():
    # CRAC-2 (Z2) and CDU-3 (Z3) are in different zones, so the zone rule allows overlap,
    # and a cost function that makes the same hour cheapest for both pulls them together.
    # Only the thermal check keeps them apart.
    crac, cdu = (next(t for t in BACKLOG if t.id == i) for i in ("T1", "T6"))
    tasks = [crac, cdu]
    def same_hour_cheapest(task, start, mode):
        return CostBreakdown(downtime=abs(start - 32), sla=0.0, risk=0.0)
    plan = make_plan(tasks, "cloud", "optimized", same_hour_cheapest)
    assert not plan.unscheduled
    assert _overheats(plan, tasks) == []
    # Without the check both would start at hour 32 (zones differ, so no zone conflict).
    # Zones heat up gradually, so a short overlap can be safe; a full stack is not.
    assert len({i.start_hour for i in plan.items}) == 2
