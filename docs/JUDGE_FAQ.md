# Judge FAQ

Numbers come only from PITCH.md, docs/PROCUREMENT.md, docs/EVAL.md and README.md. Everything simulated is labeled as simulated.

**1. Why price downtime at market price, not our billing rate?**
Market price is what a replacement GPU-hour costs today, so it is the real opportunity cost of taking racks down. Our contract rate (an assumed $3.25) only matters for the SLA break-even ($3.575/GPU-hr). The price data is real H100 history from 46 providers (GetDeploying, CC BY 4.0), about $4.16/hr in this week's forecast.

**2. Where do the savings come from?**
Mostly from avoiding overheats: $18,223 vs $31,867 in the demo week, with ASAP's overheats priced at an assumed outage rate. Timing alone saves about $177 in the demo week; over 100 weeks the median is $218.66 excluding overheat cost, and $3,091.99 including it.

**3. Isn't that dollar gap inflated?**
Partly, and we say so. Two of the five overheat hours are only 32.3 and 32.7 degrees against a 32 limit, so treat the dollar figure as a worst case. The robust claim is zero overheats vs five.

**4. Is the evaluation rigged to make ASAP fail?**
We checked: 100 seeded weeks, including 14 unplanted weeks where ASAP overheated anyway. ASAP overheated in 59 of 100 weeks (45 of 45 planted ones); optimized overheated in 0 of 100, which is true by construction because it checks every slot against the sim. The informative numbers are the catch rate and the savings, and all of it runs on our assumed model, not a real hall.

**5. Why buy replacement compute instead of paying the SLA credit?**
Not covering loses the contract revenue and owes a 10% credit: 1.1 x $3.25 = $3.575/GPU-hr. Nebius at $3.39 beats that and saves $62.16 on the incident ($1,139 vs $1,201 for 336 GPU-hours); CoreWeave stopped at $3.62, so the agent walked.

**6. Is the negotiation real AI?**
Not yet. It is scripted, code-bounded rules: opening ask from the market price, a secret floor, 5% counter steps, and only accept, counter or walk. Next step is Nemotron choosing those moves inside the same code limits, so no model ever sets a price.

**7. Is the data real?**
Price history is real (46 providers, GetDeploying). The hall, backlog, thermal model, failure risk, the two data centers (Nebius, CoreWeave), the contract rate and the ledger are simulated and labeled in `config.py`. The forecast is our model on top of a snapshot, not a feed.

**8. What about collateral and futures?**
GPUs already work as loan collateral, priced on contracts and utilization (Wing VC, AnandTech), which is why downtime hours have a financial value. We do not use futures: CME + Silicon Data planned a launch for Oct 5, 2026, and ICE + Ornn is pending CFTC review, and neither is confirmed trading. A forward curve is a v2 idea once they trade.

**9. What does Nemotron decide, and what does code do?**
Nemotron picks tools and picks among priced options (for example, earliest safe slot); code computes every number and refuses unsafe picks. Any explanation containing a number the tools did not return is replaced by code-built text.

**10. What breaks at scale?**
First the free, rate-limited Nemotron endpoint (several model calls per request), then the slot search, which grows with tasks x slots x thermal sims (about 17 ms per plan today). A full fleet needs a real solver such as OR-Tools, real telemetry and a live price feed.

**11. Why does this fit the NMC² track?**
It targets their three failure modes: a missed warning (catches overheats before they happen), wrong information at the wrong time (a priced schedule) and an unclear handoff (the shift brief). Last year's NMC² winners built ticketing and routing; none priced downtime. We have not interviewed an operator; our evidence is public (57% of operators said their last major outage cost over $100K, Uptime 2026).

**12. Why does this fit the NVIDIA "Beyond a chatbot" track?**
Nemotron runs a multi-step workflow through 9 tools (lookup, windows, add task, compare slots, choose slot, plan, simulate, re-plan), and triages the simulated INC1 alarm with no human prompt. It is the hosted Nemotron, prompted with tool definitions, not fine-tuned.

---
