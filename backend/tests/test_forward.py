from app.forward import forward_curve, spread


def test_length():
    assert len(forward_curve("h100", 8)) == 8
    assert len(forward_curve("h200", 3)) == 3


def test_band_and_widening():
    c = forward_curve("h100", 8)
    assert all(p["low"] < p["price"] < p["high"] for p in c)
    widths = [p["high"] - p["low"] for p in c]
    assert widths[-1] > widths[0]


def test_deterministic():
    assert forward_curve("b200", 6) == forward_curve("b200", 6)


def test_spread():
    assert spread("h200", "h100") > 0
