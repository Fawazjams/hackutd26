// Downtime, Priced — UI controller.
// Loads the backlog, prices and both plans, plays the week forward in the 3D hall, and races
// the $-lost counters for our plan vs ASAP. Every number on screen is computed from API data.

import { loadAll, planWithTasks } from './ui/api.js';
import { initAgentPanel } from './ui/agent-panel.js';
import { HOURS, DAYS, hourLabel, money, num, pct, esc, shortName } from './ui/format.js';
import { createPriceChart, createGantt } from './ui/charts.js';
import { createPlaceholderHall } from './ui/placeholder-hall.js';

const $ = (id) => document.getElementById(id);
const SEC_PER_HOUR = 0.5;        // 1× playback: half a second per simulated hour
const QUIET_BOOST = 6;           // fast-forward when nothing is running or about to start
const MAX_HOURS_PER_SEC = 48;
const EXTRA_EQUIPMENT = ['UPS-B']; // in the hall but not in the seeded backlog
const ZONE_VAR = { Z1: 'var(--z1)', Z2: 'var(--z2)', Z3: 'var(--z3)', Z4: 'var(--z4)' };
const PLAN_LABEL = { optimized: 'Our plan', asap: 'ASAP' };

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
  summaryDismissed: false,
  view: { pixelArt: true, pixelSize: 3, outlines: true, palette: true },
  loadToken: 0,
};

let dc = null;             // hall API: 3D scene or 2D placeholder
const rackCache = new Map();
const equipCache = new Map();
const zoneAlertCache = new Map();
let priceChart = null, gantt = null;

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
  const events = [{ h: 0, plan: null, kind: 'week', text: `Week starts · ${raw.backlog.length} jobs in the backlog` }];
  for (const key of ['optimized', 'asap']) {
    for (const it of plans[key].items) {
      events.push({ h: it.start_hour, plan: key, kind: 'start', it });
      events.push({ h: it.end_hour, plan: key, kind: 'end', it });
    }
    for (const oh of plans[key].overheats) events.push({ h: oh.hour, plan: key, kind: 'heat', oh });
  }
  const order = { week: 0, end: 1, heat: 2, start: 3 };
  events.sort((a, b) => a.h - b.h || order[a.kind] - order[b.kind] || (a.plan === 'optimized' ? -1 : 1));
  const perRackAny = plans.optimized.items.find(i => i.perRack)?.perRack
    ?? plans.asap.items.find(i => i.perRack)?.perRack ?? null;
  const equipment = [...new Set([...raw.backlog.map(t => t.equipment), ...EXTRA_EQUIPMENT])];
  const maxTotal = Math.max(1, ...['optimized', 'asap'].map(k => plans[k].total_cost));
  return { raw, tasks, plans, events, perRack: perRackAny, equipment, maxTotal, offline: raw.offline };
}

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
  $('sb-mode').textContent = mode === 'cloud' ? 'GPU cloud · revenue + SLA' : 'Private DC · rental cost';
  const raw = await loadAll(mode);
  if (token !== S.loadToken) return;
  applyRaw(raw);
  if (BOOT.t) { S.t = Math.min(HOURS, BOOT.t); BOOT.t = 0; }
  if (BOOT.paused) { setPlaying(false); BOOT.paused = false; }
}

// Render a {backlog, prices, plans, offline} bundle and restart the week.
function applyRaw(raw) {
  S.raw = raw;
  S.d = prepare(raw);
  $('offline-chip').hidden = !raw.offline;
  buildLadder();
  priceChart = createPriceChart($('price-chart'), raw.prices);
  gantt = createGantt($('gantt'), S.d.plans, raw.backlog.map(t => t.id));
  gantt.select(S.selected);
  restart();
}

// Ask Nemotron panel (ui/agent-panel.js) sends the optimized plan incl. its new task.
// The event has no ASAP plan, so ask /plan for ASAP over the same tasks; keep the old
// ASAP plan if that fails (offline), so the scoreboard still plays.
async function onAgentPlan(e) {
  const { task, plan } = e.detail || {};
  if (!task || !plan || !S.raw) return;
  const mode = plan.mode || S.mode;
  const backlog = [...S.raw.backlog.filter(t => t.id !== task.id), task];
  let asap = S.raw.plans.asap;
  try { asap = await planWithTasks(mode, 'asap', backlog); }
  catch (err) { console.warn('[agent] ASAP re-plan failed, keeping previous ASAP plan:', err); }
  S.selected = task.id;
  applyRaw({ ...S.raw, backlog, plans: { optimized: plan, asap } });
}

