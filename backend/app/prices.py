"""GET /prices, GET /cost. Owner: Fawaz. Stub: replace with the real curve + cost model."""
from fastapi import APIRouter
from .config import BASE_PRICE_USD_HR, DAILY_BAND, GPU_TYPE, HORIZON_DAYS
from .schemas import CostBreakdown, DayPrice, Mode

router = APIRouter(tags=["prices"])


@router.get("/prices", response_model=list[DayPrice])
def get_prices(days: int = HORIZON_DAYS) -> list[DayPrice]:
    # TODO(Fawaz): seeded daily curve instead of a flat line
    return [
        DayPrice(day=d, gpu_type=GPU_TYPE, price=BASE_PRICE_USD_HR,
                 low=BASE_PRICE_USD_HR * (1 - DAILY_BAND), high=BASE_PRICE_USD_HR * (1 + DAILY_BAND))
        for d in range(days)
    ]


@router.get("/cost", response_model=CostBreakdown)
def get_cost(task_id: str, start_hour: int, mode: Mode = "cloud") -> CostBreakdown:
    # TODO(Fawaz): GPUs_offline × utilization(hour) × price(day) [+ SLA] + risk
    return CostBreakdown(task_id=task_id, start_hour=start_hour, mode=mode,
                         downtime_cost=0, risk_cost=0, sla_cost=0, total=0)
