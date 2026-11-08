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
  "explanation": "New task R1: ... saving $13,731.87 (37.9%) ...",
  "tool_calls": ["lookup_equipment", "day_windows", "add_task", "make_plan", "simulate",
                 "guardrail:make_plan[asap]", "fallback:add_task", ...] }
```
`guardrail:` = a step our code ran to check/complete the plan; `fallback:` = Nemotron unavailable,
rehearsed task used. The panel labels them "code check" / "offline fallback".

`POST /request/stream {text}` → the same run as NDJSON (`application/x-ndjson`), one event per line
the moment it happens:
```
{"type":"start","text":str,"llm":bool}
{"type":"thinking","by":"nemotron","step":int}            // before each Nemotron call
{"type":"tool","by":"nemotron"|"code","name":str,"label":str,"args":{...},"result":{...}}
{"type":"explaining"}
{"type":"done","response":AgentResponse}                  // identical to POST /request
{"type":"error","message":str}                            // instead of done if the run crashes
```
`label` sequence == `done.response.tool_calls`. `name` is the bare tool (`make_plan`, `pinned_demo_task`, ...).
get_backlog/get_prices results are `{"count": n}`; make_plan results are the plan summary
(`strategy, mode, total_cost, schedule[{task_id,start,end,start_hour,end_hour,cost}], unscheduled`).

The `start` event also carries `"kind": "request"` (incidents: `"incident"`, see below).

### Nemotron decides: `compare_slots` / `choose_slot` tool events
After `add_task`, Nemotron prices the options and picks one. Both are ordinary `tool` events
(`by: "nemotron"`; `by: "code"` with a `fallback:`/`guardrail:` label when code had to do it).
```
compare_slots  args {"task_id":"R1"}
  result {"task_id":"R1","cheapest_safe_start_hour":50|null,
          "options":[{"label":"cheapest safe"|"earliest allowed"|"ASAP (business hours)"|"wait 1 day",
                      "start_hour":50,"end_hour":53,"start":"Wed 02:00","end":"Wed 05:00",
                      "task_cost":4231.94,"week_total":22454.73,"violations":0,"safe":true}, ...]}
choose_slot    args {"task_id":"R1","start_hour":50,"reason":"cheapest safe option"}
  result {"ok":true,"task_id":"R1","start_hour":50,"end_hour":53,"start":"Wed 02:00","end":"Wed 05:00",
          "task_cost":4231.94,"week_total":22454.73,"vs_cheapest":0.0,"reason":"..."}
     or  {"error":"Wed 00:00 (start_hour 48) is not safe: ..."}   // Nemotron then picks again
```
Options are deduplicated by start hour, in the order above. Each one is a full week plan + hall sim
with the task pinned to that slot (`week_total` = that plan's total). The LLM can't pick an unsafe slot.
`done.response.task` still shows the operator's windows; the plan has the chosen slot.

### Nudge
If Nemotron stops before adding a task, code nudges it once to continue:
`{"type":"tool","by":"code","name":"nudge","label":"guardrail:nudge","args":{},"result":{"message":str}}`.

### Autonomous incident: `GET /incidents`, `POST /incident/stream`
`GET /incidents` → `[{"id":"INC1","hour":62,"label":"Wed 14:00","title":"CRAC-3 vibration alarm",
"equipment":"CRAC-3","zone":"Z3","detail":str,"source":"simulated telemetry"}]` (all ASSUMED).

`POST /incident/stream {"incident_id":"INC1","mode"?:"cloud","extra_tasks"?:[Task]}` → same NDJSON events as
`/request/stream`; unknown id → 404 (before streaming). No human prompt: code builds the alarm text,
Nemotron triages it (lookup, add_task, compare_slots, choose_slot, make_plan, simulate).
```
{"type":"start","text":"ALARM (simulated telemetry) at Wed 14:00 (week hour 62): ...","llm":bool,
 "kind":"incident","incident":{...the GET /incidents dict...}}
... thinking / tool events ...
{"type":"done","response":AgentResponse}    // task = repair (id "I1"), scheduled at or after hour 62
```
The week is frozen at the alarm hour: jobs that started before hour 62 stay where the optimized plan
had them (the ASAP baseline keeps its own past), nothing new starts before 62. `plan`/`asap_plan` cover
the whole week (frozen jobs + new repair), so the scoreboard math is unchanged. `extra_tasks` = jobs the
agent added earlier this session (same as `/handoff`). Offline / Nemotron error → same events with
`fallback:` labels and code picks the cheapest safe slot. Seeded result: repair Wed 14:00-17:00
(cheapest safe; waiting a day costs +$210.24 in risk), week $20,792.04 vs ASAP $34,436.66.

`POST /handoff {mode?, extra_tasks?: [Task]}` → `{ shift_brief: str, items: [...], llm_used: bool }`
(being added on the agent router; until it exists the button shows "Handoff endpoint not available yet").

## Test
```bash
cd backend && .venv/bin/uvicorn app.main:app      # http://localhost:8000
```
Open the page, click a rehearsed chip (or type and press Enter). Without `NVIDIA_API_KEY` in
`backend/.env`, rehearsed requests still work via the offline fallback; unscripted ones return a
polite "agent offline" message.
