// Price insights for the right sidebar: real H100 rental price history (GetDeploying, CC BY 4.0)
// with our 7-day forecast, this week's daily downtime rate, and a per-hour drill-down for one day.
// Everything plotted comes from GET /prices/history and GET /prices/hourly. Owner: Nandhan.
//
//   const pi = initPriceInsights(el, { getPlans, getMode });
//   pi.refresh();        // after plans or mode change
//   pi.setToday(d);      // 0..6, cheap; call every frame
//   pi.openDay(d);       // open the hour-by-hour panel (null closes it)

const NS = 'http://www.w3.org/2000/svg';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const FALLBACK = 'http://localhost:8000';

const usd = (v, d = 2) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const fmtDate = (iso, year = false) => new Date(iso + 'T12:00').toLocaleDateString('en-US',
  year ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function svgEl(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.appendChild(n);
  return n;
}
function txt(parent, x, y, s, cls, anchor = 'start') {
  const t = svgEl('text', { x, y, class: cls, 'text-anchor': anchor }, parent);
  t.textContent = s;
  return t;
}

async function api(path) {
  const tryOne = async (base) => {
    const r = await fetch(base + path);
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  };
  if (location.protocol.startsWith('http')) {
    try { return await tryOne(''); } catch (e) { if (location.origin === FALLBACK) throw e; }
  }
  return tryOne(FALLBACK);
}

/** Dollars each plan spends in each hour of `day` (item total spread evenly over its hours, plus overheats). */
export function spendByHour(plan, day) {
  const out = new Array(24).fill(0);
  if (!plan) return out;
  for (const it of plan.items || []) {
    const s = it.start_hour, e = it.end_hour, dur = Math.max(1e-6, e - s);
    for (let h = Math.floor(s); h < Math.ceil(e); h++) {
      if (Math.floor(h / 24) !== day) continue;
      const overlap = Math.min(e, h + 1) - Math.max(s, h);
      if (overlap > 0) out[h % 24] += (it.total * overlap) / dur;
    }
  }
  for (const o of plan.overheats || []) if (Math.floor(o.hour / 24) === day) out[o.hour % 24] += o.cost;
  return out;
}

function ensureCss() {
  if (document.querySelector('link[data-price-insights]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('./price-insights.css', import.meta.url).href;
  l.dataset.priceInsights = '';
  document.head.appendChild(l);
}

export function initPriceInsights(el, { getPlans = () => null, getMode = () => 'cloud' } = {}) {
  ensureCss();
  const S = { history: null, week: null, weekMode: null, hourly: new Map(), today: null, open: null, err: null, width: 0 };
  el.classList.add('pi');
  el.innerHTML = `
    <div class="pi-sec">
      <div class="pi-h"><span class="pi-t">H100 rental price, past year</span><span class="pi-big" data-latest></span></div>
      <div class="pi-sub" data-histsub>Median across providers, $ per GPU-hour</div>
      <div class="pi-chart" data-hist></div>
      <div class="pi-key" data-histkey></div>
      <div class="pi-read" data-histread aria-live="polite"></div>
    </div>
    <div class="pi-sec">
      <div class="pi-h"><span class="pi-t">This week's downtime rate</span></div>
      <div class="pi-sub">Daily average, $ per GPU-hour</div>
      <div class="pi-chart" data-week></div>
      <div class="pi-hint" data-weekhint>Pick a day to see it hour by hour.</div>
      <div class="pi-day" data-day hidden></div>
    </div>
    <p class="pi-src">Data: <a href="https://getdeploying.com/gpus" target="_blank" rel="noopener">GetDeploying, GPU rental price history</a>,
      <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>.
      The daily forecast is our model; hourly variation is the assumed share of GPUs busy.</p>`;
  const $ = (k) => el.querySelector(`[data-${k}]`);

  // ---------- (a) 52-week history + forecast ----------
  function drawHistory() {
    const box = $('hist');
    box.innerHTML = '';
    const h = S.history;
    if (!h) { box.innerHTML = `<div class="pi-empty">${S.err ? 'Price data unavailable.' : 'Loading prices…'}</div>`; return; }
    const weeks = h.weeks, fc = h.forecast, last = weeks[weeks.length - 1];
    $('latest').textContent = usd(last.median);
    $('histsub').textContent = `Median across ${last.providers} providers, $ per GPU-hour, log scale`;
    const W = Math.max(200, box.clientWidth || 300), H = 132, padL = 30, padR = 40, padT = 8, padB = 16;
    const t0 = Date.parse(weeks[0].date), t1 = Date.parse(fc[fc.length - 1].date);
    const x = (iso) => padL + ((Date.parse(iso) - t0) / (t1 - t0)) * (W - padL - padR);
    const lo = 0.8, hi = 16, L = Math.log;
    const y = (v) => padT + (1 - (L(Math.max(lo, Math.min(hi, v))) - L(lo)) / (L(hi) - L(lo))) * (H - padT - padB);
    const svg = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img',
      'aria-label': `H100 median rental price by week, ${fmtDate(weeks[0].date, true)} to ${fmtDate(last.date, true)}, from ${usd(weeks[0].median)} to ${usd(last.median)}; forecast ${usd(fc[fc.length - 1].price)} by ${fmtDate(fc[fc.length - 1].date)}` }, box);
    for (const v of [1, 2, 4, 8, 16]) {
      svgEl('line', { class: 'pi-grid', x1: padL, x2: W - padR, y1: y(v), y2: y(v) }, svg);
      txt(svg, padL - 5, y(v) + 3.5, `$${v}`, 'pi-ax', 'end');
    }
    // month ticks: first week of every third month
    let lastM = -1;
    weeks.forEach((w) => {
      const d = new Date(w.date + 'T12:00'), m = d.getMonth();
      if (m !== lastM && m % 3 === 1) {
        txt(svg, x(w.date), H - 3, d.toLocaleDateString('en-US', { month: 'short' }) + (m === 1 || lastM === -1 ? ` \u2019${String(d.getFullYear()).slice(2)}` : ''), 'pi-ax', 'middle');
      }
      lastM = m;
    });
    // provider min-max band (real)
    const band = weeks.map((w) => `${x(w.date)},${y(w.max)}`).concat(weeks.slice().reverse().map((w) => `${x(w.date)},${y(w.min)}`));
    svgEl('polygon', { class: 'pi-band', points: band.join(' ') }, svg);
    // forecast band (our model)
    const fpts = [{ date: last.date, price: last.median, low: last.median, high: last.median }, ...fc];
    const fband = fpts.map((f) => `${x(f.date)},${y(f.high)}`).concat(fpts.slice().reverse().map((f) => `${x(f.date)},${y(f.low)}`));
    svgEl('rect', { class: 'pi-fczone', x: x(last.date), y: padT, width: x(fc[fc.length - 1].date) - x(last.date), height: H - padT - padB }, svg);
    svgEl('polygon', { class: 'pi-fcband', points: fband.join(' ') }, svg);
    svgEl('polyline', { class: 'pi-line', points: weeks.map((w) => `${x(w.date)},${y(w.median)}`).join(' ') }, svg);
    svgEl('polyline', { class: 'pi-line pi-fcline', points: fpts.map((f) => `${x(f.date)},${y(f.price)}`).join(' ') }, svg);
    // labels: latest real value + end of forecast
    svgEl('circle', { class: 'pi-dot', cx: x(last.date), cy: y(last.median), r: 3.5 }, svg);
    const fEnd = fc[fc.length - 1];
    txt(svg, x(fEnd.date) + 4, y(fEnd.price) - 2, usd(fEnd.price), 'pi-lab pi-lab-fc');
    txt(svg, x(fEnd.date) + 4, y(fEnd.price) + 9, 'forecast', 'pi-ax');
    txt(svg, x(weeks[0].date) + 2, y(weeks[0].median) - 6, usd(weeks[0].median), 'pi-lab');

    $('histkey').innerHTML = `<span><i class="k-line"></i>Median</span><span><i class="k-band"></i>Cheapest to priciest provider</span><span><i class="k-fc"></i>Our forecast, 90% range</span>`;

    // hover: crosshair + readout
    const pts = weeks.map((w) => ({ kind: 'w', ...w })).concat(fc.map((f) => ({ kind: 'f', ...f })));
    const cross = svgEl('line', { class: 'pi-cross', x1: 0, x2: 0, y1: padT, y2: H - padB, visibility: 'hidden' }, svg);
    const hdot = svgEl('circle', { class: 'pi-hdot', r: 3.5, visibility: 'hidden' }, svg);
    const read = $('histread');
    const idle = () => { read.innerHTML = `Week of ${fmtDate(last.date, true)}: <b>${usd(last.median)}</b> median, ${usd(last.min)} to ${usd(last.max)} across ${last.providers} providers`; };
    idle();
    const hit = svgEl('rect', { class: 'pi-hit', x: padL, y: 0, width: W - padL - padR + 6, height: H }, svg);
    const show = (p) => {
      const cx = x(p.date), v = p.kind === 'w' ? p.median : p.price;
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
      hdot.setAttribute('cx', cx); hdot.setAttribute('cy', y(v)); hdot.setAttribute('visibility', 'visible');
      read.innerHTML = p.kind === 'w'
        ? `Week of ${fmtDate(p.date, true)}: <b>${usd(p.median)}</b> median, ${usd(p.min)} to ${usd(p.max)} across ${p.providers} providers`
        : `${DAYS[p.day]} ${fmtDate(p.date)}, forecast: <b>${usd(p.price)}</b>, likely ${usd(p.low)} to ${usd(p.high)}`;
    };
    hit.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect(), mx = e.clientX - r.left;
      let best = pts[0], bd = Infinity;
      for (const p of pts) { const d = Math.abs(x(p.date) - mx); if (d < bd) { bd = d; best = p; } }
      show(best);
    });
    hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); hdot.setAttribute('visibility', 'hidden'); idle(); });
  }

  // ---------- (b) this week's 7 daily bars ----------
  function drawWeek() {
    const box = $('week');
    box.innerHTML = '';
    if (!S.week) { box.innerHTML = `<div class="pi-empty">${S.err ? 'Rates unavailable.' : 'Loading rates…'}</div>`; return; }
    const W = Math.max(200, box.clientWidth || 300), H = 96, padT = 16, padB = 16;
    const max = Math.max(...S.week.map((d) => d.avg_rate)) * 1.08;
    const colW = W / 7, bw = Math.min(30, colW - 8);
    const y = (v) => padT + (1 - v / max) * (H - padT - padB);
    const svg = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': 'Average downtime rate per day this week' }, box);
    svgEl('line', { class: 'pi-base', x1: 0, x2: W, y1: H - padB + 0.5, y2: H - padB + 0.5 }, svg);
    S.week.forEach((d, i) => {
      const cx = i * colW + colW / 2, top = y(d.avg_rate), base = H - padB;
      const g = svgEl('g', { class: 'pi-dbar', tabindex: 0, role: 'button', 'data-i': i,
        'aria-label': `${DAY_NAMES[i]} ${fmtDate(d.date)}: average ${usd(d.avg_rate)} per GPU-hour. Press Enter for hourly detail.`,
        'aria-expanded': String(S.open === i) }, svg);
      svgEl('rect', { class: 'pi-dhit', x: i * colW, y: 0, width: colW, height: H }, g);
      const r = 4, x0 = cx - bw / 2;
      svgEl('path', { class: 'pi-dfill', d: `M${x0},${base}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + bw - r}Q${x0 + bw},${top} ${x0 + bw},${top + r}V${base}Z` }, g);
      txt(g, cx, top - 4, usd(d.avg_rate), 'pi-dval', 'middle');
      txt(g, cx, H - 3, DAYS[i], 'pi-dlab', 'middle');
      const open = () => api_openDay(S.open === i ? null : i);
      g.addEventListener('click', open);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
    paintWeekState();
  }
  function paintWeekState() {
    el.querySelectorAll('.pi-dbar').forEach((g) => {
      const i = +g.dataset.i;
      g.classList.toggle('today', i === S.today);
      g.classList.toggle('sel', i === S.open);
      g.setAttribute('aria-expanded', String(i === S.open));
      const lab = g.querySelector('.pi-dlab');
      if (lab) lab.textContent = i === S.today ? 'Today' : DAYS[i];
    });
    const hint = $('weekhint');
    if (hint) hint.hidden = S.open != null;
  }

  // ---------- (c) one day, hour by hour ----------
  function drawDay() {
    const box = $('day');
    if (S.open == null) { box.hidden = true; box.innerHTML = ''; return; }
    const data = S.hourly.get(`${getMode()}:${S.open}`);
    box.hidden = false;
    if (!data) { box.innerHTML = '<div class="pi-empty">Loading hours…</div>'; return; }
    const cloud = data.mode === 'cloud', slaMul = 1 + data.sla_factor;
    const plans = getPlans() || {};
    const ours = spendByHour(plans.optimized, data.day), asap = spendByHour(plans.asap, data.day);
    const sum = (a) => a.reduce((s, v) => s + v, 0);
    const hasPlans = !!(plans.optimized && plans.asap);
    const anySpend = hasPlans && (sum(ours) > 0 || sum(asap) > 0);
    box.innerHTML = `
      <div class="pi-dh">
        <span class="pi-t">${DAY_NAMES[data.day]} ${data.date ? fmtDate(data.date) : ''}, hour by hour</span>
        <button class="pi-x" type="button" aria-label="Close hourly detail">×</button>
      </div>
      <div class="pi-formula">${usd(data.market_price)} market price × share of GPUs busy${cloud ? ` × ${slaMul.toFixed(2)} SLA credits` : ''} = <b>${usd(data.avg_rate)}</b> average per GPU-hour</div>
      <div class="pi-chart" data-hrate></div>
      ${anySpend ? `<div class="pi-sub2">What each plan spent per hour</div><div class="pi-chart" data-hspend></div>` : hasPlans ? '<div class="pi-sub2">Neither plan takes GPUs offline this day.</div>' : ''}
      <div class="pi-read pi-hread" data-hread aria-live="polite"></div>
      ${hasPlans ? `<div class="pi-totals">
        <div><span class="sw sw-ours"></span>Our plan<b>${usd(sum(ours), 0)}</b></div>
        <div><span class="sw sw-asap"></span>ASAP<b>${usd(sum(asap), 0)}</b></div>
      </div>` : ''}
      <p class="pi-note">Market price is our forecast for this day (likely ${usd(data.low)} to ${usd(data.high)}); it moves hour to hour only through the assumed busy share.</p>`;
    box.querySelector('.pi-x').addEventListener('click', () => api_openDay(null));

    const W = Math.max(200, $('hrate').clientWidth || 300), padL = 34, padR = 6;
    const colW = (W - padL - padR) / 24;
    const cols = [];
    // rate: one bar per hour, from $0 so heights stay honest; cheapest and priciest hours labeled,
    // hours where a plan has GPUs down drawn in teal
    {
      const H = 104, padT = 16, padB = 14;
      const max = data.max_rate * 1.06;
      const y = (v) => padT + (1 - v / max) * (H - padT - padB);
      const svg = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img',
        'aria-label': `Cost per GPU-hour for each hour of ${DAY_NAMES[data.day]}, ${usd(data.min_rate)} to ${usd(data.max_rate)}` }, $('hrate'));
      svgEl('line', { class: 'pi-grid', x1: padL, x2: W - padR, y1: y(data.avg_rate), y2: y(data.avg_rate) }, svg);
      txt(svg, padL - 4, y(data.avg_rate) + 3.5, usd(data.avg_rate), 'pi-ax', 'end');
      txt(svg, padL - 4, y(0) + 3.5, '$0', 'pi-ax', 'end');
      for (let i = 0; i < 24; i += 6) txt(svg, padL + i * colW + colW / 2, H - 2, `${String(i).padStart(2, '0')}:00`, 'pi-ax', 'middle');
      const band = svgEl('g', {}, svg);
      const iMin = data.hours.findIndex((r) => r.rate === data.min_rate);
      const iMax = data.hours.findIndex((r) => r.rate === data.max_rate);
      data.hours.forEach((r, i) => {
        const x = padL + i * colW, bw = Math.max(2, colW - 2);
        const hl = svgEl('rect', { class: 'pi-hcol', x, y: padT - 6, width: colW, height: H - padT - padB + 6 }, band);
        const busy = anySpend && (ours[i] > 0 || asap[i] > 0);
        const bar = svgEl('rect', { class: `pi-rbar${busy ? ' busy' : ''}`, x: x + 1, y: y(r.rate), width: bw,
          height: Math.max(1, y(0) - y(r.rate)), rx: 1.5 }, svg);
        if (i === iMin || i === iMax) txt(svg, x + colW / 2, y(r.rate) - 4, usd(r.rate), 'pi-blab', 'middle');
        cols[i] = [hl, bar];
      });
      svgEl('line', { class: 'pi-base', x1: padL, x2: W - padR, y1: y(0) + 0.5, y2: y(0) + 0.5 }, svg);
      addHits(svg, H);
    }
    // spend: grouped bars from zero, ours vs ASAP
    if (anySpend) {
      const H = 66, padT = 4, padB = 15;
      const max = Math.max(1, ...ours, ...asap);
      const y = (v) => padT + (1 - v / max) * (H - padT - padB);
      const svg = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img',
        'aria-label': `Spend per hour on ${DAY_NAMES[data.day]}: our plan ${usd(sum(ours), 0)}, ASAP ${usd(sum(asap), 0)}` }, $('hspend'));
      svgEl('line', { class: 'pi-grid', x1: padL, x2: W - padR, y1: y(max), y2: y(max) }, svg);
      txt(svg, padL - 4, y(max) + 3.5, `$${Math.round(max).toLocaleString('en-US')}`, 'pi-ax', 'end');
      txt(svg, padL - 4, H - padB + 3.5, '$0', 'pi-ax', 'end');
      const band = svgEl('g', {}, svg);
      const bw = Math.max(1.5, (colW - 3) / 2);
      for (let i = 0; i < 24; i++) {
        const x0 = padL + i * colW + (colW - (bw * 2 + 1)) / 2;
        const hl = svgEl('rect', { class: 'pi-hcol', x: padL + i * colW, y: 0, width: colW, height: H - padB }, band);
        cols[i].push(hl);
        for (const [v, cls, off] of [[ours[i], 'pi-sb-ours', 0], [asap[i], 'pi-sb-asap', bw + 1]]) {
          if (v <= 0) continue;
          const top = y(v), base = H - padB, r = Math.min(2, (base - top) / 2, bw / 2), xa = x0 + off;
          svgEl('path', { class: cls, d: `M${xa},${base}V${top + r}Q${xa},${top} ${xa + r},${top}H${xa + bw - r}Q${xa + bw},${top} ${xa + bw},${top + r}V${base}Z` }, svg);
        }
      }
      svgEl('line', { class: 'pi-base', x1: padL, x2: W - padR, y1: H - padB + 0.5, y2: H - padB + 0.5 }, svg);
      for (let i = 0; i < 24; i += 6) txt(svg, padL + i * colW + colW / 2, H - 1, `${String(i).padStart(2, '0')}:00`, 'pi-ax', 'middle');
      addHits(svg, H);
    }

    const read = $('hread');
    const idle = () => { read.innerHTML = 'Point at an hour to see how its rate is built.'; };
    idle();
    let cur = -1;
    function show(i) {
      if (cur >= 0) cols[cur].forEach((n) => n.classList.remove('on'));
      cur = i;
      if (i < 0) { idle(); return; }
      cols[i].forEach((n) => n.classList.add('on'));
      const r = data.hours[i];
      read.innerHTML = `<b>${r.label}</b> ${usd(data.market_price)} × ${pct(r.utilization)} busy${cloud ? ` × ${slaMul.toFixed(2)} SLA` : ''} = <b>${usd(r.rate)}</b> per GPU-hour`
        + (anySpend ? `<br><span class="sw sw-ours"></span>Our plan spent ${usd(ours[i], 0)}, <span class="sw sw-asap"></span>ASAP spent ${usd(asap[i], 0)}` : '');
    }
    function addHits(svg, H) {
      const hit = svgEl('rect', { class: 'pi-hit', x: padL, y: 0, width: W - padL - padR, height: H, tabindex: 0,
        'aria-label': 'Hours of the day; use left and right arrows to step through' }, svg);
      const at = (e) => { const r = svg.getBoundingClientRect(); return Math.max(0, Math.min(23, Math.floor((e.clientX - r.left - padL) / colW))); };
      hit.addEventListener('pointermove', (e) => show(at(e)));
      hit.addEventListener('pointerleave', () => show(-1));
      hit.addEventListener('focus', () => show(Math.max(0, cur)));
      hit.addEventListener('blur', () => show(-1));
      hit.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); show(Math.min(23, cur + 1)); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); show(Math.max(0, cur - 1)); }
        if (e.key === 'Escape') api_openDay(null);
      });
    }
  }

  // ---------- data ----------
  async function loadHistory() {
    if (S.history) return;
    try { S.history = await api('/prices/history?gpu=h100'); } catch (e) { S.err = e; console.warn('price-insights', e); }
    drawHistory();
  }
  async function loadHourly(day) {
    const mode = getMode(), k = `${mode}:${day}`;
    if (!S.hourly.has(k)) S.hourly.set(k, await api(`/prices/hourly?day=${day}&mode=${mode}`));
    return S.hourly.get(k);
  }
  async function loadWeek() {
    const mode = getMode();
    if (S.week && S.weekMode === mode) return drawWeek();
    try {
      const week = await Promise.all([0, 1, 2, 3, 4, 5, 6].map(loadHourly));
      if (mode !== getMode()) return;
      S.week = week; S.weekMode = mode;
    } catch (e) { S.err = e; console.warn('price-insights', e); }
    drawWeek();
    drawDay();
  }

  function api_openDay(d) {
    S.open = d == null || d < 0 || d > 6 ? null : d;
    paintWeekState();
    drawDay();
    if (S.open != null) loadHourly(S.open).then(drawDay).catch((e) => console.warn('price-insights', e));
  }

  const ro = new ResizeObserver(() => {
    const w = el.clientWidth;
    if (!w || Math.abs(w - S.width) < 2) return;
    S.width = w;
    drawHistory(); drawWeek(); drawDay();
  });
  ro.observe(el);

  drawHistory(); drawWeek();
  loadHistory();
  loadWeek();

  return {
    refresh() { loadWeek(); drawDay(); },
    setToday(d) {
      const t = Number.isFinite(d) ? Math.max(0, Math.min(6, d)) : null;
      if (t !== S.today) { S.today = t; paintWeekState(); }
    },
    openDay: api_openDay,
  };
}
