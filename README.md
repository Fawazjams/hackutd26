# DC Router

**A maintenance planner for GPU data centers that schedules downtime when it costs the least, priced in GPU compute market dollars, with an NVIDIA Nemotron agent that plans the work.**

HackUTD 2026: ZeroDay · Tracks: **NorthMark Compute & Cloud (NMC²)** + **NVIDIA "Use Nemotron Beyond a Chatbot"**

## The problem
NMC²'s mission is *Keep the World Running*: a **missed warning**, an **unclear handoff** or the **wrong information at the wrong time** can turn a small issue into a major disruption.
Maintenance is where that happens every week. Ops leads take racks offline "ASAP, during business hours" without knowing what those GPU-hours are worth that day, or whether two jobs will knock out cooling in neighboring zones.
GPU compute now has a market price that moves day to day, so every hour of planned downtime has a dollar cost, and a bad schedule has a bigger one.

## What it does
1. **See the week.** The seeded 7-day backlog (CRAC compressor, PDU breakers, GPU firmware, UPS test, fiber, CDU coolant flush), the H100 price forecast and the 40-rack hall.
2. **Plan.** The optimizer gives each task its cheapest safe start time, within vendor windows, cooling-zone conflicts and failure risk that grows the longer a task waits. It's compared against an "ASAP during business hours" baseline.
3. **Play the week forward.** Racks go dark on schedule, zone temperatures move hour by hour, and a **$ lost counter runs for our plan vs. ASAP**.
   - **The overheat moment:** ASAP runs the CRAC-2 and CDU-3 jobs together on Monday at 09:00. Neighboring zones Z2 and Z3 lose their backup cooling and pass the 32 °C limit. The optimized plan has no violations and costs **$13,644.61** less ($18,222.79 vs $31,867.40, 42.8%; mostly the overheats, priced at an assumed outage rate).
4. **Ask Nemotron.** Type *"UPS-B battery swap, 3 hrs, vendor only Wed or Fri"*. Nemotron turns it into a structured task, calls our tools (equipment lookup → day windows → add task → plan → simulate → re-plan if needed), and explains the result using only numbers the tools returned.
5. **Handoff brief.** Nemotron writes a shift handoff for each scheduled job (what, when, racks, zone temperatures to watch, the risk if it slips), built only from tool output.
6. **Negotiate replacement compute.** When an incident takes contracted GPUs down, two provider data centers, Nebius and CoreWeave appear beside the hall and our agent negotiates cover for the 336 lost GPU-hours, below the $3.575 break-even (ASSUMED $3.25 contract rate + 10% SLA credit). Nebius agrees at $3.39; CoreWeave walks. You accept or decline the offer. Code-bounded and simulated; see docs/PROCUREMENT.md.

![screenshot](docs/screenshot.png) <!-- TODO: add screenshot -->

## Architecture
```
 Browser (frontend/: planner UI, $ scoreboard, week playback, hall view, Ask Nemotron)
        │  fetch (falls back to a cached snapshot if the backend is down)
        ▼
 FastAPI (backend/app)
   GET  /backlog     seeded tasks                     backlog.py
   GET  /prices      daily H100 $/GPU-hr + band       prices.py / stubs.py
   GET  /cost        $ for task × start hour          prices.py
   POST /plan        optimized | asap schedule + $    planner.py
   POST /simulate    hourly racks, zone temps, violations   simulate.py
   POST /request     Nemotron agent loop              agent.py
   POST /request/stream  same run, NDJSON events live  agent.py
   GET  /incidents   simulated alarms (ASSUMED)       incidents.py
   POST /incident/stream  alarm -> Nemotron triages + schedules the repair, no operator  agent.py
   POST /handoff     shift handoff brief              agent.py
   POST /procure     negotiate replacement compute (simulated)   procurement.py
   POST /procure/decision  accept / decline an offer -> ledger   procurement.py
   POST /exposure    plan cost at low / expected / high price
        │  tool calls (OpenAI-compatible API)
        ▼
 NVIDIA Nemotron on build.nvidia.com (nemotron-3.5-lightning-30b-a3b)
```
**The LLM never computes numbers.** Prices, costs, schedules, temperatures and savings come from Python. Nemotron chooses which tool to call and with what arguments, and words the result. If its wording contains a number the tools didn't produce, we show the code-built text instead.

## How it maps to the tracks
**NVIDIA: Use Nemotron Beyond a Chatbot**
| Requirement | How we meet it |
|---|---|
| Beyond a chatbot | Nemotron turns a plain-English request into a scheduled task in the plan and a work handoff, not a chat reply |
| Multi-step workflows | Nemotron chains lookup → windows → add task → compare slots → choose slot → plan → simulate, and re-plans when the simulator reports violations |
| Decides, not just parses | Nemotron picks the slot among priced options (each a full week plan + hall sim); code refuses unsafe picks. A simulated alarm (CRAC-3, Wed 14:00) triggers it with no human prompt |
| Tool integration | 9 tools backed by our planner, simulator and price service, called through Nemotron's function calling |
| Real-world applicability | Maintenance scheduling with vendor windows, cooling redundancy and SLA exposure |

**NMC²: Keep the World Running**
- *Missed warning* → the simulator flags overheating and zone conflicts **before** the work happens.
- *Wrong information at the wrong time* → every option is priced in today's compute dollars, so the trade-off is visible.
- *Unclear handoff* → Nemotron writes a shift handoff per job from the plan's own numbers.

## Run it
```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # or: uv venv .venv && uv pip install -p .venv/bin/python -r requirements.txt
pip install -r requirements.txt
echo "NVIDIA_API_KEY=nvapi-..." > .env                 # from build.nvidia.com; gitignored, never commit it
uvicorn app.main:app --reload                          # UI: http://localhost:8000   API docs: /docs
pytest -q                                              # all tests, no network
python scripts/nemotron_check.py --list                # which Nemotron models your key can use + a 3-tool test
```
**Offline behavior.** With no key, no network or a rate limit, the 3 rehearsed requests still run from their saved tasks through the same plan → simulate pipeline. Unscripted requests return a clear "agent offline" message. If the backend is down, the UI loads a cached snapshot of real backend responses.

**Deterministic.** Everything is seeded (`SEED = 42`), so the same inputs give the same plan and the same dollar figures every run.

## Data credit
Price data: GetDeploying, GPU rental price history, https://getdeploying.com/gpus, CC BY 4.0. Dataset: https://getdeploying.com/dataset/gpu-prices

## Team
Loki · Nandhan · Fawaz. See [HACK.md](HACK.md) for the PRD, team split, assumptions and status log.
