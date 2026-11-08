// Week report: a full-screen engineering sheet comparing our plan with ASAP.
// Everything is computed from the plans, backlog and prices passed in. Hand-written SVG.

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const NS = 'http://www.w3.org/2000/svg';
let cssInjected = false;
let open = null;

const usd = (v) => '$' + Math.round(v || 0).toLocaleString('en-US');
const usdK = (v) => Math.abs(v) >= 1000 ? '$' + (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : '$' + Math.round(v);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hourLabel = (h) => `${DAYS[Math.min(6, Math.floor(h / 24))]} ${String(Math.floor(h % 24)).padStart(2, '0')}:00`;

function injectCss() {
  if (cssInjected || document.querySelector('link[data-report-css]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('./report.css', import.meta.url).href;
  l.dataset.reportCss = '1';
  document.head.appendChild(l);
  cssInjected = true;
}

// ---------- derived numbers ----------
function cumulative(plan) {
  const perHour = new Array(168).fill(0);
  for (const it of plan?.items || []) {
    const s = Math.max(0, it.start_hour), e = Math.min(168, Math.max(it.end_hour, s + 1));
    const n = e - s;
    for (let h = s; h < e; h++) perHour[h] += (it.total || 0) / n;
  }
  for (const o of plan?.overheats || []) perHour[Math.min(167, Math.max(0, Math.floor(o.hour)))] += o.cost || 0;
  const cum = [0];
  perHour.forEach((v, i) => cum.push(cum[i] + v));
  return { perHour, cum };
}
const perDay = (perHour) => DAYS.map((_, d) => perHour.slice(d * 24, d * 24 + 24).reduce((a, b) => a + b, 0));
const sum = (arr, f) => (arr || []).reduce((a, x) => a + (f(x) || 0), 0);
function categories(plan) {
  return {
    'Lost revenue': sum(plan?.items, (i) => i.downtime_cost),
    'SLA credits': sum(plan?.items, (i) => i.sla_cost),
    'Failure risk': sum(plan?.items, (i) => i.risk_cost),
    'Overheat outages': plan?.overheat_cost ?? sum(plan?.overheats, (o) => o.cost),
  };
}
function gpuHoursPerDay(plan) {
  const d = new Array(7).fill(0);
  for (const it of plan?.items || []) for (let h = it.start_hour; h < it.end_hour; h++) d[Math.min(6, Math.floor(h / 24))] += it.gpus_offline || 0;
  for (const o of plan?.overheats || []) d[Math.min(6, Math.floor(o.hour / 24))] += o.gpus_lost || 0;
  return d;
}
const overheatPerDay = (plan) => { const d = new Array(7).fill(0); (plan?.overheats || []).forEach((o) => d[Math.min(6, Math.floor(o.hour / 24))]++); return d; };

// ---------- svg helpers ----------
function svg(w, h, cls) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', `0 0 ${w} ${h}`);
  s.setAttribute('class', cls || '');
  s.setAttribute('preserveAspectRatio', 'none');
  return s;
}
function el(parent, tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  parent.appendChild(e);
  return e;
}
function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
// bar path with 4px rounded top, square at baseline
function barPath(x, y, w, h, r = 3) {
  if (h <= 0) return '';
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function sparkline(values, color, { w = 120, h = 28, area = false } = {}) {
  const s = svg(w, h, 'rp-spark');
  s.setAttribute('aria-hidden', 'true');
  const max = Math.max(...values, 1e-9), min = Math.min(0, ...values);
  const xs = (i) => 1 + (i / Math.max(1, values.length - 1)) * (w - 2);
  const ys = (v) => h - 2 - ((v - min) / (max - min || 1)) * (h - 4);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join('');
  if (area) el(s, 'path', { d: `${d}L${xs(values.length - 1)},${h}L${xs(0)},${h}Z`, fill: color, opacity: 0.12 });
  el(s, 'path', { d, fill: 'none', stroke: color, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' });
  return s;
}
function sparkBars(values, color, { w = 120, h = 28 } = {}) {
  const s = svg(w, h, 'rp-spark');
  s.setAttribute('aria-hidden', 'true');
  const max = Math.max(...values, 1e-9), bw = w / values.length;
  values.forEach((v, i) => {
    const bh = Math.max(v > 0 ? 2 : 1, (v / max) * (h - 2));
    el(s, 'rect', { x: i * bw + 1, y: h - bh, width: bw - 2, height: bh, rx: 1, fill: v > 0 ? color : 'var(--ink-4)', opacity: v > 0 ? 1 : 0.5 });
  });
  return s;
}

// ---------- tooltip ----------
function tooltip(root) {
  const tip = document.createElement('div');
  tip.className = 'rp-tip';
  tip.hidden = true;
  root.appendChild(tip);
  return {
    show(html, ev) {
      tip.innerHTML = html; tip.hidden = false;
      const r = root.getBoundingClientRect();
      let x = ev.clientX - r.left + 14, y = ev.clientY - r.top + root.scrollTop + 14;
      if (x + 240 > r.width) x -= 260;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    },
    hide() { tip.hidden = true; },
  };
}

// ---------- charts ----------
function cumulativeChart(ours, asap, plans, tip) {
  const W = 1220, H = 320, L = 56, R = 16, T = 14, B = 28;
  const s = svg(W, H, 'rp-chart');
  s.setAttribute('role', 'img');
  s.setAttribute('aria-label', `Cumulative cost over the week. Our plan ends at ${usd(ours.cum[168])}, ASAP at ${usd(asap.cum[168])}.`);
  const max = niceMax(Math.max(ours.cum[168], asap.cum[168]));
  const x = (h) => L + (h / 168) * (W - L - R), y = (v) => T + (1 - v / max) * (H - T - B);
  for (let i = 0; i <= 5; i++) {
    const v = (max / 5) * i;
    el(s, 'line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: i ? 'rp-grid' : 'rp-base' });
    el(s, 'text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'rp-axis' }, usdK(v));
  }
  DAYS.forEach((d, i) => {
    if (i) el(s, 'line', { x1: x(i * 24), x2: x(i * 24), y1: T, y2: H - B, class: 'rp-grid rp-grid-v' });
    el(s, 'text', { x: x(i * 24 + 12), y: H - 8, 'text-anchor': 'middle', class: 'rp-axis' }, d);
  });
  const line = (cum) => cum.map((v, h) => `${h ? 'L' : 'M'}${x(h).toFixed(1)},${y(v).toFixed(1)}`).join('');
  el(s, 'path', { d: line(asap.cum), class: 'rp-line', stroke: 'var(--asap)' });
  el(s, 'path', { d: line(ours.cum), class: 'rp-line', stroke: 'var(--ours)' });
  // overheat markers on the ASAP line, one per hour that had any
  const ohHours = {};
  (plans.asap?.overheats || []).forEach((o) => { (ohHours[o.hour] ||= []).push(o); });
  for (const h in ohHours) {
    const hh = +h + 1;
    const c = el(s, 'circle', { cx: x(hh), cy: y(asap.cum[Math.min(168, hh)]), r: 4.5, class: 'rp-oh' });
    c.addEventListener('mousemove', (ev) => tip.show(`<b>Overheat, ${hourLabel(+h)}</b>` + ohHours[h].map((o) => `<div>${esc(o.zone)}: ${o.temp_c.toFixed(1)} °C, ${o.gpus_lost} GPUs lost, ${usd(o.cost)}</div>`).join(''), ev));
    c.addEventListener('mouseleave', tip.hide);
  }
  // end labels
  const endLbl = (cum, cls, other) => {
    let yy = y(cum[168]);
    const yo = y(other[168]);
    if (Math.abs(yy - yo) < 14) yy += cum[168] > other[168] ? -7 : 7;
    el(s, 'text', { x: W - R - 4, y: yy - 6, 'text-anchor': 'end', class: 'rp-endlbl ' + cls }, usd(cum[168]));
  };
  endLbl(asap.cum, '', ours.cum);
  endLbl(ours.cum, '', asap.cum);
  // crosshair
  const cross = el(s, 'line', { y1: T, y2: H - B, class: 'rp-cross', visibility: 'hidden' });
  const hit = el(s, 'rect', { x: L, y: T, width: W - L - R, height: H - T - B, fill: 'transparent' });
  hit.addEventListener('mousemove', (ev) => {
    const r = s.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const h = Math.max(0, Math.min(168, Math.round(((px - L) / (W - L - R)) * 168)));
    cross.setAttribute('x1', x(h)); cross.setAttribute('x2', x(h)); cross.setAttribute('visibility', 'visible');
    tip.show(`<b>By ${hourLabel(Math.min(167, h))}</b><div><i class="sw sw-ours"></i>Our plan ${usd(ours.cum[h])}</div><div><i class="sw sw-asap"></i>ASAP ${usd(asap.cum[h])}</div>`, ev);
  });
  hit.addEventListener('mouseleave', () => { cross.setAttribute('visibility', 'hidden'); tip.hide(); });
  return s;
}

function groupedBars(labels, a, b, tip, { W = 600, H = 260, ariaLabel = '' } = {}) {
  const L = 52, R = 8, T = 18, B = 34;
  const s = svg(W, H, 'rp-chart');
  s.setAttribute('role', 'img');
  s.setAttribute('aria-label', ariaLabel);
  const max = niceMax(Math.max(...a, ...b));
  const y = (v) => T + (1 - v / max) * (H - T - B);
  for (let i = 0; i <= 5; i++) {
    const v = (max / 5) * i;
    el(s, 'line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: i ? 'rp-grid' : 'rp-base' });
    el(s, 'text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'rp-axis' }, usdK(v));
  }
  const gw = (W - L - R) / labels.length, bw = Math.min(26, (gw - 14) / 2);
  labels.forEach((lab, i) => {
    const cx = L + gw * i + gw / 2;
    [[a[i], 'var(--ours)', 'Our plan', cx - bw - 1], [b[i], 'var(--asap)', 'ASAP', cx + 1]].forEach(([v, col, name, bx]) => {
      const p = el(s, 'path', { d: barPath(bx, y(v), bw, y(0) - y(v)), fill: col });
      const hit = el(s, 'rect', { x: bx - 2, y: T, width: bw + 4, height: H - T - B, fill: 'transparent' });
      hit.addEventListener('mousemove', (ev) => { p.setAttribute('opacity', 0.8); tip.show(`<b>${esc(lab)}</b><div><i class="sw" style="background:${col}"></i>${name} ${usd(v)}</div>`, ev); });
      hit.addEventListener('mouseleave', () => { p.removeAttribute('opacity'); tip.hide(); });
    });
    el(s, 'text', { x: cx, y: H - 12, 'text-anchor': 'middle', class: 'rp-axis rp-axis-x' }, lab);
  });
  return s;
}

// ---------- build ----------
function build({ plans, backlog, prices, mode }, { inline = false } = {}) {
  const ours = plans?.optimized || { items: [], overheats: [], total_cost: 0 };
  const asap = plans?.asap || { items: [], overheats: [], total_cost: 0 };
  const co = cumulative(ours), ca = cumulative(asap);
  const oursTotal = ours.total_cost ?? co.cum[168], asapTotal = asap.total_cost ?? ca.cum[168];
  const saved = asapTotal - oursTotal, savedPct = asapTotal ? (saved / asapTotal) * 100 : 0;
  const gpuO = gpuHoursPerDay(ours), gpuA = gpuHoursPerDay(asap);
  const gpuOT = gpuO.reduce((x, y) => x + y, 0), gpuAT = gpuA.reduce((x, y) => x + y, 0);
  const pr = (prices || []).map((p) => p.price);
  const avgPrice = pr.length ? pr.reduce((x, y) => x + y, 0) / pr.length : 0;
  const cloud = !/priv/i.test(String(mode || 'cloud'));
  const title = cloud ? 'Week report, GPU cloud' : 'Week report, private DC';
  const firstDate = prices?.[0]?.date, lastDate = prices?.[prices.length - 1]?.date;
  const savedCum = co.cum.map((v, i) => ca.cum[i] - v);

  const nO = ours.overheats?.length || 0, nA = asap.overheats?.length || 0;
  const ohPhrase = nO === 0 ? 'with no overheats' : `with ${nO} overheated zone-hour${nO === 1 ? '' : 's'} against ${nA}`;
  const summary = saved >= 0
    ? `Our plan costs ${usd(oursTotal)} against ${usd(asapTotal)} for ASAP, saving ${usd(saved)}, ${ohPhrase}.`
    : `Our plan costs ${usd(oursTotal)} against ${usd(asapTotal)} for ASAP, ${usd(-saved)} more, ${ohPhrase}.`;

  const root = document.createElement('div');
  if (inline) {
    root.className = 'rp-inline';
    root.setAttribute('aria-labelledby', 'rp-title-inline');
  } else {
    root.className = 'rp-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'rp-title');
  }
  const head = inline ? `
    <header class="rp-head rp-head-inline">
      <div>
        <h1 id="rp-title-inline">The week's bottom line</h1>
        <p class="rp-summary">${esc(summary)}</p>
        <div class="rp-sub">${firstDate ? `Week of ${esc(firstDate)} to ${esc(lastDate)}, ` : ''}${cloud ? 'GPU cloud' : 'private DC'}, ${(backlog || []).length} jobs in the backlog.</div>
      </div>
      <div class="rp-actions"><button type="button" class="rp-btn" data-act="print">Print</button></div>
    </header>` : `
    <header class="rp-head">
      <div>
        <div class="rp-kicker">Maintenance schedule, sheet 1 of 1</div>
        <h1 id="rp-title">${title}</h1>
        <div class="rp-sub">${firstDate ? `Week of ${esc(firstDate)} to ${esc(lastDate)}. ` : ''}${(backlog || []).length} jobs in the backlog, our plan against doing everything as soon as possible.</div>
      </div>
      <div class="rp-actions">
        <button type="button" class="rp-btn" data-act="print">Print</button>
        <button type="button" class="rp-close" data-act="close" aria-label="Close report">×</button>
      </div>
    </header>`;
  root.innerHTML = `
  <div class="rp-sheet">${head}
    <section class="rp-kpis" aria-label="Headline numbers"></section>
    <section class="rp-grid2">
      <figure class="rp-card rp-wide" data-fig="cum">
        <figcaption><h2>Cumulative cost over the week</h2>
          <div class="rp-legend"><span><i class="sw sw-ours"></i>Our plan</span><span><i class="sw sw-asap"></i>ASAP</span><span><i class="sw-dot"></i>Overheat event</span></div></figcaption>
      </figure>
      <figure class="rp-card" data-fig="cat">
        <figcaption><h2>Cost by category</h2>
          <div class="rp-legend"><span><i class="sw sw-ours"></i>Our plan</span><span><i class="sw sw-asap"></i>ASAP</span></div></figcaption>
      </figure>
      <figure class="rp-card" data-fig="day">
        <figcaption><h2>Spend per day</h2>
          <div class="rp-legend"><span><i class="sw sw-ours"></i>Our plan</span><span><i class="sw sw-asap"></i>ASAP</span></div></figcaption>
      </figure>
    </section>
    <section class="rp-card rp-tablecard">
      <h2>Jobs, our plan against ASAP</h2>
      <div class="rp-tablewrap"><table class="rp-table"></table></div>
    </section>
    <section class="rp-card rp-note">
      <h2>How these numbers are made</h2>
      <p>Cost per hour of a job is GPUs offline × share of them busy × the H100 price that day${cloud ? ' × the SLA credit factor' : ''}, plus the failure risk of waiting, which grows each day a job is put off.</p>
      <p>Overheats are simulated per zone and hour. Each overheated zone-hour is priced as an unplanned outage of the GPUs it takes down, at an assumed outage rate.</p>
      <p>Prices: GetDeploying weekly H100 on-demand history (CC BY 4.0), with our daily forecast for this week. Average this week ${avgPrice ? '$' + avgPrice.toFixed(2) + ' per GPU-hour' : 'unavailable'}.</p>
    </section>
  </div>`;
  const tip = tooltip(root);

  // KPI tiles
  const kpis = root.querySelector('.rp-kpis');
  const tile = (label, value, sub, spark, cls = '') => {
    const t = document.createElement('div');
    t.className = 'rp-kpi ' + cls;
    t.innerHTML = `<div class="rp-kpi-l">${label}</div><div class="rp-kpi-v">${value}</div><div class="rp-kpi-s">${sub}</div>`;
    if (spark) t.appendChild(spark);
    kpis.appendChild(t);
  };
  tile('Our plan total', usd(oursTotal), `${ours.items?.length || 0} jobs scheduled`, sparkline(co.cum, 'var(--ours)', { area: true }), 'k-ours');
  tile('ASAP total', usd(asapTotal), `${asap.items?.length || 0} jobs, all at once`, sparkline(ca.cum, 'var(--asap)', { area: true }), 'k-asap');
  tile('Saved', usd(saved), `${savedPct.toFixed(1)}% less than ASAP`, sparkline(savedCum, 'var(--ours)'));
  tile('Overheats', `${ours.overheats?.length || 0} <span class="rp-vs">vs ${asap.overheats?.length || 0}</span>`, 'zone-hours, ours vs ASAP, by day', sparkBars(overheatPerDay(asap), 'var(--asap)'));
  tile('GPU-hours offline', Math.round(gpuOT).toLocaleString('en-US'), `ASAP ${Math.round(gpuAT).toLocaleString('en-US')}, ours by day`, sparkBars(gpuO, 'var(--ours)'));
  tile('H100 price this week', avgPrice ? '$' + avgPrice.toFixed(2) : 'n/a', pr.length ? `per GPU-hour, $${Math.min(...pr).toFixed(2)} to $${Math.max(...pr).toFixed(2)}` : 'no price data', pr.length ? sparkline(pr, 'var(--ink-2)') : null);

  // charts
  root.querySelector('[data-fig="cum"]').appendChild(cumulativeChart(co, ca, plans || {}, tip));
  const catO = categories(ours), catA = categories(asap), catK = Object.keys(catO);
  root.querySelector('[data-fig="cat"]').appendChild(groupedBars(catK, catK.map((k) => catO[k]), catK.map((k) => catA[k]), tip, { ariaLabel: 'Cost by category, our plan against ASAP' }));
  const dO = perDay(co.perHour), dA = perDay(ca.perHour);
  root.querySelector('[data-fig="day"]').appendChild(groupedBars(DAYS, dO, dA, tip, { ariaLabel: 'Spend per day, our plan against ASAP' }));

  // table
  const asapBy = Object.fromEntries((asap.items || []).map((i) => [i.task_id, i]));
  const ids = [...new Set([...(ours.items || []).map((i) => i.task_id), ...(asap.items || []).map((i) => i.task_id)])];
  const oursBy = Object.fromEntries((ours.items || []).map((i) => [i.task_id, i]));
  const bl = Object.fromEntries((backlog || []).map((t) => [t.id, t]));
  ids.sort((p, q) => (oursBy[p]?.start_hour ?? 999) - (oursBy[q]?.start_hour ?? 999));
  let rows = '', tO = 0, tA = 0;
  for (const id of ids) {
    const o = oursBy[id], a = asapBy[id], t = bl[id] || {};
    const oc = o?.total || 0, ac = a?.total || 0, diff = oc - ac;
    tO += oc; tA += ac;
    rows += `<tr><td><span class="rp-job">${esc(o?.name || a?.name || t.name || id)}</span><span class="rp-meta">${esc(t.equipment || '')}${t.duration_hrs ? `, ${t.duration_hrs} h` : ''}</span></td>
      <td>${esc(o?.zone || a?.zone || t.zone || '')}</td><td>${o ? esc(o.start_label) : 'not scheduled'}</td><td>${a ? esc(a.start_label) : 'not scheduled'}</td>
      <td class="n">${usd(oc)}</td><td class="n">${usd(ac)}</td><td class="n ${diff < 0 ? 'good' : diff > 0 ? 'bad' : ''}">${diff < 0 ? '−' : diff > 0 ? '+' : ''}${usd(Math.abs(diff))}</td></tr>`;
  }
  const ohO = ours.overheat_cost || 0, ohA = asap.overheat_cost || 0;
  rows += `<tr class="rp-oh-row"><td><span class="rp-job">Overheat outages</span><span class="rp-meta">${ours.overheats?.length || 0} vs ${asap.overheats?.length || 0} zone-hours</span></td><td></td><td></td><td></td><td class="n">${usd(ohO)}</td><td class="n">${usd(ohA)}</td><td class="n ${ohO - ohA < 0 ? 'good' : ''}">${ohO - ohA < 0 ? '−' : ohO - ohA > 0 ? '+' : ''}${usd(Math.abs(ohO - ohA))}</td></tr>`;
  root.querySelector('.rp-table').innerHTML = `<thead><tr><th>Job</th><th>Zone</th><th>Our start</th><th>ASAP start</th><th class="n">Our cost</th><th class="n">ASAP cost</th><th class="n">Difference</th></tr></thead>
    <tbody>${rows}</tbody><tfoot><tr><td>Week total</td><td></td><td></td><td></td><td class="n">${usd(oursTotal)}</td><td class="n">${usd(asapTotal)}</td><td class="n good">−${usd(saved)}</td></tr></tfoot>`;
  return root;
}

export function closeReport() {
  if (!open) return;
  const { root, onKey, prevFocus } = open;
  document.removeEventListener('keydown', onKey, true);
  root.remove();
  document.body.classList.remove('rp-printing');
  open = null;
  prevFocus?.focus?.();
}

function printInline(root) {
  document.querySelectorAll('.rp-print-target').forEach((n) => n.classList.remove('rp-print-target'));
  root.classList.add('rp-print-target');
  document.body.classList.add('rp-printing-inline');
  const done = () => { document.body.classList.remove('rp-printing-inline'); root.classList.remove('rp-print-target'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}

// Render the dashboard inline inside `host`. Safe to call again to refresh.
export function renderReport(host, { plans, backlog, prices, mode } = {}) {
  if (!host) return null;
  injectCss();
  const root = build({ plans, backlog, prices, mode }, { inline: true });
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-act]')?.dataset.act === 'print') printInline(root);
  });
  host.replaceChildren(root);
  return root;
}

export function openReport({ plans, backlog, prices, mode } = {}) {
  injectCss();
  closeReport();
  const root = build({ plans, backlog, prices, mode });
  document.body.appendChild(root);
  document.body.classList.add('rp-printing');
  const prevFocus = document.activeElement;
  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') closeReport();
    else if (act === 'print') window.print();
  });
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeReport(); return; }
    if (e.key === 'Tab') {
      const f = [...root.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])')].filter((n) => !n.disabled);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!root.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', onKey, true);
  open = { root, onKey, prevFocus };
  root.querySelector('.rp-close').focus();
  return closeReport;
}
