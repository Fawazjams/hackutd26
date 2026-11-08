"""Seed + every assumed number. Values marked ASSUMED are invented; disclose them in the demo."""

SEED = 42
HORIZON_DAYS = 7
HOURS = HORIZON_DAYS * 24

# Hall (ASSUMED)
NUM_RACKS = 40
GPUS_PER_RACK = 32
GPU_TYPE = "H100"
COOLING_ZONES = ["Z1", "Z2", "Z3", "Z4"]  # ASSUMED: 10 racks per zone

# Prices
BASE_PRICE_USD_HR = 3.04       # Silicon Data public H100 index level (see HACK.md)
DAILY_BAND = 0.10              # ASSUMED: ±10% daily forecast band

# Utilization (ASSUMED)
UTIL_MIN, UTIL_MAX = 0.85, 0.98

# GPU-cloud mode (ASSUMED)
CONTRACTED_SHARE = 0.70
SLA_PENALTY = 0.10

# Risk (ASSUMED)
UNPLANNED_COST_MULTIPLIER = 3.0
