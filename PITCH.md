# PITCH.md

Read this out loud while you rehearse. Every number below comes from the merged code on `main` (seed 42, cloud mode) as of Sat 22:20. Re-check them after any change to the planner or cost model.

**Working name:** "Downtime, Priced" (the UI title; the final product name is still open in HACK.md)

**One-liner:** *We schedule GPU data-center maintenance at the lowest compute-market cost, without letting the hall overheat. Nemotron turns a plain-English work request into a safe, priced plan.*

---

## 3-minute pitch (format in HACK.md: about 3 min)

| Part | Time | Driver does | Narrator says |
|---|---|---|---|
| Open | 0:00–0:15 | UI already open on the hall | "Every time a GPU data center takes racks down for maintenance, those GPU-hours have a market price, and nobody schedules around it. Ops teams just do it ASAP during business hours. We built the planner that prices the downtime and keeps the hall safe." |
| Demo: ASAP | 0:15–0:45 | Play the **ASAP** week, stop at Mon 12:00 | "Here's this week's backlog: CRAC compressor, PDU breakers, firmware, UPS test, fiber, coolant flush. Done the usual way, ASAP, the CRAC-2 replacement and the CDU-3 flush both start Monday at 9. They're cooling units in neighboring zones, so there's no backup cooling. Watch the ticker: zones Z2 and Z3 go over 32 degrees, five zone-hours, with Z3 peaking at 34.8." |
| Demo: optimized | 0:45–1:15 | Play **our plan**, end on the summary card | "Our optimizer prices every hour of downtime in GPU-market dollars, using real H100 rental prices from 46 providers (GetDeploying data; about $4.16 an hour this week in our forecast) plus failure risk that grows while a job waits. It checks every slot against the thermal sim. Same backlog: **zero overheats versus five.** If each overheat hour became an outage, ASAP costs $31,867 and we cost $18,223." |
| Demo: Nemotron | 1:15–2:05 | Click the **UPS-B** chip, then point at the trace | "Now a new job comes in: 'UPS-B battery swap, 3 hours, vendor only Wednesday or Friday.' Nemotron isn't chatting. It plans: it looks up the equipment, converts days to hours with our tool, adds the task, runs the optimizer, then runs the simulator to check the result. It lands Wednesday at 2 AM, with no conflicts and no overheating. **Every number on screen comes from our code, not the model.**" |
| Tech | 2:05–2:30 | Click **Shift handoff** | "Under the hood: a FastAPI backend with a deterministic optimizer, an hour-by-hour thermal sim of 40 racks in 4 cooling zones, and Nemotron on build.nvidia.com calling 7 tools. Guardrails pin the numbers, and if the sim ever flags a problem, the agent re-plans around it. Then it writes the shift handoff, so the next crew knows what's running, the zone temps to watch, and what a one-day delay costs." |
| Honesty + close | 2:30–2:50 | Stay on the handoff | "To be straight with you: the hall, the backlog and the thermal model are simulated. The prices are real market data from 46 providers, with our own daily forecast on top, and most of the dollar gap is those overheats priced at an assumed outage rate. Plug in real telemetry and a live price feed, and this runs on a real hall. Thank you." |

**If a judge wants to type:** hand them the keyboard for an unscripted request (see "Requests" below). It takes about 15–40 seconds live, so fill the wait by narrating the trace as the steps appear.

---

## 30-second version (a judge walks up mid-pitch)

"We schedule data-center maintenance around GPU market prices without overheating the hall." *(point at the summary card)* "Doing it ASAP overheats two cooling zones on Monday; our plan has zero overheats." *(click the UPS-B chip)* "And Nemotron takes plain-English jobs like this one, calls our optimizer and simulator as tools, and schedules it safely. Every number comes from code, not the model."

---

## Requests (these must match `backend/app/demo_requests.py`)

| # | Type exactly | Result (offline path, deterministic) | Quote $? |
|---|---|---|---|
| 1 | UPS-B battery swap, 3 hrs, vendor only Wed or Fri | Z4, Wed 02:00–05:00, no violations | Yes |
| 2 | CRAC-4 filter and belt service, 4 hours, weekdays 8am to 6pm | Z4 cooling job, Mon 09:00–13:00, no violations | Yes |
| 3 | PDU row C breaker inspection, 2 hours, weekend only | Z3, Sat 06:00–08:00, no violations | **No.** ASAP only uses business hours, so it can't schedule a weekend job, and the "saving" compares different work |

**Unscripted, for a judge:** "Swap the fan tray on CRAC-1, about 2 hours, any weekday afternoon" was tested live and came back clean.

With Nemotron live, the trace shows real tool calls. For rehearsed requests the parsed task is checked against the verified version and swapped for it only if Nemotron got something wrong, and that's disclosed below.

---

## Roles (proposed; confirm as a team)

