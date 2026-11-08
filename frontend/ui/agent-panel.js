// "Ask Nemotron" panel: plain-English request -> POST /request -> tool trace + explanation.
// Self-contained (own CSS, own fetch). Wire-up: see docs/INTEGRATION.md.
// Emits window 'agent:plan' {task, plan, explanation} so main.js can swap the new plan in.

const TIMEOUT_MS = 90_000;          // Nemotron on build.nvidia.com takes ~13-40 s per request
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

function friendlyError(e) {
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

  async function run(text) {
    if (busy) return;
    busy = true;
    setBusy(true);
    result.replaceChildren();
    const t0 = performance.now();
    status.className = 'ap-status ap-wait';
    const tick = () => { status.textContent = `Nemotron is planning… ${Math.round((performance.now() - t0) / 1000)} s`; };
    tick();
    const timer = setInterval(tick, 1000);
    try {
      const r = await postJSON('/request', { text }, TIMEOUT_MS);
      const secs = Math.round((performance.now() - t0) / 1000);
      status.className = 'ap-status';
      status.textContent = `Done in ${secs} s.`;
      render(r);
      if (r?.task && r?.plan) {
        window.dispatchEvent(new CustomEvent('agent:plan', { detail: { task: r.task, plan: r.plan, explanation: r.explanation } }));
      }
    } catch (e) {
      status.className = 'ap-status ap-err';
      status.textContent = friendlyError(e);
    } finally {
      clearInterval(timer);
      busy = false;
      setBusy(false);
    }
  }

  function setBusy(on) {
    input.disabled = on;
    chips.querySelectorAll('button').forEach((b) => { b.disabled = on; });
    box.classList.toggle('ap-busy', on);
  }

  function render(r) {
    const parts = [];
    const calls = Array.isArray(r?.tool_calls) ? r.tool_calls : [];
    if (calls.length) {
      parts.push(el('div', { class: 'ap-h', text: 'What the agent did' }));
      parts.push(el('ol', { class: 'ap-trace' }, calls.map(stepItem)));
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

function stepItem(raw) {
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
    el('code', { class: 'ap-fn', text: base }));
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
