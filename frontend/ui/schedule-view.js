// Full-page "Schedule" view: what runs when (our plan vs ASAP), and why.
// renderSchedule(el, { plans, backlog, mode, now }) replaces el's content; safe to call repeatedly.

const CSS_ID = 'schedule-view-css';
function ensureCss() {
  if (document.getElementById(CSS_ID)) return;
  const l = document.createElement('link');
  l.id = CSS_ID; l.rel = 'stylesheet';
  l.href = new URL('./schedule-view.css', import.meta.url).href;
  document.head.appendChild(l);
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (v) => (v < 0 ? '−' : '') + '$' + Math.round(Math.abs(v)).toLocaleString('en-US');
const zn = (z) => parseInt(String(z).replace(/\D/g, ''), 10);
const near = (a, b) => Math.abs(zn(a) - zn(b)) <= 1;
const overlaps = (a, b) => a.start_hour < b.end_hour && b.start_hour < a.end_hour;
const hourLabel = (h) => `${DAYS[Math.floor(h / 24) % 7]} ${String(h % 24).padStart(2, '0')}:00`;

function why(ours, asap, asapPlan, oursPlan, backlog) {
  if (!ours || !asap) return ours ? 'Only in our plan' : 'Only in ASAP';
  const eq = (id) => backlog.find((t) => t.id === id)?.equipment;
  const parts = [];
  const heats = (asapPlan.overheats || []).filter((o) => o.hour >= asap.start_hour && o.hour < asap.end_hour && near(o.zone, asap.zone));
  const asapPeers = asapPlan.items.filter((o) => o.task_id !== asap.task_id && overlaps(o, asap) && near(o.zone, asap.zone));
  const avoided = asapPeers.filter((p) => {
    const op = oursPlan.items.find((o) => o.task_id === p.task_id);
    return !op || !overlaps(op, ours);
  });
  if (avoided.length && heats.length) parts.push(`Avoids running with ${avoided.map((p) => eq(p.task_id) || p.name).slice(0, 2).join(' and ')}`);
  if (heats.length) parts.push(`ASAP overheats ${[...new Set(heats.map((h) => h.zone))].sort().join('/')}`);
  if (parts.length) return parts.join('; ');
  if (ours.start_hour === asap.start_hour) return 'Same time in both';
  const d = asap.total - ours.total;
  if (d > 1) return 'Cheaper hours';
  if (d < -1) return 'Costs a little more, frees the hall elsewhere';
  return 'Different hour, same cost';
}

export function renderSchedule(el, { plans, backlog = [], mode, now } = {}) {
  ensureCss();
  const ours = plans?.optimized || { items: [], overheats: [], unscheduled: [] };
  const asap = plans?.asap || { items: [], overheats: [], unscheduled: [] };
  const byId = (p) => Object.fromEntries((p.items || []).map((i) => [i.task_id, i]));
  const O = byId(ours), A = byId(asap);
  const ids = [...new Set([...backlog.map((t) => t.id), ...Object.keys(O), ...Object.keys(A)])]
    .filter((id) => O[id] || A[id])
    .sort((a, b) => (O[a]?.start_hour ?? A[a]?.start_hour ?? 999) - (O[b]?.start_hour ?? A[b]?.start_hour ?? 999));
  const task = (id) => backlog.find((t) => t.id === id) || {};
  const nameOf = (id) => O[id]?.name || A[id]?.name || task(id).name || id;
  const zoneOf = (id) => O[id]?.zone || A[id]?.zone || task(id).zone || '';

  // ---- timeline geometry
  const W = 1120, LABEL = 250, PADR = 16, ROW = 40, TOP = 34, HEAT = 34;
  const plotW = W - LABEL - PADR;
  const x = (h) => LABEL + (h / 168) * plotW;
  const H = TOP + HEAT + ids.length * ROW + 8;
  let svg = `<svg class="sv-tl" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Week timeline, our plan versus ASAP">`;
  for (let d = 0; d < 7; d++) {
    if (d % 2 === 1) svg += `<rect x="${x(d * 24)}" y="${TOP - 6}" width="${plotW / 7}" height="${H - TOP}" class="sv-band"/>`;
    svg += `<text x="${x(d * 24 + 12)}" y="18" class="sv-day" text-anchor="middle">${DAYS[d]}</text>`;
  }
  for (let h = 0; h <= 168; h += 6) {
    svg += `<line x1="${x(h)}" x2="${x(h)}" y1="${TOP - 6}" y2="${H}" class="${h % 24 ? 'sv-grid' : 'sv-grid-day'}"/>`;
  }
  // overheats row
  const hy = TOP + HEAT / 2;
  svg += `<text x="${LABEL - 14}" y="${hy + 5}" class="sv-rowlabel" text-anchor="end">ASAP overheats</text>`;
  const heatHours = {};
  for (const o of asap.overheats || []) (heatHours[o.hour] ||= []).push(o);
  for (const [h, list] of Object.entries(heatHours)) {
    const cx = x(+h + 0.5);
    const tip = `${hourLabel(+h)}: ${list.map((o) => `${o.zone} ${o.temp_c.toFixed(1)}°C`).join(', ')}, ${money(list.reduce((s, o) => s + o.cost, 0))} lost`;
    svg += `<g class="sv-heat"><title>${esc(tip)}</title><rect x="${cx - 6}" y="${hy - 12}" width="12" height="24" fill="transparent"/><path d="M${cx} ${hy - 7} L${cx + 5.5} ${hy + 5} L${cx - 5.5} ${hy + 5} Z"/></g>`;
  }
  if (!Object.keys(heatHours).length) svg += `<text x="${LABEL + 4}" y="${hy + 5}" class="sv-muted">None this week</text>`;
  // job rows
  ids.forEach((id, i) => {
    const y0 = TOP + HEAT + i * ROW;
    svg += `<line x1="0" x2="${W}" y1="${y0}" y2="${y0}" class="sv-rowrule"/>`;
    const nm = nameOf(id);
    svg += `<text x="0" y="${y0 + ROW / 2 + 5}" class="sv-name">${esc(nm.length > 27 ? nm.slice(0, 26) + '…' : nm)}<title>${esc(nm)}</title></text>`;
    svg += `<g transform="translate(${LABEL - 44},${y0 + ROW / 2 - 9})"><rect width="32" height="18" rx="9" class="sv-zchip z${zn(zoneOf(id))}"/><text x="16" y="13" text-anchor="middle" class="sv-zt">${esc(zoneOf(id))}</text></g>`;
    const bar = (it, cls, dy, label) => {
      if (!it) return '';
      const bx = x(it.start_hour), bw = Math.max(3, x(it.end_hour) - bx);
      return `<rect x="${bx}" y="${y0 + dy}" width="${bw}" height="8" rx="3" class="${cls}"><title>${esc(`${label}: ${it.start_label} to ${it.end_label}, ${money(it.total)}`)}</title></rect>`;
    };
    svg += bar(O[id], 'sv-ours', ROW / 2 - 10, 'Our plan') + bar(A[id], 'sv-asap', ROW / 2 + 2, 'ASAP');
  });
  svg += `<line x1="0" x2="${W}" y1="${H - 8}" y2="${H - 8}" class="sv-rowrule"/>`;
  if (Number.isFinite(now) && now >= 0 && now <= 168) {
    svg += `<line x1="${x(now)}" x2="${x(now)}" y1="${TOP - 8}" y2="${H - 8}" class="sv-now"/><text x="${x(now) + 5}" y="${TOP + 10}" class="sv-nowt">Now</text>`;
  }
  svg += '</svg>';

  // ---- table
  let rows = '', sumO = 0, sumA = 0;
  for (const id of ids) {
    const o = O[id], a = A[id];
    sumO += o?.total || 0; sumA += a?.total || 0;
    const diff = (a?.total || 0) - (o?.total || 0);
    const dcls = diff > 0.5 ? 'sv-save' : diff < -0.5 ? 'sv-more' : '';
    const dtxt = Math.abs(diff) < 0.5 ? '$0' : diff > 0 ? `${money(diff)} saved` : `${money(-diff)} more`;
    rows += `<tr><td>${esc(nameOf(id))}</td><td><span class="sv-chip z${zn(zoneOf(id))}">${esc(zoneOf(id))}</span></td>
      <td>${o ? esc(o.start_label) : 'Not scheduled'}</td><td>${a ? esc(a.start_label) : 'Not scheduled'}</td>
      <td class="num">${o ? money(o.total) : ''}</td><td class="num">${a ? money(a.total) : ''}</td>
      <td class="num ${dcls}">${dtxt}</td><td class="sv-why">${esc(why(o, a, asap, ours, backlog))}</td></tr>`;
  }
  const ohO = (ours.overheats || []).reduce((s, o) => s + o.cost, 0);
  const ohA = (asap.overheats || []).reduce((s, o) => s + o.cost, 0);
  const extra = (ohO || ohA) ? `<tr class="sv-sub"><td colspan="4">Overheat losses (GPUs throttled)</td><td class="num">${money(ohO)}</td><td class="num">${money(ohA)}</td>
      <td class="num ${ohA - ohO > 0.5 ? 'sv-save' : ohA - ohO < -0.5 ? 'sv-more' : ''}">${money(Math.abs(ohA - ohO))}${ohA > ohO ? ' saved' : ohA < ohO ? ' more' : ''}</td><td class="sv-why">${(asap.overheats || []).length} hot zone-hours under ASAP, ${(ours.overheats || []).length} under ours</td></tr>` : '';
  const totO = ours.total_cost ?? sumO + ohO, totA = asap.total_cost ?? sumA + ohA, totD = totA - totO;
  const total = `<tr class="sv-total"><td colspan="4">Week total</td><td class="num">${money(totO)}</td><td class="num">${money(totA)}</td>
    <td class="num ${totD > 0.5 ? 'sv-save' : totD < -0.5 ? 'sv-more' : ''}">${money(Math.abs(totD))} ${totD >= 0 ? 'saved' : 'more'}</td><td></td></tr>`;

  const uns = [...(ours.unscheduled || []).map((u) => ({ ...u, plan: 'Our plan' })), ...(asap.unscheduled || []).map((u) => ({ ...u, plan: 'ASAP' }))];
  const unsHtml = uns.length
    ? `<section class="sv-uns"><h2>Couldn't fit this week</h2><ul>${uns.map((u) => `<li><strong>${esc(nameOf(u.task_id) || u.task_id)}</strong> <span class="sv-muted">(${u.plan})</span>: ${esc(u.reason)}</li>`).join('')}</ul></section>`
    : `<p class="sv-muted sv-allfit">Every job fits in both plans this week.</p>`;

  el.innerHTML = `<div class="sv">
    <header class="sv-head"><h1>This week's schedule</h1>
      <p>Our plan picks the cheapest hours that keep the hall cool. ASAP starts everything Monday morning.</p>
      <div class="sv-legend"><span><i class="sv-k ours"></i>Our plan</span><span><i class="sv-k asap"></i>ASAP</span><span><i class="sv-k heat"></i>ASAP overheat hour</span>${Number.isFinite(now) ? '<span><i class="sv-k now"></i>Now</span>' : ''}${mode ? `<span class="sv-muted">Mode: ${esc(mode)}</span>` : ''}</div>
    </header>
    <div class="sv-card">${svg}</div>
    <div class="sv-card sv-tablewrap"><table class="sv-table"><thead><tr><th>Job</th><th>Zone</th><th>Our start</th><th>ASAP start</th><th class="num">Our cost</th><th class="num">ASAP cost</th><th class="num">Difference</th><th>Why</th></tr></thead>
      <tbody>${rows}${extra}${total}</tbody></table></div>
    ${unsHtml}
  </div>`;
}
