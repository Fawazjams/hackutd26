from fastapi.testclient import TestClient

from app import procurement as P
from app.main import app

client = TestClient(app)


def test_deterministic_and_outcomes():
    a = client.post("/procure", json={"incident_id": "INC1"}).json()
    b = client.post("/procure", json={"incident_id": "INC1"}).json()
    assert a == b
    assert a["simulated"] is True and a["llm_used"] is False
    assert a["need"]["gpu_hours"] == 336
    outs = {n["provider_id"]: n for n in a["negotiations"]}
    assert outs["halden"]["outcome"] == "deal" and outs["halden"]["final_price"] <= P.BREAKEVEN
    assert outs["corvid"]["outcome"] == "no_deal"
    prop = a["proposal"]
    assert prop["provider_id"] == "halden" and prop["status"] == "pending"
    assert prop["total"] == round(prop["price_per_gpu_hr"] * prop["gpu_hours"], 2)
    assert prop["savings"] > 0


def test_decision_accept_writes_ledger_and_errors():
    client.post("/procure", json={"incident_id": "INC1"})
    n = len(P.LEDGER)
    r = client.post("/procure/decision", json={"proposal_id": "P1", "decision": "accept"}).json()
    assert r["status"] == "accepted" and len(r["ledger"]) == n + 1
    assert r["ledger"][-1]["simulated"] is True
    assert client.get("/procure/ledger").json() == r["ledger"]
    assert client.post("/procure/decision", json={"proposal_id": "NOPE", "decision": "accept"}).status_code == 404
    assert client.post("/procure/decision", json={"proposal_id": "P1", "decision": "maybe"}).status_code == 422
    assert client.post("/procure", json={"incident_id": "NOPE"}).status_code == 404
