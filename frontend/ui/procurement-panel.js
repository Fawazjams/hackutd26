// "Replacement compute" panel: when an incident takes contracted GPUs down, our agent negotiates
// cover from other data centers. POST /procure -> animate research + negotiation in the
// hall -> offer card with Accept / Decline -> POST /procure/decision. Everything is SIMULATED.
// Every number shown comes from the /procure response (or the embedded FALLBACK of the same shape).

const TIMEOUT_MS = 20_000;
const ROUND_MS = 700;

// Offline sample, same shape as POST /procure.
const FALLBACK = {
  id: 'PR-INC1-offline', simulated: true,
  need: { equipment: 'CRAC-3', zone: 'Z3', racks: ['C01', 'C02', 'C03', 'C04', 'C05'], gpus: 160,
    gpu_hours: 336, start_label: 'Wed 14:00', end_label: 'Wed 17:00' },
  economics: { contract_rate: 3.25, sla_credit_rate: 0.10, breakeven_rate: 3.58, market_rate: 4.2 },
  providers: [
    { id: 'nebius', name: 'Nebius', region: 'Dallas, TX', uptime_pct: 99.95, gpus_available: 512, lead_time_hrs: 1 },
    { id: 'coreweave', name: 'CoreWeave', region: 'Phoenix, AZ', uptime_pct: 99.8, gpus_available: 256, lead_time_hrs: 2 },
  ],
  negotiations: [
    { provider_id: 'nebius', outcome: 'deal', final_price: 3.39, rounds: [
      { round: 1, from: 'seller', action: 'ask', price: 4.24 },
      { round: 1, from: 'buyer', action: 'counter', price: 3.29 },
      { round: 2, from: 'seller', action: 'counter', price: 3.39 },
      { round: 2, from: 'buyer', action: 'accept', price: 3.39 },
    ] },
    { provider_id: 'coreweave', outcome: 'no_deal', final_price: null, rounds: [
      { round: 1, from: 'seller', action: 'ask', price: 4.41 },
      { round: 1, from: 'buyer', action: 'counter', price: 3.29 },
      { round: 2, from: 'seller', action: 'counter', price: 3.97 },
      { round: 2, from: 'buyer', action: 'walk', price: null },
    ] },
  ],
  proposal: { id: 'P-INC1-offline', provider_id: 'nebius', provider_name: 'Nebius',
    price_per_gpu_hr: 3.39, gpu_hours: 336, total: 1139.04, cost_if_not_covered: 1201.2, savings: 62.16,
    reason: 'Lowest price under break-even; fastest delivery.', needs_approval: true, status: 'pending' },
};

// ---------- helpers ----------
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const usd = (v) => (v == null || isNaN(v) ? '—' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const rate = (v) => (v == null || isNaN(v) ? '—' : `$${Number(v).toFixed(2)}`);
const num = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US'));

const sameOrigin = location.protocol.startsWith('http') ? [''] : [];
const BASES = [...new Set([...sameOrigin, 'http://localhost:8000'])];
let workingBase = null;

async function postJSON(path, body) {
  const bases = workingBase !== null ? [workingBase, ...BASES.filter((b) => b !== workingBase)] : BASES;
  let lastErr;
  for (const base of bases) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
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
      if (e.name === 'AbortError') break;
    } finally { clearTimeout(timer); }
  }
  throw lastErr || new Error('backend unreachable');
}

// Call a hall method if it exists; otherwise wait `fallbackMs` so the sequence still reads well.
async function hallCall(getHall, name, args, fallbackMs = 0) {
  let hall = null;
  try { hall = getHall?.(); } catch { hall = null; }
  const fn = hall?.[name];
  if (typeof fn !== 'function') { if (fallbackMs) await sleep(fallbackMs); return undefined; }
  try { return await fn.apply(hall, args); } catch (e) {
    console.warn(`[procure] hall.${name} failed`, e);
    if (fallbackMs) await sleep(fallbackMs);
    return undefined;
  }
}

// ---------- panel ----------
export function initProcurementPanel(opts = {}) {
  try { return mount(opts); } catch (e) { console.warn('[procure] init failed:', e); return null; }
}

