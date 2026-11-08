"""Cost model (app/prices.py): /cost endpoint, risk formula, modes, determinism, price-driven savings."""
import pytest
from fastapi.testclient import TestClient

from app import prices as P
from app.backlog import BACKLOG
from app.config import DAILY_PRICE, EMERGENCY_PREMIUM, UNPLANNED_COST_MULTIPLIER
from app.main import app
from app.planner import make_plan
from app.stubs import seeded_backlog, slot_cost as stub_slot_cost

client = TestClient(app)
T1 = BACKLOG[0]


def test_stubs_reexport_the_real_cost_model():
    assert stub_slot_cost is P.slot_cost


def test_prices_curve_shape():
    data = client.get("/prices", params={"days": 7}).json()
    assert [d["price"] for d in data] == DAILY_PRICE
    assert data[0]["price"] == 3.04                       # Silicon Data public index level
    for d in data:
        assert set(d) == {"day", "gpu", "price", "low", "high"}
        assert d["low"] < d["price"] < d["high"]
    assert max(DAILY_PRICE) <= 3.04 * 1.10 and min(DAILY_PRICE) >= 3.04 * 0.90


@pytest.mark.parametrize("mode", ["cloud", "private"])
def test_cost_endpoint_matches_slot_cost(mode):
    r = client.get("/cost", params={"task_id": "T1", "start_hour": 30, "mode": mode})
    assert r.status_code == 200
    body, c = r.json(), P.slot_cost(T1, 30, mode)
    assert body["downtime_cost"] == round(c.downtime, 2)
    assert body["sla_cost"] == round(c.sla, 2)
    assert body["risk_cost"] == round(c.risk, 2)
    assert body["total"] == round(c.total, 2)
    assert body["mode"] == mode


def test_cost_endpoint_errors():
    assert client.get("/cost", params={"task_id": "NOPE", "start_hour": 0}).status_code == 404
    assert client.get("/cost", params={"task_id": "T1", "start_hour": 999}).status_code == 422


def test_no_waiting_means_planned_cost_only():
    c = P.slot_cost(T1, 0, "cloud")                       # p = 0 at Mon 00:00
    assert c.risk == 0 and c.total == pytest.approx(c.downtime + c.sla)


def test_expected_cost_formula_no_double_count():
    start, mode = 48, "cloud"                             # 2 days waited
    c = P.slot_cost(T1, start, mode)
    p = P.failure_chance(T1, start)
    assert p == pytest.approx(T1.risk_growth_per_day * 2)
    planned = c.downtime + c.sla
    gpus = len(T1.racks_affected) * P.GPUS_PER_RACK
    ref = gpus * T1.duration_hrs * P._avg_hourly_value() * (1 + P._sla_factor(mode))
    unplanned = ref * UNPLANNED_COST_MULTIPLIER * (1 + EMERGENCY_PREMIUM)
    assert c.total == pytest.approx((1 - p) * planned + p * unplanned)


def test_private_mode_has_no_sla():
    assert P.slot_cost(T1, 30, "private").sla == 0
    assert P.slot_cost(T1, 30, "cloud").sla > 0


def test_deterministic():
    assert P._seeded_utilization() == P.UTILIZATION
    a = [P.slot_cost(t, 20, "cloud") for t in BACKLOG]
    b = [P.slot_cost(t, 20, "cloud") for t in BACKLOG]
    assert a == b


@pytest.mark.parametrize("mode", ["cloud", "private"])
def test_savings_are_price_driven(monkeypatch, mode):
    """With utilization forced flat, the daily price curve alone still makes optimized beat ASAP,
    and keeps most of the savings."""
    real = make_plan(seeded_backlog(), mode, "asap").total_cost - make_plan(seeded_backlog(), mode, "optimized").total_cost
    flat = [sum(P.UTILIZATION) / len(P.UTILIZATION)] * len(P.UTILIZATION)
    monkeypatch.setattr(P, "UTILIZATION", flat)
    asap = make_plan(seeded_backlog(), mode, "asap")
    opt = make_plan(seeded_backlog(), mode, "optimized")
    assert opt.total_cost < asap.total_cost
    assert asap.total_cost - opt.total_cost >= 0.8 * real
