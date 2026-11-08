from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_endpoints_respond():
    assert client.get("/health").json() == {"ok": True}
    assert len(client.get("/prices").json()) == 7
    assert client.get("/backlog").status_code == 200
    plan = client.post("/plan", json={"mode": "cloud", "strategy": "asap"}).json()
    assert plan["strategy"] == "asap" and plan["items"]
    assert client.post("/simulate", json=plan).status_code == 200
    assert client.get("/cost", params={"task_id": "T1", "start_hour": 9}).status_code == 200


def test_plan_is_deterministic():
    a = client.post("/plan", json={"strategy": "optimized"}).json()
    b = client.post("/plan", json={"strategy": "optimized"}).json()
    assert a == b
