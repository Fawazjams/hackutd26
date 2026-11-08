# HACK.md: PRD

> Shared plan for the team. Every hack-* skill reads and updates this file.
> Product name: **TBD**. Last updated: Sat Nov 7, 20:18 CST.

## Event
- **HackUTD 2026: ZeroDay**, UT Dallas (ECSW). Devpost: https://hackutd-zeroday.devpost.com/
- **Register team on Devpost: Sat 11:00 PM CST** (a first submission is required; you can edit it later)
- **Team cutoff: Sun 9:00 AM CST.** Hard Devpost deadline: Sun 12:00 PM CST (no edits after).
- Submit: title + description, repo, tracks, **demo video ≤ 2 min**.
- Judging criteria: Innovation & Creativity, Technical Complexity, Completeness, Design, Impact, Presentation. Pitch about 3 min.
- Rules: up to 3 sponsor tracks + 1 HackUTD track; unlimited [MLH] tracks.
- **Track 1: NorthMark Compute & Cloud (NMC²).** "Mission: Keep the World Running... A missed warning, an unclear handoff, or the wrong information at the wrong time can turn a small issue into a major disruption. Build a solution that helps data center teams stay one step ahead." NMC² told us the solution does **not** need to match their own data center.
- **Track 2: NVIDIA, "Use Nemotron Beyond a Chatbot."** Must include: multi-step workflows (agents that plan and execute), tool integration, real-world applicability. Prizes: 2× / 1× RTX 5080 + $200 Brev credits.
- Track 3: **maybe, TBD.**

## Team
| Name | Phase 1: GPU compute core | Later |
|------|---------------------------|-------|
| **Fawaz** | Price curve + cost model | UI (Three.js) |
| **Nandhan** | Task model + optimizer + naive baseline | |
| **Loki** | Data-center sim + seeded backlog | |
| First to finish phase 1 | | Starts Nemotron agent (phase 2) |

## Problem (NMC² format)
**When** a GPU data center has to take equipment offline for maintenance, **the operations lead struggles to** decide what to take down and when, **because** they can't see what each lost GPU-hour is worth on today's compute market. **Our solution helps them** schedule maintenance at the lowest compute cost without letting failure risk get out of hand, **improving** the dollars of GPU capacity lost per maintenance cycle (measured against a "do it ASAP during business hours" plan).

- **User:** the operations lead at a GPU data center planning this week's maintenance backlog. There's one switch between two modes:
  - **GPU cloud mode:** cost = lost revenue + SLA penalties for contract hours missed.
  - **Private data-center mode:** cost = replacement cost (what it would cost to rent the GPUs you lost).
  - The math underneath is the same; only the labels and the SLA term change.
