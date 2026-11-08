// Backend access with graceful fallback.
// Order: same origin (when FastAPI serves the page) -> http://localhost:8000 -> cached snapshot.
import { FALLBACK } from '../fallback-plans.js';

const TIMEOUT_MS = 2500;
const sameOrigin = location.protocol.startsWith('http') ? [''] : [];
const BASES = [...new Set([...sameOrigin, 'http://localhost:8000'])];
let workingBase = null;

async function fetchJSON(base, path, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(base + path, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function request(path, opts) {
  const bases = workingBase !== null ? [workingBase, ...BASES.filter(b => b !== workingBase)] : BASES;
  let lastErr;
  for (const base of bases) {
    try {
      const data = await fetchJSON(base, path, opts);
      workingBase = base;
      return data;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('API unreachable');
}

const postPlan = (mode, strategy) => request('/plan', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ mode, strategy }),
});

/** One plan for an explicit task list (e.g. backlog + a task Nemotron added). Throws if offline. */
export const planWithTasks = (mode, strategy, tasks) => request('/plan', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ mode, strategy, tasks }),
});

/** Simulated alarms Nemotron can answer on its own (GET /incidents). Offline or missing → []. */
export async function loadIncidents() {
  try {
    const list = await request('/incidents');
    return Array.isArray(list) ? list.filter(i => i && i.id && Number.isFinite(Number(i.hour))) : [];
  } catch {
    return [];
  }
}

/** Everything the UI needs for one mode. Falls back to the cached snapshot if any call fails. */
export async function loadAll(mode) {
  try {
    const [backlog, prices, optimized, asap] = await Promise.all([
      request('/backlog'), request('/prices?days=7'), postPlan(mode, 'optimized'), postPlan(mode, 'asap'),
    ]);
    return { backlog, prices, plans: { optimized, asap }, offline: false };
  } catch (err) {
    console.warn('[api] backend unreachable, using cached plan:', err);
    return {
      backlog: FALLBACK.backlog,
      prices: FALLBACK.prices,
      plans: { optimized: FALLBACK.plans[mode].optimized, asap: FALLBACK.plans[mode].asap },
      offline: true,
    };
  }
}