function restart() {
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
    const same = o && a && o.start_hour === a.start_hour;
    const when = same
      ? `<span class="eq">${esc(o.start_label)} · same</span>`
      : `<span class="o" title="Our plan start">■ ${o ? esc(o.start_label) : '—'}</span><span class="a" title="ASAP start">■ ${a ? esc(a.start_label) : '—'}</span>`;
    const cost = o
      ? `${a && Math.round(a.total) !== Math.round(o.total) ? `<s title="ASAP cost">${money(a.total)}</s>` : ''}${money(o.total)}`
      : '—';
    li.innerHTML = `
      <span class="bar"></span>
      <span class="l1"><span class="nm" title="${esc(task.name)} · ${esc(task.equipment)} · ${task.duration_hrs} h · ${task.racks_affected.length} racks">${esc(shortName(task.name))}</span><i class="zone">${esc(task.zone)}</i><span class="pill" data-pill>queued</span></span>
      <span class="l2"><span class="when">${when}</span><span class="cost">${cost}</span></span>`;
    li.addEventListener('click', () => selectTask(task.id));
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); selectTask(task.id); } });
    ol.appendChild(li);
  }
  const notes = ['optimized', 'asap'].flatMap(k => plans[k].unscheduled.map(u => `${PLAN_LABEL[k]}: ${u.task_id} not scheduled — ${u.reason}`));
  $('ladder-note').textContent = notes.join(' · ');
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
  for (const [id, st] of want) {
    if (rackCache.get(id) !== st) { rackCache.set(id, st); call('setRackState', id, st); }
  }
  const busyEq = new Set(act.map(i => i.equipment).filter(Boolean));
  for (const eq of S.d.equipment) {
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
  setText('sb-clock', hourLabel(S.t).toUpperCase());
  const status = S.t >= HOURS ? 'Final'
    : !S.playing ? '❚❚ Paused'
    : S.boosting ? '▶▶ Quiet hours'
    : `▶ ${S.speed}× · day ${Math.min(7, Math.floor(S.t / 24) + 1)}/7`;
  setText('sb-status', status);
  $('sb-status').classList.toggle('ff', S.boosting && S.playing && S.t < HOURS);

  const { s } = settledSavings(S.t);
  setText('sb-saved', (s < 0 ? '−' : '') + money(Math.abs(s)));
  $('sb-saved-wrap').classList.toggle('neg', s < 0);
  const finalSaved = plans.asap.total_cost - plans.optimized.total_cost;
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
    const tag = `<span class="tag ${e.plan === 'optimized' ? 'ours' : 'asap'}">${e.plan === 'optimized' ? 'OURS' : 'ASAP'}</span>`;
    const body = e.kind === 'heat'
      ? `<b class="heat">Zone ${esc(e.oh.zone)} overheated</b> · ${e.oh.temp_c.toFixed(1)} °C · ${num(e.oh.gpus_lost)} GPUs lost · ${money(e.oh.cost)}`
      : e.kind === 'start'
      ? `<b>${esc(e.it.name)}</b> started · ${num(e.it.gpus_offline)} GPUs offline`
      : `<b>${esc(e.it.name)}</b> done · ${money(e.it.total)}`;
    return `<li${fresh}>${tag}<time>${hourLabel(e.h)}</time><span class="what">— ${body}</span></li>`;
  }).join('');
}

