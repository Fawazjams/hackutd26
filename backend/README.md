# Backend (FastAPI)

```bash
cd backend
uv venv .venv && uv pip install -p .venv/bin/python -r requirements.txt
.venv/bin/uvicorn app.main:app --reload        # http://localhost:8000/docs
.venv/bin/python -m pytest -q
```

| File | Owner | What |
|---|---|---|
| `app/models.py` | shared | `Task` / `Plan` JSON contract (hours 0–167 from Mon 00:00, all $) |
| `app/planner.py` | Nandhan | ASAP baseline + optimizer behind `POST /plan` |
| `app/stubs.py` | **temporary** | stand-in prices, utilization, cost model (→ Fawaz) and seeded backlog (→ Loki) |
| `app/main.py` | shared | routes |

`POST /plan {"mode": "cloud"|"private", "strategy": "optimized"|"asap", "tasks": [...]?}`.
Leave `tasks` out to plan the seeded backlog. Phase 2 passes the backlog plus new tasks.

To plug in the real cost model, pass any `cost_fn(task, start_hour, mode) -> CostBreakdown`
to `make_plan`, or replace `stubs.slot_cost`.
