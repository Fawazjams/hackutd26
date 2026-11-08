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
Fawaz's lane (prices + cost model) is redistributed to Loki and Nandhan as of 21:50 Sat.

| Name | Done | Owns now |
|------|------|----------|
| **Loki** | backlog, simulate, Nemotron `/request` agent, PR #1 merge | prices + cost model (from Fawaz), agent UI panel, Devpost/README/video/pitch |
| **Nandhan** | `/plan` optimizer + ASAP, planner UI, fallback snapshot | thermal-aware planner, 3D hall scene, UI integration |

## Task board (deadline Sun 09:00; Harden phase: finish the journey, no extras)
**P0: before 01:00 (MVP becomes demo-complete)**
- [x] Loki: register team on Devpost by **23:00** (temporary draft submitted) (paste docs/DEVPOST.md)
- [x] Loki: `frontend/ui/agent-panel.js` (own file): enable "Ask Nemotron" box, POST /request, show live tool-call trace, explanation, "thinking" state (~13-40 s), swap the new plan into the scoreboard. Nandhan adds the one import in main.js.
- [x] Nandhan: thermal-aware optimizer: reject any plan where `simulate.find_conflicts`/`simulate_plan` reports violations (or add a neighbor-cooling rule), so "optimized never overheats" is true by design.
- [x] Loki: cost model into `prices.py`: fix risk term to (1-p)*planned + p*unplanned, real `/cost` from it, keep `stubs.slot_cost` as a thin re-export so planner is untouched.
- [x] ~~Loki: make the daily price curve drive decisions~~ superseded by real prices (see status log) (savings should come mostly from price, not invented utilization dips); flatten/dampen utilization dips; re-run test_optimized_beats_asap and regenerate fallback-plans.js.

**P1: before 04:00 (polish that judges see)**
- [ ] Nandhan: 3D hall (scene.js): racks go dark on schedule, zones glow red on overheat during ASAP playback.
- [x] Loki: agent re-plan for real: when the new task causes a violation, Nemotron sees it from `simulate` and re-plans (needs thermal-aware planner); trace shows the re-plan.
- [x] Loki (NMC² "unclear handoff"): `/handoff`: Nemotron writes a shift handoff / work order per scheduled task from tool numbers only (what, when, racks, zone temps to watch, risk if delayed). Button in the UI.
- [x] Nandhan: end-of-week summary shows $ saved and "0 overheats vs 5" side by side.

**P2: 04:00-06:00 harden**
- [ ] Both: rehearse 3 scripted + 1 unscripted request; same output every run; kill Wi-Fi once and confirm fallback.
- [ ] Loki: ~~README~~ (done) · secret scan (no keys in git).

**P3: 06:00-08:30 present**
- [ ] Loki: 2-min video (docs/DEMO_SCRIPT.md), final Devpost with real $ figures.
- [ ] Both: pitch rehearsal x3; each person can answer "where do the savings come from" and "what does Nemotron decide vs code".

