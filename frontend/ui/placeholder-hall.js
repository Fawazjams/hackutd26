// 2D isometric stand-in for the 3D hall, used only when scene.js is missing or fails.
// It implements the same API as createDataCenter() so the rest of the UI works unchanged.

const NS = 'http://www.w3.org/2000/svg';
const ROWS = ['A', 'B', 'C', 'D'];
const PER_ROW = 10;
const S = 22; // px per world unit
const C30 = Math.cos(Math.PI / 6), S30 = 0.5;

const COLORS = {
  online:      { top: '#3A3C41', l: '#222428', r: '#2C2E33', led: '#76B900' },
  maintenance: { top: '#F7BA52', l: '#D98A1F', r: '#E89D30', led: '#1B1B1B' },
  offline:     { top: '#76746E', l: '#4C4B47', r: '#5D5C57', led: null },
};
const ZONE_FILL = ['#DCE3EE', '#EFE3C8', '#E4DCEF', '#D6EAE4'];
const ZONE_HI = ['#BFD0EA', '#EAD29E', '#D3C3EE', '#B5E0D3'];

const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};

export function createPlaceholderHall(containerEl) {
  const wrap = document.createElement('div');
  wrap.className = 'ph-wrap';
  containerEl.appendChild(wrap);
  const note = document.createElement('div');
  note.className = 'ph-note';
  note.textContent = '2D preview · 3D scene not loaded';
  containerEl.appendChild(note);

  const state = {};
  const racks = [];
  ROWS.forEach((row, r) => {
    for (let i = 0; i < PER_ROW; i++) {
      const id = `${row}${String(i + 1).padStart(2, '0')}`;
      racks.push({ id, r, i, zone: `Z${r + 1}`, x0: i * 1.2, y0: r * 2.9, w: 1.0, d: 1.3, h: 2.1 });
      state[id] = 'online';
    }
  });
  const floor = { x0: -1.6, y0: -1.3, x1: 12.6, y1: 3 * 2.9 + 1.3 + 1.3 };
  const cx = (floor.x0 + floor.x1) / 2, cy = (floor.y0 + floor.y1) / 2;

  let turns = 0, zoneHi = null, clickCb = null, svg = null;
  const refs = {};

  const rot = (x, y) => {
    let dx = x - cx, dy = y - cy;
    for (let k = 0; k < turns; k++) [dx, dy] = [-dy, dx];
    return [cx + dx, cy + dy];
  };
  const proj = (x, y, z) => [(x - y) * C30 * S, (x + y) * S30 * S - z * S];
  const pts = (arr) => arr.map(([x, y, z]) => proj(x, y, z).map(v => v.toFixed(1)).join(',')).join(' ');
  const box = (x0, y0, w, d) => {
    const cs = [[x0, y0], [x0 + w, y0], [x0, y0 + d], [x0 + w, y0 + d]].map(([x, y]) => rot(x, y));
    const xs = cs.map(c => c[0]), ys = cs.map(c => c[1]);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  };

  function paintRack(id) {
    const ref = refs[id]; if (!ref) return;
    const c = COLORS[state[id]] || COLORS.online;
    ref.top.setAttribute('fill', c.top); ref.l.setAttribute('fill', c.l); ref.r.setAttribute('fill', c.r);
    ref.leds.forEach(n => { n.setAttribute('stroke', c.led || 'transparent'); });
  }

  function build() {
    wrap.innerHTML = '';
    svg = el('svg', { viewBox: '-330 -90 660 440', 'shape-rendering': 'crispEdges', role: 'img', 'aria-label': 'GPU hall, 40 racks in four rows' }, wrap);
    const g = el('g', {}, svg);
    // floating slab
    const f = box(floor.x0, floor.y0, floor.x1 - floor.x0, floor.y1 - floor.y0);
    const T = 0.9, T2 = 1.6;
    el('polygon', { points: pts([[f.x1, f.y0, -T], [f.x1, f.y1, -T], [f.x1, f.y1, -T2], [f.x1, f.y0, -T2]]), fill: '#4F4B44' }, g);
    el('polygon', { points: pts([[f.x0, f.y1, -T], [f.x1, f.y1, -T], [f.x1, f.y1, -T2], [f.x0, f.y1, -T2]]), fill: '#3E3B35' }, g);
    el('polygon', { points: pts([[f.x1, f.y0, 0], [f.x1, f.y1, 0], [f.x1, f.y1, -T], [f.x1, f.y0, -T]]), fill: '#9E978A' }, g);
    el('polygon', { points: pts([[f.x0, f.y1, 0], [f.x1, f.y1, 0], [f.x1, f.y1, -T], [f.x0, f.y1, -T]]), fill: '#857E71' }, g);
    el('polygon', { points: pts([[f.x0, f.y0, 0], [f.x1, f.y0, 0], [f.x1, f.y1, 0], [f.x0, f.y1, 0]]), fill: '#E9E4D8', stroke: '#D5CFC1', 'stroke-width': 1 }, g);
    // floor tile grid
    const grid = el('g', { stroke: '#DDD7CA', 'stroke-width': 0.6 }, g);
    for (let gx = Math.ceil(f.x0); gx < f.x1; gx++) el('polyline', { points: pts([[gx, f.y0, 0], [gx, f.y1, 0]]), fill: 'none' }, grid);
    for (let gy = Math.ceil(f.y0); gy < f.y1; gy++) el('polyline', { points: pts([[f.x0, gy, 0], [f.x1, gy, 0]]), fill: 'none' }, grid);
    // zone tiles + labels
    ROWS.forEach((row, r) => {
      const z = box(-0.9, r * 2.9 - 0.45, PER_ROW * 1.2 + 0.5, 1.3 + 0.9);
      const poly = el('polygon', {
        class: 'ph-zone' + (zoneHi === `Z${r + 1}` ? ' hi' : ''), 'data-zone': `Z${r + 1}`,
        points: pts([[z.x0, z.y0, 0], [z.x1, z.y0, 0], [z.x1, z.y1, 0], [z.x0, z.y1, 0]]),
        fill: zoneHi === `Z${r + 1}` ? ZONE_HI[r] : ZONE_FILL[r],
      }, g);
      refs[`zone:Z${r + 1}`] = { poly, r };
      const [lx, ly] = rot(PER_ROW * 1.2 + 0.25, r * 2.9 + 0.65);
      const [px, py] = proj(lx, ly, 0);
      const t = el('text', { x: px, y: py + 3, 'text-anchor': 'middle', 'font-family': 'Silkscreen, monospace', 'font-size': 8, fill: '#4A4842', 'data-label': 1 }, g);
      t.textContent = `${row}·Z${r + 1}`;
    });
    // racks, back to front
    const placed = racks.map(rk => ({ rk, b: box(rk.x0, rk.y0, rk.w, rk.d) }))
      .sort((a, b) => (a.b.x0 + a.b.y0) - (b.b.x0 + b.b.y0));
    for (const { rk, b } of placed) {
      const h = rk.h;
      const rg = el('g', { class: 'ph-rack', 'data-id': rk.id }, g);
      // contact shadow
      el('polygon', { points: pts([[b.x0 + 0.15, b.y0 + 0.15, 0], [b.x1 + 0.25, b.y0 + 0.15, 0], [b.x1 + 0.25, b.y1 + 0.25, 0], [b.x0 + 0.15, b.y1 + 0.25, 0]]), fill: 'rgba(27,27,27,.12)' }, rg);
      const l = el('polygon', { points: pts([[b.x0, b.y1, 0], [b.x1, b.y1, 0], [b.x1, b.y1, h], [b.x0, b.y1, h]]) }, rg);
      const r = el('polygon', { points: pts([[b.x1, b.y0, 0], [b.x1, b.y1, 0], [b.x1, b.y1, h], [b.x1, b.y0, h]]) }, rg);
      const top = el('polygon', { points: pts([[b.x0, b.y0, h], [b.x1, b.y0, h], [b.x1, b.y1, h], [b.x0, b.y1, h]]) }, rg);
      const leds = [0.45, 0.85, 1.25, 1.65].map(z => el('polyline', {
        points: pts([[b.x0 + 0.18, b.y1, z], [b.x1 - 0.18, b.y1, z]]), fill: 'none', 'stroke-width': 1.4, 'stroke-dasharray': '2 2',
      }, rg));
      refs[rk.id] = { top, l, r, leds };
      paintRack(rk.id);
      rg.addEventListener('click', (e) => {
        e.stopPropagation();
        clickCb?.({ rackId: rk.id, zone: rk.zone, state: state[rk.id], screenX: e.clientX, screenY: e.clientY });
      });
    }
  }
  build();

  return {
    setRackState(id, s) { if (id in state) { state[id] = s; paintRack(id); } },
    resetRacks() { Object.keys(state).forEach(id => { state[id] = 'online'; paintRack(id); }); },
    setEquipmentState() {},
    highlightZone(zoneId) {
      zoneHi = zoneId;
      Object.entries(refs).forEach(([k, v]) => {
        if (!k.startsWith('zone:')) return;
        const on = k === `zone:${zoneId}`;
        v.poly.classList.toggle('hi', on);
        v.poly.setAttribute('fill', on ? ZONE_HI[v.r] : ZONE_FILL[v.r]);
      });
    },
    setHour(t) {
      const hod = ((t % 24) + 24) % 24;
      const day = 0.5 - 0.5 * Math.cos(((hod - 1) / 24) * Math.PI * 2); // 0 at ~1am, 1 at ~1pm
      if (svg) svg.style.filter = `brightness(${(0.86 + 0.14 * day).toFixed(3)}) saturate(${(0.85 + 0.15 * day).toFixed(3)})`;
    },
    setView() {},
    rotate(dir) { turns = (turns + (dir > 0 ? 1 : 3)) % 4; build(); },
    setPaused() {},
    onRackClick(cb) { clickCb = cb; },
    getRackIds() { return racks.map(r => r.id); },
    showProviders() {},
    hideProviders() {},
    setProviderState() {},
    sendNegotiator() { return Promise.resolve(); },
    returnNegotiator() { return Promise.resolve(); },
    dispose() { wrap.remove(); note.remove(); },
  };
}