- **What's different:** this is **not** an agent-monitoring tool, which is common. It's a planner that prices data-center operations in **GPU compute market dollars**. Last year's NMC² winners (TaskFlow, DCDaddy, DataDriver) built tickets and routing; none priced downtime or optimized timing.
- **Why it matters (verified sources):**
  - GPU compute is now a priced commodity. CME + Silicon Data announced compute futures on May 12, 2026 ([CNBC](https://www.cnbc.com/2026/05/12/new-futures-market-for-semiconductors-comes-as-ai-drives-costs-skyward.html)); ICE + Ornn announced cash-settled H100/H200/B200 futures ([LeapRate](https://www.leaprate.com/financial-services/exchanges/ice-and-ornn-announce-gpu-compute-futures-contracts/)). **CME's launch date is unconfirmed**; don't claim it's trading.
  - Prices swing over days and weeks: the Ornn H100 index went from $2.31 to $4.95 in about 2 months ([Tunguz](https://www.linkedin.com/posts/tomasztunguz_nvidias-latest-gpu-rental-prices-on-the-activity-7454588703492075523-YP-o)); one-year H100 rentals rose about 40% from Oct 2025 to Mar 2026 ([SemiAnalysis](https://newsletter.semianalysis.com/p/the-great-gpu-shortage-rental-capacity)). Silicon Data's public page shows H100 at $3.04/hr ([Silicon Data](https://www.silicondata.com/products/silicon-index)).
  - 57% of operators say their last major outage cost >$100K; 1 in 5 say >$1M ([Uptime 2026](https://via.tt.se/pressmeddelande/4381155/uptime-announces-annual-outage-analysis-report-2026?publisherId=259167&lang=en)).
  - Most GPU cloud capacity is pre-sold. CoreWeave reported about $104B of backlog ([Converge Digest](https://convergedigest.com/trackers/neoclouds/)), so missed hours carry real penalties.

## MVP: the one journey
1. The operator opens the planner: the 7-day backlog (5–6 tasks), the GPU price forecast, and the 3D hall.
2. They click **Plan**. The optimizer picks the cheapest safe time for each task, within cooling-zone conflicts and failure risk that grows while a task waits.
3. The 3D sim plays the week forward. Racks go dark on schedule and a **$ lost counter runs for "our plan" vs. "ASAP plan."**
4. **(Phase 2, Nemotron)** A judge types a new request in plain English, e.g. *"UPS-B battery swap, 3 hrs, vendor only Wed or Fri."* Nemotron turns it into a task, calls the tools (forecast → optimizer → sim check → re-plan if anything overheats), and explains the new plan and the savings.

**Done means:** steps 1–3 run live and give the same answer every time; step 4 works on at least 3 rehearsed requests plus one unscripted request.

## How it works
**Cost of downtime per hour, for each rack offline:**
```
cost(hour) = GPUs_offline × utilization(hour) × price(day) [× SLA multiplier, GPU-cloud mode]
```
- `price(day)`: a daily price with a forecast range. Prices really do move day to day. **We do not model hourly price dips**; no evidence was found of reliable cheap nights.
- `utilization(hour)`: what share of GPUs are busy that hour. Taking idle GPUs offline costs less. This is an **assumption** (see Assumptions).
- **Expected cost of waiting:** `risk(task, days_waited) × unplanned_failure_cost`. This stops the optimizer from pushing everything to the cheapest day.
- **The LLM never computes numbers.** Code computes prices, costs, the schedule and temperatures. Nemotron parses requests, orchestrates tools and explains the results.

**Proposed API (Python + FastAPI), so all three can work in parallel:**
| Endpoint | Owner | Returns |
|---|---|---|
| `GET /prices?days=7` | Fawaz | daily price + low/high band, per GPU type |
| `GET /cost?task_id&start_hour&mode` | Fawaz | $ cost of running that task at that hour (planned + risk + SLA) |
| `GET /backlog` | Loki | seeded tasks: id, equipment, duration_hrs, racks_affected, zone, risk_growth, allowed_windows |
| `POST /simulate {plan}` | Loki | hourly hall state: racks offline, temps, violations (e.g., two tasks in one cooling zone) |
| `POST /plan {mode, strategy: optimized \| asap}` | Nandhan | schedule + total $ + per-task breakdown |
| `POST /request {text}` | Phase 2 | Nemotron → structured task → re-plan + explanation |

Agree on the `Task` and `Plan` JSON shapes **in the first 20 minutes** before splitting up.

## Assumptions (invented numbers; label them, never present them as facts)
| Assumption | Starting value | Why it's reasonable | Source |
|---|---|---|---|
| Hall size | 40 racks × 32 H100 = 1,280 GPUs | Typical scale for an AI hall row set | None (assumed) |
| Price forecast | Starts at $3.04/hr H100, ±10% daily band | Current public H100 index; band reflects recent volatility | Price: [Silicon Data](https://www.silicondata.com/products/silicon-index); band: assumed |
| Hourly utilization | 85–98%, small dips | AI clusters run near full; dips at job boundaries | None (assumed) |
| Risk growth while a task waits | +0.5–2%/day failure chance, by task | Deferred maintenance raises failure odds | None (assumed) |
| Unplanned failure cost | 3× planned downtime + emergency premium | Unplanned outages run longer and cost more | None (assumed) |
| Contracted share (GPU-cloud mode) | 70% contracted / 30% open market | Neoclouds pre-sell most capacity | Direction: CoreWeave backlog; value assumed |
| SLA penalty | 10% credit on missed contract hours | Common cloud SLA credit range | None (assumed) |
| Task durations, racks affected, zones | Per seeded task | Plausible for CRAC/PDU/UPS/firmware/fiber work | None (assumed) |

**Seeded backlog (5–6 tasks):** CRAC-2 compressor replacement, PDU breaker swaps (row B), GPU firmware rollout, UPS battery test, fiber re-cabling, plus one more (Loki picks). At least two must share a cooling zone so conflicts appear.

## Cut list
- Monitoring and alerting: common, and not our angle.
- Trading or hedging features: we price with the market; we don't trade on it.
- Jira, tickets, login, settings, onboarding: seeded state only.
- Phone, text and email calls (Photon/Twilio): stretch.
- Native mobile app, AR, hardware sensors.
- Hourly price curves with invented night-time dips.
- The old `prototype/index.html`: dropped; the UI starts fresh in Three.js.

## Stretch (only after the MVP works)
- **Fine-tune Nemotron on maintenance tickets** (synthetic data, disclosed).
- **Fine-tune on prices, under guardrails:** max 2 hours, real public price points only (never our seeded curve), must beat the simple code forecast, and the data it saw is disclosed. Expect to drop it; free data is thin.
- Escalation calls/texts.
- Higgsfield CLI for visuals (undecided).

## Tasks to check early (first 1–2 hours)
- [ ] **Nemotron tool calling on build.nvidia.com:** pick the model, test a 3-tool loop, and check the rate limit (reported ~40 requests/min, unverified).
- [ ] **Free price feed:** try [GetDeploying](https://getdeploying.com/gpu-price-trends) (weekly history, 103 GPUs), the Silicon Data public page and Ornn. If none works, keep the seeded curve.
- [ ] **Optimizer:** greedy vs. OR-Tools (Nandhan decides; greedy is faster).
- [ ] **Ask the NMC² booth:** what maintenance actually costs them, and how they schedule it now. Their answer can make a pitch line.

## Honesty (disclose in the demo)
- The facility, telemetry, backlog, utilization and risk numbers are simulated or assumed (see Assumptions).
- Prices are a seeded sample curve based on public index levels, **not a live feed**, unless the feed task above succeeds.
- Don't claim NMC² uses this market, or that CME compute futures are trading.

## Open (still undecided)
- Product name, track 3, pitch roles, whether to use Higgsfield.

## Budget (now 20:18 CST, about 12.7h to the 9 AM cutoff)
| Phase | Clock (CST) | Goal |
|-------|-------------|------|
| Contracts | 20:20 – 20:40 | agree on Task/Plan JSON + endpoints |
| Phase 1: GPU compute core | 20:40 – 00:30 | `/prices`, `/cost`, `/backlog`, `/simulate`, `/plan` work; optimized beats ASAP |
| **Devpost registration** | **by 23:00** | team registered, draft submission |
| Phase 2: Nemotron + rough UI | 00:30 – 04:00 | `/request` loop works; Three.js hall + $ counter |
| Harden | 04:00 – 06:00 | same answer every run, 3 rehearsed requests |
| Demo prep | 06:00 – 08:00 | README, 2-min video, pitch rehearsal |
| Buffer | 08:00 – 09:00 | something will break |
Sleep in shifts; someone is always building.

## Reference
- Sponsor tracks (full text): https://hackutd-2026.notion.site/Sponsor-Tracks-3bd63cec7740808c9e89e4e25cee23e7
- Research: sponsor winners: https://claude.ai/artifact/CigCb57vufzpgyentwkhuQ
- Research: Northmark deep dive: https://claude.ai/artifact/FpAzGkfzY9LhqU1x42snhU (its NMC² facility figures are wrong: the official release says 27 jobs and initial operations Q3 2026)

## Status log
- 20:18 PRD written after grilling: maintenance planner priced in GPU compute dollars; NMC² + NVIDIA. Next: agree on JSON contracts, then split up.
- Loki: /backlog (6 seeded tasks; T1+T2 share Z2, T4+T5 share Z4; T1 CRAC-2 + T6 CDU-3 overlap = neighbor cooling loss -> overheat) and /simulate (hourly racks offline, zone temps, zone_conflict/overheat/window/unknown_task) done, 16 tests. Added optional `Plan.tasks` (for Nemotron-added tasks) and thermal constants in config.py. Planner: import `simulate_plan` / `find_conflicts` from `app.simulate` to reject bad plans. Stub ASAP plan currently overheats Z2/Z3 Mon 09-12.
- 21:3x Loki: phase 2 `/request` agent on main (Nemotron via build.nvidia.com, 7 deterministic tools, code re-plans on violations, explanation numbers checked against tool output, offline fallback for 3 rehearsed requests in app/demo_requests.py). 30 tests. `backend/scripts/nemotron_check.py` probes models/tool calling/rate limit once NVIDIA_API_KEY is in .env. Draft docs/DEVPOST.md + docs/DEMO_SCRIPT.md. TODO: align agent.py EQUIPMENT names with Nandhan's frontend contract; re-check Mon Z2/Z3 overheat with the real ASAP baseline.
