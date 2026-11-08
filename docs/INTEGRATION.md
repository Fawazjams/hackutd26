# Ask Nemotron panel: integration (for Nandhan)

`frontend/ui/agent-panel.js` + `frontend/ui/agent-panel.css` are self-contained. The panel finds the
existing disabled `.ask` input in `index.html`, enables it, loads its own CSS, and adds rehearsed-request
chips, a live "Nemotron is planning… N s" status, the tool-call trace, the explanation, the new task
and a **Shift handoff** button underneath it. No edits to `index.html` or `styles.css` needed.

## Add to `frontend/main.js`
```js
import { initAgentPanel } from './ui/agent-panel.js';          // with the other imports

// inside boot(), after the UI is built:
initAgentPanel();
window.addEventListener('agent:plan', (e) => {
  const { task, plan, explanation } = e.detail;   // plan = optimized Plan incl. the new task
  // e.g. add `task` to the backlog Map, replace S.d.raw.plans.optimized with `plan`,
  // re-run the same normalize/render path used after loadAll(), restart playback.
});
```
`initAgentPanel({ input: '#my-input', container: someEl })` overrides the defaults. It never throws.

Note: the event carries only the **optimized** plan. For the ASAP side of the scoreboard either keep
the old ASAP plan, or `POST /plan {mode, strategy: "asap", tasks: [...backlog, task]}`.

## Backend shapes
`POST /request {text}` → (13–40 s with Nemotron; ~instant on the offline fallback)
```json
{ "task": Task | null,
  "plan": { "mode": "cloud", "strategy": "optimized", "total_cost": 0.0,
            "items": [PlanItem...], "unscheduled": [{"task_id","reason"}] } | null,
  "explanation": "New task R1: ... saving $700.17 (4.2%) ...",
  "tool_calls": ["lookup_equipment", "day_windows", "add_task", "make_plan", "simulate",
                 "guardrail:make_plan[asap]", "fallback:add_task", ...] }
```
`guardrail:` = a step our code ran to check/complete the plan; `fallback:` = Nemotron unavailable,
rehearsed task used. The panel labels them "code check" / "offline fallback".

`POST /handoff {mode?, extra_tasks?: [Task]}` → `{ shift_brief: str, items: [...], llm_used: bool }`
(being added on the agent router; until it exists the button shows "Handoff endpoint not available yet").

## Test
```bash
cd backend && .venv/bin/uvicorn app.main:app      # http://localhost:8000
```
Open the page, click a rehearsed chip (or type and press Enter). Without `NVIDIA_API_KEY` in
`backend/.env`, rehearsed requests still work via the offline fallback; unscripted ones return a
polite "agent offline" message.
