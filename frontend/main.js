// Downtime, Priced — UI controller.
// Loads the backlog, prices and both plans, plays the week forward in the 3D hall, and races
// the $-lost counters for our plan vs ASAP. Every number on screen is computed from API data.

import { loadAll, planWithTasks, loadIncidents } from './ui/api.js';
import {
  initAgentPanel, rackSpan, windowsText, runIncident, isAgentBusy, setAlarmTrigger,
  cheapestSafe, vsCheapestText, slotSpan,
} from './ui/agent-panel.js';
import { HOURS, DAYS, hourLabel, money, num, pct, esc, shortName } from './ui/format.js';
import { createPriceChart, createGantt } from './ui/charts.js';
import { createPlaceholderHall } from './ui/placeholder-hall.js';
import { buildBeats } from './ui/play-by-play.js';

const BEAT_HOLD_MS = 3000;
const CONTRAST_HOLD_MS = 2000;   // director: after an ASAP key moment, hold on our plan this long       // explain mode: pause this long on each key moment
const BEAT_LEAD_HRS = 1.5;       // ...and play the lead-in to it at 1x

const $ = (id) => document.getElementById(id);
const SEC_PER_HOUR = 0.5;        // 1× playback: half a second per simulated hour
const QUIET_BOOST = 6;           // fast-forward when nothing is running or about to start
const MAX_HOURS_PER_SEC = 48;
const EXTRA_EQUIPMENT = ['UPS-B']; // in the hall but not in the seeded backlog
const ZONE_VAR = { Z1: 'var(--z1)', Z2: 'var(--z2)', Z3: 'var(--z3)', Z4: 'var(--z4)' };
const PLAN_LABEL = { optimized: 'Our plan', asap: 'ASAP' };
const LEAD_HOURS = 2;            // after an agent run, land the clock this long before the new job
const FOCUS_RATE = 1 / 3;        // play the new job at a third of the speed so the racks visibly change...
const FOCUS_MAX_SECS = 6;        // ...but never take longer than this for a long job
const PENDING_BLINK_MS = 650;    // racks the agent is working on blink calmly until the plan lands
const STEP_DWELL_MS = 1100;      // each tool step stays on screen at least this long (steps can land together)
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

const S = {
  mode: 'cloud',
  show: 'optimized',
  t: 0,
  playing: true,
  speed: 1,
  boosting: false,
  d: null,                 // prepared data for the current mode
  selected: null,          // selected backlog task id
  flash: null,             // { racks:Set, start }
  agent: null,             // live Nemotron run: { racks:Set, zone, equipment, task, wasPlaying, ... }
  focus: null,             // job the agent just added: { id, start, end } (no fast-forward near it)
  incidents: [],           // simulated alarms from GET /incidents ([] offline)
  alarm: null,             // alarm on screen: { inc, wasPlaying }
  slotMarks: null,         // slots Nemotron compared for the new job: { options, chosen }
  slowed: false,
  explain: true,           // key moments: slow to 1x, hold BEAT_HOLD_MS, show the card
  hold: 0,                 // performance.now() until which playback holds on a key moment
  beats: [],               // key moments built from the two plans (ui/play-by-play.js)
  beatLog: [],
  dirManual: false,        // user picked Our plan/ASAP while playing: director stops switching until restart
  dirLabel: '',            // what the director is showing, for the status line
  contrast: null,          // plan to switch to when the current key-moment hold ends
  summaryDismissed: false,
  view: { pixelArt: false, pixelSize: 3, outlines: true, palette: false },
  loadToken: 0,
};

let dc = null;             // hall API: 3D scene or 2D placeholder
const rackCache = new Map();
const equipCache = new Map();
const zoneAlertCache = new Map();
let priceChart = null, gantt = null;
let priceInsights = null;   // ui/price-insights.js when it loads; else the basic createPriceChart

// Load the price-insights module once; any failure falls back to the basic bar chart.
let priceInsightsLoad = null;
function loadPriceInsights() {
  priceInsightsLoad ||= import('./ui/price-insights.js')
    .then((m) => {
      const pi = m.initPriceInsights($('price-insights'), { getPlans: () => S.d?.plans, getMode: () => S.mode });
      if (!pi) throw new Error('initPriceInsights returned nothing');
      priceInsights = pi;
      $('price-credit').hidden = true;   // the module carries its own data credit
    })
    .catch((e) => { console.warn('[price-insights] using the basic price chart:', e); priceInsights = null; });
  return priceInsightsLoad;
}

function renderPrices(raw) {
  if (priceInsights) {
    try {
      priceInsights.refresh?.();
      if (BOOT.day != null) { const d = BOOT.day; BOOT.day = null; setTimeout(() => { try { priceInsights?.openDay?.(d); } catch (e) { console.warn('[price-insights] openDay failed:', e); } }, 0); }
      return;
    } catch (e) { console.warn('[price-insights] refresh failed, using the basic price chart:', e); priceInsights = null; }
  }
  const host = $('price-insights');
  host.classList.add('price-chart');
  $('price-credit').hidden = false;
  priceChart = createPriceChart(host, raw.prices);
}
const firedIncidents = new Set();   // each alarm fires by itself once per page load
const sessionTasks = new Map();     // jobs Nemotron added this session: id -> { task, source }

// ---------------------------------------------------------------- hall wiring
const warned = new Set();
function call(name, ...args) {
  if (!dc || typeof dc[name] !== 'function') return undefined;
  try { return dc[name](...args); } catch (e) {
    if (!warned.has(name)) {
      warned.add(name);
      console.error(`[scene] ${name} failed`, e);
      window.__showDevError?.(`scene.${name}(): ${e.message}`);
    }
    return undefined;
  }
}

async function initHall() {
  const stage = $('stage');
  try {
    const mod = await import('./scene.js');
    if (typeof mod.createDataCenter !== 'function') throw new Error('scene.js does not export createDataCenter');
    dc = await mod.createDataCenter(stage);
    if (!dc) throw new Error('createDataCenter returned nothing');
  } catch (e) {
    const missing = /dynamically imported module|Importing a module script failed|404/i.test(String(e && e.message));
    console.warn('[hall] 3D scene unavailable, showing 2D preview:', e);
    if (!missing) window.__showDevError?.(`scene.js: ${e.message}`);
    try { dc?.dispose?.(); } catch { /* ignore */ }
    dc = createPlaceholderHall(stage);
  }
  $('stage-loading')?.remove();
  rackCache.clear(); equipCache.clear(); zoneAlertCache.clear();
  call('onRackClick', onRackClick);
  call('setView', { ...S.view });
  call('setPaused', !S.playing);
  if (S.selected && S.d) call('highlightZone', S.d.tasks.get(S.selected)?.zone ?? null);
}

function allRackIds() {
  const ids = call('getRackIds');
  if (Array.isArray(ids) && ids.length) return ids;
  const out = [];
  for (const row of 'ABCD') for (let i = 1; i <= 10; i++) out.push(`${row}${String(i).padStart(2, '0')}`);
  return out;
}

// ---------------------------------------------------------------- data prep
function prepare(raw) {
  const tasks = new Map(raw.backlog.map(t => [t.id, t]));
  const plans = {};
  for (const key of ['optimized', 'asap']) {
    const p = raw.plans[key];
    const items = p.items.map(it => {
      const task = tasks.get(it.task_id);
      const racks = task ? task.racks_affected : [];
      return {
        ...it,
        racks,
        equipment: task ? task.equipment : null,
        dur: Math.max(1e-6, it.end_hour - it.start_hour),
        perRack: racks.length ? it.gpus_offline / racks.length : 0,
      };
    });
    plans[key] = { ...p, items, overheats: p.overheats || [], byTask: new Map(items.map(i => [i.task_id, i])) };
  }
  const events = [{ h: 0, plan: null, kind: 'week', text: `Week starts with ${raw.backlog.length} jobs to fit in` }];
  for (const key of ['optimized', 'asap']) {
    for (const it of plans[key].items) {
      events.push({ h: it.start_hour, plan: key, kind: 'start', it });
      events.push({ h: it.end_hour, plan: key, kind: 'end', it });
    }
    for (const oh of plans[key].overheats) events.push({ h: oh.hour, plan: key, kind: 'heat', oh });
  }
  for (const inc of S.incidents) if (firedIncidents.has(inc.id)) events.push(alarmEvent(inc));
  sortEvents(events);
  const perRackAny = plans.optimized.items.find(i => i.perRack)?.perRack
    ?? plans.asap.items.find(i => i.perRack)?.perRack ?? null;
  const equipment = [...new Set([...raw.backlog.map(t => t.equipment), ...EXTRA_EQUIPMENT])];
  const maxTotal = Math.max(1, ...['optimized', 'asap'].map(k => plans[k].total_cost));
  return { raw, tasks, plans, events, perRack: perRackAny, equipment, maxTotal, offline: raw.offline };
}

