"""Replacement-compute procurement for incidents: POST /procure, POST /procure/decision, GET /procure/ledger.

When an incident takes contracted GPUs offline, a buyer agent negotiates with two cloud
providers for replacement hours, then brings back the best offer for a person to accept or decline.
Rule 1 holds: every price is produced by the code below (deterministic, bounded steps); no LLM
writes a number. Purchases are SIMULATED: they are only written to an in-memory ledger.

Economics (all ASSUMED):
  not covering an hour loses the contract revenue AND owes an SLA credit -> 1.1 x CONTRACT_RATE
  covering an hour costs the replacement price, and the client still pays us
  => buy only if replacement price <= BREAKEVEN = CONTRACT_RATE x (1 + SLA_PENALTY)
"""
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import market, prices
from .config import CONTRACTED_SHARE, GPUS_PER_RACK, SLA_PENALTY
from .incidents import expected_task, get_incident
from .models import hour_label

router = APIRouter(tags=["procurement"])

CONTRACT_RATE = 3.25          # ASSUMED $/GPU-hr we bill contracted clients (Wing VC 4-yr H100 contract example)
BREAKEVEN = round(CONTRACT_RATE * (1 + SLA_PENALTY), 4)   # 3.575: above this, paying the SLA credit is cheaper
TARGET = round(BREAKEVEN * 0.92, 2)   # ASSUMED buyer opening counter
BUYER_RAISE = 1.03                    # ASSUMED buyer raises its counter 3% per round, capped at BREAKEVEN
SELLER_DROP = 0.96                    # ASSUMED seller drops its ask 4% per round, never below its floor
MAX_COUNTERS = 3

# Replacement-compute providers. Their agents negotiate with ours; terms below drive the negotiation.
PROVIDERS: list[dict[str, Any]] = [
    {"id": "nebius", "name": "Nebius", "region": "Dallas, TX", "uptime_pct": 99.95,
     "gpus_available": 512, "lead_time_hrs": 1, "ask_mult": 1.02, "floor": 3.38},
    {"id": "coreweave", "name": "CoreWeave", "region": "Phoenix, AZ", "uptime_pct": 99.8,
     "gpus_available": 256, "lead_time_hrs": 2, "ask_mult": 0.97, "floor": 3.62},
]

PROPOSALS: dict[str, dict[str, Any]] = {}
LEDGER: list[dict[str, Any]] = []


def _need(incident_id: str) -> dict[str, Any]:
    inc = get_incident(incident_id)
    if inc is None:
        raise HTTPException(status_code=404, detail=f"unknown incident '{incident_id}'")
    t = expected_task(incident_id)
    gpus = len(t.racks_affected) * GPUS_PER_RACK
    start, end = inc["hour"], inc["hour"] + t.duration_hrs
    return {"incident_id": incident_id, "task_id": t.id, "equipment": t.equipment, "zone": t.zone,
            "racks": t.racks_affected, "gpus": gpus, "contracted_share": CONTRACTED_SHARE,
            "hours": t.duration_hrs, "gpu_hours": round(gpus * t.duration_hrs * CONTRACTED_SHARE, 2),
            "start_hour": start, "end_hour": end,
            "start_label": hour_label(start), "end_label": hour_label(end)}


def negotiate(provider: dict[str, Any], market_rate: float) -> dict[str, Any]:
    """Deterministic, bounded haggle. Buyer starts at TARGET and raises 3%/round up to BREAKEVEN;
    seller starts at market x ask_mult and drops 4%/round, never below its (secret) floor."""
    ask = round(market_rate * provider["ask_mult"], 2)
    rounds = [{"round": 0, "from": "seller", "action": "ask", "price": ask}]
    bid = TARGET
    for r in range(1, MAX_COUNTERS + 1):
        rounds.append({"round": r, "from": "buyer", "action": "counter", "price": bid})
        if bid >= provider["floor"]:
            rounds.append({"round": r, "from": "seller", "action": "accept", "price": bid})
            return {"provider_id": provider["id"], "rounds": rounds, "outcome": "deal", "final_price": bid}
        ask = max(provider["floor"], round(ask * SELLER_DROP, 2))
        rounds.append({"round": r, "from": "seller", "action": "counter", "price": ask})
        if ask <= BREAKEVEN:
            rounds.append({"round": r, "from": "buyer", "action": "accept", "price": ask})
            return {"provider_id": provider["id"], "rounds": rounds, "outcome": "deal", "final_price": ask}
        bid = min(round(BREAKEVEN, 2), round(bid * BUYER_RAISE, 2))
    rounds.append({"round": MAX_COUNTERS, "from": "buyer", "action": "walk", "price": ask})
    return {"provider_id": provider["id"], "rounds": rounds, "outcome": "no_deal", "final_price": None}


