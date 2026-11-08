// Small SVG charts for the right panel: the 7-day H100 price forecast and the week timeline.
import { DAYS, HOURS, esc, money } from './format.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};

/** Rounded-top bar path anchored to the baseline (4px data-end, square base). */
function barPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * H100 price forecast: one thin bar per day from $0 (honest baseline) inside a lighter
 * low–high band box. Today's column is inked and marked. Hover shows the day's numbers.
 */
export function createPriceChart(container, prices) {
  container.innerHTML = '';
  const W = container.clientWidth || 246, H = 82;
  const padL = 26, padR = 2, padT = 14, padB = 14;
  const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': 'Seven-day H100 price forecast, dollars per GPU-hour' }, container);
  const tip = document.createElement('div');
  tip.className = 'chart-tip'; tip.hidden = true; container.appendChild(tip);

  const maxV = Math.max(...prices.map(p => p.high)) * 1.04;
  const y = v => padT + (1 - v / maxV) * (H - padT - padB);
  const plotW = W - padL - padR;
  const colW = plotW / prices.length;

  // recessive grid: $0 baseline + two reference lines
  const step = maxV > 3 ? 1 : 0.5;
  for (let v = 0; v <= maxV; v += step) {
    el('line', { class: 'grid', x1: padL, x2: W - padR, y1: y(v), y2: y(v) }, svg);
    const t = el('text', { class: 'ax', x: padL - 4, y: y(v) + 3, 'text-anchor': 'end' }, svg);
    t.textContent = `$${v.toFixed(v % 1 ? 1 : 0)}`;
  }

  const hi = prices.reduce((a, b) => (b.price > a.price ? b : a));
  const lo = prices.reduce((a, b) => (b.price < a.price ? b : a));
  const cols = prices.map((p, i) => {
    const cx = padL + colW * i + colW / 2;
    const g = el('g', { class: 'col' }, svg);
    const bandW = Math.min(18, colW - 6), barW = Math.min(8, bandW - 6);
    el('rect', { class: 'band', x: cx - bandW / 2, y: y(p.high), width: bandW, height: y(p.low) - y(p.high), rx: 2 }, g);
    el('path', { class: 'bar', d: barPath(cx - barW / 2, y(p.price), barW, y(0) - y(p.price), 2) }, g);
    const dl = el('text', { class: 'dl', x: cx, y: H - 2 }, g);
    dl.textContent = DAYS[p.day % 7].slice(0, 2);
    if (p === hi || p === lo) {
      const vl = el('text', { class: 'vl', x: cx, y: y(p.high) - 3 }, g);
      vl.textContent = `$${p.price.toFixed(2)}`;
    }
    const hit = el('rect', { class: 'hit', x: cx - colW / 2, y: 0, width: colW, height: H }, g);
    hit.addEventListener('mouseenter', () => {
      tip.hidden = false;
      tip.innerHTML = `<b>${DAYS[p.day % 7]}</b> · $${p.price.toFixed(2)}/hr<br>band $${p.low.toFixed(2)}–$${p.high.toFixed(2)}`;
      tip.style.left = `${Math.min(Math.max(cx, 60), W - 60)}px`;
      tip.style.top = `${y(p.high)}px`;
    });
    hit.addEventListener('mouseleave', () => { tip.hidden = true; });
    return { g, cx, p };
  });

  const nowMark = el('path', { class: 'now', d: '' }, svg);
  let lastDay = -1;
  return {
    setToday(dayIdx) {
      if (dayIdx === lastDay) return;
      lastDay = dayIdx;
      cols.forEach((c, i) => c.g.classList.toggle('today', i === dayIdx));
      const c = cols[dayIdx];
      if (!c) { nowMark.setAttribute('d', ''); return; }
      // small pixel caret above today's band (or above its value label)
      const top = y(c.p.high) - (c.p === hi || c.p === lo ? 14 : 4);
      nowMark.setAttribute('d', `M${c.cx - 3},${top - 4}h6l-3,4z`);
    },
  };
}

/**
 * Week timeline: two lanes (our plan, ASAP) with one block per scheduled task, a
 * day grid, and a playhead. Purely a view; scrubbing goes through the range input.
 */
export function createGantt(container, plans, taskOrder) {
  container.innerHTML = '';
  const W = container.clientWidth || 246, H = 46;
  const padL = 30, laneH = 11, gap = 3, top = 2;
  const plotW = W - padL;
  const x = h => padL + (h / HOURS) * plotW;
  const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': 'Week timeline: when each task runs under our plan and under ASAP' }, container);

  for (let d = 0; d <= 7; d++) {
    el('line', { class: 'tick', x1: x(d * 24), x2: x(d * 24), y1: top, y2: top + laneH * 2 + gap + 3 }, svg);
    if (d < 7) {
      const t = el('text', { class: 'tl', x: x(d * 24 + 12), y: H - 6 }, svg);
      t.textContent = DAYS[d].slice(0, 2);
    }
  }
  const blocks = [];
  [['optimized', 'ours', 'Ours'], ['asap', 'asap', 'ASAP']].forEach(([key, cls, label], li) => {
    const ly = top + li * (laneH + gap);
    el('rect', { class: 'lane', x: padL, y: ly, width: plotW, height: laneH }, svg);
    const lt = el('text', { class: 'lane-l', x: 0, y: ly + laneH - 3 }, svg);
    lt.textContent = label;
    // stack tasks that overlap in time into thin sub-rows so none hide each other
    const items = [...plans[key].items].sort((a, b) => a.start_hour - b.start_hour);
    const rowsEnd = [];
    const placed = items.map(it => {
      let r = rowsEnd.findIndex(end => end <= it.start_hour);
      if (r < 0) { r = rowsEnd.length; rowsEnd.push(0); }
      rowsEnd[r] = it.end_hour;
      return { it, r };
    });
    const nRows = Math.max(1, rowsEnd.length);
    const rowH = (laneH - (nRows - 1)) / nRows;
    placed.forEach(({ it, r }) => {
      const b = el('rect', {
        class: `blk ${cls}`, x: x(it.start_hour), y: ly + r * (rowH + 1),
        width: Math.max(1.5, x(it.end_hour) - x(it.start_hour)), height: rowH,
      }, svg);
      const t = el('title', {}, b);
      t.textContent = `${label}: ${it.name} · ${it.start_label}–${it.end_label} · ${money(it.total)}`;
      blocks.push({ b, id: it.task_id });
    });
  });
  const head = el('line', { class: 'head', x1: padL, x2: padL, y1: 0, y2: top + laneH * 2 + gap + 3 }, svg);
  const cap = el('path', { class: 'head-cap', d: '' }, svg);

  return {
    setHour(t) {
      const hx = x(t).toFixed(1);
      head.setAttribute('x1', hx); head.setAttribute('x2', hx);
      cap.setAttribute('d', `M${hx - 3},-4h6l-3,4z`);
    },
    select(taskId) {
      blocks.forEach(({ b, id }) => {
        b.classList.toggle('sel', !!taskId && id === taskId);
        b.classList.toggle('dim', !!taskId && id !== taskId);
      });
    },
  };
}

export { esc };