const EVENT_ORDER = { week: 0, end: 1, heat: 2, start: 3, alarm: 4 };
function sortEvents(events) {
  events.sort((a, b) => a.h - b.h || EVENT_ORDER[a.kind] - EVENT_ORDER[b.kind] || (a.plan === 'optimized' ? -1 : 1));
}
const alarmEvent = (inc) => ({ h: Number(inc.hour), plan: null, kind: 'alarm', inc });

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const active = (plan, t) => plan.items.filter(i => i.start_hour <= t && t < i.end_hour);
// Overheat zone-hours (priced as unplanned outages by the backend) accrue over their hour.
const heatAt = (plan, t) => plan.overheats.reduce((s, o) => s + o.cost * clamp01(t - o.hour), 0);
const costAt = (plan, t) => plan.items.reduce((s, i) => s + i.total * clamp01((t - i.start_hour) / i.dur), 0) + heatAt(plan, t);
function gpusOff(plan, t) {
  const racks = new Map();
  for (const i of active(plan, t)) for (const r of i.racks) racks.set(r, i.perRack);
  let n = 0; racks.forEach(v => { n += v; });
  return Math.round(n);
}
/** Savings on work finished in both plans, task by task (never a guess about unfinished work). */
function settledSavings(t) {
  const { optimized: o, asap: a } = S.d.plans;
  let s = 0, n = 0;
  for (const [id, oi] of o.byTask) {
    const ai = a.byTask.get(id);
    if (ai && t >= oi.end_hour && t >= ai.end_hour) { s += ai.total - oi.total; n++; }
  }
  s += heatAt(a, t) - heatAt(o, t);  // an overheat is a loss the moment it happens
  return { s, n };
}
function isQuiet(t) {
  const plans = Object.values(S.d.plans);
  if (plans.some(p => active(p, t).length)) return false;
  const next = Math.min(...plans.flatMap(p => p.items.map(i => i.start_hour).filter(h => h > t)));
  return !(next - t <= 1.0);
}

// ---------------------------------------------------------------- loading
async function loadMode(mode) {
  const token = ++S.loadToken;
  document.body.classList.toggle('mode-cloud', mode === 'cloud');
  document.body.classList.toggle('mode-private', mode === 'private');
  $('sb-mode').textContent = mode === 'cloud' ? 'GPU cloud: lost revenue and SLA credits' : 'Private hall: cost to rent replacements';
  const raw = await loadAll(mode);
  if (token !== S.loadToken) return;
  closeNewJob();
  hideAlarm();
  applyRaw(raw);
  if (BOOT.t) { S.t = Math.min(HOURS, BOOT.t); BOOT.t = 0; }
  if (BOOT.paused) { setPlaying(false); BOOT.paused = false; }
}

// Render a {backlog, prices, plans, offline} bundle and restart the week (or jump to hour `at`).
function applyRaw(raw, at = null) {
  S.raw = raw;
  S.d = prepare(raw);
  S.beats = buildBeats(S.d.plans.optimized, S.d.plans.asap);
  S.beatLog = []; S.hold = 0; hideBeat();
  $('offline-chip').hidden = !raw.offline;
  buildLadder();
  renderPrices(raw);
  gantt = createGantt($('gantt'), S.d.plans, raw.backlog.map(t => t.id));
  ganttW = $('gantt').clientWidth;
  gantt.select(S.selected);
  if (at == null) restart();
  else {
    lastTickerKey = '';
    seek(at);
    setPlaying(true);
  }
  refreshIncidents();
  refreshView();
}

// GET /incidents after every load; offline or an older backend gives [] (no alarms, no button).
let incidentsToken = 0;
async function refreshIncidents() {
  const token = ++incidentsToken;
  const list = S.raw?.offline ? [] : await loadIncidents();
  if (token !== incidentsToken) return;
  S.incidents = list.map(i => ({ ...i, hour: Number(i.hour) })).sort((a, b) => a.hour - b.hour);
  setAlarmTrigger(S.incidents.length ? { incident: S.incidents[0], onTrigger: triggerAlarm } : null);
}

// Ask Nemotron panel (ui/agent-panel.js) sends the optimized plan incl. its new task.
// Use the agent's own ASAP plan (same tasks, same numbers as its explanation). Older backends
// don't send one, so fall back to asking /plan; keep the old ASAP plan if that fails (offline).
// Backlog = only the jobs the agent planned, so a task left over from an earlier request
// can't sneak into ASAP and inflate the savings.
async function onAgentPlan(e) {
  const { task, plan, asapPlan } = e.detail || {};
  if (!task || !plan || !S.raw) { endAgentRun(true); return; }
  await stepsShown();                       // let the last steps finish narrating first
  const incident = e.detail.kind === 'incident' ? (e.detail.incident || S.agent?.incident || null) : null;
  sessionTasks.set(task.id, { task, source: incident ? `incident:${incident.id}` : 'request' });
  const a = S.agent;
  S.slotMarks = a?.options ? { options: a.options, chosen: a.chosen ?? null } : null;
  const mode = plan.mode || S.mode;
  const planned = new Set([...plan.items, ...(plan.unscheduled || [])].map(i => i.task_id));
  const backlog = [...S.raw.backlog.filter(t => t.id !== task.id && planned.has(t.id)), task];
  let asap = asapPlan || S.raw.plans.asap;
  if (!asapPlan) {
    try { asap = await planWithTasks(mode, 'asap', backlog); }
    catch (err) { console.warn('[agent] ASAP re-plan failed, keeping previous ASAP plan:', err); }
  }
  S.selected = task.id;
  // Land on the new job instead of rewinding to Monday: a couple of hours before it starts,
  // our plan in the hall, 1x, so the racks visibly go into maintenance within seconds.
  // An alarm response never lands before the alarm: the plan before it is history.
  const item = plan.items.find(i => i.task_id === task.id);
  const floor = incident ? incident.hour : 0;
  endAgentRun(false);
  setShow('optimized');
  S.speed = 1; setSeg('seg-speed', '1');
  S.focus = item ? { id: task.id, start: item.start_hour, end: item.end_hour } : null;
  const at = item ? Math.max(floor, item.start_hour - LEAD_HOURS) : Math.max(floor, S.t);
  applyRaw({ ...S.raw, backlog, plans: { optimized: plan, asap } }, at);
  call('highlightZone', task.zone);
  showNewJob(task, { incident });
  if (incident && S.alarm?.inc.id === incident.id) {
    const it = S.d.plans.optimized.byTask.get(task.id);
    $('alarm').classList.add('settled');     // compact once handled: the new-job card carries the detail
    setAlarmState(it ? `Nemotron scheduled the repair: ${it.start_label} to ${it.end_label}, ${money(it.total)}.`
      : 'Nemotron added the repair, but no slot fits this week.');
  }
}

// ---------------------------------------------------------------- simulated alarms
// GET /incidents lists simulated telemetry alarms. When playback of our plan reaches one, the
// week pauses, the alarm shows over the hall and Nemotron plans the repair with no human prompt
// (POST /incident/stream through the agent panel). Every number still comes from the backend.
function crossedIncident(from, to) {
  if (S.show !== 'optimized' || pendingAlarm || !(to > from)) return null;
  return S.incidents.find(inc => !firedIncidents.has(inc.id) && from < inc.hour && to >= inc.hour) || null;
}
// Reached while another Nemotron call is still running (they share a rate limit): hold the week
// on the alarm hour and fire as soon as that call finishes.
let pendingAlarm = null;
function onIncidentReached(inc) {
  S.t = inc.hour;
  if (S.agent || isAgentBusy()) { pendingAlarm = { inc, wasPlaying: true }; setPlaying(false); return; }
  fireIncident(inc, true);
}
function firePendingAlarm() {
  if (!pendingAlarm || S.agent || isAgentBusy()) return;
  const { inc, wasPlaying } = pendingAlarm;
  pendingAlarm = null;
  seek(inc.hour);
  fireIncident(inc, wasPlaying);
}

/** "Trigger alarm" button: jump to the alarm hour and fire it (demo control, may repeat). */
function triggerAlarm(inc) {
  if (!inc || S.agent || isAgentBusy()) return;
  const wasPlaying = S.playing || S.t >= HOURS;
  seek(inc.hour);
  fireIncident(inc, wasPlaying);
}

function fireIncident(inc, wasPlaying = S.playing) {
  if (S.agent || isAgentBusy()) return;
  firedIncidents.add(inc.id);
  setPlaying(false);
  setShow('optimized');
  closeNewJob();
  S.alarm = { inc, wasPlaying };
  showAlarm(inc);
  call('highlightZone', inc.zone || null);
  if (S.d && !S.d.events.some(e => e.kind === 'alarm' && e.inc.id === inc.id)) {
    S.d.events.push(alarmEvent(inc));
    sortEvents(S.d.events);
  }
  const extraTasks = alarmExtraTasks(inc);
  runIncident(inc, { mode: S.mode, extraTasks }).then((r) => {
    if (r?.task && r?.plan) return;                 // onAgentPlan lands it
    if (S.alarm?.inc !== inc) return;
    setAlarmState(r ? 'Nemotron did not add a repair job. See the Ask Nemotron panel.'
      : 'Nemotron could not respond to this alarm. See the Ask Nemotron panel.');
    // the run never started (e.g. no /incident/stream): put playback back as it was
    if (!S.agent && wasPlaying && !S.playing) setPlaying(true);
  }).catch((err) => console.warn('[alarm] run failed:', err));
}

