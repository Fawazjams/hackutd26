# CLAUDE.md

HackUTD 2026 (ZeroDay) project: a maintenance planner for GPU data centers that schedules downtime at the lowest cost, priced in GPU compute market dollars. Tracks: NMC² + NVIDIA Nemotron.

**Read `HACK.md` first.** It is the PRD and the source of truth for scope, team split, endpoints, assumptions, the cut list and the deadline. If something here conflicts with HACK.md, HACK.md wins. When a decision is made (product name, track 3, contract change), update HACK.md's "Open" section and add a line to its "Status log".

## Hard deadline
Team cutoff **Sun 9:00 AM CST**. Devpost registration by **Sat 11:00 PM CST**. Optimize for a demo that works the same way every time, not for elegance. If a task is on the cut list, don't build it.

## Rules for every change
1. **The LLM never computes numbers.** Prices, costs, schedules, temperatures and savings come from Python code. Nemotron only parses plain-English requests into a `Task`, calls our endpoints as tools, and explains results using numbers the tools returned.
2. **Deterministic.** Every random number comes from a seeded RNG (`SEED = 42` in `backend/app/config.py`). Same inputs → same plan, same $ every run.
3. **Contracts first.** `backend/app/schemas.py` holds the shared `Task`, `Plan`, etc. shapes. Don't change a field there without telling the team; add optional fields instead of renaming.
4. **Stay in your lane.** Each owner has their own module (see below). Edit someone else's module only when asked.
5. **Honesty.** Invented numbers live in `backend/app/config.py` with a comment saying they're assumed. Never present them as real data, and never claim CME compute futures are trading or that NMC² uses this market.
6. Keep it small: no auth, no database, no ticketing, no monitoring/alerting. Seeded state only.

## Layout
```
backend/
  app/
    main.py        FastAPI app, wires routers (shared)
    schemas.py     shared Pydantic contracts (shared, change carefully)
    config.py      seed + every assumed number, labeled (shared)
    prices.py      GET /prices, GET /cost          (Fawaz)
    backlog.py     GET /backlog                     (Loki)
    simulate.py    POST /simulate                   (Loki)
    planner.py     POST /plan  (optimized + asap)   (Nandhan)
    agent.py       POST /request  Nemotron loop     (phase 2)
  tests/
  requirements.txt
frontend/          Three.js hall + $ counter        (Fawaz, phase 2)
```

## Run
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000           # docs at http://localhost:8000/docs
pytest -q
```
Nemotron key goes in `backend/.env` as `NVIDIA_API_KEY=...` (gitignored). Never commit keys.

## Cost model (from HACK.md)
```
cost(hour) = GPUs_offline × utilization(hour) × price(day) [× SLA multiplier, GPU-cloud mode]
waiting    = risk(task, days_waited) × unplanned_failure_cost
```
Daily prices only, no hourly dips. Two modes: `gpu_cloud` (lost revenue + SLA) and `private` (replacement cost).

## Definition of done (MVP)
- `/plan` with `strategy=optimized` beats `strategy=asap` on the seeded backlog, identically every run.
- `/simulate` flags cooling-zone conflicts (at least two seeded tasks share a zone).
- Phase 2: `/request` handles 3 rehearsed requests + 1 unscripted one.

## Git
Small commits, pull before you push, one branch per person (`fawaz/*`, `nandhan/*`, `loki/*`), merge to `main` often. Never force-push `main`.
