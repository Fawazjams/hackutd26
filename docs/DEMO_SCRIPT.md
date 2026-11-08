# Demo script

> Full live pitch + Q&A: see `PITCH.md`. Every `$[X]` is a placeholder. Fill it from the live tool output on the final build and **never round up or invent**. Run the demo twice before recording: the numbers must match both times (seed 42).

## Setup checklist
- [ ] `cd backend && uvicorn app.main:app --port 8000` running; `/docs` loads
- [ ] Frontend open, mode = **GPU cloud**
- [ ] `NVIDIA_API_KEY` in `backend/.env`; one warm-up `/request` sent (avoid a cold first call on camera)
- [ ] Fallback plans loaded in the UI (works even if the backend dies)
- [x] Overheat beat confirmed on the final ASAP baseline: Z2/Z3 over 32 C Mon 10:00-12:00 (5 zone-hours)

---

## 2-minute video (≈ 300 words spoken)

| Time | Screen | Say |
|---|---|---|
| 0:00–0:15 | Title → 3D hall | "When a GPU data center takes racks down for maintenance, nobody asks what those GPU-hours are worth that day. GPU compute now has a market price, and that price moves." |
| 0:15–0:30 | Backlog panel + price forecast | "This is one week's backlog: CRAC compressor, PDU breakers, firmware, UPS test, fiber, coolant flush. Here's the H100 price forecast, built from real GetDeploying market prices." |
| 0:30–0:50 | Click **ASAP plan**, play week | "The usual way is to do it all ASAP. Watch Monday morning: the CRAC-2 replacement and the CDU-3 flush overlap in neighboring zones, both lose their backup cooling, and zones Z2 and Z3 **overheat**. The ASAP plan also costs **$[X]**." |
| 0:50–1:15 | Click **Plan** (optimized), play week, $ counters side by side | "Our optimizer prices every hour of downtime in market dollars, factors in failure risk that grows while a task waits, and keeps cooling zones apart. Same backlog, **$[Y]**, so **$[X−Y] saved** this week with no overheating." |
| 1:15–1:45 | Type request 1 into the agent box | "Now a new job comes in." *(type the UPS-B request)* "Nemotron turns it into a task and calls our tools: equipment lookup, day windows, optimizer, then the simulator to check the result. The heat-aware optimizer already keeps it clean; if the sim ever flags a problem, the agent re-plans around it. Every number it says comes from our code, not the model." |
| 1:45–2:00 | Tool-call trace + explanation | "It fits the swap into the vendor's window at **$[Z]**. Simulated hall, assumed numbers, real market logic. That's [product name]." |

---

## 3-minute live pitch

1. **Hook (20 s).** "57% of operators say their last major outage cost more than $100K. Every planned outage has a price too, set by a GPU compute market that moves day to day. CME and ICE have both announced GPU compute futures." *(Don't say they are trading.)*
2. **Problem (20 s).** The ops lead schedules maintenance ASAP during business hours, without knowing what each lost GPU-hour is worth. Last year's NMC² winners built ticketing and routing; none priced downtime.
3. **Demo: plan (60 s).** Backlog → forecast → ASAP plan overheats Z2/Z3 Monday 09:00–12:00 → optimized plan: no violations, **$[X] saved**. Flip the mode switch to **Private DC**: same math, replacement cost instead of lost revenue and SLA.
4. **Demo: Nemotron (50 s).** Run one rehearsed request, then hand the keyboard to a judge for the unscripted one. Point at the tool-call trace: "That's multiple steps with tool use. The LLM never computes a number."
5. **How it works (20 s).** `cost(hour) = GPUs offline × utilization × price(day)` plus SLA; waiting cost = risk growth × unplanned failure cost. Seeded, so the same answer every time.
6. **Honesty + close (10 s).** "Facility and backlog are simulated, assumptions are labeled in the repo, prices are real weekly market data with our own forecast on top, and overheats are priced at an assumed outage rate. Plug in a live feed and real telemetry and this runs on a real hall."

---

## Nemotron requests

**Rehearsed (must match `backend/app/demo_requests.py`; run each 3 times, results must match):**
1. *"UPS-B battery swap, 3 hrs, vendor only Wed or Fri"*: Z4, Wed 02:00-05:00, no violations.
2. *"CRAC-4 filter and belt service, 4 hours, weekdays 8am to 6pm"*: Z4 cooling job, Mon 09:00-13:00, no violations.
3. *"PDU row C breaker inspection, 2 hours, weekend only"*: Z3, Sat 06:00-08:00. **Don't quote its $ saving**: ASAP (business hours only) can't schedule a weekend job, so the comparison isn't like for like.

**Unscripted (hand to a judge), suggest:**
- *"Swap the fan tray on CRAC-1, about 2 hours, any weekday afternoon"* (tested live, clean).

## If it breaks, say this
- **Agent/API fails:** "Nemotron's rate-limited right now. Here's the same request from our rehearsal." Then show the saved run. "The plan and the numbers come from our optimizer either way; the model only parses and explains."
- **Backend down:** the UI falls back to saved `/plan` output. "This is the exact output from the backend, saved, because the result is deterministic."
- **3D view stutters:** switch to the panel + $ counter. "The scoreboard is the point: our plan vs. ASAP, in dollars."
