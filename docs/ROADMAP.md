# Roadmap (v2 to v4)

**Nothing on this page is built.** v1 is the simulated slice in `docs/PROCUREMENT.md`: scripted negotiation, simulated ledger, a person approves every deal. Each version below lists what changes, where, and the main risk.

## v2: LLM negotiators and cost-aware scheduling (not built)

| Item | What changes | Where | Risk |
|---|---|---|---|
| Nemotron buyer and seller agents | Replace the scripted moves with an LLM that chooses `accept`, `counter` or `walk` each round. Code still sets every price bound: seller floor, 5% counter steps, break-even ceiling. An out-of-bounds move is rejected and replaced with `walk`. | `backend/app/procurement.py`, `backend/app/agent.py` | Non-determinism breaks "same incident, same offer". Mitigate with temperature 0, a recorded-transcript fallback, and code-only validation of every move. |
| Planned-maintenance procurement | Buy replacement compute days ahead for scheduled work, not only for incidents. Adds a second trigger type and lets us buy at lower lead-time prices. | `backend/app/procurement.py`, `backend/app/backlog.py`, `backend/app/incidents.py` | Forecast error: we buy cover for work that moves or is cancelled. Needs a cancel or resell rule. |
| Cover-aware planner | The planner prefers repair slots where replacement compute is cheap, using the market price by hour. This changes the planner output, so the pitch numbers change. | `backend/app/planner.py`, `backend/app/market.py`, `backend/app/prices.py` | Trades thermal and SLA quality for price. Keep SLA and thermal limits as hard constraints and price as a tiebreak. Re-run `backend/scripts/eval_weeks.py`. |

## v3: Forward curve and hedging (not built, not confirmed)

| Item | What changes | Where | Risk |
|---|---|---|---|
| Forward curve input | Use compute futures as the price source for slots days or weeks ahead, in place of the spot-history extrapolation. | `backend/app/market.py`, `backend/app/prices.py` | **No compute futures are confirmed trading.** CME with Silicon Data was announced for Oct 5, 2026. ICE with Ornn is pending CFTC review. Build only once at least one trades and publishes a usable price feed. Until then this is a design, not a data source. |
| Hedge exposure, not speculation | Use futures only to offset contracted GPU-hours already at risk (`backend/app/exposure.py`). A hard cap: hedge notional never exceeds modeled exposure. Code never opens a position larger than the exposure. | `backend/app/exposure.py`, new hedge policy module | Basis risk: the index may not match our GPU class or region. Margin calls and liquidity. A person approves every order. |

## v4: Lender view and agent payments (not built)

| Item | What changes | Where | Risk |
|---|---|---|---|
| Lender report | A read-only report of utilization and delivered hours against contract for GPU-backed debt. It uses the ledger and simulation output. GPUs are already used as loan collateral, so lenders want evidence of uptime. | new `backend/app/lender.py`, new `GET /lender/report`, new frontend panel | Today's inputs are simulated, so the report must stay labeled simulated until fed by real telemetry. A report that looks audited but is not creates liability. |
| Agent payments rail | Settle approved deals through an agent payments rail such as x402, as in the Elix project: agents propose, policy code decides, a person approves, one gateway pays and writes the ledger. | `backend/app/procurement.py` ledger, new payment gateway module | Real money. Needs spend limits, an allowlist of payees, idempotent payments, and an audit trail. Start on a testnet or sandbox. Keep human approval on every payment. |

## Rules that hold in every version
- Agents propose. Code checks bounds. A person approves.
- Anything simulated or assumed stays labeled in the UI and docs.
- Each step must keep `backend/scripts/eval_weeks.py` results reproducible.
