"""Regenerate frontend/fallback-plans.js from the current backend (no server needed).

Run from backend/:  .venv/bin/python scripts/make_fallback.py
Re-run whenever prices, the cost model, the backlog or the planner change.
"""
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "frontend" / "fallback-plans.js"


def main() -> None:
    c = TestClient(app)
    data = {
        "generated": f"{date.today().isoformat()} (saved from the real backend: GET /backlog, "
                     "GET /prices?days=7, POST /plan)",
        "backlog": c.get("/backlog").json(),
        "prices": c.get("/prices", params={"days": 7}).json(),
        "plans": {
            mode: {s: c.post("/plan", json={"mode": mode, "strategy": s}).json()
                   for s in ("optimized", "asap")}
            for mode in ("cloud", "private")
        },
    }
    OUT.write_text(
        "// AUTO-GENERATED snapshot of real backend responses, used only when the API is unreachable.\n"
        "// Regenerate: cd backend && .venv/bin/python scripts/make_fallback.py\n"
        f"export const FALLBACK = {json.dumps(data, indent=1)};\n"
    )
    for mode, plans in data["plans"].items():
        print(mode, {s: p["total_cost"] for s, p in plans.items()})


if __name__ == "__main__":
    main()
