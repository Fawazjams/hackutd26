"""FastAPI app. Run from backend/:  uvicorn app.main:app --reload

/plan is the real thing; /prices and /backlog serve the temporary stubs until
Fawaz's and Loki's versions are merged in.
"""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from . import stubs
from .models import Plan, PlanRequest, Task
from .planner import make_plan

app = FastAPI(title="GPU maintenance planner")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.post("/plan", response_model=Plan)
def plan(req: PlanRequest) -> Plan:
    tasks = req.tasks if req.tasks is not None else stubs.seeded_backlog()
    try:
        return make_plan(tasks, req.mode, req.strategy)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


# ---- TEMPORARY stub endpoints (owners: Fawaz /prices, Loki /backlog) --------
@app.get("/prices")
def prices(days: int = 7) -> list[dict]:
    return stubs.prices(days)


@app.get("/backlog", response_model=list[Task])
def backlog() -> list[Task]:
    return stubs.seeded_backlog()


# Serve the Three.js frontend at / (mounted last so API routes win).
FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"
if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
