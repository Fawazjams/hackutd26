from fastapi.testclient import TestClient

from app import prices as P
from app.config import CONTRACTED_SHARE, SLA_PENALTY
from app.main import app

client = TestClient(app)


def test_hourly_rate_is_price_times_busy_share_times_sla():
    r = client.get("/prices/hourly", params={"day": 2, "mode": "cloud"}).json()
    assert len(r["hours"]) == 24 and r["market_price"] == P.price(2)
    for row in r["hours"]:
        want = P.price(2) * P.utilization(2 * 24 + row["hour"]) * (1 + CONTRACTED_SHARE * SLA_PENALTY)
        assert abs(row["rate"] - want) < 1e-3
    assert r["min_rate"] <= r["avg_rate"] <= r["max_rate"]


def test_private_mode_has_no_sla_term():
    r = client.get("/prices/hourly", params={"day": 0, "mode": "private"}).json()
    assert r["sla_factor"] == 0
    assert all(abs(h["rate"] - P.price(0) * h["utilization"]) < 1e-3 for h in r["hours"])


def test_bad_day_is_rejected():
    assert client.get("/prices/hourly", params={"day": 7}).status_code == 422


def test_history_is_the_real_weekly_series_plus_forecast():
    from app import market
    r = client.get("/prices/history", params={"gpu": "h100"}).json()
    assert r["weeks"] == market.weekly_history("h100") and len(r["weeks"]) >= 52
    assert all(w["min"] <= w["median"] <= w["max"] for w in r["weeks"])
    assert len(r["forecast"]) == 7 and r["forecast"][0]["date"] > r["weeks"][-1]["date"]
    assert all(f["low"] <= f["price"] <= f["high"] for f in r["forecast"])
    assert r["source"]["as_of"] == r["weeks"][-1]["date"]


def test_history_rejects_unknown_gpu():
    assert client.get("/prices/history", params={"gpu": "a100"}).status_code == 422
