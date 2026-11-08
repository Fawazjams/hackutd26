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

# Hall layout + thermal sim (ASSUMED; owner: Loki)
RACKS_PER_ZONE = NUM_RACKS // len(COOLING_ZONES)          # ASSUMED: one row per zone
ROWS = "ABCD"                                             # row A = Z1, B = Z2, C = Z3, D = Z4 (matches frontend hall)
ZONE_RACKS = {z: [f"{ROWS[i]}{n:02d}" for n in range(1, RACKS_PER_ZONE + 1)]   # "A01".."A10", ...
              for i, z in enumerate(COOLING_ZONES)}
ZONE_NEIGHBORS = {                                        # ASSUMED: zones laid out in a line, neighbors share backup cooling
    z: [COOLING_ZONES[j] for j in (i - 1, i + 1) if 0 <= j < len(COOLING_ZONES)]
    for i, z in enumerate(COOLING_ZONES)
}
COOLING_EQUIPMENT = ("CRAC", "CDU", "CHILLER")            # task.equipment prefix => that zone loses cooling while it runs
BASE_ZONE_TEMP_C = 24.0           # ASSUMED: normal cold-aisle inlet temp
TEMP_NOISE_C = 0.3                # ASSUMED: ± seeded hourly noise
OVERHEAT_C = 32.0                 # ASHRAE A1 allowable upper inlet limit (32 °C), used as the overheat line
OFFLINE_COOLING_C = 2.0           # ASSUMED: zone runs this much cooler when all its racks are offline
COOLING_LOSS_C = 10.0             # ASSUMED: rise × online-rack share when the zone's own cooling is down (neighbors back it up)
COOLING_LOSS_NO_BACKUP_C = 20.0   # ASSUMED: same, but a neighbor's cooling is also down, so no backup
NEIGHBOR_LOAD_C = 1.5             # ASSUMED: rise when a neighbor zone leans on this zone's cooling
THERMAL_RESPONSE = 0.6            # ASSUMED: share of the gap to target temp closed each hour (thermal inertia)

# Cost model (owner: Loki, from Fawaz's lane; see app/prices.py)
EMERGENCY_PREMIUM = 0.20          # ASSUMED: unplanned failure = UNPLANNED_COST_MULTIPLIER x planned, +20% emergency premium
# Daily H100 prices: REAL weekly market data + our forecast, see app/market.py (prices.DAILY_PRICE).
# Hourly utilization (ASSUMED, seeded): kept in a narrow band with small dips so the daily price,
# not invented hourly noise, drives most scheduling decisions.
UTIL_BAND = (0.93, 0.96)          # ASSUMED: normal busy share
UTIL_DIP = (0.92, 0.93)           # ASSUMED: brief dips at job boundaries