**Cut / stretch:** live price feed tool (only if P0-P1 done), fine-tuning, calls/texts.

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
| Price forecast | Real H100 on-demand median $4.02/hr (median of 128 offerings from 46 providers, Nov 2, 2026; per-provider median $3.96) + 8-week trend; 90% band from 26-week volatility | History is real; the daily forecast is our model | [GetDeploying dataset](https://getdeploying.com/gpu-price-trends) |
| Hourly utilization | 93–96%, brief dips to 92–93% | AI clusters run near full; dips at job boundaries | None (assumed) |
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
- [x] **Nemotron tool calling on build.nvidia.com:** pick the model, test a 3-tool loop, and check the rate limit (reported ~40 requests/min, unverified).
- [x] **Free price feed:** try [GetDeploying](https://getdeploying.com/gpu-price-trends) (weekly history, 103 GPUs), the Silicon Data public page and Ornn. If none works, keep the seeded curve.
- [ ] **Optimizer:** greedy vs. OR-Tools (Nandhan decides; greedy is faster).
- [ ] **Ask the NMC² booth:** what maintenance actually costs them, and how they schedule it now. Their answer can make a pitch line.

## Honesty (disclose in the demo)
- The facility, telemetry, backlog, utilization and risk numbers are simulated or assumed (see Assumptions).
- Prices: real weekly history from GetDeploying (H100 on-demand, 46 providers: median of 128 offerings $4.02/hr, per-provider median $3.96, as of 2026-11-02; in `backend/data/gpu-prices/`). The daily forecast for the planning week (latest median + 8-week trend, 90% band from real volatility) is **our model**. A snapshot, **not a live feed**.
- Don't claim NMC² uses this market, or that CME compute futures are trading.
- Nemotron rehearsed requests: for the 3 scripted demo requests the parsed task is pinned to a pre-verified version (and used outright if Nemotron is offline/rate-limited). Unscripted requests use Nemotron's parse as-is.
- Overheats are priced: each zone-hour over 32 °C in our (assumed) thermal sim counts the GPUs still running there as an unplanned outage at the assumed 3× + 20% rate. Most of the optimized-vs-ASAP savings (~99% on the seeded week) is ASAP's 5 overheat zone-hours priced this way, not price timing.
- With real prices the price rises steadily through the week (~0.5%/day), so price timing alone saves ~1%.
- The optimized plan is checked against our own thermal sim (simulate.py), whose temperatures and cooling rules are assumed. "Never overheats" means never in that sim.
- The hall view is a 2D placeholder until the 3D scene lands.

## Pitch (full script, 30-second version and Q&A in `PITCH.md`)
- **One-liner:** We schedule GPU data-center maintenance at the lowest compute-market cost, without letting the hall overheat; Nemotron turns a plain-English work request into a safe, priced plan.
- **Roles (proposed):** Driver Nandhan · Narrator Loki · Tech answers Loki + Nandhan · Backup Fawaz (video, hotspot, timer)
- **Lead with "0 overheats vs 5"**, not the 42.8%.

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
- 21:40 Loki merged PR #1 (Nandhan: /plan optimizer + ASAP baseline + planner UI). Contract = Nandhan's app/models.py (mode "cloud", racks "A01".."D10", Plan.items/unscheduled); schemas.py re-exports it. Backlog/simulate/agent adapted; stubs.seeded_backlog() now returns Loki's backlog; fallback-plans.js regenerated. Seeded week: ASAP $13,248.58 with 5 overheat violations (CRAC-2 + CDU-3 Mon 09:00) vs optimized $12,772.56 clean. 44 tests. Open: planner doesn't check thermal (optimized is clean by luck; wire simulate_plan in), /cost still Fawaz's stub (real cost model lives in stubs.slot_cost), /prices served from stubs in main.py.
- 21:45 hack-check: phase Harden (~11h to cutoff). Weakest: Presentation (no video/rehearsal; Devpost registration unconfirmed, due 23:00). Highest-leverage build fix: wire the disabled "Ask Nemotron" box to POST /request (journey step 4, NVIDIA track). Then: thermal-aware optimizer, /cost from stubs.slot_cost, utilization-vs-price savings story.
- 21:50 Fawaz's lane redistributed (Loki: prices/cost model; Nandhan: thermal-aware planner + 3D). Task board added.
- 22:xx Nandhan: thermal-aware optimizer. Every slot the optimizer takes is checked with `simulate_plan` on the whole plan; cheapest slot that keeps all zones under 32 C wins. ASAP stays unchecked (the baseline). Shortcut: non-cooling tasks only lower temps, so they skip per-slot sims; ~17 ms per plan. Seeded week unchanged: optimized $12,772.56 clean vs ASAP $13,248.58 with 5 overheats; fallback-plans.js still valid. 48 tests.
- 23:xx Nandhan: real prices. Fawaz's GetDeploying CSVs (H100/H200/B200, weekly Nov 2025-Nov 2026) in backend/data/gpu-prices; app/market.py turns them into a daily forecast for the week of Mon Nov 9 (H100 $4.16 -> $4.28, rising ~0.5%/day). stubs.price() now uses it (Loki: cost model untouched). Seeded week: optimized $17,449 clean vs ASAP $18,101 (5 overheats); saved $652 (3.6%). Real week-to-week moves average 2.7%, so within one week price barely changes the schedule: savings still come from utilization + timing. fallback-plans.js regenerated via backend/scripts/make_fallback.py.
- 23:xx Nandhan: merged loki/polish into nandhan/thermal-planner (main untouched). Loki's cost model (prices.py, fixed risk term) now reads the real GetDeploying forecast instead of the invented curve (team call: real data). Real prices alone save ~1%, so ASAP's overheats are now priced (Plan.overheat_cost / Plan.overheats, optional fields): seeded week cloud optimized $18,222.79 clean vs ASAP $31,867.40 incl. $13,467.77 for 5 overheat zone-hours -> saved $13,644.61 (42.8%), ~99% of it overheats at the ASSUMED outage rate. Agent tests updated for the heat-aware planner (re-plan path tested with a planner blind to the new task's heat). Ask Nemotron panel wired into main.js; summary shows overheats 0 vs 5. 74 tests.
- 22:15 Loki reviewed + merged PR #3 (includes PR #2) into main. Verified: 74 tests, live server ASAP $31,867.40 (5 overheats) vs optimized $18,222.79 (0), live Nemotron request clean. Pitch note: ~99% of the 42.8% is overheats priced at the ASSUMED outage rate (two of five zone-hours only 32.3/32.7 C); lead with "0 overheats vs 5". Open: confirm GetDeploying data reuse terms before repo goes public.

- 22:25 Pitch written (PITCH.md): 3-min script, 30-s version, 10 Q&A answers. DEMO_SCRIPT rehearsed requests fixed to match demo_requests.py. Found: weekend PDU request's $ saving is not like-for-like (ASAP can't schedule weekend jobs); don't quote it.
- 22:35 GetDeploying data license confirmed on https://getdeploying.com/dataset/gpu-prices: CC BY 4.0, attribution "GetDeploying, GPU rental price history, https://getdeploying.com/gpus, CC BY 4.0" added to README, DEVPOST, data README. Clarified two medians (offering median $4.02 used by market.py vs per-provider median $3.96). TODO Nandhan: add the credit line under the price chart in the UI.