/** Jobs Nemotron added earlier this session that are still in the plan (not from this alarm). */
function alarmExtraTasks(inc) {
  if (!S.d) return [];
  return [...sessionTasks.values()]
    .filter(({ task, source }) => source !== `incident:${inc.id}` && S.d.tasks.has(task.id))
    .map(({ task }) => S.d.tasks.get(task.id));
}

function showAlarm(inc) {
  $('al-when').textContent = inc.label || hourLabel(inc.hour);
  $('al-title').textContent = inc.title || 'Alarm';
  $('al-detail').textContent = inc.detail || '';
  $('al-detail').hidden = !inc.detail;
  $('al-src').textContent = [inc.equipment, inc.zone && `zone ${inc.zone}`, inc.source || 'simulated telemetry'].filter(Boolean).join(', ');
  setAlarmState('Week paused. Nemotron is planning a response; no one typed anything.');
  $('alarm').classList.remove('settled');
  $('alarm').hidden = false;
}
function setAlarmState(txt) { $('al-state').textContent = txt; }
function hideAlarm() {
  S.alarm = null;
  $('alarm').hidden = true;
}

// ---------------------------------------------------------------- live agent run
// ui/agent-panel.js streams the agent's steps as 'agent:step' events; the hall narrates them:
// the racks it looked up blink, the clock moves to the slot it found, the plan lands at done.
// Steps can arrive in the same second, so they play through a queue with a short dwell each.
const stepQ = [];
let stepBusy = false, stepIdle = [];
function onAgentStep(e) {
  const evt = e.detail || {};
  if (evt.type === 'start') { stepQ.length = 0; }
  stepQ.push(evt);
  if (!stepBusy) pumpSteps();
}
async function pumpSteps() {
  stepBusy = true;
  while (stepQ.length) {
    const evt = stepQ.shift();
    playStep(evt);
    // hold each tool step on screen; anything that arrives meanwhile waits its turn
    if (evt.type === 'tool' && S.agent) await new Promise(r => setTimeout(r, STEP_DWELL_MS));
  }
  stepBusy = false;
  stepIdle.splice(0).forEach(r => r());
}
const stepsShown = () => (stepBusy || stepQ.length ? new Promise(r => stepIdle.push(r)) : Promise.resolve());

function playStep(evt) {
  try {
    if (evt.type === 'start') return agentStart(evt);
    if (!S.agent) return;
    if (evt.type === 'thinking') { S.agent.status = 'thinking'; tickCallout(); }
    else if (evt.type === 'explaining') { S.agent.status = 'writing the explanation'; tickCallout(); }
    else if (evt.type === 'tool') { S.agent.status = ''; agentTool(evt); }
    else if (evt.type === 'done') {
      // a plan arrives via 'agent:plan' (onAgentPlan); without one, put things back as they were
      if (!evt.response?.task || !evt.response?.plan) endAgentRun(true);
    } else if (evt.type === 'error') endAgentRun(true);
  } catch (err) {
    console.warn('[agent] step failed:', err);
  }
}

function agentStart(evt) {
  const incident = evt.kind === 'incident' ? (evt.incident || S.alarm?.inc || null) : null;
  const wasPlaying = S.agent ? S.agent.wasPlaying : incident && S.alarm ? S.alarm.wasPlaying : S.playing;
  closeNewJob();
  pendingAlarm = null;                       // a new run takes over; an unfired alarm fires on the next crossing
  if (!incident) hideAlarm();                // a typed request: the old alarm is no longer news
  S.agent = {
    wasPlaying, racks: null, zone: null, equipment: null, task: null, replanned: false, status: 'thinking', t0: performance.now(),
    incident, floor: incident ? incident.hour : 0, options: null, chosen: null,
  };
  setPlaying(false);
  setShow('optimized');
  if (S.t >= HOURS) S.summaryDismissed = true;
  $('summary').hidden = true;
  $('popover').hidden = true;
  if (incident) setCallout('Nemotron is responding to the alarm', incident.title || '');
  // evt.stream === false: older backend without live steps, so only start and done arrive
  else setCallout(evt.stream === false ? 'Nemotron is planning' : 'Nemotron is reading the request', evt.text ? `“${evt.text}”` : '');
  clearInterval(calloutTimer);
  calloutTimer = setInterval(tickCallout, 1000);
}

function agentTool(evt) {
  const r = evt.result || {};
  const a = S.agent;
  const by = evt.by === 'code' ? 'Our code' : 'Nemotron';
  const label = String(evt.label || evt.name || '');
  if (r.error && evt.name === 'choose_slot') {
    // our code checks every pick; say plainly that it refused this one (reason from the result)
    const unsafe = /safe|violat|conflict|overheat/i.test(String(r.error));
    setCallout(unsafe ? 'Nemotron picked an unsafe slot; our code refused it' : 'Nemotron picked a slot our code refused', String(r.error));
    return;
  }
  if (r.error) { setCallout(`${by} got an error and is retrying`, String(r.error)); return; }
  switch (evt.name) {
    case 'lookup_equipment':
      if (!r.zone) return;
      a.zone = r.zone; a.equipment = r.equipment || null;
      a.racks = new Set(r.racks || []);
      call('highlightZone', r.zone);
      setCallout(`${by} looked up the equipment`, `${r.equipment} is in zone ${r.zone}, racks ${rackSpan(r.racks)}`);
      break;
    case 'day_windows':
      if (!Array.isArray(r.windows)) return;
      gantt?.setWindows(r.windows);
      setCallout(`${by} turned the request into time windows`, `Allowed: ${windowsText(r.windows)}`);
      break;
    case 'add_task':
    case 'pinned_demo_task': {
      const t = r.task;
      if (!t) return;
      a.task = t; a.zone = t.zone; a.equipment = t.equipment;
      a.racks = new Set(t.racks_affected || []);
      call('highlightZone', t.zone);
      gantt?.setWindows(t.allowed_windows);
      setCallout(evt.name === 'pinned_demo_task' ? 'Our code pinned the rehearsed job' : `${by} added the job`,
        `${t.name}, ${t.duration_hrs} h, racks ${rackSpan(t.racks_affected)}`);
      break;
    }
    case 'make_plan': {
      if (r.strategy === 'asap' || /\[asap\]/.test(label)) {
        setCallout(`${by} priced the do-it-now plan to compare`, `ASAP total for the week: ${money(r.total_cost)}`);
        return;
      }
      const avoid = /avoid_violations/.test(label) || !!r.avoid_violations;
      if (avoid) a.replanned = true;
      const id = a.task?.id;
      const slot = id && (r.schedule || []).find(x => x.task_id === id);
      const un = id && (r.unscheduled || []).find(x => x.task_id === id);
      if (slot) {
        a.slot = slot;
        setCallout(avoid ? `${by} re-planned around the problem` : `${by} ran the optimizer`,
          `Cheapest safe slot: ${slot.start} to ${slot.end}, ${money(slot.cost)}`);
        seek(Math.max(a.floor, slot.start_hour - LEAD_HOURS));   // the clock jumps to just before it
      } else if (un) {
        setCallout(`${by} ran the optimizer`, `No slot fits: ${un.reason}`);
      } else {
        setCallout(`${by} ran the optimizer`, `Week total: ${money(r.total_cost)}`);
      }
      break;
    }
    case 'simulate': {
      const n = Number(r.violations) || 0;
      const first = r.first?.[0];
      setCallout(`${by} checked the hall`, n === 0 ? 'Hall check: no overheats or zone conflicts'
        : `Hall check: ${n} ${n === 1 ? 'problem' : 'problems'} found${first ? ` (${first.detail})` : ''}${a.replanned ? '' : ', re-planning'}`);
      break;
    }
    case 'compare_slots': {
      const opts = Array.isArray(r.options) ? r.options : [];
      if (!opts.length) { setCallout(`${by} compared slots`, 'No slots to compare'); return; }
      a.options = opts;
      gantt?.setMarkers(opts, null);
      const best = cheapestSafe(r);
      // an unsafe option can't be placed, so its price isn't comparable (it can even look cheaper):
      // greyed out, no price, marked unsafe
      setCallout(opts.length === 1 ? `${by} priced the only slot` : `${by} compared ${opts.length} slots`, null, opts.map(o => ({
        when: o.start || hourLabel(o.start_hour),
        cost: o.safe !== false && Number.isFinite(o.task_cost) ? money(o.task_cost) : '',
        label: o.label || '',
        unsafe: o.safe === false,
        best: o === best,
      })));
      if (best) seek(Math.max(a.floor, best.start_hour - LEAD_HOURS));   // look at the cheapest safe one
      break;
    }
    case 'choose_slot': {
      if (!r.start && !Number.isFinite(r.start_hour)) return;
      a.chosen = r.start_hour;
      const opts = a.options || [];
      if (!opts.some(o => o.start_hour === r.start_hour)) {
        a.options = [...opts, { label: 'chosen', start_hour: r.start_hour, end_hour: r.end_hour, start: r.start, task_cost: r.task_cost, safe: true }];
      }
      gantt?.setMarkers(a.options, r.start_hour);
      const vs = vsCheapestText(r);
      const why = r.reason ? `“${r.reason}”` : '';
      setCallout(`${by} chose ${slotSpan(r.start || hourLabel(r.start_hour), r.end || hourLabel(r.end_hour))}`,
        [vs && vs[0].toUpperCase() + vs.slice(1), why].filter(Boolean).join('. '));
      if (Number.isFinite(r.start_hour)) seek(Math.max(a.floor, r.start_hour - LEAD_HOURS));
      break;
    }
    case 'nudge': setCallout('Our code nudged Nemotron to keep going', r.message || ''); break;
    case 'get_backlog': setCallout(`${by} read the backlog`, r.count != null ? `${r.count} jobs already planned` : ''); break;
    case 'get_prices': setCallout(`${by} read the GPU price forecast`, r.count != null ? `${r.count} days of prices` : ''); break;
    case 'llm_error': setCallout('Nemotron is unavailable', 'Using the rehearsed job instead'); break;
    default: setCallout(`${by} ran ${evt.name}`);
  }
}

