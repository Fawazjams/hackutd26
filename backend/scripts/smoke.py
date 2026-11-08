"""Smoke test against a running server. Usage: python backend/scripts/smoke.py [base_url]"""
import sys
import time

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
client = httpx.Client(base_url=BASE, timeout=60)
failed = 0
state: dict = {}


def check(name, fn):
    global failed
    t = time.perf_counter()
    try:
        msg = fn()
        status, extra = "PASS", msg or ""
    except SkipCheck as e:
        status, extra = "SKIP", str(e)
    except Exception as e:  # noqa: BLE001
        failed += 1
        status, extra = "FAIL", f"{type(e).__name__}: {e}"
    print(f"{status} {name} ({(time.perf_counter() - t) * 1000:.0f} ms) {extra}".rstrip())


class SkipCheck(Exception):
    pass


def ok(r, code=200):
    assert r.status_code == code, f"HTTP {r.status_code}: {r.text[:200]}"
    return r


def t_health():
    assert ok(client.get("/health")).json().get("ok") is True


def t_backlog():
    d = ok(client.get("/backlog")).json()
    assert isinstance(d, list) and d, "empty backlog"
    return f"{len(d)} tasks"


def t_plan():
    o = ok(client.post("/plan", json={"mode": "cloud", "strategy": "optimized"})).json()["total_cost"]
    a = ok(client.post("/plan", json={"mode": "cloud", "strategy": "asap"})).json()["total_cost"]
    assert o < a, f"optimized {o} not < asap {a}"
    return f"optimized={o:.2f} asap={a:.2f}"


def t_procure():
    d = ok(client.post("/procure", json={"incident_id": "INC1"})).json()
    p = d.get("proposal")
    assert p, "no proposal"
    assert "nebius" in p["provider_name"].lower() or "nebius" in p["provider_id"].lower(), p["provider_name"]
    be = d["economics"]["breakeven_rate"]
    assert p["price_per_gpu_hr"] <= be, f"{p['price_per_gpu_hr']} > breakeven {be}"
    state["pid"] = p["id"]
    return f"{p['provider_name']} ${p['price_per_gpu_hr']} <= {be}"


def t_decision():
    d = ok(client.post("/procure/decision", json={"proposal_id": state["pid"], "decision": "accept"})).json()
    assert d["status"] == "accepted", d


def t_ledger():
    d = ok(client.get("/procure/ledger")).json()
    assert any(e["status"] == "accepted" for e in d), "no accepted entry"
    return f"{len(d)} entries"


def t_exposure():
    r = client.post("/exposure", json={"mode": "cloud"})
    if r.status_code in (404, 405):
        raise SkipCheck(f"HTTP {r.status_code}")
    ok(r)


def t_index():
    ok(client.get("/"))


for name, fn in [("GET /health", t_health), ("GET /backlog", t_backlog), ("POST /plan", t_plan),
                 ("POST /procure", t_procure), ("POST /procure/decision", t_decision),
                 ("GET /procure/ledger", t_ledger), ("POST /exposure", t_exposure), ("GET /", t_index)]:
    check(name, fn)

print("ALL PASS" if not failed else f"{failed} FAILED")
sys.exit(1 if failed else 0)