// ---------------------------------------------------------------- summary
function showSummary() {
  if (S.summaryDismissed || !$('summary').hidden) return;
  const { optimized: o, asap: a } = S.d.plans;
  const cloud = S.mode === 'cloud';
  const sum = (p, f) => p.items.reduce((s, i) => s + f(i), 0);
  const saved = a.total_cost - o.total_cost;
  const share = a.total_cost > 0 ? saved / a.total_cost : 0;
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
  html += `<div>Last job finishes</div><div class="n">${done(o)}</div><div class="n">${done(a)}</div>`;
  $('summary-grid').innerHTML = html;
  const sameGH = Math.round(gh(o)) === Math.round(gh(a));
  let sub = $('summary-card-sub');
  if (!sub) {
    sub = document.createElement('p');
    sub.id = 'summary-card-sub'; sub.className = 'summary-sub';
    $('summary-title').after(sub);
  }
  const heatShare = saved > 0 ? (a.overheat_cost - o.overheat_cost) / saved : 0;
  sub.textContent = `${o.items.length} jobs, ${cloud ? 'priced as lost revenue + SLA credits' : 'priced as replacement rental'}. `
    + (sameGH ? 'Same work and the same GPU-hours offline — only the timing changed. ' : 'Both plans obey the same windows and cooling-zone rules. ')
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
      ${now ? `<b>${esc(now.name)}</b><span class="mono">${esc(now.start_label)} → ${esc(now.end_label)} · ${money(now.total)}</span>`
            : `<b>No work right now</b>`}
      <div class="mono" style="margin-top:4px">${next ? `Next: ${esc(shortName(next.name))} · ${esc(next.start_label)}` : 'No more work this week'} <span style="opacity:.7">(${PLAN_LABEL[S.show]})</span></div>
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
  seg('seg-show', setShow);
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
  $('summary-close').addEventListener('click', () => { $('summary').hidden = true; S.summaryDismissed = true; });
  $('summary').addEventListener('click', (e) => { if (e.target === $('summary')) { $('summary').hidden = true; S.summaryDismissed = true; } });
  $('summary-replay').addEventListener('click', restart);
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
      e.preventDefault(); setShow(S.show === 'optimized' ? 'asap' : 'optimized');
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

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (S.d) {
    if (S.playing && S.t >= HOURS) setPlaying(false);
    else if (S.playing) {
      S.boosting = isQuiet(S.t);
      const rate = Math.min(MAX_HOURS_PER_SEC, (S.speed / SEC_PER_HOUR) * (S.boosting ? QUIET_BOOST : 1));
      S.t = Math.min(HOURS, S.t + dt * rate);
      if (S.t >= HOURS) setPlaying(false);
    }
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
  priceChart?.setToday(Math.min(6, Math.floor(S.t / 24)));
  gantt?.setHour(S.t);
  const scrub = $('scrub');
  if (document.activeElement !== scrub || !S.playing) scrub.value = S.t.toFixed(2);
  scrub.style.setProperty('--p', `${(100 * S.t / HOURS).toFixed(2)}%`);
  setText('time-aside', `${hourLabel(S.t)} · ${DAYS[Math.min(6, Math.floor(S.t / 24))] === 'Sun' && S.t >= HOURS ? 'end' : `h ${Math.floor(S.t)}`}`);
  if (S.t >= HOURS) showSummary();
}

// ---------------------------------------------------------------- boot
// Optional deep-link for rehearsals and screenshots: ?mode=private&show=asap&t=36&speed=4&paused=1
const Q = new URLSearchParams(location.search);
const BOOT = { t: Number(Q.get('t')) || 0, paused: Q.get('paused') === '1' };

(function boot() {
  (window.__pendingErrors || []).forEach(m => window.__showDevError?.(m));
  if (Q.get('mode') === 'private') { S.mode = 'private'; setSeg('seg-mode', 'private'); }
  if (Q.get('show') === 'asap') setShow('asap');
  if (['1', '4', '16'].includes(Q.get('speed'))) { S.speed = Number(Q.get('speed')); setSeg('seg-speed', Q.get('speed')); }
  wireControls();
  pushView();
  // ?turn=N rotates the camera N quarter-turns once the hall is up (rehearsals, screenshots)
  initHall().then(() => { for (let i = 0; i < (Number(Q.get('turn')) || 0) % 4; i++) call('rotate', +1); });
  initAgentPanel();
  window.addEventListener('agent:plan', onAgentPlan);
  loadMode(S.mode);
  requestAnimationFrame(frame);
})();