/** The run is over. `restore`: no plan came back, so undo the pause and the gantt shading. */
function endAgentRun(restore) {
  const a = S.agent;
  S.agent = null;
  clearInterval(calloutTimer);
  $('agent-callout').hidden = true;
  if (!a) return;
  if (restore) {
    gantt?.setWindows(null);
    gantt?.setMarkers(null);
    S.slotMarks = null;
    const task = S.selected && S.d ? S.d.tasks.get(S.selected) : null;
    call('highlightZone', task ? task.zone : null);
    if (a.wasPlaying) setPlaying(true);
  }
}

let calloutTimer = 0;
/** Narration over the stage. `text` null keeps the old line; `options` renders a slot list instead. */
function setCallout(title, text = null, options = null) {
  $('ac-title').textContent = title;
  const box = $('ac-text');
  box.classList.toggle('ac-list', !!options);
  if (options) {
    box.replaceChildren(...options.map((o) => {
      const row = document.createElement('div');
      row.className = `ac-opt${o.unsafe ? ' unsafe' : ''}${o.best ? ' best' : ''}`;
      for (const [cls, txt] of [['ac-o-when', o.when], ['ac-o-cost', o.cost], ['ac-o-lab', o.unsafe ? `${o.label ? `${o.label}, ` : ''}unsafe` : o.label]]) {
        const s = document.createElement('span');
        s.className = cls; s.textContent = txt;
        row.append(s);
      }
      return row;
    }));
  } else if (text !== null) box.textContent = text;
  box.hidden = !box.textContent;
  $('agent-callout').hidden = false;
  tickCallout();
}
function tickCallout() {
  if (!S.agent) return;
  const secs = `${Math.round((performance.now() - S.agent.t0) / 1000)} s`;
  $('ac-secs').textContent = S.agent.status ? `${S.agent.status}… ${secs}` : secs;
}

// Persistent card for the job the agent just added. Every value comes from the response.
function showNewJob(task, { incident = null } = {}) {
  const { optimized: o, asap: a } = S.d.plans;
  $('nj-kicker').textContent = incident ? 'New job from Nemotron (alarm response)' : 'New job from Nemotron';
  $('newjob').classList.toggle('from-alarm', !!incident);
  const it = o.byTask.get(task.id);
  const asapIt = a.byTask.get(task.id);
  const un = o.unscheduled.find(u => u.task_id === task.id);
  $('nj-name').textContent = task.name;
  $('nj-zone').textContent = task.zone;
  $('nj-zone').style.setProperty('--zc', ZONE_VAR[task.zone] || 'var(--ink-3)');
  $('nj-slot').textContent = it ? `${it.start_label} to ${it.end_label}` : `Not scheduled: ${un ? un.reason : 'no slot fits'}`;
  $('nj-racks').textContent = `Racks ${rackSpan(task.racks_affected)}, ${task.duration_hrs} h`;
  $('nj-cost').textContent = it ? money(it.total) : '';
  const asapUn = a.unscheduled.find(u => u.task_id === task.id);
  $('nj-asap').textContent = asapIt && it && asapIt.start_hour !== it.start_hour
    ? `ASAP would start ${asapIt.start_label}, ${money(asapIt.total)}`
    : !asapIt && asapUn ? `ASAP could not fit it: ${asapUn.reason}` : '';
  $('nj-asap').hidden = !$('nj-asap').textContent;
  gantt?.setWindows(task.allowed_windows);
  gantt?.setMarkers(S.slotMarks?.options || null, S.slotMarks?.chosen ?? it?.start_hour ?? null);
  lastNewJobState = '';
  $('newjob').hidden = false;
  updateNewJob();
}
function closeNewJob() {
  S.focus = null;
  $('newjob').hidden = true;
  gantt?.setWindows(null);
  gantt?.setMarkers(null);
  S.slotMarks = null;
}
let lastNewJobState = '';
function updateNewJob() {
  if ($('newjob').hidden || !S.d) return;
  const id = S.focus?.id;
  const it = id ? S.d.plans.optimized.byTask.get(id) : null;
  const st = !it ? 'none' : S.t < it.start_hour ? 'wait' : S.t < it.end_hour ? 'live' : 'done';
  if (st === lastNewJobState) return;
  lastNewJobState = st;
  const racks = it ? rackSpan(it.racks) : '';
  $('nj-status').textContent = {
    none: 'Not in our plan this week.',
    wait: `Watch racks ${racks}: work starts ${it?.start_label}.`,
    live: `Running now: racks ${racks} are in maintenance.`,
    done: `Finished ${it?.end_label}. Racks ${racks} are back online.`,
  }[st];
  $('newjob').dataset.state = st;
}

function restart() {
  if (!S.agent) hideAlarm();
  pendingAlarm = null;
  lastNewJobState = '';
  S.beatLog = []; S.hold = 0; hideBeat();
  S.dirManual = false; S.dirLabel = ''; S.contrast = null;
  S.t = 0;
  S.summaryDismissed = false;
  lastTickerKey = '';
  $('summary').hidden = true;
  setPlaying(true);
}

// ---------------------------------------------------------------- ladder
function buildLadder() {
  const { tasks, plans } = S.d;
  const ol = $('ladder');
  ol.innerHTML = '';
  for (const task of tasks.values()) {
    const o = plans.optimized.byTask.get(task.id);
    const a = plans.asap.byTask.get(task.id);
    const li = document.createElement('li');
    li.tabIndex = 0;
    li.dataset.id = task.id;
    li.style.setProperty('--zc', ZONE_VAR[task.zone] || 'var(--ink-3)');
    li.classList.toggle('selected', task.id === S.selected);
    const same = o && a && o.start_hour === a.start_hour;
    const when = same
      ? `<span class="eq">${esc(o.start_label)}, same in both</span>`
      : `<span class="o" title="Our plan start">■ ${o ? esc(o.start_label) : '—'}</span><span class="a" title="ASAP start">■ ${a ? esc(a.start_label) : '—'}</span>`;
    const cost = o
      ? `${a && Math.round(a.total) !== Math.round(o.total) ? `<s title="ASAP cost">${money(a.total)}</s>` : ''}${money(o.total)}`
      : '—';
    li.innerHTML = `
      <span class="bar"></span>
      <span class="l1"><span class="nm" title="${esc(task.name)}: ${esc(task.equipment)}, ${task.duration_hrs} h, ${task.racks_affected.length} racks">${esc(shortName(task.name))}</span><i class="zone">${esc(task.zone)}</i><span class="pill" data-pill>queued</span></span>
      <span class="l2"><span class="when">${when}</span><span class="cost">${cost}</span></span>`;
    li.addEventListener('click', () => selectTask(task.id));
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); selectTask(task.id); } });
    ol.appendChild(li);
  }
  const notes = ['optimized', 'asap'].flatMap(k => plans[k].unscheduled.map(u => `${PLAN_LABEL[k]}: ${u.task_id} not scheduled — ${u.reason}`));
  $('ladder-note').textContent = notes.join('. ');
  lastPills = '';
}

