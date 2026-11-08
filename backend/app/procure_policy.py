"""Elix-style policy engine for buying replacement GPU compute."""
from __future__ import annotations

# All values below are ASSUMED (demo defaults, not from a real finance policy).
POLICY = {
    "auto_approve_limit_usd": 500,   # ASSUMED: purchases up to this need no human
    "budget_usd": 5000,              # ASSUMED: hard cap per purchase
    "max_price_per_gpu_hr": None,    # set per call = breakeven passed in
    "min_uptime_pct": 99.5,          # ASSUMED: minimum provider uptime SLA
    "max_lead_time_hrs": 2,          # ASSUMED: must be live within 2 hours
}


def decide(offer: dict, breakeven: float) -> dict:
    reasons: list[str] = []
    if offer["price_per_gpu_hr"] > breakeven:
        reasons.append(
            f"price ${offer['price_per_gpu_hr']}/GPU-hr exceeds breakeven ${breakeven}"
        )
    if offer["total"] > POLICY["budget_usd"]:
        reasons.append(f"total ${offer['total']} exceeds budget ${POLICY['budget_usd']}")
    if offer["uptime_pct"] < POLICY["min_uptime_pct"]:
        reasons.append(f"uptime {offer['uptime_pct']}% below {POLICY['min_uptime_pct']}%")
    if offer["lead_time_hrs"] > POLICY["max_lead_time_hrs"]:
        reasons.append(
            f"lead time {offer['lead_time_hrs']}h exceeds {POLICY['max_lead_time_hrs']}h"
        )
    if offer["gpus_available"] < offer["gpus_needed"]:
        reasons.append(
            f"only {offer['gpus_available']} GPUs available, {offer['gpus_needed']} needed"
        )
    if reasons:
        return {"decision": "refused", "reasons": reasons}
    if offer["total"] > POLICY["auto_approve_limit_usd"]:
        return {
            "decision": "needs_approval",
            "reasons": [
                f"total ${offer['total']} exceeds auto-approve limit ${POLICY['auto_approve_limit_usd']}"
            ],
        }
    return {"decision": "auto", "reasons": ["within all policy limits"]}
