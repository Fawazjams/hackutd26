from app.reconcile import reconcile

DEAL = {"provider": "P", "gpu_hours": 100, "price_per_gpu_hr": 2.0}


def inv(lines, total=None):
    return {"provider": "P", "lines": lines,
            "total": sum(l["amount"] for l in lines) if total is None else total}


def L(d, h, p, a=None):
    return {"description": d, "gpu_hours": h, "price_per_gpu_hr": p, "amount": h * p if a is None else a}


def kinds(r):
    return {i["kind"] for i in r["issues"]}


def test_clean_match():
    r = reconcile(DEAL, inv([L("a", 100, 2.0)]), 100)
    assert r["status"] == "match" and r["issues"] == []
    assert r["pay"] == 200.0 and r["dispute_amount"] == 0.0


def test_overbilled_hours():
    r = reconcile(DEAL, inv([L("a", 120, 2.0)]), 100)
    assert r["status"] == "dispute" and "overbilled_hours" in kinds(r)
    assert r["pay"] == 200.0 and r["dispute_amount"] == 40.0


def test_arithmetic_error():
    r = reconcile(DEAL, inv([L("a", 100, 2.0, 250.0)]), 100)
    assert "arithmetic" in kinds(r) and r["status"] == "dispute"


def test_duplicate_line():
    r = reconcile(DEAL, inv([L("a", 50, 2.0), L("a", 50, 2.0)]), 50)
    assert "duplicate" in kinds(r) and r["dispute_amount"] == 100.0