let lastPills = '';
function updateLadder() {
  const plan = S.d.plans[S.show];
  const states = [];
  for (const li of $('ladder').children) {
    const it = plan.byTask.get(li.dataset.id);
    let st = 'queued';
    if (!it) st = 'unsched';
    else if (S.t >= it.end_hour) st = 'done';
    else if (S.t >= it.start_hour) st = 'live';
    states.push(st);
  }
  const key = states.join() + S.show;
  if (key === lastPills) return;
  lastPills = key;
  [...$('ladder').children].forEach((li, idx) => {
    const st = states[idx];
    const pill = li.querySelector('[data-pill]');
    pill.className = `pill ${st}`;
    pill.textContent = { queued: 'queued', live: 'live', done: 'done', unsched: 'n/a' }[st];
    if (st === 'unsched') {
      const u = plan.unscheduled.find(x => x.task_id === li.dataset.id);
      pill.title = u ? u.reason : 'not scheduled';
    } else pill.removeAttribute('title');
  });
}

function selectTask(id) {
  S.selected = S.selected === id ? null : id;
  for (const li of $('ladder').children) li.classList.toggle('selected', li.dataset.id === S.selected);
  gantt?.select(S.selected);
  const task = S.selected ? S.d.tasks.get(S.selected) : null;
  call('highlightZone', task ? task.zone : null);
  S.flash = task ? { racks: new Set(task.racks_affected), start: performance.now() } : null;
}

// ---------------------------------------------------------------- hall state
function applyHall(now) {
  const plan = S.d.plans[S.show];
  const act = active(plan, S.t);
  const want = new Map();
  for (const id of allRackIds()) want.set(id, 'online');
  for (const it of act) for (const r of it.racks) want.set(r, 'maintenance');

  if (S.flash) {
    const el = now - S.flash.start;
    if (el > 1500) S.flash = null;
    else if (Math.floor(el / 190) % 2 === 0) {
      for (const r of S.flash.racks) want.set(r, want.get(r) === 'maintenance' ? 'offline' : 'maintenance');
    }
  }
  // racks a live agent run is working on: calm blink (steady when motion is reduced)
  if (S.agent?.racks?.size) {
    const pend = reduceMotion.matches || Math.floor((now - S.agent.t0) / PENDING_BLINK_MS) % 2 === 0 ? 'offline' : 'maintenance';
    for (const r of S.agent.racks) if (want.has(r)) want.set(r, pend);
  }
  for (const [id, st] of want) {
    if (rackCache.get(id) !== st) { rackCache.set(id, st); call('setRackState', id, st); }
  }
  const busyEq = new Set(act.map(i => i.equipment).filter(Boolean));
  if (S.agent?.equipment) busyEq.add(S.agent.equipment);
  for (const eq of new Set([...S.d.equipment, ...equipCache.keys(), ...busyEq])) {
    const st = busyEq.has(eq) ? 'maintenance' : 'normal';
    if (equipCache.get(eq) !== st) { equipCache.set(eq, st); call('setEquipmentState', eq, st); }
  }
  // overheats in the shown plan this hour -> zone glows red (fades in over the hour)
  const hr = Math.floor(S.t);
  const hot = new Map();
  for (const o of plan.overheats || []) if (o.hour === hr) hot.set(o.zone, Math.max(hot.get(o.zone) || 0, clamp01((o.temp_c - 31) / 3)));
  for (const z of ['Z1', 'Z2', 'Z3', 'Z4']) {
    const lvl = hot.get(z) || 0;
    if (zoneAlertCache.get(z) !== lvl) { zoneAlertCache.set(z, lvl); call('setZoneAlert', z, lvl); }
  }
  // cinematic: glide onto the zone that matters right now (ASAP's overheating zone during the
  // explained story, even while showing our calm hall; the zone Nemotron is working on; the new
  // job's zone while it runs), and back out to the whole island when nothing is happening
  const hotPlan = S.explain ? S.d.plans.asap : plan;
  const hotNow = (hotPlan.overheats || []).filter(o => o.hour === Math.floor(S.t)).sort((x, y) => y.temp_c - x.temp_c)[0];
  const jobZone = S.focus && S.t >= S.focus.start - 1 && S.t < S.focus.end ? S.d.tasks.get(S.focus.id)?.zone : null;
  call('focusZone', hotNow?.zone || S.agent?.zone || jobZone || null);
  call('setHour', S.t);
}

// ---------------------------------------------------------------- scoreboard + ticker
const textCache = new Map();
function setText(id, txt) {
  if (textCache.get(id) === txt) return;
  textCache.set(id, txt);
  $(id).textContent = txt;
}

let lastSaved = null;
function updateScoreboard() {
  const { plans, maxTotal } = S.d;
  for (const [key, suffix] of [['optimized', 'ours'], ['asap', 'asap']]) {
    const c = costAt(plans[key], S.t);
    setText(`sb-${suffix}`, money(c));
    $(`sb-bar-${suffix}`).style.width = `${(100 * c / maxTotal).toFixed(2)}%`;
    const g = gpusOff(plans[key], S.t);
    setText(`sb-gpus-${suffix}`, num(g));
    const row = $(`sb-${suffix}`).closest('.sb-row');
    row.classList.toggle('zero', g === 0);
    row.classList.toggle('shown', S.show === key);
  }
  for (const [key, suffix] of [['optimized', 'ours'], ['asap', 'asap']]) {
    // same rule as the ticker: an overheat counts from the start of its hour (hour <= t)
    const n = plans[key].overheats.filter(o => o.hour <= S.t).length;
    const w = $(`sb-heatw-${suffix}`);
    if (w.dataset.n !== String(n)) {
      w.dataset.n = String(n);
      w.innerHTML = `<b id="sb-heat-${suffix}">${n}</b> ${n === 1 ? 'overheat' : 'overheats'}`;
    }
    w.classList.toggle('hot', n > 0);
  }
  setText('sb-clock', hourLabel(S.t));
  const status = S.t >= HOURS ? 'Final'
    : pendingAlarm ? 'Alarm: waiting for Nemotron to finish'
    : !S.playing ? 'Paused'
    : S.hold > performance.now() ? (directorOn() && S.dirLabel) || 'Key moment'
    : S.boosting ? 'Skipping quiet hours'
    : directorOn() && S.dirLabel ? S.dirLabel
    : S.slowed ? 'Slowed down for the new job'
    : `Playing at ${S.speed}×, day ${Math.min(7, Math.floor(S.t / 24) + 1)} of 7`;
  setText('sb-status', status);
  $('sb-status').classList.toggle('ff', S.boosting && S.playing && S.t < HOURS);

  const { s } = settledSavings(S.t);
  setText('sb-saved', (s < 0 ? '−' : '') + money(Math.abs(s)));
  $('sb-saved-wrap').classList.toggle('neg', s < 0);
  const finalSaved = settledSavings(HOURS).s;     // same like-for-like rule as the summary card
  $('sb-delta').style.width = `${finalSaved > 0 ? (100 * clamp01(s / finalSaved)).toFixed(1) : 0}%`;
  if (lastSaved !== null && Math.round(s) !== Math.round(lastSaved) && S.playing) {
    const sb = $('scoreboard');
    sb.classList.remove('bump'); void sb.offsetWidth; sb.classList.add('bump');
  }
  lastSaved = s;
}

let lastTickerKey = '';
function updateTicker() {
  const evs = S.d.events.filter(e => e.h <= S.t);
  const tail = evs.slice(-3);
  const key = `${S.mode}|${evs.length}`;
  if (key === lastTickerKey) return;
  const grew = lastTickerKey.startsWith(`${S.mode}|`) && evs.length > Number(lastTickerKey.split('|')[1]);
  lastTickerKey = key;
  $('ticker-list').innerHTML = tail.map((e, idx) => {
    const fresh = grew && idx === tail.length - 1 ? ' class="fresh"' : '';
    if (e.kind === 'week') return `<li${fresh}><time>${hourLabel(e.h)}</time><span class="what">${esc(e.text)}</span></li>`;
    if (e.kind === 'alarm') {
      const what = String(e.inc.title || 'alarm').replace(/\s*alarm$/i, '');
      return `<li${fresh}><time>${hourLabel(e.h)}</time><span class="what"><b class="heat">Alarm: ${esc(what)}</b>${e.inc.zone ? ` in zone ${esc(e.inc.zone)}` : ''}, ${esc(e.inc.source || 'simulated telemetry')}</span></li>`;
    }
    const tag = `<span class="tag ${e.plan === 'optimized' ? 'ours' : 'asap'}">${e.plan === 'optimized' ? 'Ours' : 'ASAP'}</span>`;
    const body = e.kind === 'heat'
      ? `<b class="heat">Zone ${esc(e.oh.zone)} overheated</b> at ${e.oh.temp_c.toFixed(1)} °C, ${num(e.oh.gpus_lost)} GPUs lost, ${money(e.oh.cost)}`
      : e.kind === 'start'
      ? `<b>${esc(e.it.name)}</b> started, ${num(e.it.gpus_offline)} GPUs down`
      : `<b>${esc(e.it.name)}</b> done, ${money(e.it.total)}`;
    return `<li${fresh}>${tag}<time>${hourLabel(e.h)}</time><span class="what">${body}</span></li>`;
  }).join('');
}

