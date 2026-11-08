from app.procure_policy import decide

BASE = dict(total=300, price_per_gpu_hr=2.0, uptime_pct=99.9, lead_time_hrs=1,
            gpus_available=8, gpus_needed=8)


def offer(**kw):
    return {**BASE, **kw}


def test_auto():
    assert decide(offer(), 3.0)["decision"] == "auto"


def test_needs_approval():
    assert decide(offer(total=1000), 3.0)["decision"] == "needs_approval"


def test_refused_price():
    assert decide(offer(price_per_gpu_hr=4.0), 3.0)["decision"] == "refused"


def test_refused_budget():
    r = decide(offer(total=6000), 3.0)
    assert r["decision"] == "refused" and r["reasons"]


def test_refused_uptime():
    assert decide(offer(uptime_pct=98), 3.0)["decision"] == "refused"


def test_refused_lead():
    assert decide(offer(lead_time_hrs=5), 3.0)["decision"] == "refused"


def test_refused_capacity():
    assert decide(offer(gpus_available=4), 3.0)["decision"] == "refused"


def test_multiple_reasons():
    r = decide(offer(uptime_pct=90, lead_time_hrs=9), 3.0)
    assert len(r["reasons"]) == 2