| Role | Who | Job |
|---|---|---|
| Driver | Nandhan | Built the UI. Hands on the keyboard, follows the script, never improvises clicks |
| Narrator | Loki | Tells the story above |
| Tech answers | Loki (agent, sim, cost model) and Nandhan (optimizer, UI) | Hard-part questions |
| Backup | Fawaz | Price-data questions, backup video in an open tab, phone hotspot, watches the time |

---

## Q&A

**1. Who's the user, and how do you know they have this problem?**
The operations lead at a GPU data center planning the week's maintenance. Honest answer: we haven't interviewed one yet; the evidence is public. 57% of operators said their last major outage cost over $100K (Uptime 2026), and most GPU cloud capacity is pre-sold, so missed hours carry penalties. *(Ask the NMC² booth tonight how they schedule maintenance. A real quote from them beats this answer.)*

**2. What did you build vs. use?**
We built the optimizer, the thermal sim, the cost model, the agent loop, its guardrails and the UI. We used FastAPI, Nemotron through NVIDIA's hosted API, and GetDeploying's GPU price history (CC BY 4.0, credited in the README).

**3. What's mocked?**
The hall, backlog, utilization, failure risk and thermal model are simulated, and every assumed number is labeled in `config.py`. Prices are real weekly data with our own daily forecast on top, and they're a snapshot, not a live feed. For the 3 rehearsed requests, Nemotron's parse is checked against a verified task and replaced by it if they differ.

**4. Hardest technical problem?**
Making "never overheats" true by design. The optimizer runs the hour-by-hour thermal sim on every candidate slot, which still only takes about 17 ms per plan. The second hardest: keeping the LLM from ever producing a number. It only calls tools, and any explanation with a number the tools didn't return gets replaced by the code-built text.

**5. How is this different from a CMMS or ticketing tool?**
Those track work orders. We decide *when* to do the work, priced in compute-market dollars and checked against cooling. Last year's NMC² winners built ticketing and routing; none priced downtime.

**6. "0.3 °C over 32 doesn't mean a full outage."** *(Expect this one.)*
"Fair. Two of the five overheat hours are only 32.3 and 32.7 degrees. We price every hour over the limit as an outage at an assumed rate, so treat the dollar figure as a worst case. The robust claim is zero overheats versus five. Even ignoring overheats, our plan is cheaper on price and timing alone, by about $177 this week, because real H100 prices barely move in one week."

**7. Did you fine-tune Nemotron?**
"No. It's the hosted Nemotron 3.5 Lightning, prompted with tool definitions, and our guardrails catch its mistakes. Fine-tuning a smaller, faster Nemotron on maintenance requests is next. The data generator is easy because our tools produce the correct labels."

**8. What breaks first at 1,000 users?**
The free Nemotron endpoint: it's rate-limited, and each request makes several model calls. Second, the optimizer's slot search, which grows with tasks × slots × thermal sims. That's fine for a week's backlog, but a full fleet would need a real solver such as OR-Tools.

**9. Another week?**
Real telemetry instead of the simulated hall, a live price feed, a solver for bigger backlogs, a fine-tuned smaller Nemotron, and escalation calls to on-call techs.

**10. "Are those prices real?"**
"The history is real: weekly H100 rental prices from 46 providers, from GetDeploying's open dataset. Today's median is about $4 an hour. That's in line with Silicon Data's public H100 index at $3.04 and the Ornn index, which went from $2.31 to $4.95 in about two months. The day-by-day forecast for this week is our model, and it's a snapshot, not a live feed."

**11. "What does Nemotron actually decide, and what does code do?"**
"Nemotron decides; code computes. It parses the request, then calls compare_slots, which prices every candidate slot: cheapest safe, earliest, business-hours ASAP, wait a day. Each option is a full week plan plus a hall simulation. Nemotron picks one with a reason, for example earliest safe when the operator says 'as soon as possible'. When an alarm fires, like the simulated CRAC-3 vibration alarm Wednesday 14:00, nobody types anything: Nemotron triages it, prices fixing now against waiting, and schedules the repair. Code computes every number and refuses an unsafe pick, so the model can choose but can't overheat the hall or invent a dollar figure."

**12. Which tracks, and how do you meet them?**
- **NVIDIA "Beyond a chatbot":** Nemotron plans and executes a multi-step workflow (lookup, windows, add task, compare slots, choose slot, plan, simulate, re-plan) through 9 tools, chooses between priced options, and acts on a simulated alarm with no human prompt.
- **NMC² "keep the world running":** it catches the warning before it happens (overheat), puts the right information at the right time (priced schedule), and fixes the unclear handoff (shift brief).

---

## Before you go on (demo machine)
- [ ] `cd backend && .venv/bin/uvicorn app.main:app` running; http://localhost:8000 loads
- [ ] `NVIDIA_API_KEY` in `backend/.env`, and one warm-up request sent
- [ ] Notifications off, extra tabs closed, browser zoom 125%, laptop charged, phone hotspot ready
- [ ] Backup video open in a tab
- [ ] Rehearse 3 times with a timer; cut any line that pushes you past 3:00

**Avoid:** team intros, history, clicking around to find things, saying "trained", saying "live price feed", saying futures are "trading".