// ---------------------------------------------------------------- summary
function showSummary() {
  if (S.summaryDismissed || !$('summary').hidden) return;
  const { optimized: o, asap: a } = S.d.plans;
  const cloud = S.mode === 'cloud';
  const sum = (p, f) => p.items.reduce((s, i) => s + f(i), 0);
  // Like for like, the same rule as the scoreboard's "Saved": only jobs both plans scheduled,
  // plus overheats. The percentage is against ASAP's cost for those same jobs + its overheats.
  const saved = settledSavings(HOURS).s;
  const asapBase = [...a.byTask.values()].filter(i => o.byTask.has(i.task_id)).reduce((s, i) => s + i.total, 0) + heatAt(a, HOURS);
  const share = asapBase > 0 ? saved / asapBase : 0;
  const name = (id) => `${id} ${S.d.tasks.get(id)?.name || ''}`.trim();
  const why = (p, id) => p.unscheduled.find(u => u.task_id === id)?.reason || 'no slot fits';
  const onlyOne = [
    ...[...o.byTask.keys()].filter(id => !a.byTask.has(id)).map(id => `ASAP couldn't schedule ${name(id)}: ${why(a, id)}`),
    ...[...a.byTask.keys()].filter(id => !o.byTask.has(id)).map(id => `Our plan couldn't schedule ${name(id)}: ${why(o, id)}`),
  ];
  $('summary-mode').textContent = cloud ? 'GPU cloud mode' : 'Private DC mode';
  $('summary-title').innerHTML = saved > 0
    ? `Saved ${money(saved)} <span class="pct">(${pct(share)})</span>`
    : 'No savings this week';
  const rows = [
    [cloud ? 'Lost revenue' : 'Replacement GPU rental', i => i.downtime_cost],
    ...(cloud ? [['SLA credits', i => i.sla_cost]] : []),
    ['Risk of waiting', i => i.risk_cost],
  ];
  const gh = p => sum(p, i => i.gpus_offline * i.dur);
  const done = p => p.items.length ? hourLabel(Math.max(...p.items.map(i => i.end_hour))) : '—';
  let html = `<div class="h"></div><div class="h n">Our plan</div><div class="h n">ASAP</div>`;
  for (const [label, f] of rows) html += `<div>${label}</div><div class="n o">${money(sum(o, f))}</div><div class="n a">${money(sum(a, f))}</div>`;
  html += `<div>Overheat outages</div><div class="n o">${money(o.overheat_cost || 0)}</div><div class="n a">${money(a.overheat_cost || 0)}</div>`;
  html += `<div class="tot">Total</div><div class="n tot o">${money(o.total_cost)}</div><div class="n tot a">${money(a.total_cost)}</div>`;
  html += `<div>GPU-hours offline</div><div class="n">${num(Math.round(gh(o)))}</div><div class="n">${num(Math.round(gh(a)))}</div>`;
  html += `<div class="heat-row">Overheats (zone-hours)</div><div class="n o heat-n">${o.overheats.length}</div><div class="n a heat-n">${a.overheats.length}</div>`;
  html += `<div>Jobs done</div><div class="n o">${o.items.length}</div><div class="n a">${a.items.length}</div>`;
  html += `<div>Last job finishes</div><div class="n">${done(o)}</div><div class="n">${done(a)}</div>`;
  $('summary-grid').innerHTML = html;
  let only = $('summary-only');
  if (!only) {
    only = document.createElement('p');
    only.id = 'summary-only'; only.className = 'summary-only';
    $('summary-grid').after(only);
  }
  only.textContent = onlyOne.length ? `${onlyOne.join('. ')}. Saved compares only jobs both plans scheduled; the rows above are full-plan totals.` : '';
  only.hidden = !onlyOne.length;
  const sameGH = Math.round(gh(o)) === Math.round(gh(a));
  let sub = $('summary-card-sub');
  if (!sub) {
    sub = document.createElement('p');
    sub.id = 'summary-card-sub'; sub.className = 'summary-sub';
    $('summary-title').after(sub);
  }
  // overheats are part of `saved`, so their share can't exceed it (clamped against rounding)
  const heatShare = saved > 0 ? Math.min(1, Math.max(0, (heatAt(a, HOURS) - heatAt(o, HOURS)) / saved)) : 0;
  const jobs = o.items.length === a.items.length ? `${o.items.length} jobs` : `${o.items.length} jobs in our plan, ${a.items.length} in ASAP`;
  sub.textContent = `${jobs}, ${cloud ? 'priced as lost revenue + SLA credits' : 'priced as replacement rental'}. `
    + (sameGH ? 'Same work and the same GPU-hours offline; only the timing changed. ' : 'Both plans obey the same windows and cooling-zone rules. ')
    + (a.overheats.length && !o.overheats.length
      ? `ASAP overheated ${a.overheats.length} zone-hours; ours none. ${pct(heatShare)} of the savings is those overheats, priced as unplanned outages (assumed rate).`
      : '');
  $('summary-swap').textContent = cloud ? 'Try Private DC mode' : 'Try GPU cloud mode';
  $('summary').hidden = false;
}

// ---------------------------------------------------------------- popover
function onRackClick({ rackId, zone, screenX, screenY } = {}) {
  if (!S.d || !rackId) return;
  const plan = S.d.plans[S.show];
  const st = rackCache.get(rackId) || 'online';
  const now = active(plan, S.t).find(i => i.racks.includes(rackId));
  const next = plan.items.filter(i => i.start_hour > S.t && i.racks.includes(rackId)).sort((x, y) => x.start_hour - y.start_hour)[0];
  const z = zone || `Z${'ABCD'.indexOf(rackId[0]) + 1}`;
  const per = S.d.perRack ? `${S.d.perRack}× H100` : 'H100 rack';
  const pop = $('popover');
  pop.innerHTML = `
    <div class="p-head"><span class="p-id">${esc(rackId)}</span><button class="p-x" aria-label="Close">×</button></div>
    <div class="p-meta"><i class="zone" style="--zc:${ZONE_VAR[z] || 'var(--ink-3)'}">${esc(z)}</i><span>${per}</span><span class="state ${st}">${st}</span></div>
    <div class="p-task">
      ${now ? `<b>${esc(now.name)}</b><span class="mono">${esc(now.start_label)} to ${esc(now.end_label)}, ${money(now.total)}</span>`
            : `<b>No work right now</b>`}
      <div class="mono" style="margin-top:4px">${next ? `Next: ${esc(shortName(next.name))}, ${esc(next.start_label)}` : 'No more work this week'} <span style="opacity:.7">(${PLAN_LABEL[S.show]})</span></div>
    </div>`;
  pop.hidden = false;
  const w = pop.offsetWidth, h = pop.offsetHeight;
  const x = Math.max(8, Math.min(innerWidth - w - 8, (screenX ?? innerWidth / 2) + 14));
  const y = Math.max(8, Math.min(innerHeight - h - 8, (screenY ?? innerHeight / 2) - h / 2));
  pop.style.left = `${x}px`; pop.style.top = `${y}px`;
  pop.querySelector('.p-x').addEventListener('click', () => { pop.hidden = true; });
}

// ---------------------------------------------------------------- controls
function setPlaying(p) {
  if (p && S.t >= HOURS) { S.t = 0; S.summaryDismissed = false; $('summary').hidden = true; }
  S.playing = p;
  $('play-ico').textContent = p ? '❚❚' : '▶';
  $('play-txt').textContent = p ? 'Pause' : 'Play';
  $('btn-play').setAttribute('aria-pressed', String(p));
  call('setPaused', !p);
}

function seg(id, onPick) {
  const root = $(id);
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-value]');
    if (!b || b.getAttribute('aria-checked') === 'true') return;
    setSeg(id, b.dataset.value);
    onPick(b.dataset.value);
  });
}
function setSeg(id, value) {
  for (const b of $(id).querySelectorAll('button[data-value]')) b.setAttribute('aria-checked', String(b.dataset.value === String(value)));
}

function setShow(v) {
  S.show = v; setSeg('seg-show', v);
  lastPills = '';
}
// manual pick (buttons / key) while playing: the director stops switching until restart or explain is re-enabled
function pickShow(v) {
  if (S.playing) { S.dirManual = true; S.contrast = null; S.dirLabel = ''; }
  setShow(v);
}

