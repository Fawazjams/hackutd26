"""Elix-style invoice reconciliation for replacement compute."""
from __future__ import annotations

TOL = 0.01


def reconcile(deal: dict, invoice: dict, delivered_gpu_hours: float) -> dict:
    agreed = float(deal["price_per_gpu_hr"])
    issues: list[dict] = []
    lines = invoice.get("lines", [])

    seen: set[str] = set()
    for ln in lines:
        desc = ln.get("description", "")
        hrs = float(ln["gpu_hours"])
        price = float(ln["price_per_gpu_hr"])
        amt = float(ln["amount"])
        if abs(hrs * price - amt) > TOL:
            issues.append({"kind": "arithmetic", "detail": f"{desc}: {hrs}h x {price} = {hrs * price:.2f}, billed {amt:.2f}",
                           "amount": round(abs(amt - hrs * price), 2)})
        if price > agreed + 1e-9:
            issues.append({"kind": "price", "detail": f"{desc}: {price}/hr above agreed {agreed}/hr",
                           "amount": round((price - agreed) * hrs, 2)})
        key = desc.strip().lower()
        if key in seen:
            issues.append({"kind": "duplicate", "detail": f"duplicate line '{desc}'", "amount": round(amt, 2)})
        seen.add(key)

    line_sum = sum(float(l["amount"]) for l in lines)
    total = float(invoice["total"])
    if abs(line_sum - total) > TOL:
        issues.append({"kind": "total_mismatch", "detail": f"lines sum {line_sum:.2f} != total {total:.2f}",
                       "amount": round(abs(total - line_sum), 2)})

    billed = sum(float(l["gpu_hours"]) for l in lines)
    if billed > delivered_gpu_hours + 1e-9:
        over = billed - delivered_gpu_hours
        issues.append({"kind": "overbilled_hours", "detail": f"billed {billed}h > delivered {delivered_gpu_hours}h",
                       "amount": round(over * agreed, 2)})

    pay = round(delivered_gpu_hours * agreed, 2)
    dispute = round(max(total - pay, 0.0), 2)
    return {"status": "dispute" if issues else "match", "issues": issues, "pay": pay, "dispute_amount": dispute}
