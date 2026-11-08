"""TEMPORARY stand-ins so the planner can be built before the other parts land.

- prices, utilization, cost  -> re-exported from app/prices.py (the real cost model)
- seeded_backlog             -> returns Loki's backlog (app/backlog.py)

Prices come from real market data (app/market.py); every other number is ASSUMED or SEEDED.
The planner only depends on `slot_cost(task, start_hour, mode)` and the Task model,
so swapping these out should not require planner changes.
"""

from .models import Task
# Price curve, utilization and cost model now live in app/prices.py (owner: Loki); re-exported here
# so planner.py / main.py imports keep working unchanged.
from .prices import (  # noqa: F401
    DAILY_PRICE, PRICE_BAND, UTILIZATION, CostBreakdown, failure_chance, price, prices, slot_cost, utilization,
)
from .config import (  # noqa: F401
    CONTRACTED_SHARE, EMERGENCY_PREMIUM, GPUS_PER_RACK,
    SLA_PENALTY as SLA_CREDIT_RATE, UNPLANNED_COST_MULTIPLIER as UNPLANNED_MULTIPLIER,
)


# ---- Seeded backlog: now Loki's real backlog (app/backlog.py) -----------------
def seeded_backlog() -> list[Task]:
    from .backlog import BACKLOG  # lazy: backlog imports schemas -> models
    return [t.model_copy(deep=True) for t in BACKLOG]