// ---------------------------------------------------------------- director (explain mode)
// Switches the hall between the two plans so the presenter doesn't have to: each key moment shows
// its plan; ASAP cooling/overheat moments then cut to our plan at the same hour. Between moments it
// shows ASAP while ASAP is overheating, else our plan. Never fights a Nemotron run or new-job focus.
function directorOn() {
  return S.explain && !S.dirManual && !S.agent && !S.focus;
}
function directBeat(group) {
  if (!directorOn()) { S.contrast = null; return; }
  const b = group.find(x => x.plan === 'asap') || group[0];
  setShow(b.plan);
  S.dirLabel = b.plan === 'asap' ? 'Key moment: showing ASAP' : 'Key moment: showing our plan';
  S.contrast = b.contrast && b.contrast !== b.plan ? b.contrast : null;
}
function directIdle() {
  if (!directorOn()) return;
  const hr = Math.floor(S.t);
  const hot = (S.d.plans.asap?.overheats || []).some(o => o.hour === hr);
  const want = hot ? 'asap' : 'optimized';
  if (S.show !== want) setShow(want);
  S.dirLabel = hot ? 'ASAP overheating: showing ASAP' : '';
}
function setMode(v) {
  S.mode = v; setSeg('seg-mode', v);
  loadMode(v);
}
function seek(t) {
  S.t = Math.max(0, Math.min(HOURS, t));
  if (S.t < HOURS) { $('summary').hidden = true; S.summaryDismissed = false; }
}
function pushView() {
  $('pixel-size').disabled = !S.view.pixelArt;
  $('pixel-size-out').textContent = S.view.pixelSize;
  call('setView', { ...S.view });
}

function wireControls() {
  seg('seg-mode', setMode);
  seg('seg-show', pickShow);
  seg('seg-speed', v => { S.speed = Number(v); });
  seg('seg-render', v => { S.view.pixelArt = v === 'pixel'; pushView(); });
  $('btn-play').addEventListener('click', () => setPlaying(!S.playing));
  $('btn-restart').addEventListener('click', restart);
  $('scrub').addEventListener('input', (e) => seek(Number(e.target.value)));
  $('btn-left').addEventListener('click', () => call('rotate', -1));
  $('btn-right').addEventListener('click', () => call('rotate', +1));
  $('pixel-size').addEventListener('input', (e) => { S.view.pixelSize = Number(e.target.value); pushView(); });
  $('chk-outlines').addEventListener('change', (e) => { S.view.outlines = e.target.checked; pushView(); });
  $('chk-palette').addEventListener('change', (e) => { S.view.palette = e.target.checked; pushView(); });
  $('chk-explain').addEventListener('change', (e) => { S.explain = e.target.checked; S.hold = 0; S.contrast = null; if (S.explain) S.dirManual = false; });
  $('bt-close').addEventListener('click', () => { hideBeat(); S.hold = 0; });
  $('summary-close').addEventListener('click', () => { $('summary').hidden = true; S.summaryDismissed = true; });
  $('summary').addEventListener('click', (e) => { if (e.target === $('summary')) { $('summary').hidden = true; S.summaryDismissed = true; } });
  $('summary-replay').addEventListener('click', restart);
  $('nj-replay').addEventListener('click', restart);
  $('nj-close').addEventListener('click', closeNewJob);
  $('al-close').addEventListener('click', hideAlarm);
  $('summary-swap').addEventListener('click', () => setMode(S.mode === 'cloud' ? 'private' : 'cloud'));
  $('panel-toggle').addEventListener('click', () => {
    const open = document.body.classList.toggle('panel-open');
    $('panel-toggle').setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('pointerdown', (e) => {
    const pop = $('popover');
    if (!pop.hidden && !pop.contains(e.target)) pop.hidden = true;
  });

  const isField = (t) => t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['range', 'checkbox'].includes(t.type)));
  document.addEventListener('keyup', (e) => { if (e.code === 'Space' && !isField(e.target)) e.preventDefault(); });
  document.addEventListener('keydown', (e) => {
    if (isField(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!S.playing); }
    else if ((k === 'arrowleft' || k === 'arrowright') && e.target.type !== 'range') {
      e.preventDefault();
      setPlaying(false);
      const step = e.shiftKey ? 6 : 1;
      seek(k === 'arrowleft' ? Math.ceil(S.t - step) : Math.floor(S.t + step));
    }
    else if (k === 'q') call('rotate', -1);
    else if (k === 'e') call('rotate', +1);
    else if (k === 'tab' && (document.activeElement === document.body || !document.activeElement)) {
      e.preventDefault(); pickShow(S.show === 'optimized' ? 'asap' : 'optimized');
    }
    else if (k === 'r') restart();
    else if (k === 'p') { S.view.pixelArt = !S.view.pixelArt; setSeg('seg-render', S.view.pixelArt ? 'pixel' : 'raw'); pushView(); }
    else if (k === 'escape') {
      $('popover').hidden = true;
      if (!$('summary').hidden) { $('summary').hidden = true; S.summaryDismissed = true; }
      else if (S.selected) selectTask(S.selected);
    }
  });
}

// ---------------------------------------------------------------- key moments
// Cards built from the two plans by ui/play-by-play.js: why ASAP overheats, what ours does instead.
let beatTimer = 0;
function showBeats(group) {
  const tag = (b) => b.plan === 'asap' ? 'asap' : 'ours';
  $('bt-when').textContent = hourLabel(group[0].hour);
  $('bt-list').innerHTML = group.map(b => `
    <div class="bt-item ${tag(b)}"><span class="bt-tag ${tag(b)}">${b.plan === 'asap' ? 'ASAP' : 'Our plan'}</span>
      <b>${esc(b.title)}</b><p>${esc(b.text)}</p></div>`).join('');
  S.beatLog.push(...group);
  renderBeatLog();
  const card = $('beat');
  card.classList.remove('open');
  delete card.dataset.folded;
  card.hidden = false;
  stagePick = null;
  layoutStage();
  // fold to its chip about 2 s after the 3 s hold ends
  clearTimeout(beatTimer);
  beatTimer = setTimeout(() => { card.dataset.folded = '1'; card.classList.remove('open'); layoutStage(); }, 5000);
}
function hideBeat() { $('beat').hidden = true; clearTimeout(beatTimer); renderBeatLog(); layoutStage(); }
/** Left column, under the clock: the last five key moments, newest on top. Click a row to seek there. */
function renderBeatLog() {
  const log = $('bt-log');
  const rows = (S.beatLog || []).slice(-5).reverse();
  log.innerHTML = rows.map(b => `<li class="${b.plan === 'asap' ? 'asap' : 'ours'}" data-h="${Number(b.hour)}" title="Jump to ${esc(hourLabel(b.hour))}"><time>${esc(hourLabel(b.hour))}</time><span>${esc(b.title)}</span></li>`).join('');
  log.hidden = !rows.length;
}

// ---------------------------------------------------------------- stage cards: one at a time
// Priority alarm > Nemotron step > key moment > new job. The rest fold to a one-line chip; click one to expand it.
const STAGE = ['alarm', 'agent-callout', 'beat', 'newjob'];
let stagePick = null;
function layoutStage() {
  const vis = STAGE.filter(id => !$(id).hidden && !(id === 'beat' && $('beat').dataset.folded && stagePick !== 'beat'));
  const top = vis.includes(stagePick) ? stagePick : vis[0];
  for (const id of STAGE) {
    const el = $(id), small = !el.hidden && id !== top;
    el.classList.toggle('compact', small);
    if (small) el.title = 'Click to expand'; else el.removeAttribute('title');
  }
}
function wireStage() {
  const seen = new Map(STAGE.map(id => [id, $(id).hidden]));
  new MutationObserver(() => {
    for (const id of STAGE) {
      const h = $(id).hidden;
      if (seen.get(id) && !h && stagePick !== id) stagePick = null;   // a card just appeared: priority decides again
      seen.set(id, h);
    }
    layoutStage();
  }).observe(document.querySelector('.stage-top'), { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  for (const id of STAGE) {
    $(id).addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const el = $(id);
      if (el.classList.contains('compact')) { stagePick = id; if (id === 'beat') clearTimeout(beatTimer); layoutStage(); }
      else if (id === 'beat') el.classList.toggle('open');
    });
  }
  $('bt-log').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-h]');
    if (li) { S.hold = 0; seek(Number(li.dataset.h)); }
  });
  layoutStage();
}
wireStage();

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (S.d) {
    if (S.playing && S.t >= HOURS) setPlaying(false);
    else if (S.playing && S.hold > now) S.boosting = false;   // a key moment is on screen: hold
    else if (S.playing && S.contrast && directorOn()) {        // director: same hour, our plan
      setShow(S.contrast); S.contrast = null;
      S.dirLabel = 'Same hour, our plan';
      S.hold = now + CONTRAST_HOLD_MS; S.boosting = false;
    }
    else if (S.playing) {
      S.hold = 0; S.contrast = null;
      // never fast-forward through the lead-in to the job the agent just added; play it slower
      const f = S.focus;
      const nearFocus = f && S.t >= f.start - LEAD_HOURS - 1 && S.t < f.end;
      S.boosting = !nearFocus && isQuiet(S.t);
      S.slowed = !!(f && S.t >= f.start && S.t < f.end);
      let rate = Math.min(MAX_HOURS_PER_SEC, (S.speed / SEC_PER_HOUR) * (S.boosting ? QUIET_BOOST : 1));
      if (S.slowed) rate = Math.min(rate, Math.max(rate * FOCUS_RATE, (f.end - f.start) / FOCUS_MAX_SECS));
      // explain mode: play the lead-in to the next key moment at 1x so judges see it coming
      const nb = S.explain ? S.beats.find(b => b.hour > S.t) : null;
      if (nb && nb.hour - S.t <= BEAT_LEAD_HRS) { S.boosting = false; rate = Math.min(rate, 1 / SEC_PER_HOUR); }
      const before = S.t;
      S.t = Math.min(HOURS, S.t + dt * rate);
      // playback of our plan reached a simulated alarm: stop on its hour and let Nemotron respond
      const inc = crossedIncident(before, S.t);
      const hit = inc ? [] : S.beats.filter(b => before < b.hour && b.hour <= S.t);
      if (inc) onIncidentReached(inc);
      else if (hit.length) {
        const h = hit[0].hour;
        if (S.explain) { S.t = h; S.hold = now + BEAT_HOLD_MS; }
        const group = hit.filter(b => b.hour === h);
        directBeat(group);
        showBeats(group);
      }
      else if (S.t >= HOURS) setPlaying(false);
      else directIdle();
    }
    if (pendingAlarm) firePendingAlarm();
    try { render(now); } catch (e) {
      console.error(e);
      window.__showDevError?.(`render: ${e.message}`);
      S.playing = false;
    }
  }
  requestAnimationFrame(frame);
}