function mount({ container, getHall } = {}) {
  const root = typeof container === 'string' ? document.querySelector(container) : container;
  if (!root) { console.warn('[procure] no container'); return null; }

  if (!document.querySelector('link[data-procure-panel]')) {
    document.head.append(el('link', { rel: 'stylesheet', href: new URL('./procurement-panel.css', import.meta.url).href, 'data-procure-panel': true }));
  }

  const btn = el('button', { type: 'button', class: 'pc-btn', text: 'Source cover for INC1' });
  const reset = el('button', { type: 'button', class: 'pc-link', text: 'Reset', hidden: true });
  const status = el('div', { class: 'pc-status', role: 'status', 'aria-live': 'polite' });
  const body = el('div', { class: 'pc-body', 'aria-live': 'polite' });
  const ledger = el('ol', { class: 'pc-ledger' });
  const ledgerHead = el('summary', { class: 'pc-h', text: 'Ledger' });
  const ledgerWrap = el('details', { class: 'pc-ledger-wrap', hidden: true }, ledgerHead, ledger);

  const box = el('div', { class: 'pc-box' },
    el('div', { class: 'sec-label' }, el('span', { text: 'Replacement compute' })),
    el('div', { class: 'caption', text: 'When an incident takes contracted GPUs down, our agent negotiates cover from other data centers.' }),
    el('div', { class: 'pc-actions' }, btn, reset),
    status, body, ledgerWrap);
  root.replaceChildren(box);

  let busy = false, started = false, current = null, runId = 0;

  btn.addEventListener('click', () => run());
  reset.addEventListener('click', () => {
    runId++;
    busy = false; current = null;
    body.replaceChildren(); status.textContent = '';
    btn.disabled = false; reset.hidden = true;
    hallCall(getHall, 'hideProviders', []);
  });
  const auto = () => { if (!started) run(); };
  window.addEventListener('incident:done', auto);
  window.addEventListener('procure:start', auto);

  async function run() {
    if (busy) return;
    busy = true; started = true;
    const my = ++runId;
    btn.disabled = true; reset.hidden = false;
    body.replaceChildren();
    status.className = 'pc-status pc-wait';
    status.textContent = 'Asking other data centers for cover…';

    let r, offline = false;
    try { r = await postJSON('/procure', { incident_id: 'INC1' }); }
    catch (e) { console.warn('[procure] /procure failed, using offline sample:', e); r = FALLBACK; offline = true; }
    if (my !== runId) return;
    current = r;
    status.className = 'pc-status';
    status.textContent = offline ? 'Offline: showing a saved sample run.' : '';

    const n = r.need || {}, ec = r.economics || {};
    body.append(el('div', { class: 'pc-need' },
      el('b', { text: `Need: ${num(n.gpu_hours)} GPU-hours` }),
      el('span', { text: `, ${n.start_label || '?'}–${n.end_label || '?'}, break-even ${rate(ec.breakeven_rate)}/GPU-hr` }),
      el('div', { class: 'pc-sub', text: `${n.equipment || ''} down in ${n.zone || ''} (${num(n.gpus)} GPUs). Contract ${rate(ec.contract_rate)}/hr, market ${rate(ec.market_rate)}/hr.` })));

    const providers = Array.isArray(r.providers) ? r.providers : [];
    await hallCall(getHall, 'showProviders', [providers.map((p) => ({ id: p.id, name: p.name }))], 400);

    const byProv = new Map((r.negotiations || []).map((x) => [x.provider_id, x]));
    for (const p of providers) {
      if (my !== runId) return;
      const neg = byProv.get(p.id);
      const chat = el('ol', { class: 'pc-chat' });
      const outcome = el('span', { class: 'pc-outcome', text: 'negotiating…' });
      // open while the agents talk; folds to one line (click to reopen) once there's an outcome
      const card = el('details', { class: 'pc-card', 'data-state': 'talking', open: true },
        el('summary', { class: 'pc-card-head' }, el('b', { text: p.name }), outcome),
        el('div', { class: 'pc-facts', text: `${p.region}, ${p.uptime_pct}% uptime, ${num(p.gpus_available)} GPUs, ${p.lead_time_hrs} h lead time` }),
        chat);
      body.append(card);
      await hallCall(getHall, 'setProviderState', [p.id, 'talking']);
      await hallCall(getHall, 'sendNegotiator', [p.id], 900);
      for (const rd of neg?.rounds || []) {
        if (my !== runId) return;
        await sleep(ROUND_MS);
        chat.append(chatLine(rd, p));
      }
      const ok = neg?.outcome === 'deal';
      card.dataset.state = ok ? 'deal' : 'no_deal';
      outcome.textContent = ok ? `Deal, ${rate(neg.final_price)}/GPU-hr` : 'No deal, above break-even';
      card.open = false;
      await hallCall(getHall, 'setProviderState', [p.id, ok ? 'deal' : 'no_deal']);
      await hallCall(getHall, 'returnNegotiator', [], 900);
    }
    if (my !== runId) return;
    showOffer(r, offline);
    busy = false;
  }

  function chatLine(rd, p) {
    const who = rd.from === 'buyer' ? 'Our agent' : `${(p.name || '').split(' ')[0]} agent`;
    const what = rd.action === 'ask' ? `asks ${rate(rd.price)}`
      : rd.action === 'counter' ? `counter ${rate(rd.price)}`
      : rd.action === 'accept' ? `accept${rd.price != null ? ` ${rate(rd.price)}` : ''}`
      : rd.action === 'walk' ? 'walks away' : `${rd.action}${rd.price != null ? ` ${rate(rd.price)}` : ''}`;
    return el('li', { class: `pc-line pc-${rd.from === 'buyer' ? 'buyer' : 'seller'}` },
      el('span', { class: 'pc-who', text: `${who}:` }), el('span', { text: ` ${what}` }));
  }

  function showOffer(r, offline) {
    const pr = r.proposal;
    if (!pr) {
      body.append(el('div', { class: 'pc-offer pc-none', text: 'No offer under break-even. Paying the SLA credit is cheaper than buying cover.' }));
      return;
    }
    const decided = el('div', { class: 'pc-decided' });
    const accept = el('button', { type: 'button', class: 'pc-btn', text: 'Accept' });
    const decline = el('button', { type: 'button', class: 'pc-btn pc-ghost', text: 'Decline' });
    const actions = el('div', { class: 'pc-actions' }, accept, decline);
    const detail = el('div', { class: 'pc-offer-detail' },
      el('div', { class: 'pc-offer-math', text: `${rate(pr.price_per_gpu_hr)}/GPU-hr × ${num(pr.gpu_hours)} GPU-hours = ${usd(pr.total)}` }),
      el('div', { class: 'pc-offer-math' }, `vs ${usd(pr.cost_if_not_covered)} if not covered, `, el('b', { class: 'pc-save', text: `saves ${usd(pr.savings)}` })));
    const status = el('span', { class: 'pc-h', text: 'needs your approval' });
    const offer = el('div', { class: 'pc-offer', title: pr.reason || null },
      el('div', { class: 'pc-offer-top' },
        el('span', { class: 'pc-offer-name', text: pr.provider_name }), status),
      detail, actions, decided);
    body.append(offer);

    const decide = async (decision) => {
      accept.disabled = decline.disabled = true;
      decided.textContent = 'Recording…';
      let res = null;
      if (!offline) {
        try { res = await postJSON('/procure/decision', { proposal_id: pr.id, decision }); }
        catch (e) { console.warn('[procure] decision failed, recording locally:', e); }
      }
      const st = res?.status || (decision === 'accept' ? 'accepted' : 'declined');
      decided.textContent = st === 'accepted'
        ? `Accepted. ${pr.provider_name} covers ${num(pr.gpu_hours)} GPU-hours for ${usd(pr.total)}.`
        : `Declined. We pay the SLA credit instead.`;
      offer.dataset.status = st;
      status.textContent = st === 'accepted' ? 'Accepted' : 'Declined';
      detail.hidden = true; actions.hidden = true;   // the decision line says it all; keeps the column short
      const entries = Array.isArray(res?.ledger) ? res.ledger : [{ id: pr.id, provider_name: pr.provider_name, total: pr.total, status: st }];
      ledgerWrap.hidden = false;
      ledger.replaceChildren(...entries.map((e) =>
        el('li', { text: `${e.id || pr.id}: ${e.provider_name || pr.provider_name}, ${usd(e.total ?? pr.total)}, ${e.status || st}` })));
      ledgerHead.textContent = `Ledger (${entries.length})`;
      if (st === 'accepted') await hallCall(getHall, 'setProviderState', [pr.provider_id, 'deal']);
      else setTimeout(() => hallCall(getHall, 'hideProviders', []), 1500);
    };
    accept.addEventListener('click', () => decide('accept'));
    decline.addEventListener('click', () => decide('decline'));
  }

  return { run, element: box };
}
