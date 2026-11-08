// "Ask Nemotron" panel: plain-English request -> POST /request/stream (NDJSON, one event per
// line as it happens) -> live tool trace + explanation. Falls back to POST /request if the
// stream endpoint is missing. Self-contained (own CSS, own fetch). Wire-up: docs/INTEGRATION.md.
// Emits window 'agent:step' (every stream event: start, thinking, tool, explaining, done, error)
// and 'agent:plan' {task, plan, asapPlan, explanation} so main.js can swap the new plan in.

const TIMEOUT_MS = 90_000;          // Nemotron on build.nvidia.com takes ~13-40 s per request
const STREAM_IDLE_MS = 90_000;      // stream: give up if no event arrives for this long
const HANDOFF_TIMEOUT_MS = 90_000;

// Must match backend/app/demo_requests.py DEMO_REQUESTS keys exactly.
export const REHEARSED = [
  'UPS-B battery swap, 3 hrs, vendor only Wed or Fri',
  'CRAC-4 filter and belt service, 4 hours, weekdays 8am to 6pm',
  'PDU row C breaker inspection, 2 hours, weekend only',
];

const STEP_LABEL = {
  get_backlog: 'Read the backlog',
  get_prices: 'Read the GPU price forecast',
  lookup_equipment: 'Looked up equipment → zone + racks',
  day_windows: 'Turned days/times into week hours',
  add_task: 'Added the task',
  make_plan: 'Ran the optimizer',
  simulate: 'Simulated the hall (conflicts, heat)',
  pinned_demo_task: 'Pinned the rehearsed task',
  llm_error: 'Nemotron unavailable',
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hourLabel = (h) => (h >= 168 ? 'next Mon 00:00' : `${DAYS[Math.floor(h / 24)]} ${String(h % 24).padStart(2, '0')}:00`);

// ---------- tiny DOM helpers (textContent only: no unescaped HTML) ----------
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) if (kid != null) n.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return n;
}

// ---------- backend access: same origin first, then localhost:8000 (like api.js) ----------
const sameOrigin = location.protocol.startsWith('http') ? [''] : [];
const BASES = [...new Set([...sameOrigin, 'http://localhost:8000'])];
let workingBase = null;

async function postJSON(path, body, timeoutMs) {
  const bases = workingBase !== null ? [workingBase, ...BASES.filter((b) => b !== workingBase)] : BASES;
  let lastErr;
  for (const base of bases) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(base + path, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body), signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
      const data = await res.json();
      workingBase = base;
      return data;
    } catch (e) {
      lastErr = e;
      if (e.name === 'AbortError') break;      // timed out on a reachable server: don't retry elsewhere
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error('backend unreachable');
}

class StreamUnavailable extends Error {}

/**
 * POST /request/stream and call onEvent(evt) for every NDJSON line the moment it arrives.
 * Resolves with the final AgentResponse (the 'done' event). Throws StreamUnavailable when no
 * base serves the stream (404/405, not NDJSON, unreachable) so the caller can use POST /request.
 */
async function streamRequest(text, onEvent) {
  const bases = workingBase !== null ? [workingBase, ...BASES.filter((b) => b !== workingBase)] : BASES;
  for (const base of bases) {
    const ctrl = new AbortController();
    let timer = setTimeout(() => ctrl.abort(), STREAM_IDLE_MS);
    const poke = () => { clearTimeout(timer); timer = setTimeout(() => ctrl.abort(), STREAM_IDLE_MS); };
    let res;
    try {
      res = await fetch(base + '/request/stream', {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
        body: JSON.stringify({ text }), signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw e;
      continue;                                    // unreachable base: try the next one
    }
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !res.body || !/ndjson|jsonl|stream|text\/plain/i.test(type)) {
      clearTimeout(timer);
      ctrl.abort();
      continue;                                    // 404/405 or not a stream: not available here
    }
    workingBase = base;
    try {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let final = null;
      const handle = (line) => {
        if (!line.trim()) return;
        let evt;
        try { evt = JSON.parse(line); } catch { console.warn('[agent-panel] bad stream line:', line); return; }
        onEvent(evt);
        if (evt.type === 'done') final = evt.response || {};
        if (evt.type === 'error') throw Object.assign(new Error(evt.message || 'agent error'), { fromStream: true });
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        poke();
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, nl)); buf = buf.slice(nl + 1); }
      }
      handle(buf + dec.decode());
      if (!final) throw new Error('The planner stream ended before it finished.');
      return final;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new StreamUnavailable('no /request/stream');
}

