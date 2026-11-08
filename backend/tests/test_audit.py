from app.audit import AuditLog


def _log():
    log = AuditLog(clock=lambda: 1000.0)
    log.append("a", "x", {"n": 1})
    log.append("b", "y", {"n": 2})
    log.append("c", "z", {"n": 3})
    return log


def test_verify_ok():
    log = _log()
    assert log.verify() == (True, None)
    assert [e["seq"] for e in log.events()] == [0, 1, 2]
    assert log.events()[1]["prev_hash"] == log.events()[0]["hash"]


def test_tamper_detected():
    log = _log()
    log.events()[1]["detail"]["n"] = 99
    assert log.verify() == (False, 1)
