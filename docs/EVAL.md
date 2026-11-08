# Many-week evaluation

Regenerate: `cd backend && .venv/Scripts/python scripts/eval_weeks.py --n 100` (seeded: same numbers every run).

## Why
The demo shows one seeded week ("0 overheats vs 5"). A judge can say that week was designed for ASAP to fail.
This evaluation tests the claims on weeks we did not design, in the style of Elix's planted-anomaly proof.

## Method
- **What varies (per seed):** 5-7 jobs drawn from the equipment catalog (CRAC, CDU, PDU, fiber, UPS), each with a
  random duration (2-6 h), failure-risk growth (0.5-2%/day) and allowed window (whole week, weekdays 08-20, or 2 random days).
- **Planted problems (answer key):** on about 40% of seeds we add a CRAC job and a CDU job in *neighboring* cooling
  zones, both allowed from Mon 08:00. If they overlap, the zones lose backup cooling. The answer key says ASAP should
  overheat on these weeks. The planner never reads the answer key.
- **What is fixed:** the hall (40 racks, 4 zones), real-data H100 price forecast, seeded utilization, the cost model
  and the thermal model.
- **For each week:** run ASAP and optimized (cloud mode), simulate both hour by hour, count overheat zone-hours,
  total cost and unscheduled jobs. Savings are only compared on weeks where both plans schedule the same jobs.

## Results
| Measure | Result |
|---|---|
| Weeks tested (seeds 1..N) | 100 |
| Optimized weeks with any overheat | 0 of 100 |
| ASAP weeks with any overheat | 59 of 100 |
| Planted weeks where ASAP overheated (answer key) | 45 of 45 |
| Unplanted weeks where ASAP overheated anyway | 14 |
| Like-for-like weeks (both plans schedule the same jobs) | 93 |
| Optimized cheaper than ASAP (like-for-like) | 100.0% |
| Median saving per week (like-for-like) | $3,091.99 |
| Median saving excluding ASAP overheat cost | $218.66 |
| Jobs left unscheduled, ASAP / optimized | 9 / 0 |

## Limits (say these out loud)
- Every week runs on our **assumed** thermal and cost model (`app/config.py`). This proves the planner is reliable
  *inside our simulation*, not in a real hall.
- "Optimized never overheats" is expected by construction: the optimizer checks every slot against the simulator.
  The informative numbers are the ASAP catch rate, the savings and the unscheduled jobs.
- Most of the saving is ASAP's overheats priced as unplanned outages at an **assumed** rate; the
  "excluding overheat cost" row shows what timing alone saves.