function render(now) {
  applyHall(now);
  updateScoreboard();
  updateTicker();
  updateLadder();
  updateNewJob();
  const today = Math.min(6, Math.floor(S.t / 24));
  if (priceInsights) {
    try { priceInsights.setToday(today); }
    catch (e) { console.warn('[price-insights] setToday failed, using the basic price chart:', e); priceInsights = null; if (S.raw) renderPrices(S.raw); }
  } else priceChart?.setToday(today);
  gantt?.setHour(S.t);
  const scrub = $('scrub');
  if (document.activeElement !== scrub || !S.playing) scrub.value = S.t.toFixed(2);
  scrub.style.setProperty('--p', `${(100 * S.t / HOURS).toFixed(2)}%`);
  setText('time-aside', S.t >= HOURS ? 'End of week' : hourLabel(S.t));
  if (S.t >= HOURS) showSummary();
}

// ---------------------------------------------------------------- boot
// Optional deep-link for rehearsals and screenshots: ?mode=private&show=asap&t=36&speed=4&paused=1
const Q = new URLSearchParams(location.search);
const BOOT = {
  t: Number(Q.get('t')) || 0, paused: Q.get('paused') === '1',
  day: /^[0-6]$/.test(Q.get('day') || '') ? Number(Q.get('day')) : null,   // ?day=N opens that day's price detail
};

// ---------------------------------------------------------------- views (#hall / #schedule / #prices / #report)
const VIEWS = ['home', 'details'];
const ROOT = { home: 'view-hall', details: 'view-details' };
const SECTION = { schedule: 'view-schedule', prices: 'view-prices', report: 'view-report' };
let curView = 'home';
function viewFromHash() {
  const h = (location.hash || '').replace('#', '');
  if (h === 'hall') return 'home';
  if (SECTION[h]) return 'details';
  return VIEWS.includes(h) ? h : null;
}
function setView(name, { focus = false } = {}) {
  if (!VIEWS.includes(name)) name = 'home';
  curView = name;
  document.body.classList.toggle('view-hall', name === 'home');
  for (const v of VIEWS) {
    document.body.classList.toggle(`view-${v}`, v === name);
    const root = $(ROOT[v]);
    if (root) { root.classList.toggle('off', v !== name); root.setAttribute('aria-hidden', String(v !== name)); }
    const tab = $(`nav-${v}`);
    if (tab) {
      tab.setAttribute('aria-selected', String(v === name));
      if (v === name) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
      tab.tabIndex = v === name ? 0 : -1;
      if (v === name && focus) tab.focus();
    }
  }
  const help = $('help'); if (help) help.open = false;
  refreshView();
  try { window.dispatchEvent(new Event('resize')); } catch (e) { /* ignore */ }
  // #schedule / #prices / #report deep links scroll to that part of Details
  const sec = SECTION[(location.hash || '').replace('#', '')];
  if (name === 'details' && sec) requestAnimationFrame(() => $(sec)?.scrollIntoView({ block: 'start' }));
}
// Render whichever view is showing; called on view change and whenever plans change.
let scheduleMod = null, reportMod = null;
function refreshView() {
  if (!S.d || !S.raw) return;
  if (curView === 'details') {
    (scheduleMod ||= import('./ui/schedule-view.js')).then((m) => {
      if (typeof m.renderSchedule !== 'function') throw new Error('renderSchedule missing');
      m.renderSchedule($('schedule-host'), { plans: S.d.plans, backlog: S.raw.backlog, mode: S.mode, now: S.t });
      $('schedule-host').hidden = false; $('schedule-fallback').hidden = true;
    }).catch((e) => {
      console.warn('[schedule-view] using the jobs list:', e);
      scheduleMod = null;
      $('schedule-host').hidden = true; $('schedule-fallback').hidden = false;
    });
  }
  if (curView === 'details') {
    try { priceInsights?.refresh?.(); } catch (e) { console.warn('[price-insights] refresh failed:', e); }
  }
  if (curView === 'details') {
    (reportMod ||= import('./ui/report.js')).then((m) => {
      const host = $('report-host');
      const args = { plans: S.d.plans, backlog: S.raw.backlog, prices: S.raw.prices, mode: S.mode };
      if (typeof m.renderReport === 'function') { m.renderReport(host, args); return; }
      host.innerHTML = '<button class="btn-dark" type="button">Open week report</button>';
      host.firstChild.addEventListener('click', () => m.openReport?.(args));
    }).catch((e) => { console.warn('[report] not available yet:', e); reportMod = null; $('report-host').textContent = 'The report is not available yet.'; });
  }
}
function wireViews() {
  const list = document.querySelector('.tn-links');
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  list.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = tabs.length - 1;
    if (j == null) return;
    e.preventDefault(); e.stopPropagation();
    history.replaceState(null, '', `${location.search}#${tabs[j].dataset.view}`);
    setView(tabs[j].dataset.view, { focus: true });
  });
  window.addEventListener('hashchange', () => setView(viewFromHash() || 'home'));
  let start = viewFromHash();
  if (!start) {
    start = BOOT.day != null ? 'details' : 'home';
    history.replaceState(null, '', `${location.search}#${start}`);
  }
  setView(start);
}
function wireReport() {
  const b = $('btn-report');
  if (!b) return;
  b.addEventListener('click', () => {
    try {
      if (!S.d || !S.raw) return;
      import('./ui/report.js')
        .then(m => m.openReport({ plans: S.d.plans, backlog: S.raw.backlog, prices: S.raw.prices, mode: S.mode }))
        .catch(e => console.warn('[report] not available yet:', e));
    } catch (e) { console.warn('[report] failed:', e); }
  });
}
let ganttW = 0, ganttTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(ganttTimer);
  ganttTimer = setTimeout(() => {
    const host = $('gantt');
    if (!host || !S.d || !S.raw || host.clientWidth === ganttW) return;
    ganttW = host.clientWidth;
    try {
      gantt = createGantt(host, S.d.plans, S.raw.backlog.map(t => t.id));
      gantt.select(S.selected); gantt.setHour(S.t);
    } catch (e) { console.warn('[gantt] resize failed:', e); }
  }, 120);
});

(function boot() {
  (window.__pendingErrors || []).forEach(m => window.__showDevError?.(m));
  if (Q.get('mode') === 'private') { S.mode = 'private'; setSeg('seg-mode', 'private'); }
  if (Q.get('show') === 'asap') setShow('asap');
  if (['1', '4', '16'].includes(Q.get('speed'))) { S.speed = Number(Q.get('speed')); setSeg('seg-speed', Q.get('speed')); }
  wireControls();
  wireViews();
  wireReport();
  pushView();
  // ?turn=N rotates the camera N quarter-turns once the hall is up (rehearsals, screenshots)
  initHall().then(() => { for (let i = 0; i < (Number(Q.get('turn')) || 0) % 4; i++) call('rotate', +1); });
  initAgentPanel();
  window.addEventListener('agent:step', onAgentStep);
  window.addEventListener('agent:plan', onAgentPlan);
  // price insights first (a local module, quick) so the first load renders into it
  loadPriceInsights().finally(() => loadMode(S.mode));
  requestAnimationFrame(frame);
})();
