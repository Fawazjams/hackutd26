// "Money at risk" card: expected cost, price band and worst case per plan, from POST /exposure.
// Every number comes from the backend; this file only formats it.

const TIMEOUT_MS = 8000;
const sameOrigin = location.protocol.startsWith('http') ? [''] : [];
const BASES = [...new Set([...sameOrigin, 'http://localhost:8000'])];
const PARTS = [
  ['market', 'Market', 'var(--ink-2, #3E4C55)'],
  ['contract', 'SLA', 'var(--amber, #F2BE3A)'],
  ['failure', 'Failure', 'var(--ink-4, #A7B2B7)'],
  ['overheat', 'Overheat', 'var(--asap, #C8283C)'],
];
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const money = (v) => (Number.isFinite(Number(v)) ? usd.format(Math.round(Number(v))) : '—');

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

async function postExposure(mode) {
  let lastErr;
  for (const base of BASES) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(base + '/exposure', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode }), signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`/exposure → HTTP ${res.status}`);
      return await res.json();
    } catch (e) { lastErr = e; } finally { clearTimeout(timer); }
  }
  throw lastErr || new Error('backend unreachable');
}

function planRow(key, label, p) {
  const row = el('div', `ex-row ex-${key}`);
  const head = el('div', 'ex-head');
  head.append(el('span', 'ex-name', label), el('span', 'ex-exp', money(p.expected)));
  row.append(head);
  row.append(el('div', 'ex-line', `${money(p.price_low)} – ${money(p.price_high)} if H100 prices move`));
  row.append(el('div', 'ex-line ex-worst', `Worst case incl. overheats: ${money(p.worst_case)}`));
  const b = p.breakdown || {};
  const total = PARTS.reduce((s, [k]) => s + Math.max(0, Number(b[k]) || 0), 0);
  const bar = el('div', 'ex-bar');
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', PARTS.map(([k, n]) => `${n} ${money(b[k] || 0)}`).join(', '));
  if (total > 0) {
    for (const [k, n, c] of PARTS) {
      const v = Math.max(0, Number(b[k]) || 0);
      if (!v) continue;
      const seg = el('i');
      seg.style.width = `${(100 * v / total).toFixed(2)}%`;
      seg.style.background = c;
      seg.title = `${n}: ${money(v)}`;
      bar.append(seg);
    }
  }
  row.append(bar);
  return row;
}

export function initExposureCard({ container, getMode } = {}) {
  try {
    if (!container) return null;
    if (!document.querySelector('link[data-exposure-card]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = new URL('./exposure-card.css', import.meta.url).href;
      l.dataset.exposureCard = '';
      document.head.append(l);
    }
    const label = el('div', 'sec-label');
    label.append(el('span', null, 'Money at risk'), el('span', 'sec-aside', 'this week'));
    const body = el('div', 'ex-body');
    const legend = el('div', 'ex-legend');
    for (const [, n, c] of PARTS) {
      const it = el('span', 'ex-key');
      const sw = el('i'); sw.style.background = c;
      it.append(sw, document.createTextNode(n));
      legend.append(it);
    }
    const cap = el('div', 'caption', 'Price band is real market volatility; SLA, failure and overheat rates are assumed.');
    container.replaceChildren(label, body, legend, cap);

    const mode = () => (typeof getMode === 'function' ? getMode() : 'cloud') || 'cloud';
    let current = null, token = 0;
    async function refresh() {
      const m = mode();
      current = m;
      const t = ++token;
      try {
        const data = await postExposure(m);
        if (t !== token) return;
        const plans = data?.plans || {};
        const rows = [];
        if (plans.optimized) rows.push(planRow('ours', 'Our plan', plans.optimized));
        if (plans.asap) rows.push(planRow('asap', 'ASAP', plans.asap));
        if (!rows.length) throw new Error('no plans');
        body.replaceChildren(...rows);
        legend.hidden = false;
      } catch (e) {
        if (t !== token) return;
        body.replaceChildren(el('div', 'ex-off', 'Exposure unavailable (backend)'));
        legend.hidden = true;
      }
    }
    refresh();
    setInterval(() => { if (mode() !== current) refresh(); }, 1000);
    return { refresh };
  } catch (e) {
    console.warn('[exposure] init failed:', e);
    return null;
  }
}
