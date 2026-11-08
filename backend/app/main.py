"""FastAPI app. Run from backend/:  uvicorn app.main:app --reload   (UI at /, docs at /docs)

Contract: app/models.py (Task, Plan, PlanRequest), re-exported by app/schemas.py.
/plan (Nandhan) and /prices (seeded stub curve, -> Fawaz) live here; the other endpoints
come from their owners' routers.
"""
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import agent, backlog, exposure, prices, procurement, rates, simulate, stubs
from .models import Plan, PlanRequest
from .planner import make_plan

app = FastAPI(title="GPU maintenance planner")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/plan", response_model=Plan, tags=["plan"])
def plan(req: PlanRequest) -> Plan:
    tasks = req.tasks if req.tasks is not None else stubs.seeded_backlog()
    try:
        return make_plan(tasks, req.mode, req.strategy)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


# TEMPORARY (Fawaz): seeded daily curve from stubs.py. Registered before prices.router, so this
# /prices wins; prices.router still provides /cost.
@app.get("/prices", tags=["prices"])
def get_prices(days: int = 7) -> list[dict]:
    return stubs.prices(days)


for r in (rates.router, prices.router, backlog.router, simulate.router, agent.router,
          procurement.router, exposure.router):
    app.include_router(r)

# Serve the frontend at / (mounted last so API routes win).
FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"
if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
