from fastapi.testclient import TestClient

from app import market, stubs
from app.main import app


def test_history_is_the_real_dataset():
    h = market.weekly_history("h100")
    assert len(h) == 53
    assert h[-1]["date"] == "2026-11-02" and h[-1]["median"] == 4.0225
    assert all(set(market.weekly_history(g)[-1]) >= {"median", "providers"} for g in market.GPUS)


def test_forecast_covers_the_planning_week_from_monday():
    f = market.daily_forecast("h100", 7)
    assert [d["date"] for d in f][0] == "2026-11-09"  # first Monday after the Nov 2 snapshot
    assert len(f) == 7
    for d in f:
        assert d["low"] < d["price"] < d["high"]
    widths = [d["high"] - d["low"] for d in f]
    assert widths == sorted(widths)  # band widens further from the data


def test_planner_prices_come_from_the_forecast():
    assert stubs.DAILY_PRICE == [d["price"] for d in market.daily_forecast("h100", 7)]
    assert stubs.price(0) == market.daily_forecast("h100", 7)[0]["price"]


def test_prices_endpoint_labels_its_source():
    rows = TestClient(app).get("/prices", params={"days": 7}).json()
    assert len(rows) == 7
    assert rows[0]["as_of"] == "2026-11-02" and "GetDeploying" in rows[0]["source"]
