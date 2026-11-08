# 2-minute video shot list

Voiceover is about 300 words. Every number below appears in `docs/DEMO_SCRIPT.md`, `PITCH.md` or `docs/PROCUREMENT.md`. Read the final on-screen numbers before recording and never round up.

| Time | Click / screen | Voiceover |
|---|---|---|
| 0:00-0:10 | 3D hall at `http://localhost:8000`, mode GPU cloud. No clicks. | "Every time a GPU data center takes racks down for maintenance, those GPU-hours have a market price, and nobody schedules around it." |
| 0:10-0:25 | Click **ASAP plan**, press play. Stop at Mon 12:00. Zoom on the ticker. | "Done the usual way, ASAP, the CRAC-2 replacement and the CDU-3 flush both start Monday at 9. Zones Z2 and Z3 go over 32 degrees: five zone-hours, Z3 peaking at 34.8." |
| 0:25-0:40 | Click **Plan** (optimized), play the week. End on the summary card. | "Our optimizer prices every hour of downtime with real H100 prices from 46 providers, and checks every slot against the thermal sim. Same backlog: zero overheats versus five." |
| 0:40-1:00 | Click the **UPS-B** chip. Point at the tool-call trace as the steps appear. | "A new job: UPS-B battery swap, 3 hours, vendor only Wednesday or Friday. Nemotron looks up the equipment, converts days to hours, runs the optimizer, then the simulator. Wednesday 2 AM, no overheating. Every number comes from our code, not the model." |
| 1:00-1:10 | Click **Trigger alarm** (INC1, CRAC-3, Wed 14:00). Show the alarm banner and trace. | "Then an alarm fires. Nobody typed anything. The CRAC-3 vibration alarm takes 336 contracted GPU-hours down." |
| 1:10-1:35 | Camera glides to the two islands (Nebius, CoreWeave). The negotiator drone flies to each and back. Offer card appears. Click **Accept**. Ledger shows "simulated". | "Our negotiator drone flies to two other data centers. Break-even is $3.575 an hour. CoreWeave won't go below $3.62, so we walk. Nebius agrees at $3.39: $1,139 instead of $1,201, saving $62.16. Agents negotiate. Code checks. A person signs." |
| 1:35-1:48 | Click the **Money at risk** card. Hold 3 seconds. | "The Money at risk card shows what is exposed if nothing is done. If each overheat hour became an outage, ASAP costs $31,867 and we cost $18,223." |
| 1:48-2:00 | Open `/proof.html`. Slow scroll. | "Proof is on this page, with the eval results. Hall, backlog and providers are simulated; prices are real market data. Plug in real telemetry and a live price feed and this runs on a real hall." |

## Notes
- The three source files contain no figure for the Money at risk card itself. Read the number off the card on camera, or use the $31,867 and $18,223 outage-priced totals from `PITCH.md`, which must match the card.
- Say these dollar totals are a worst case: each overheat hour is priced as an outage at an assumed rate.
- Do not say "trained", "live price feed" or that futures are "trading".

## Recording tips
- Record with OBS at 1920x1080, 30 fps. Capture the browser window only.
- Set browser zoom to 125%. Close extra tabs and turn notifications off.
- Start the backend (`cd backend && uvicorn app.main:app --port 8000`) and confirm `NVIDIA_API_KEY` is in `backend/.env`.
- Send one warm-up request first so the first call on camera is not cold. Then reload the page.
- Check that `POST /procure {"incident_id":"INC1"}` works. Restart uvicorn after backend changes.
- Run the full flow twice before recording. The numbers must match both times (seed 42).
- Record the voiceover separately, or read it aloud once with a timer. Cut any line that runs past 2:00.
- Keep a spare take of the Nemotron step. It can take 15-40 seconds live, so trim the wait in the edit.
