# Replacement-compute procurement

**Agents negotiate. Code checks. A person signs.**

## What it does
1. Incident INC1 (CRAC-3 vibration alarm, Wed 14:00, zone Z3) takes racks C01-C05 offline for a 3 h repair. Part of those GPUs are sold under contract, so clients are owed those hours.
2. Two fictional data centers render as floating islands beside our hall in the Three.js scene:
   - **Halden Compute**: Dallas, 99.95% uptime, 512 GPUs available, 1 h lead time.
   - **Corvid Cloud**: Phoenix, 99.8% uptime, 256 GPUs available, 2 h lead time.
3. Our negotiator agent (a drone in the scene) flies to each island, negotiates a price for the replacement GPU-hours, and flies back.
4. An offer card shows the best deal, the break-even price and the policy check. The operator clicks **Accept** or **Decline**. Either way, the decision is written to a simulated ledger.

## Decisions (settled in the design session)
| Decision | Value |
|---|---|
| Build now | Yes, as a thin simulated slice |
| Trigger | Incidents only (INC1) in v1 |
| What to cover | Contracted share only: 160 GPUs × 3 h × 70% = **336 GPU-hours** |
| When buying is worth it | Price < break-even = contract rate × (1 + SLA credit) = $3.25 × 1.1 = **$3.575/GPU-hr** |
| Who sets numbers | Code. Seller opening ask comes from the market price; each seller has a secret floor; counters move in 5% steps; agents may only accept, counter or walk away |
| Determinism | Same incident → same negotiation → same offer, every run |
| Planner | Unchanged in v1. The pitch numbers stay the same |
| Money | Simulated ledger only. No payments, no real providers |
| Approval | A person approves every deal. Nothing is bought automatically |

Inspired by Elix (accounts payable for agent payments): agents only propose, policy code decides, a person approves, one gateway writes to the ledger, and everything simulated is labeled.

## API
| Endpoint | Does |
|---|---|
| `POST /procure {incident_id}` | Runs the negotiation with both providers; returns the transcript, the best proposal and the policy check |
| `POST /procure/decision {proposal_id, decision}` | `accept` or `decline`; writes a ledger entry |
| `GET /procure/ledger` | The simulated ledger |

## Honesty
- Halden Compute and Corvid Cloud, their profiles, their floor prices and the $3.25 contract rate are **ASSUMED / fictional**. The $3.25 rate follows an example 4-year H100 contract in a Wing VC analysis.
- v1 negotiation is **scripted code**. No LLM sets or computes a price.
- The market price history behind the opening asks is **real** GetDeploying data (CC BY 4.0).
- Ledger entries are simulated. No money moves.

## Next (v2)
- Nemotron buyer and seller agents choose moves (accept, counter, walk), still inside code-set price bounds.
- The planner picks repair slots where replacement compute is cheap.
- Planned maintenance, not only incidents.
- A futures forward curve, once compute futures trade. CME + Silicon Data planned a launch for Oct 5, 2026, and ICE + Ornn is pending CFTC review. Neither is confirmed trading.

## Real-world analogs
- Riot Platforms is paid to switch its compute off when grid power is worth more: [Decrypt](https://decrypt.co/155272/texas-paid-riot-platforms-31-7m-to-slash-bitcoin-mining-in-august-heatwave)
- GPUs are already loan collateral, priced on contracts and utilization: [Wing VC](https://www.wing.vc/content/how-the-gpu-became-collateral), [AnandTech](https://www.anandtech.com/show/19995)
- Power plants schedule maintenance in low-price shoulder seasons: [EIA](https://www.eia.gov/TodayinEnergy/detail.php?id=64044)
- Refiners time turnarounds against margins: [Argus](https://www.argusmedia.com/en/news-and-insights/latest-market-news/2800370-refiners-stick-to-maintenance-despite-crack-surge)
- Compute futures: [CME](https://www.cmegroup.com/media-room/press-releases/2026/5/12/cme_group_and_silicondatapartnertolaunchfirstcomputefutures.html), [ICE notice](https://www.ice.com/publicdocs/futures_us/exchange_notices/ICE_Futures_US_Exchange_Notice_ORNN_Compute_4Q2026_20260929.pdf)