def _public_provider(p: dict[str, Any]) -> dict[str, Any]:
    hist = market.weekly_history("h100")[-8:]   # REAL GetDeploying H100 on-demand medians
    return {"id": p["id"], "name": p["name"], "region": p["region"], "uptime_pct": p["uptime_pct"],
            "gpus_available": p["gpus_available"], "lead_time_hrs": p["lead_time_hrs"],
            "price_history": [{"date": h["date"], "median": h["median"]} for h in hist]}


def run_procurement(incident_id: str = "INC1") -> dict[str, Any]:
    need = _need(incident_id)
    market_rate = prices.price(need["start_hour"] // 24)
    negs = [negotiate(p, market_rate) for p in PROVIDERS]
    by_id = {p["id"]: p for p in PROVIDERS}
    deals = [n for n in negs if n["outcome"] == "deal" and n["final_price"] <= BREAKEVEN
             and by_id[n["provider_id"]]["gpus_available"] >= need["gpus"]]
    proposal = None
    if deals:
        best = min(deals, key=lambda n: (n["final_price"], n["provider_id"]))
        p = by_id[best["provider_id"]]
        total = round(best["final_price"] * need["gpu_hours"], 2)
        not_covered = round(need["gpu_hours"] * BREAKEVEN, 2)
        proposal = {"id": "P1", "provider_id": p["id"], "provider_name": p["name"],
                    "price_per_gpu_hr": best["final_price"], "gpu_hours": need["gpu_hours"], "total": total,
                    "cost_if_not_covered": not_covered, "savings": round(not_covered - total, 2),
                    "reason": (f"{p['name']} agreed to ${best['final_price']:.2f}/GPU-hr, below the "
                               f"${BREAKEVEN:.3f} break-even (contract rate + SLA credit); "
                               f"{p['gpus_available']} GPUs available, {p['lead_time_hrs']} h lead time."),
                    "needs_approval": True, "status": "pending"}
        PROPOSALS[proposal["id"]] = proposal
    return {"id": "P1", "simulated": True, "llm_used": False, "need": need,
            "economics": {"contract_rate": CONTRACT_RATE, "sla_credit_rate": SLA_PENALTY,
                          "breakeven_rate": BREAKEVEN, "market_rate": market_rate},
            "providers": [_public_provider(p) for p in PROVIDERS], "negotiations": negs, "proposal": proposal}


class ProcureRequest(BaseModel):
    incident_id: str = "INC1"
    mode: Literal["cloud", "private"] = "cloud"


class DecisionRequest(BaseModel):
    proposal_id: str
    decision: str


@router.post("/procure")
def procure(req: ProcureRequest) -> dict[str, Any]:
    return run_procurement(req.incident_id)


@router.post("/procure/decision")
def decide(req: DecisionRequest) -> dict[str, Any]:
    if req.decision not in ("accept", "decline"):
        raise HTTPException(status_code=422, detail="decision must be 'accept' or 'decline'")
    prop = PROPOSALS.get(req.proposal_id)
    if prop is None:
        raise HTTPException(status_code=404, detail=f"unknown proposal '{req.proposal_id}'")
    status = "accepted" if req.decision == "accept" else "declined"
    prop["status"] = status
    LEDGER.append({"proposal_id": prop["id"], "provider_name": prop["provider_name"],
                   "gpu_hours": prop["gpu_hours"], "price_per_gpu_hr": prop["price_per_gpu_hr"],
                   "total": prop["total"] if status == "accepted" else 0.0, "status": status, "simulated": True})
    return {"status": status, "ledger": LEDGER}


@router.get("/procure/ledger")
def ledger() -> list[dict[str, Any]]:
    return LEDGER
