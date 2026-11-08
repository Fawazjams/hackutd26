from collections import Counter

from fastapi.testclient import TestClient

from app.backlog import BACKLOG, task_lookup
from app.config import COOLING_ZONES, HOURS, NUM_RACKS, OVERHEAT_C, ZONE_RACKS
from app.main import app
from app.schemas import CostBreakdown, Plan, ScheduledTask, Task
from app.simulate import find_conflicts, simulate_plan

client = TestClient(app)
TASKS = task_lookup()


def make_plan(*items: tuple[str, int], extra: list[Task] | None = None) -> Plan:
    lookup = task_lookup(extra)
    sched = []
    for tid, start in items:
        dur = lookup[tid].duration_hrs if tid in lookup else 1
        cost = CostBreakdown(task_id=tid, start_hour=start, mode="gpu_cloud",
                             downtime_cost=0, risk_cost=0, sla_cost=0, total=0)
        sched.append(ScheduledTask(task_id=tid, start_hour=start, end_hour=start + dur, cost=cost))
    return Plan(mode="gpu_cloud", strategy="optimized", schedule=sched, total_cost=0, tasks=extra or [])


def kinds(result) -> Counter:
    return Counter(v.kind for v in result.violations)


# ---- backlog ----

def test_backlog_shape():
    assert 5 <= len(BACKLOG) <= 6
    assert len({t.id for t in BACKLOG}) == len(BACKLOG)
    zones = Counter(t.zone for t in BACKLOG)
    assert any(n >= 2 for n in zones.values()), "at least two tasks must share a cooling zone"


def test_backlog_racks_and_windows_valid():
    for t in BACKLOG:
        assert t.zone in COOLING_ZONES
        assert t.racks_affected and all(0 <= r < NUM_RACKS for r in t.racks_affected)
        assert set(t.racks_affected) <= set(ZONE_RACKS[t.zone]), f"{t.id} racks outside zone {t.zone}"
        for w in t.allowed_windows:
            assert 0 <= w.start_hour < w.end_hour <= HOURS
            assert w.end_hour - w.start_hour >= t.duration_hrs, f"{t.id} window shorter than task"


def test_backlog_endpoint():
    data = client.get("/backlog").json()
    assert [t["id"] for t in data] == [t.id for t in BACKLOG]


# ---- simulate ----

def test_empty_plan_is_quiet():
    r = simulate_plan(make_plan())
    assert len(r.hours) == HOURS
    assert r.violations == []
    for hs in r.hours:
        assert hs.racks_offline == []
        assert all(23 < t < 25 for t in hs.zone_temps_c.values())


def test_racks_offline_match_schedule():
    r = simulate_plan(make_plan(("T3", 10)))
    assert r.hours[9].racks_offline == []
    assert r.hours[10].racks_offline == TASKS["T3"].racks_affected
    assert r.hours[12].racks_offline == TASKS["T3"].racks_affected
    assert r.hours[13].racks_offline == []


def test_same_zone_overlap_flags_zone_conflict_on_exact_hours():
    # T1 Z2 hours 20-26, T2 Z2 hours 24-28 -> overlap 24, 25
    r = simulate_plan(make_plan(("T1", 20), ("T2", 24)))
    conflict_hours = [v.hour for v in r.violations if v.kind == "zone_conflict"]
    assert conflict_hours == [24, 25]
    assert "Z2" in r.violations[0].detail or any("Z2" in v.detail for v in r.violations)


def test_back_to_back_same_zone_is_fine():
    r = simulate_plan(make_plan(("T1", 20), ("T2", 26)))
    assert kinds(r)["zone_conflict"] == 0


def test_cooling_alone_does_not_overheat():
    r = simulate_plan(make_plan(("T1", 20)))
    assert kinds(r)["overheat"] == 0
    assert max(hs.zone_temps_c["Z2"] for hs in r.hours) < OVERHEAT_C
    assert r.hours[25].zone_temps_c["Z2"] > r.hours[19].zone_temps_c["Z2"]  # but it does warm up


def test_neighbor_cooling_outages_overheat():
    # T1 (CRAC-2, Z2) and T6 (CDU-3, Z3) both Mon 08:00 -> no backup cooling
    r = simulate_plan(make_plan(("T1", 8), ("T6", 8)))
    hot = {v.detail.split()[1] for v in r.violations if v.kind == "overheat"}
    assert {"Z2", "Z3"} <= hot
    assert kinds(r)["zone_conflict"] == 0  # different zones


def test_window_violation():
    r = simulate_plan(make_plan(("T4", 0)))  # UPS test only Tue/Thu 08-17
    assert [v.kind for v in r.violations] == ["window"]
    ok = simulate_plan(make_plan(("T4", 32)))  # Tue 08:00
    assert ok.violations == []


def test_past_horizon_is_window_violation():
    r = simulate_plan(make_plan(("T3", HOURS - 1)))
    assert kinds(r)["window"] == 1


def test_unknown_task_and_extra_tasks():
    r = simulate_plan(make_plan(("X9", 5)))
    assert kinds(r)["unknown_task"] == 1
    ups_b = Task(id="T7", name="UPS-B battery swap", equipment="UPS-B", duration_hrs=3,
                 racks_affected=[30, 31], zone="Z4", risk_growth_per_day=0.01)
    r2 = simulate_plan(make_plan(("T7", 40), ("T5", 41), extra=[ups_b]))
    assert kinds(r2)["unknown_task"] == 0
    assert [v.hour for v in r2.violations if v.kind == "zone_conflict"] == [41, 42]


def test_find_conflicts_matches_sim_without_thermal():
    p = make_plan(("T1", 8), ("T2", 10), ("T6", 8), ("T4", 0))
    full = [v for v in simulate_plan(p).violations if v.kind != "overheat"]
    assert find_conflicts(p) == full


def test_deterministic_function_and_api():
    p = make_plan(("T1", 8), ("T2", 10), ("T6", 8))
    assert simulate_plan(p) == simulate_plan(p)
    a = client.post("/simulate", json=p.model_dump()).json()
    b = client.post("/simulate", json=p.model_dump()).json()
    assert a == b
    assert a == simulate_plan(p).model_dump()
