# Devpost draft (paste-ready)

> Registration due **Sat 23:00 CST**. Final edits allowed until Sun 12:00 PM CST. Lines tagged **[update after demo works]** depend on unfinished work; fix them before the final submit.

## Title (product name TBD, pick one)
1. **Downtime Desk**: maintenance priced in GPU-hours
2. **Spot Window**: schedule maintenance when compute is cheapest
3. **RackTime**: the maintenance planner that knows what a GPU-hour is worth

## Tagline
Every hour a GPU rack is down for maintenance has a market price. We schedule the week's maintenance backlog at the lowest compute cost without letting failure risk or cooling limits get out of hand.

## Tracks
- NorthMark Compute & Cloud (NMC²): "Keep the World Running"
- NVIDIA: "Use Nemotron Beyond a Chatbot"
- Track 3: **TBD**

---

## Inspiration
GPU compute is turning into a priced commodity. CME and Silicon Data announced compute futures on May 12, 2026 ([CNBC](https://www.cnbc.com/2026/05/12/new-futures-market-for-semiconductors-comes-as-ai-drives-costs-skyward.html)), and ICE and Ornn announced cash-settled H100/H200/B200 futures ([LeapRate](https://www.leaprate.com/financial-services/exchanges/ice-and-ornn-announce-gpu-compute-futures-contracts/)). These are announcements; we don't claim either is trading yet. Prices also move: the Ornn H100 index went from $2.31 to $4.95 in about two months ([Tunguz](https://www.linkedin.com/posts/tomasztunguz_nvidias-latest-gpu-rental-prices-on-the-activity-7454588703492075523-YP-o)), and one-year H100 rentals rose about 40% from Oct 2025 to Mar 2026 ([SemiAnalysis](https://newsletter.semianalysis.com/p/the-great-gpu-shortage-rental-capacity)).

Data centers still schedule maintenance the old way: as soon as possible, during business hours. Nobody asks what the GPU-hours they're taking offline are worth that day. Meanwhile 57% of operators say their last major outage cost more than $100K ([Uptime 2026](https://via.tt.se/pressmeddelande/4381155/uptime-announces-annual-outage-analysis-report-2026?publisherId=259167&lang=en)), and most GPU cloud capacity is pre-sold (CoreWeave reports about $104B of backlog, [Converge Digest](https://convergedigest.com/trackers/neoclouds/)), so every missed hour has a cost.

## What it does
An operations lead opens the week's maintenance backlog: CRAC compressor replacement, PDU breaker swaps, GPU firmware rollout, UPS battery test, fiber re-cabling and a CDU coolant flush.

- **Prices downtime in market dollars.** `cost(hour) = GPUs offline × utilization × price(day)`, plus SLA penalties in GPU-cloud mode. A switch toggles between **GPU cloud** (lost revenue + SLA credits) and **private data center** (cost to rent the GPUs you lost).
- **Optimizes when each task runs.** The optimizer picks the cheapest safe start time for each task and compares it with a "do it ASAP during business hours" baseline. Waiting is not free: failure risk grows every day a task is deferred, so the planner can't push everything to the cheapest day.
- **Simulates the hall hour by hour.** A 40-rack, 4-zone hall shows racks going dark and zone temperatures changing. It flags cooling-zone conflicts, overheating (when two cooling outages in neighboring zones remove each other's backup) and vendor-window violations.
- **Shows the difference.** A 3D hall plays the week forward with a live **$ lost counter: our plan vs. the ASAP plan**. Savings: **$[X] per week** [update after demo works].
- **Nemotron as an operator agent, not a chatbot.** Type *"UPS-B battery swap, 3 hrs, vendor only Wed or Fri."* Nemotron turns it into a structured task, then calls our tools in sequence: price forecast → optimizer → simulator → re-plan if anything overheats or conflicts. It explains the new plan using only numbers the tools returned. **The LLM never computes a number.** [update after demo works]

## How we built it
- **Backend:** Python + FastAPI. Endpoints: `/prices`, `/cost`, `/backlog`, `/simulate`, `/plan` (optimized and ASAP), `/request` (Nemotron agent). Shared Pydantic contracts let three people build in parallel.
- **Deterministic by design:** every random number comes from one seeded RNG (seed 42), so the same inputs give the same plan and the same dollar figures on every run.
- **Simulator:** hourly racks offline, cooling-zone temperatures with thermal inertia, and violation detection (`zone_conflict`, `overheat`, `window`). The overheat line is 32 °C, the ASHRAE A1 allowable inlet limit.
- **Optimizer:** [greedy / OR-Tools: Nandhan to confirm] over hourly start times, checked against the simulator.
- **Agent:** NVIDIA Nemotron on build.nvidia.com via its OpenAI-compatible API with tool calling. [model name: update after demo works]
- **Frontend:** Three.js pixel-art cut-away of the GPU hall, with LEDs, cooling units, day/night lighting and week playback. [update after demo works]

## Challenges we ran into
- Keeping the LLM away from arithmetic: every price, cost, temperature and saving had to come from code, with Nemotron limited to parsing, orchestrating and explaining.
- Modeling failure risk so the optimizer doesn't just push all work to the cheapest day.
- Making the demo give the same answer every run: seeded state everywhere, no live dependencies in the critical path.
- [add real ones after the build]

## Accomplishments that we're proud of
- A new angle: past NMC² winners built ticketing and routing. We price data-center operations in GPU compute market dollars.
- The simulator catches a real failure mode: the naive "earliest hour" plan overlaps the CRAC-2 replacement and the CDU-3 flush in neighboring zones, and both zones overheat.
- [optimized vs ASAP savings: update after demo works]

## What we learned
- [fill in after the build]

## What's next
- Plug in a live price feed (Silicon Data, Ornn indices, or GetDeploying refreshed automatically) instead of the weekly snapshot.
- Real facility telemetry (temps, utilization) instead of the simulated hall.
- Escalation calls and texts to the on-call technician.
- Fine-tune Nemotron on maintenance tickets.

## Data credit
Price data: GetDeploying, GPU rental price history, https://getdeploying.com/gpus, CC BY 4.0. Dataset: https://getdeploying.com/dataset/gpu-prices

## Honesty / disclosures
- The facility, telemetry, backlog, utilization and risk numbers are **simulated or assumed**. Every assumed value is labeled in `backend/app/config.py`.
- Prices: the **history is real** (GetDeploying weekly H100 on-demand prices from 46 providers: median of 128 offerings $4.02/GPU-hr on 2026-11-02, per-provider median $3.96, in `backend/data/gpu-prices/`); the day-by-day forecast for the planning week (latest median + 8-week trend, 90% band from real volatility) is **our model**. A snapshot, **not a live feed**.
- Overheats are priced: each zone-hour over 32 °C in our (assumed) thermal sim counts the GPUs still running there as an unplanned outage at the assumed 3× + 20% rate. Most of the optimized-vs-ASAP savings (~99% on the seeded week) is ASAP's 5 overheat zone-hours priced this way, not price timing.
- We do not claim NMC² uses this market, or that CME compute futures are trading.

## Built With
python · fastapi · pydantic · uvicorn · pytest · nvidia-nemotron · build.nvidia.com · openai-python (OpenAI-compatible client) · three.js · javascript · html · css

## Links
- Repo: https://github.com/Fawazjams/hackutd26
- Demo video (≤ 2 min): [update after demo works]