function friendlyError(e) {
  if (e?.fromStream) return `The agent hit an error: ${e.message}`;
  if (/stream ended/.test(e?.message || '')) return e.message;
  if (e?.name === 'AbortError') return 'Nemotron took too long (over 90 s). Try one of the rehearsed requests below.';
  return 'Could not reach the planner backend. Start it with: cd backend && .venv/bin/uvicorn app.main:app';
}

// ---------- panel ----------
export function initAgentPanel(opts = {}) {
  try {
    return mount(opts);
  } catch (e) {
    console.warn('[agent-panel] init failed:', e);
    return null;
  }
}

function mount(opts) {
  const input = typeof opts.input === 'string' || !opts.input
    ? document.querySelector(opts.input || '.ask') : opts.input;
  if (!input) { console.warn('[agent-panel] no .ask input found'); return null; }

  // own stylesheet, once
  if (!document.querySelector('link[data-agent-panel]')) {
    document.head.append(el('link', { rel: 'stylesheet', href: new URL('./agent-panel.css', import.meta.url).href, 'data-agent-panel': true }));
  }

  const section = input.closest('section') || input.parentElement;
  input.disabled = false;
  input.setAttribute('aria-label', 'Ask Nemotron to schedule a maintenance task');
  input.classList.add('ap-live');
  const caption = section.querySelector('.caption');
  if (caption) caption.textContent = 'Type a maintenance request and press Enter. Nemotron plans it with our tools.';
  const phase = section.querySelector('.pill-phase');
  if (phase) { phase.textContent = 'Live'; phase.classList.add('ap-pill-live'); }

  const chips = el('div', { class: 'ap-chips', role: 'group', 'aria-label': 'Rehearsed requests' },
    REHEARSED.map((t) => el('button', { type: 'button', class: 'ap-chip', title: t, text: t, onclick: () => { input.value = t; run(t); } })));
  const status = el('div', { class: 'ap-status', role: 'status', 'aria-live': 'polite' });
  const result = el('div', { class: 'ap-result', 'aria-live': 'polite' });
  const box = el('div', { class: 'ap-box' }, chips, status, result);
  (opts.container || section).append(box);

  let busy = false;

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    const text = input.value.trim();
    if (text) run(text);
  });

  const emit = (evt) => {
    try { window.dispatchEvent(new CustomEvent('agent:step', { detail: evt })); } catch (e) { console.warn('[agent-panel] agent:step listener failed:', e); }
  };

  async function run(text) {
    if (busy) return;
    busy = true;
    setBusy(true);
    result.replaceChildren();
    const t0 = performance.now();
    const live = liveTrace();
    let waitText = 'Nemotron is planning';
    status.className = 'ap-status ap-wait';
    const tick = () => { status.textContent = `${waitText}… ${Math.round((performance.now() - t0) / 1000)} s`; };
    tick();
    const timer = setInterval(tick, 1000);
    let started = false, ended = false;
    try {
      let r;
      try {
        r = await streamRequest(text, (evt) => {
          if (evt.type === 'start') started = true;
          if (evt.type === 'done' || evt.type === 'error') ended = true;
          if (evt.type === 'thinking') waitText = 'Nemotron is thinking';
          else if (evt.type === 'tool') waitText = evt.by === 'code' ? 'Our code is checking' : 'Nemotron is working';
          else if (evt.type === 'explaining') waitText = 'Writing the explanation';
          tick();
          live.add(evt);
          emit(evt);
        });
      } catch (e) {
        if (!(e instanceof StreamUnavailable)) throw e;
        // Older backend: one blocking POST /request. Tell main.js a run started, then the result.
        live.reset();
        if (!started) { started = true; emit({ type: 'start', text, llm: null, stream: false }); }
        live.add({ type: 'start' });
        r = await postJSON('/request', { text }, TIMEOUT_MS);
        ended = true;
        emit({ type: 'done', response: r, stream: false });
      }
      const secs = Math.round((performance.now() - t0) / 1000);
      status.className = 'ap-status';
      status.textContent = `Done in ${secs} s.`;
      render(r, live);
      if (r?.task && r?.plan) {
        window.dispatchEvent(new CustomEvent('agent:plan', { detail: { task: r.task, plan: r.plan, asapPlan: r.asap_plan, explanation: r.explanation } }));
      }
    } catch (e) {
      status.className = 'ap-status ap-err';
      status.textContent = friendlyError(e);
      live.stop();
      if (started && !ended) emit({ type: 'error', message: e?.message || String(e), local: true });
    } finally {
      clearInterval(timer);
      busy = false;
      setBusy(false);
    }
  }

  // The trace as it happens: one row per tool event, plus a "thinking" row between steps.
  function liveTrace() {
    const ol = el('ol', { class: 'ap-trace ap-live-trace' });
    const head = el('div', { class: 'ap-h', text: 'What the agent is doing' });
    const pending = el('li', { class: 'ap-step ap-pending' },
      el('span', { class: 'ap-tag', text: 'Nemotron' }),
      el('span', { class: 'ap-step-txt', text: 'Reading the request…' }));
    let count = 0;
    const show = (txt, tag) => {
      pending.querySelector('.ap-step-txt').textContent = txt;
      pending.querySelector('.ap-tag').textContent = tag;
      ol.append(pending);                       // keep it last
      if (!head.isConnected) result.replaceChildren(head, ol);
    };
    return {
      get count() { return count; },
      ol,
      add(evt) {
        if (evt.type === 'start') show('Reading the request…', 'Nemotron');
        else if (evt.type === 'thinking') show(`Thinking about step ${evt.step ?? count + 1}…`, 'Nemotron');
        else if (evt.type === 'explaining') show('Writing the explanation…', 'Nemotron');
        else if (evt.type === 'tool') {
          const li = stepItem(evt.label || evt.name, toolDetail(evt));
          li.classList.add('ap-fresh');
          count++;
          ol.insertBefore(li, pending.isConnected ? pending : null);
          pending.remove();
          if (!head.isConnected) result.replaceChildren(head, ol);
        } else if (evt.type === 'done' || evt.type === 'error') pending.remove();
      },
      stop() { pending.remove(); },
      reset() { pending.remove(); ol.replaceChildren(); count = 0; },
    };
  }

  function setBusy(on) {
    input.disabled = on;
    chips.querySelectorAll('button').forEach((b) => { b.disabled = on; });
    box.classList.toggle('ap-busy', on);
  }

  function render(r, live) {
    const parts = [];
    const calls = Array.isArray(r?.tool_calls) ? r.tool_calls : [];
    if (calls.length) {
      parts.push(el('div', { class: 'ap-h', text: 'What the agent did' }));
      // keep the live rows (they carry details) when they match the final list one for one
      if (live && live.count === calls.length) {
        live.stop();
        live.ol.classList.remove('ap-live-trace');
        live.ol.querySelectorAll('.ap-fresh').forEach((n) => n.classList.remove('ap-fresh'));
        parts.push(live.ol);
      } else parts.push(el('ol', { class: 'ap-trace' }, calls.map((c) => stepItem(c))));
    }
    if (r?.task) parts.push(taskChip(r.task, r.plan));
    parts.push(el('p', { class: 'ap-expl', text: r?.explanation || 'No explanation returned.' }));
    if (r?.task) {
      const out = el('div', { class: 'ap-handoff', 'aria-live': 'polite' });
      const btn = el('button', { type: 'button', class: 'ap-btn', text: 'Shift handoff' });
      btn.addEventListener('click', () => handoff(r.task, r.plan?.mode, btn, out));
      parts.push(el('div', { class: 'ap-actions' }, btn), out);
    }
    result.replaceChildren(...parts);
  }

  async function handoff(task, mode, btn, out) {
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = 'Writing handoff…';
    out.replaceChildren();
    try {
      const body = { extra_tasks: [task] };
      if (mode) body.mode = mode;
      const h = await postJSON('/handoff', body, HANDOFF_TIMEOUT_MS);
      out.replaceChildren(
        el('div', { class: 'ap-h', text: h?.llm_used ? 'Shift handoff (Nemotron)' : 'Shift handoff' }),
        el('pre', { class: 'ap-brief', text: h?.shift_brief || 'No handoff returned.' }),
      );
    } catch (e) {
      out.replaceChildren(el('p', { class: 'ap-status ap-err', text: /HTTP 40[45]/.test(e?.message || '') ?'Handoff endpoint not available yet.' : friendlyError(e) }));
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  return { run, element: box };
}

function stepItem(raw, detail) {
  const s = String(raw);
  let kind = 'llm', name = s;
  if (s.startsWith('guardrail:')) { kind = 'code'; name = s.slice(10); }
  else if (s.startsWith('fallback:')) { kind = 'fallback'; name = s.slice(9); }
  const m = name.match(/^([a-z_]+)(?:\[(.+)\])?$/);
  const base = m ? m[1] : name;
  const arg = m && m[2] ? ` (${m[2]})` : '';
  const tag = kind === 'code' ? 'code check' : kind === 'fallback' ? 'offline fallback' : 'Nemotron';
  return el('li', { class: `ap-step ap-${kind}` },
    el('span', { class: 'ap-tag', text: tag }),
    el('span', { class: 'ap-step-txt', text: (STEP_LABEL[base] || base) + arg }),
    detail ? el('span', { class: 'ap-detail', text: detail }) : null,
    el('code', { class: 'ap-fn', text: base }));
}

/** "D01–D10" for a contiguous run in one row, else the list. Formatting only. */
export function rackSpan(racks) {
  if (!Array.isArray(racks) || !racks.length) return '';
  const row = racks[0][0];
  const nums = racks.map((r) => Number(r.slice(1)));
  const contiguous = racks.every((r, i) => r[0] === row && (i === 0 || nums[i] === nums[i - 1] + 1));
  return contiguous && racks.length > 2 ? `${racks[0]}–${racks[racks.length - 1]}` : racks.join(', ');
}

// One short line of what a tool returned, straight from its result (no numbers of our own).
function toolDetail(evt) {
  const r = evt.result || {};
  if (r.error) return `Error: ${r.error}`;
  switch (evt.name) {
    case 'lookup_equipment': return r.zone ? `${r.equipment}: zone ${r.zone}, racks ${rackSpan(r.racks)}` : '';
    case 'day_windows': return Array.isArray(r.windows) ? windowsText(r.windows) : '';
    case 'add_task':
    case 'pinned_demo_task': {
      const t = r.task;
      return t ? `${t.id} ${t.name}, ${t.duration_hrs} h, ${t.racks_affected?.length ?? 0} racks` : '';
    }
    case 'make_plan': {
      const tot = typeof r.total_cost === 'number' ? `total $${Math.round(r.total_cost).toLocaleString('en-US')}` : '';
      const un = r.unscheduled?.length ? `, ${r.unscheduled.length} not scheduled` : '';
      return tot + un;
    }
    case 'simulate': return typeof r.violations === 'number' ? (r.violations ? `${r.violations} problems found` : 'No conflicts or overheats') : '';
    default: return '';
  }
}

/** Week-hour windows -> "Wed, Fri, all day" / "Mon to Fri, 08:00 to 18:00". Formatting only. */
export function windowsText(windows) {
  if (!Array.isArray(windows) || !windows.length) return '';
  const hh = (h) => `${String(h).padStart(2, '0')}:00`;
  const groups = new Map();
  for (const w of windows) {
    const d0 = Math.floor(w.start_hour / 24);
    const span = w.end_hour - w.start_hour;
    const key = span >= 168 ? 'week' : span === 24 && w.start_hour % 24 === 0 ? 'all day'
      : w.end_hour <= (d0 + 1) * 24 ? `${hh(w.start_hour % 24)} to ${hh(w.end_hour - d0 * 24)}`
      : `${hourLabel(w.start_hour)} to ${hourLabel(w.end_hour)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d0);
  }
  return [...groups].map(([key, days]) => {
    if (key === 'week') return 'any time this week';
    if (key.includes(' to ') && /^[A-Z]/.test(key)) return key;
    return `${dayList(days)}, ${key}`;
  }).join('; ');
}
function dayList(idx) {
  const u = [...new Set(idx)].sort((a, b) => a - b);
  const run = u.length > 2 && u.every((d, i) => i === 0 || d === u[i - 1] + 1);
  return run ? `${DAYS[u[0]]} to ${DAYS[u[u.length - 1]]}` : u.map((d) => DAYS[d]).join(', ');
}

function taskChip(task, plan) {
  const item = plan?.items?.find((i) => i.task_id === task.id);
  const unsched = plan?.unscheduled?.find((u) => u.task_id === task.id);
  const when = item
    ? `${item.start_label || hourLabel(item.start_hour)} → ${item.end_label || hourLabel(item.end_hour)}`
    : unsched ? `Not scheduled: ${unsched.reason}` : 'Not scheduled';
  return el('div', { class: 'ap-task', 'data-zone': task.zone },
    el('span', { class: 'ap-task-id', text: task.id }),
    el('span', { class: 'ap-task-main' },
      el('b', { text: task.equipment }),
      el('span', { class: 'ap-task-zone', text: ` · ${task.zone} · ${task.duration_hrs} h` })),
    el('span', { class: `ap-task-when${item ? '' : ' ap-unsched'}`, text: when }));
}
