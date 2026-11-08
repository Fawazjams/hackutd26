# Backend (FastAPI)

```bash
cd backend
python -m venv .venv && .venv/bin/pip install -r requirements.txt   # or: uv venv .venv && uv pip install -p .venv/bin/python -r requirements.txt
.venv/bin/uvicorn app.main:app --reload        # UI at http://localhost:8000, docs at /docs
.venv/bin/python -m pytest -q
```
Nemotron key: `NVIDIA_API_KEY=...` in `backend/.env` (gitignored). Check models/tool calling with `.venv/bin/python scripts/nemotron_check.py --list`.

| File | Owner | What |
|---|---|---|
| `app/models.py` | shared | **The contract**: `Task`, `Window`, `Plan` (`items`, `unscheduled`), `PlanRequest`. Hours 0–167 from Mon 00:00, mode `cloud`/`private`, racks `"A01"`..`"D10"` (row A = Z1 … D = Z4), all $ |
| `app/schemas.py` | shared | Re-exports `models.py` and adds `DayPrice`, `CostBreakdown`, `HourState`, `Violation`, `SimResult`, `AgentRequest/Response` |
| `app/config.py` | shared | `SEED = 42` and every assumed number, labeled `ASSUMED` (hall layout, thermal model) |
| `app/main.py` | shared | Routes: `/plan`, `/prices`, the routers below and the static frontend at `/` |
| `app/prices.py` | Loki (was Fawaz) | Price curve and cost model; `GET /cost` |
| `app/stubs.py` | shared | Thin re-exports kept so `planner.py` imports keep working (`slot_cost`, `prices`, `seeded_backlog` → real backlog) |
| `app/backlog.py` | Loki | `GET /backlog`: 6 seeded tasks (T1+T2 share Z2, T4+T5 share Z4, T1+T6 overheat if overlapped) |
| `app/simulate.py` | Loki | `POST /simulate`: hourly racks offline, zone temps, `zone_conflict`/`overheat`/`window`/`unknown_task`; `simulate_plan`, `find_conflicts` for the planner |
| `app/planner.py` | Nandhan | `POST /plan`: ASAP baseline (business hours) + optimizer (greedy + local improvement) |
| `app/agent.py` | Loki | `POST /request` + `POST /request/stream` (Nemotron tool loop, code-side re-plan, numbers-checked explanation) and `POST /handoff` (shift brief) |
| `app/demo_requests.py` | Loki | 3 rehearsed requests → verified `Task`s (swapped in only if Nemotron's parse differs); offline fallback |
| `scripts/nemotron_check.py` | Loki | Lists Nemotron models, runs a 3-tool loop, optional rate-limit probe |

`POST /plan {"mode": "cloud"|"private", "strategy": "optimized"|"asap", "tasks": [...]?}`.
Leave `tasks` out to plan the seeded backlog; the agent passes the backlog plus new tasks.
To plug in a different cost model, pass any `cost_fn(task, start_hour, mode) -> CostBreakdown` to `make_plan`.
