"""Real GPU rental prices (GetDeploying weekly dataset, see data/gpu-prices/README.md).

The data is weekly; the planner needs a price per day for the week ahead. The daily
forecast is our own simple model on top of the real data:
  - level: the latest weekly ON_DEMAND median across providers
  - trend: least-squares slope of the last TREND_WEEKS weekly medians, applied per day
  - band:  90% range from the real week-to-week changes, widening with sqrt(days ahead)
The history is real; the forecast is a model, so label it as one.
"""

import csv
import math
from datetime import date, timedelta
from functools import cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "gpu-prices"
GPUS = ("h100", "h200", "b200")
BILLING_TYPE = "ON_DEMAND"
TREND_WEEKS = 8
VOLATILITY_WEEKS = 26
Z_90 = 1.645


@cache
def weekly_history(gpu: str = "h100") -> list[dict]:
    """[{date, median, min, max, providers}] for ON_DEMAND, oldest first."""
    gpu = gpu.lower()
    if gpu not in GPUS:
        raise ValueError(f"unknown gpu {gpu!r}; have {GPUS}")
    with open(DATA_DIR / f"nvidia-{gpu}.csv", newline="") as f:
        rows = [r for r in csv.DictReader(f) if r["billing_type"] == BILLING_TYPE]
    return sorted(
        (
            {
                "date": r["date"],
                "median": float(r["median_price"]),
                "min": float(r["min_price"]),
                "max": float(r["max_price"]),
                "providers": int(r["provider_count"]),
            }
            for r in rows
        ),
        key=lambda r: r["date"],
    )


def _weekly_slope(values: list[float]) -> float:
    n = len(values)
    mean_x, mean_y = (n - 1) / 2, sum(values) / n
    num = sum((x - mean_x) * (y - mean_y) for x, y in enumerate(values))
    den = sum((x - mean_x) ** 2 for x in range(n))
    return num / den


def _weekly_volatility(values: list[float]) -> float:
    """Std dev of week-over-week log returns."""
    rets = [math.log(b / a) for a, b in zip(values, values[1:])]
    mean = sum(rets) / len(rets)
    return math.sqrt(sum((r - mean) ** 2 for r in rets) / (len(rets) - 1))


@cache
def daily_forecast(gpu: str = "h100", days: int = 7) -> tuple[dict, ...]:
    """Day-by-day forecast for the planning week: day 0 = the first Monday after the
    latest snapshot (planner hours count from Monday 00:00)."""
    hist = weekly_history(gpu)
    medians = [h["median"] for h in hist]
    level = medians[-1]
    per_day = _weekly_slope(medians[-TREND_WEEKS:]) / 7
    vol = _weekly_volatility(medians[-VOLATILITY_WEEKS:])
    snapshot = date.fromisoformat(hist[-1]["date"])
    monday = snapshot + timedelta(days=7 - snapshot.weekday())  # next Monday, strictly after
    out = []
    for d in range(days):
        ahead = (monday - snapshot).days + d  # days past the latest real data point
        price = level + per_day * ahead
        spread = Z_90 * vol * math.sqrt(ahead / 7)
        out.append({
            "day": d,
            "date": (monday + timedelta(days=d)).isoformat(),
            "gpu": gpu.upper(),
            "price": round(price, 4),
            "low": round(price * math.exp(-spread), 4),
            "high": round(price * math.exp(spread), 4),
        })
    return tuple(out)


def source_note(gpu: str = "h100") -> dict:
    hist = weekly_history(gpu)
    return {
        "source": "GetDeploying GPU price dataset (weekly, ON_DEMAND median across providers)",
        "as_of": hist[-1]["date"],
        "latest_median": hist[-1]["median"],
        "providers": hist[-1]["providers"],
        "forecast": f"our model: latest median + {TREND_WEEKS}-week linear trend; "
                    f"90% band from {VOLATILITY_WEEKS}-week volatility",
    }
