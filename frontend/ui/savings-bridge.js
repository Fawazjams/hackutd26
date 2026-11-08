// "Where the savings come from": a bridge (waterfall) from the ASAP week cost down to our plan's,
// one step per cost category, plus savings per job (diverging bars). Owner: Nandhan.
// renderBridge(el, { plans, mode }) — re-callable; numbers come straight from the two Plans.
import { eq, v, op } from './formula.js';

const NS = 'http://www.w3.org/2000/svg';
const usd = (v) => `$${Math.round(Math.abs(v)).toLocaleString('en-US')}`;
const sgn = (v) => (v > 0.5 ? '−' : v < -0.5 ? '+' : '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function el(tag, attrs = {}, parent, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  parent?.appendChild(n);
  return n;
}
const sum = (items, k) => items.reduce((s, i) => s + (Number(i[k]) || 0), 0);

function categories(plan) {
  const items = plan?.items || [];
  return {
    revenue: sum(items, 'downtime_cost'),
    sla: sum(items, 'sla_cost'),
    risk: sum(items, 'risk_cost'),
    overheat: Number(plan?.overheat_cost) || (plan?.overheats || []).reduce((s, o) => s + (o.cost || 0), 0),
  };
}

function bridgeChart(host, plans, cloud) {
  const a = categories(plans.asap), o = categories(plans.optimized);
  const steps = [
    ['Overheat outages avoided', a.overheat - o.overheat],
    [cloud ? 'Lost revenue' : 'Replacement rental', a.revenue - o.revenue],
    ...(cloud ? [['SLA credits', a.sla - o.sla]] : []),
    ['Failure risk of waiting', a.risk - o.risk],
  ];
  const W = Math.max(520, host.clientWidth || 900), H = 300, padL = 64, padR = 16, padT = 28, padB = 54;
  const cols = steps.length + 2, colW = (W - padL - padR) / cols, bw = Math.min(86, colW * 0.62);
  const max = Math.max(plans.asap.total_cost, plans.optimized.total_cost) * 1.08;
  const y = (v) => padT + (1 - v / max) * (H - padT - padB);
  const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `Bridge from the ASAP week cost ${usd(plans.asap.total_cost)} to our plan ${usd(plans.optimized.total_cost)}` }, host);
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i, yy = y(v);
    el('line', { x1: padL, x2: W - padR, y1: yy, y2: yy, class: 'br-grid' }, svg);
    el('text', { x: padL - 8, y: yy + 4, class: 'br-ax', 'text-anchor': 'end' }, svg, v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`);
  }
  const cx = (i) => padL + colW * i + colW / 2;
  const bar = (i, top, bot, cls, label, value) => {
    const y0 = y(Math.max(top, bot)), y1 = y(Math.min(top, bot));
    el('rect', { x: cx(i) - bw / 2, y: y0, width: bw, height: Math.max(2, y1 - y0), class: cls, rx: 2 }, svg);
    el('text', { x: cx(i), y: y0 - 7, class: 'br-val', 'text-anchor': 'middle' }, svg, value);
    const words = label.split(' '), lines = [];
    for (const w of words) { const last = lines[lines.length - 1]; if (last && (last + ' ' + w).length <= 14) lines[lines.length - 1] = last + ' ' + w; else lines.push(w); }
    lines.forEach((ln, k) => el('text', { x: cx(i), y: H - padB + 18 + k * 14, class: 'br-lab', 'text-anchor': 'middle' }, svg, ln));
  };
  let level = plans.asap.total_cost;
  bar(0, level, 0, 'br-asap', 'ASAP week', usd(level));
  steps.forEach(([label, d], k) => {
    const next = level - d;
    bar(k + 1, level, next, d >= 0 ? 'br-save' : 'br-cost', label, `${sgn(d)}${usd(d)}`);
    el('line', { x1: cx(k) + bw / 2, x2: cx(k + 1) - bw / 2, y1: y(level), y2: y(level), class: 'br-link' }, svg);
    level = next;
  });
  el('line', { x1: cx(steps.length) + bw / 2, x2: cx(steps.length + 1) - bw / 2, y1: y(level), y2: y(level), class: 'br-link' }, svg);
  bar(steps.length + 1, plans.optimized.total_cost, 0, 'br-ours', 'Our plan', usd(plans.optimized.total_cost));
  return steps;
}

function perJob(host, plans) {
  const a = new Map((plans.asap.items || []).map((i) => [i.task_id, i]));
  const rows = (plans.optimized.items || []).map((o) => {
    const x = a.get(o.task_id);
    return { name: o.name, zone: o.zone, d: x ? x.total - o.total : 0, ours: o.start_label, asap: x?.start_label || '—' };
  });
  const oh = (Number(plans.asap.overheat_cost) || 0) - (Number(plans.optimized.overheat_cost) || 0);
  if (Math.abs(oh) > 0.5) rows.push({ name: 'Overheat outages', zone: '', d: oh, ours: 'none', asap: `${(plans.asap.overheats || []).length} zone-hours` });
  rows.sort((p, q) => q.d - p.d);
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.d)));
  host.innerHTML = rows.map((r) => {
    const w = (Math.abs(r.d) / max) * 100;
    return `<div class="pj-row">
      <div class="pj-name">${esc(r.name)}${r.zone ? `<i class="pj-zone">${esc(r.zone)}</i>` : ''}<span class="pj-when">${esc(r.ours)} vs ${esc(r.asap)}</span></div>
      <div class="pj-track"><span class="pj-mid"></span><span class="pj-bar ${r.d >= 0 ? 'save' : 'cost'}" style="width:${(w / 2).toFixed(1)}%"></span></div>
      <div class="pj-val ${r.d >= 0 ? 'save' : 'cost'}">${r.d >= 0.5 ? `${usd(r.d)} saved` : r.d <= -0.5 ? `${usd(r.d)} more` : 'same'}</div>
    </div>`;
  }).join('');
}

export function renderBridge(root, { plans, mode } = {}) {
  if (!root || !plans?.optimized || !plans?.asap) return;
  const cloud = mode !== 'private';
  root.innerHTML = `
    <div class="br-grid2">
      <figure class="br-card">
        <figcaption><h3>From the ASAP bill to ours</h3>
          <p>Each step is one cost category: how much lower it is under our plan for the same jobs.</p></figcaption>
        <div class="br-chart"></div>
        <div data-eq="bridge"></div>
        <p class="br-take"></p>
      </figure>
      <figure class="br-card">
        <figcaption><h3>Savings by job</h3>
          <p>Green bars save money against ASAP; red ones cost a little more.</p></figcaption>
        <div class="pj"></div>
        <div data-eq="job"></div>
      </figure>
    </div>`;
  const steps = bridgeChart(root.querySelector('.br-chart'), plans, cloud);
  perJob(root.querySelector('.pj'), plans);
  const saved = plans.asap.total_cost - plans.optimized.total_cost;

  const sym = cloud ? ['O', 'D', 'S', 'R'] : ['O', 'D', 'R'];
  const terms = steps.map(([, d], i) => (i ? (d < -0.5 ? ' − ' : ' + ') : d < -0.5 ? '−' : '') + usd(d)).join('');
  root.querySelector('[data-eq="bridge"]').innerHTML = eq({
    n: 6, inset: true,
    f: `Δ${v('C')} ${op('=')} ${sym.map((s) => `Δ${v(s)}`).join(` ${op('+')} `)}`,
    plug: `${terms} = <b${saved < 0 ? ' class="bad"' : ''}>${saved < -0.5 ? '−' : ''}${usd(saved)}</b>`,
    where: `Each Δ is that category's ASAP cost minus ours, the steps of the bridge above.`,
  });
  const a = new Map((plans.asap.items || []).map((i) => [i.task_id, i]));
  const best = (plans.optimized.items || []).filter((o) => a.has(o.task_id))
    .sort((p, q) => (a.get(q.task_id).total - q.total) - (a.get(p.task_id).total - p.total))[0];
  if (best) {
    const x = a.get(best.task_id), d = x.total - best.total;
    root.querySelector('[data-eq="job"]').innerHTML = eq({
      n: 7, inset: true,
      f: `Δ${v('C', 'j')} ${op('=')} ${v('C', 'j', 'ASAP')}(${v('s', 'j', 'ASAP')}) ${op('−')} ${v('C', 'j', 'ours')}(${v('s', 'j', '*')})`,
      plug: `${esc(best.name)}: ${usd(x.total)} − ${usd(best.total)} = <b${d < 0 ? ' class="bad"' : ''}>${d < -0.5 ? '−' : ''}${usd(d)}</b>`,
      where: `${v('s', 'j')} is the job's start hour: ${esc(best.start_label)} in our plan, ${esc(x.start_label)} under ASAP.`,
    });
  }
  const big = steps.slice().sort((p, q) => q[1] - p[1])[0];
  root.querySelector('.br-take').innerHTML = saved > 0 && big
    ? `Biggest lever: <b>${esc(big[0].toLowerCase())}</b>, ${usd(big[1])} of the ${usd(saved)} saved (${Math.round((100 * big[1]) / saved)}%).`
    : '';
}
