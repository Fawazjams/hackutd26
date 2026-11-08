from fastapi.testclient import TestClient

from app import prices
from app.exposure import exposure
from app.main import app

client = TestClient(app)


def test_band_and_overheats():
    before = prices.DAILY_PRICE[:]
    p = exposure("cloud")["plans"]
    assert prices.DAILY_PRICE == before  # restored
    o, a = p["optimized"], p["asap"]
    assert o["price_low"] < o["expected"] < o["price_high"]
    assert o["overheat_cost"] == 0 and a["overheat_cost"] > 0
    assert a["worst_case"] > o["worst_case"]


def test_endpoint_deterministic():
    r1 = client.post("/exposure", json={"mode": "cloud"}).json()
    r2 = client.post("/exposure", json={"mode": "cloud"}).json()
    assert r1 == r2 and r1["simulated_week"] is True
    assert client.post("/exposure", json={"mode": "private"}).json()["plans"]["optimized"]["breakdown"]["contract"] == 0
