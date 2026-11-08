"""Forward price curve for GPU rental.

Our model, not a traded futures curve. It extrapolates the last 8 weekly
ON_DEMAND medians with a least-squares linear trend and wraps a 90% band
built from 26-week log-return volatility, widening with sqrt(weeks ahead).
"""

import math
from datetime import date, timedelta

from .market import weekly_history

TREND_WEEKS = 8
VOL_WEEKS = 26
Z_90 = 1.645


def _trend(ys: list[float]) -> tuple[float, float]:
    n = len(ys)
    xm = (n - 1) / 2
    ym = sum(ys) / n
    sxx = sum((i - xm) ** 2 for i in range(n))
    slope = sum((i - xm) * (y - ym) for i, y in enumerate(ys)) / sxx if sxx else 0.0
    return slope, ym - slope * xm


def _weekly_vol(medians: list[float]) -> float:
    r = [math.log(b / a) for a, b in zip(medians, medians[1:]) if a > 0 and b > 0]
    if len(r) < 2:
        return 0.0
    m = sum(r) / len(r)
    return math.sqrt(sum((x - m) ** 2 for x in r) / (len(r) - 1))


def forward_curve(gpu: str = "h100", weeks: int = 8) -> list[dict]:
    """[{week, date, price, low, high}] for weeks 1..weeks ahead (USD/GPU-hr)."""
    hist = weekly_history(gpu)
    medians = [h["median"] for h in hist]
    recent = medians[-TREND_WEEKS:]
    slope, intercept = _trend(recent)
    vol = _weekly_vol(medians[-(VOL_WEEKS + 1):])
    last_date = date.fromisoformat(hist[-1]["date"][:10])
    out = []
    for k in range(1, weeks + 1):
        price = max(intercept + slope * (len(recent) - 1 + k), 0.01)
        band = Z_90 * vol * math.sqrt(k)
        out.append({
            "week": k,
            "date": (last_date + timedelta(weeks=k)).isoformat(),
            "price": round(price, 4),
            "low": round(price * math.exp(-band), 4),
            "high": round(price * math.exp(band), 4),
        })
    return out


def spread(gpu_a: str, gpu_b: str) -> float:
    """Latest median price ratio gpu_a / gpu_b."""
    return weekly_history(gpu_a)[-1]["median"] / weekly_history(gpu_b)[-1]["median"]
