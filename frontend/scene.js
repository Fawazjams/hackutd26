// 3D GPU hall diorama (Three.js r160). Owner: Nandhan.
// A floating-island data-center campus rendered as pixel art: low-res render + ink outlines.
// main.js drives it through the API returned by createDataCenter() (see the bottom of this file).
// Everything is deterministic (seeded RNG) so the demo looks the same every run.

import * as THREE from 'three';

// ------------------------------------------------------------------ palette (matches styles.css)
const C = {
  ink: 0x1b1b1b,
  grass: 0x8da37a, grassDark: 0x6c8766, soil: 0x7b6b5e, soilDark: 0x574b44, rock: 0x5f696e, rockDark: 0x444e54,
  concrete: 0xd8dcda, concreteDark: 0xb4bcbc, wall: 0xeef1ef, wallTrim: 0xbfc8ca,
  floor: 0xe3e7e6, floorLine: 0xc6cecf, cold: 0x9cc7e6, hot: 0xf0b48a,
  rack: 0x24272c, rackTop: 0x34383f, rackDark: 0x3a3a3a,
  led: 0x8cff5a, ledOff: 0x222222, red: 0xff3b2e, amber: 0xf2a33a, amberHot: 0xffc14d,
  steel: 0x9aa3ab, steelDark: 0x6c757d, yellow: 0xf2be3a, busway: 0x2c2f33,
  white: 0xf7f4ec, glass: 0xbfd9e6, pine: 0x3d6b5b, pineDark: 0x2c4f47, trunk: 0x5c4a3e,
  truck: 0xe8572e, ours: 0x76b900, skin: 0xe9b48a, vest: 0xf28c28, shirt: 0x3f6fb0,
  zone: { Z1: 0x3f6fb0, Z2: 0xc4912a, Z3: 0x8463b4, Z4: 0x2f8f7b },
};

const ROWS = 'ABCD';
const ZONES = ['Z1', 'Z2', 'Z3', 'Z4'];
const ROW_Z = [-7.5, -2.5, 2.5, 7.5];          // row A..D centre lines
const RACK_X0 = -11, RACK_DX = 2.0;            // 10 racks per row: x = -11 .. 7
const RACK = { w: 1.7, h: 3.0, d: 1.5 };
const HALL = { x0: -16, x1: 16, z0: -11, z1: 11, wallH: 5.2 };
const HALL_SCALE = 1.3;
// campus sections pushed outward to frame the bigger apron (apron edge: x ±23.4, z ±16.9; island ±35 x ±27)
const CAMPUS_OFFSET = {
  paths: [0, 0], chillers: [0, -4.5], towers: [-2.5, 0], generators: [2, 0], substation: [3, 4],
  dock: [0, 3.3], parking: [0, 2.5], gate: [-3, 3], fence: [0, 0],
};                         // the data hall is the main show: drawn 1.3x on a bigger apron

// seeded RNG (mulberry32) so trees, rocks and blink patterns never change between runs
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ------------------------------------------------------------------ small geometry helpers
const mats = new Map();
function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return mats.get(key);
}
function box(w, h, d, material, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent?.add(m);
  return m;
}
function cyl(rt, rb, h, material, x = 0, y = 0, z = 0, parent, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent?.add(m);
  return m;
}

function canvasTexture(w, h, draw, repeat) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(...repeat); }
  return tex;
}

// ------------------------------------------------------------------ drawing-sheet markings
// Floor paint, dimension lines and the title block use the page's engineering-sheet language:
// slate ink, chilled-water teal, safety yellow. Smooth-filtered so lettering stays legible when zoomed.
const SHEET = { ink: '#17232b', ink2: '#3e4c55', teal: '#1F7A4D', yellow: '#f2be3a', orange: '#C8283C', vellum: '#e8ecec', sheet: '#f6f8f8' };
const FONT = '"Barlow Condensed", "Arial Narrow", sans-serif';
function markTexture(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
function decal(w, d, tex, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
    new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.04, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; m.renderOrder = 1;
  parent.add(m);
  return m;
}
function hazard(c, x, y, w, h, step) {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.fillStyle = SHEET.yellow; c.fillRect(x, y, w, h);
  c.fillStyle = SHEET.ink;
  for (let k = -h; k < w + h; k += step * 2) {
    c.beginPath(); c.moveTo(x + k, y + h); c.lineTo(x + k + step, y + h); c.lineTo(x + k + step + h, y); c.lineTo(x + k + h, y); c.fill();
  }
  c.restore();
}
// yellow/black striped ring painted round a unit under maintenance (shared by every ring)
let ringMat = null;
function maintRing(w, d, parent) {
  ringMat ??= new THREE.MeshLambertMaterial({
    map: markTexture(128, 128, (c, W, H) => { hazard(c, 0, 0, W, H, 9); c.clearRect(14, 14, W - 28, H - 28); }),
    alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ringMat);
  m.rotation.x = -Math.PI / 2; m.receiveShadow = true; m.visible = false;
  parent.add(m);
  return m;
}

// ------------------------------------------------------------------ pixel-art post pass
const POST_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const POST_FRAG = /* glsl */`
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 texel;
  uniform float outlines;
  uniform float palette;
  uniform vec3 inkColor;
  varying vec2 vUv;

  float bayer(vec2 p) {
    int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
    int i = x + y * 4;
    float m[16];
    m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;
    m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
    for (int k = 0; k < 16; k++) if (k == i) return m[k] / 16.0 - 0.5;
    return 0.0;
  }

  void main() {
    vec4 c = texture2D(tColor, vUv);
    float d = texture2D(tDepth, vUv).r;
    if (outlines > 0.5) {
      float dl = texture2D(tDepth, vUv - vec2(texel.x, 0.0)).r;
      float dr = texture2D(tDepth, vUv + vec2(texel.x, 0.0)).r;
      float du = texture2D(tDepth, vUv + vec2(0.0, texel.y)).r;
      float dd = texture2D(tDepth, vUv - vec2(0.0, texel.y)).r;
      float al = texture2D(tColor, vUv - vec2(texel.x, 0.0)).a;
      float ar = texture2D(tColor, vUv + vec2(texel.x, 0.0)).a;
      float au = texture2D(tColor, vUv + vec2(0.0, texel.y)).a;
      float ad = texture2D(tColor, vUv - vec2(0.0, texel.y)).a;
      // ink where a nearer surface meets a much farther one (only on the farther side: 1px lines)
      float edge = max(max(d - dl, d - dr), max(d - du, d - dd));
      if (c.a > 0.5 && edge > 0.0035) c.rgb = mix(c.rgb, inkColor, 0.72);
      // sticker outline around the whole island silhouette
      if (c.a < 0.5 && max(max(al, ar), max(au, ad)) > 0.5) c = vec4(inkColor, 0.9);
    }
    if (palette > 0.5 && c.a > 0.0) {
      vec3 s = pow(max(c.rgb, 0.0), vec3(1.0 / 2.2));
      float levels = 14.0;
      s += bayer(gl_FragCoord.xy) / levels;
      s = floor(s * levels + 0.5) / levels;
      // cool print tint so it sits on the vellum page
      s = mix(s, s * vec3(0.98, 1.0, 1.01), 0.6);
      c.rgb = pow(clamp(s, 0.0, 1.0), vec3(2.2));
    }
    gl_FragColor = c;
    #include <colorspace_fragment>
  }
`;

// ------------------------------------------------------------------ main entry
export async function createDataCenter(containerEl) {
  try {   // drawing-sheet lettering is painted into canvases; give the webfont a moment to arrive
    await Promise.race([document.fonts.load(`700 40px ${FONT}`), new Promise(r => setTimeout(r, 800))]);
  } catch { /* fall back to the system face */ }
  const R = rng(42);
  const scene = new THREE.Scene();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.touchAction = 'none';
  containerEl.appendChild(renderer.domElement);

  // ---- camera: orthographic isometric, orbiting the island
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 400);
  const target = new THREE.Vector3(0, -7, 0);
  const home = target.clone();                              // whole-island framing
  const shot = { zone: null, pos: home.clone() };           // cinematic focus (focusZone), eased in frame()
  const follow = { on: false };                              // camera rides along with the negotiator drone
  let dayHold = false;                                       // provider sequence: keep the hall in daylight
  const cam = { az: Math.PI / 4, azTarget: Math.PI / 4, el: 0.62, zoom: 1, zoomTarget: 1, dist: 160, drift: 0 };
  const VIEW_H = 90; // world units visible vertically at zoom 1 (whole island + underside)

  // ---- lights
  const hemi = new THREE.HemisphereLight(0xfff6e6, 0x6b5a48, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 220 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const hallGlow = new THREE.PointLight(0xfff3d1, 0, 60, 1.6);  // ceiling lights at night
  hallGlow.position.set(0, 7, 0);
  scene.add(hallGlow);

  // ---- render targets for the pixel pass
  const post = {
    pixelArt: false, pixelSize: 3, outlines: true, palette: false,
    rt: null,
    material: new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null }, tDepth: { value: null }, texel: { value: new THREE.Vector2() },
        outlines: { value: 1 }, palette: { value: 0 }, inkColor: { value: new THREE.Color(0x17232b) },
      },
      vertexShader: POST_VERT, fragmentShader: POST_FRAG, transparent: true, depthTest: false, depthWrite: false,
    }),
  };
  const postScene = new THREE.Scene();
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post.material));

  // ================================================================ WORLD
  const world = new THREE.Group();
  scene.add(world);
  const anim = [];      // per-frame callbacks (t, dt)

  buildIsland(world, R);
  const outside = buildCampus(world, R, anim);
  const hall = buildHall(world, R, anim);

  // ================================================================ STATE + API
  const state = {
    racks: new Map(hall.racks.map(r => [r.id, 'online'])),
    equip: new Map(),
    zoneHi: null,
    alerts: { Z1: 0, Z2: 0, Z3: 0, Z4: 0 },
    hour: 9,
    paused: false,
    clickCb: null,
    night: 0,
  };

  function applyRack(r, st) {
    r.state = st;
    const on = st === 'online', mnt = st === 'maintenance';
    r.body.material.color.setHex(mnt ? C.amber : st === 'offline' ? C.rackDark : C.rack);
    r.body.material.emissive.setHex(mnt ? 0x5a2e00 : 0x000000);
    r.ledMat.emissive.setHex(on ? C.led : C.ledOff);
    r.status.material.emissive.setHex(on ? C.led : mnt ? C.amberHot : C.red);
    r.beacon.visible = mnt;
    r.ring.visible = mnt;
  }

  // equipment ids from the backlog and Nemotron vary ("PDU row B", "Fiber spine 4", "CRAC-2"...)
  function equipKey(id) {
    const s = String(id || '').toUpperCase();
    let m;
    if ((m = s.match(/CRAC\D*(\d)/))) return `CRAC-${m[1]}`;
    if ((m = s.match(/CDU\D*(\d)/))) return `CDU-${m[1]}`;
    if ((m = s.match(/UPS\D*([AB])/))) return `UPS-${m[1]}`;
    if ((m = s.match(/PDU\W*(?:ROW\s*)?([A-D])\b/))) return `PDU-${m[1]}`;
    if (/FIBER|FIBRE|SPINE|TRUNK/.test(s)) {
      if ((m = s.match(/\b([A-D])\b/))) return `FIBER-${m[1]}`;
      if ((m = s.match(/(\d)/))) return `FIBER-${ROWS[(+m[1] - 1) % 4]}`;
    }
    if (/FIRMWARE/.test(s)) return 'FIRMWARE';
    return null;
  }

  function applyEquip(key, st) {
    const e = hall.equipment.get(key);
    if (!e) return;
    e.state = st;
    const on = st === 'maintenance';
    e.beacon.visible = on;
    e.tech.visible = on;
    if (e.ring) e.ring.visible = on;
    for (const m of e.tint) m.emissive.setHex(on ? 0x4a2600 : 0x000000);
  }

  // ---- technicians assigned to racks under maintenance (pool, deterministic placement)
  function placeTechs() {
    const mnt = hall.racks.filter(r => r.state === 'maintenance');
    // one tech per ~3 racks, standing in the aisle in front of the rack
    const picks = mnt.filter((_, i) => i % 3 === 1 || mnt.length < 3 && i === 0);
    hall.techPool.forEach((t, i) => {
      const r = picks[i];
      t.visible = !!r;
      if (!r) return;
      const side = r.row % 2 === 0 ? -1 : 1;        // A,C face north aisle; B,D face south aisle
      t.position.set(r.x + 0.4, 0.62, r.z + side * (RACK.d / 2 + 0.75));
      t.rotation.y = side < 0 ? 0 : Math.PI;
    });
  }

  // ================================================================ RENDER LOOP
  let w = 1, h = 1;
  function resize() {
    const rect = containerEl.getBoundingClientRect();
    w = Math.max(1, Math.round(rect.width)); h = Math.max(1, Math.round(rect.height));
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = `${w}px`;
    renderer.domElement.style.height = `${h}px`;
    rebuildRT();
  }
  function rebuildRT() {
    post.rt?.dispose();
    post.rt?.depthTexture?.dispose();
    // Pixel art: render at 1/pixelSize and upscale with nearest filtering (chunky pixels).
    // Crisp: render at screen resolution (supersampled 1.5x on non-retina screens) and
    // downsample with linear filtering, so edges are smooth and outlines stay ~1 CSS px.
    const pr = renderer.getPixelRatio();
    const scale = post.pixelArt ? 1 / post.pixelSize : pr * (pr >= 2 ? 1 : 1.5);
    const rw = Math.max(1, Math.min(4096, Math.floor(w * scale)));
    const rh = Math.max(1, Math.min(4096, Math.floor(h * scale)));
    const filter = post.pixelArt ? THREE.NearestFilter : THREE.LinearFilter;
    const rt = new THREE.WebGLRenderTarget(rw, rh, { minFilter: filter, magFilter: filter, generateMipmaps: false });
    rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    rt.depthTexture = new THREE.DepthTexture(rw, rh);
    rt.depthTexture.type = THREE.UnsignedIntType;
    post.rt = rt;
    post.material.uniforms.tColor.value = rt.texture;
    post.material.uniforms.tDepth.value = rt.depthTexture;
    const line = post.pixelArt ? 1 : Math.max(1, Math.round(scale * 0.75)); // outline width in RT pixels
    post.material.uniforms.texel.value.set(line / rw, line / rh);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(containerEl);
  resize();

  function updateCamera() {
    const aspect = w / h;
    const vh = VIEW_H / cam.zoom;
    // keep the whole island in frame on narrow stages
    const vw = Math.max(vh * aspect, 0);
    const fit = Math.max(1, 102 / cam.zoom / vw);
    camera.left = -vw / 2 * fit; camera.right = vw / 2 * fit;
    camera.top = vh / 2 * fit; camera.bottom = -vh / 2 * fit;
    const az = cam.az + Math.sin(cam.drift) * 0.025;
    camera.position.set(
      target.x + Math.cos(az) * Math.cos(cam.el) * cam.dist,
      target.y + Math.sin(cam.el) * cam.dist,
      target.z + Math.sin(az) * Math.cos(cam.el) * cam.dist,
    );
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    hall.setCutaway(Math.cos(az), Math.sin(az));
  }

  function updateLighting() {
    const hod = dayHold ? 12 : ((state.hour % 24) + 24) % 24;   // provider sequence: hold at noon
    const elev = Math.sin(((hod - 6) / 12) * Math.PI);       // -1 midnight .. 1 noon
    const day = clamp01(elev * 1.4 + 0.25);
    const dusk = clamp01(1 - Math.abs(elev) * 3) * (day > 0.05 ? 1 : 0.4);
    state.night = 1 - day;
    const sunAz = ((hod - 6) / 12) * Math.PI;
    sun.position.set(Math.cos(sunAz) * 60, 25 + Math.max(0, elev) * 60, 30 + Math.sin(sunAz) * 20);
    sun.intensity = lerp(0.12, 1.7, day);
    sun.color.setHex(0xfff1d6).lerp(new THREE.Color(0xff9a5a), dusk * 0.6).lerp(new THREE.Color(0x8fa6ff), state.night * 0.7);
    hemi.intensity = lerp(0.38, 0.95, day);
    hemi.color.setHex(0xfff6e6).lerp(new THREE.Color(0x7d8bc4), state.night * 0.8);
    hemi.groundColor.setHex(0x6b5a48).lerp(new THREE.Color(0x2a2836), state.night * 0.8);
    hallGlow.intensity = state.night * 120;
    hall.setNight(state.night);
    outside.setNight(state.night);
    // tint the stage itself: cream by day, dusk lavender at night (kept light so overlay text stays readable)
    // page ground: drafting vellum by day, a cool dusk at night (light enough for the ink text)
    // sky: soft blue by day, dusk blue at night (kept light near the ground so overlay text stays readable)
    const sky = new THREE.Color(0xdcedf7).lerp(new THREE.Color(0xb8c3d8), state.night * 0.9);
    const skyTop = new THREE.Color(0x9fcdee).lerp(new THREE.Color(0x4f6290), state.night * 0.9);
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--sky', `#${sky.getHexString()}`);
    rootStyle.setProperty('--sky-top', `#${skyTop.getHexString()}`);
    rootStyle.setProperty('--cloud-alpha', (1 - state.night * 0.65).toFixed(3));
  }

  // ================================================================ PROVIDER ISLANDS + NEGOTIATOR DRONE
  // Replacement-compute providers that float in beside the hall during an incident.
  // All motion runs on wall-clock time so it animates while the week is paused.
  const providers = createProviders(scene);

  let last = performance.now(), animT = 0, raf = 0, disposed = false;
  function frame(now) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));   // never negative (first frame / clock skew)
    last = now;
    if (!state.paused) animT += dt;
    cam.drift += dt * 0.25;
    cam.az += (cam.azTarget - cam.az) * Math.min(1, dt * 6);
    cam.zoom += (cam.zoomTarget - cam.zoom) * Math.min(1, dt * (shot.zone ? 1.4 : 8));
    if (follow.on) {                                          // track the drone, ground-level so islands stay framed
      const dp = providers.dronePos();
      if (dp) shot.pos.set(dp.x, -3, dp.z);
    }
    target.lerp(shot.pos, Math.min(1, dt * (follow.on ? 2.2 : 1.4)));   // slow glide, no cuts
    updateCamera();
    for (const f of anim) f(animT, state.paused ? 0 : dt, state);
    hall.tick(animT, now / 1000, state);
    providers.tick(now / 1000);

    // both styles go through the post pass (outlines, optional palette)
    renderer.setRenderTarget(post.rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(postScene, postCam);
  }
  updateLighting();
  raf = requestAnimationFrame(frame);

  // ---- input: drag to orbit, wheel to zoom, click a rack
  const ray = new THREE.Raycaster();
  const ptr = { down: false, x: 0, y: 0, moved: 0, az0: 0 };
  const el = renderer.domElement;
  const onDown = (e) => {
    ptr.down = true; ptr.x = e.clientX; ptr.y = e.clientY; ptr.moved = 0; ptr.az0 = cam.azTarget;
    el.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!ptr.down) {
      el.style.cursor = pickRack(e) ? 'pointer' : 'grab';
      return;
    }
    const dx = e.clientX - ptr.x;
    ptr.moved = Math.max(ptr.moved, Math.abs(dx) + Math.abs(e.clientY - ptr.y));
    cam.azTarget = ptr.az0 + dx * 0.008;
    el.style.cursor = 'grabbing';
  };
  const onUp = (e) => {
    if (!ptr.down) return;
    ptr.down = false;
    el.releasePointerCapture?.(e.pointerId);
    if (ptr.moved < 5) {
      const r = pickRack(e);
      if (r) state.clickCb?.({ rackId: r.id, zone: r.zone, state: r.state, screenX: e.clientX, screenY: e.clientY });
    }
  };
  const onWheel = (e) => {
    e.preventDefault();
    cam.zoomTarget = Math.max(0.7, Math.min(2.6, cam.zoomTarget * (e.deltaY > 0 ? 0.9 : 1.1)));
  };
  function pickRack(e) {
    const rect = el.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(p, camera);
    const hit = ray.intersectObjects(hall.pickables, false)[0];
    return hit ? hit.object.userData.rack : null;
  }
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('wheel', onWheel, { passive: false });

  // ================================================================ public API
  const api = {
    setRackState(rackId, st) {
      const r = hall.byId.get(rackId);
      if (!r || !['online', 'offline', 'maintenance'].includes(st)) return;
      state.racks.set(rackId, st);
      applyRack(r, st);
      placeTechs();
    },
    resetRacks() {
      for (const r of hall.racks) applyRack(r, 'online');
      for (const k of hall.equipment.keys()) applyEquip(k, 'normal');
      placeTechs();
    },
    setEquipmentState(equipmentId, st) {
      const key = equipKey(equipmentId);
      if (!key) return;
      state.equip.set(key, st);
      applyEquip(key, st === 'maintenance' ? 'maintenance' : 'normal');
    },
    highlightZone(zoneId) {
      state.zoneHi = ZONES.includes(zoneId) ? zoneId : null;
    },
    /** 0..1 overheat level per zone (main.js sets it from the plan's overheats). */
    setZoneAlert(zoneId, level) {
      if (zoneId in state.alerts) state.alerts[zoneId] = clamp01(Number(level) || 0);
    },
    setHour(hourOfWeek) {
      const hNew = Number(hourOfWeek) || 0;
      if (Math.abs(hNew - state.hour) < 0.02) return;
      state.hour = hNew;
      updateLighting();
    },
    setView(v = {}) {
      if ('pixelArt' in v && !!v.pixelArt !== post.pixelArt) { post.pixelArt = !!v.pixelArt; rebuildRT(); }
      if ('outlines' in v) post.material.uniforms.outlines.value = v.outlines ? 1 : 0;
      if ('palette' in v) post.material.uniforms.palette.value = v.palette ? 1 : 0;
      if ('pixelSize' in v) {
        const ps = Math.max(1, Math.min(6, Math.round(Number(v.pixelSize) || 3)));
        if (ps !== post.pixelSize) { post.pixelSize = ps; if (post.pixelArt) rebuildRT(); }
      }
    },
    rotate(dir) { cam.azTarget += (dir < 0 ? -1 : 1) * Math.PI / 2; },
    /** Ease the camera onto a zone's row (null = back to the whole island). Repeated calls are no-ops. */
    focusZone(zoneId) {
      const i = ZONES.indexOf(zoneId);
      const key = i < 0 ? null : zoneId;
      if (key === shot.zone) return;
      shot.zone = key;
      if (key) { shot.pos.set(-2 * HALL_SCALE, 1, ROW_Z[i] * HALL_SCALE); cam.zoomTarget = 1.8; }
      else { shot.pos.copy(home); cam.zoomTarget = 1; }
    },
    /** Float in one small data-center island per provider [{id, name}] and zoom out to fit. */
    showProviders(list = []) {
      providers.show(list);
      shot.zone = null; shot.pos.copy(home);
      cam.zoomTarget = 0.55;
      dayHold = true; updateLighting();           // bright daylight for the negotiation
    },
    hideProviders() {
      providers.hide();
      follow.on = false; shot.zone = null; shot.pos.copy(home);
      cam.zoomTarget = 1;
      dayHold = false; updateLighting();          // back to the week's own clock
    },
    /** 'idle' | 'talking' | 'deal' | 'no_deal' */
    setProviderState(id, st) { providers.setState(id, st); },
    /** Drone flies from the hall to the provider; resolves on arrival. */
    sendNegotiator(id) {
      follow.on = true; shot.zone = null;
      cam.zoomTarget = 0.95;                      // close enough that the provider island fills the frame on arrival
      return providers.fly(id, true);
    },
    /** Drone flies back to the hall; resolves on arrival. */
    returnNegotiator() {
      follow.on = true; cam.zoomTarget = 0.7;
      return providers.fly(null, false).then((v) => {
        follow.on = false; shot.pos.copy(home); cam.zoomTarget = 0.55;   // glide back to the main island, all islands in view
        return v;
      });
    },
    setPaused(p) { state.paused = !!p; },
    onRackClick(cb) { state.clickCb = typeof cb === 'function' ? cb : null; },
    getRackIds() { return hall.racks.map(r => r.id); },
    /** floating labels were removed; kept as a no-op so callers stay safe */
    setLabels() {},
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      post.rt?.dispose();
      renderer.dispose();
      el.remove();
    },
  };
  // preview only: ?drone=1 plays the provider sequence by itself (show, fly to each, come back, hide)
  try {
    if (new URLSearchParams(location.search).get('drone') === '1') {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      (async () => {
        await wait(800);
        api.showProviders([{ id: 'nebius', name: 'Nebius' }, { id: 'coreweave', name: 'CoreWeave' }]);
        for (const id of ['nebius', 'coreweave']) {
          await wait(1200); api.setProviderState(id, 'talking');
          await api.sendNegotiator(id); await wait(1500);
          api.setProviderState(id, 'deal'); await api.returnNegotiator();
        }
      })();
    }
  } catch { /* preview only */ }
  return api;
}

// ================================================================== ISLAND
function buildIsland(parent, R) {
  const g = new THREE.Group();
  parent.add(g);
  // grass cap with chunky stepped edges
  const W = 70, D = 54;
  box(W, 1.2, D, mat(C.grass), 0, -0.6, 0, g);
  box(W - 2, 0.2, D - 2, mat(C.grassDark), 0, -1.25, 0, g);
  // stepped earth layers tapering into a rocky point
  // visible cliff face first (same footprint as the grass), then strata tapering to a point
  const layers = [
    [W, 1.6, D, C.soil, -2.0],
    [W - 0.6, 1.2, D - 0.6, 0x8a796b, -3.4],
    [W - 1.4, 1.8, D - 1.4, C.soilDark, -4.9],
    [W - 6, 2.4, D - 6, C.rock, -7.0],
    [W - 14, 2.6, D - 13, C.rockDark, -9.5],
    [W - 26, 2.8, D - 22, C.rock, -12.2],
    [W - 40, 3.0, D - 32, C.rockDark, -15.1],
    [W - 54, 3.0, D - 42, C.rock, -18.0],
    [W - 62, 2.6, D - 48, C.rockDark, -20.6],
  ];
  for (const [w, h, d, c, y] of layers) box(w, h, d, mat(c), 0, y, 0, g);
  // irregular rock chunks on the flanks so it doesn't read as a stack of boxes
  for (let i = 0; i < 46; i++) {
    const layer = layers[1 + Math.floor(R() * (layers.length - 1))];
    const [lw, lh, ld, , ly] = layer;
    const side = Math.floor(R() * 4);
    const s = 1.5 + R() * 3.5;
    const along = (R() - 0.5);
    let x, z;
    if (side < 2) { x = along * lw; z = (side ? 1 : -1) * (ld / 2 + s * 0.15); }
    else { z = along * ld; x = (side === 2 ? 1 : -1) * (lw / 2 + s * 0.15); }
    const c = R() < 0.5 ? C.rock : C.rockDark;
    const m = box(s, s * (0.7 + R() * 0.8), s, mat(c), x, ly - R() * 1.5, z, g);
    m.rotation.y = R() * Math.PI;
  }
  // hanging roots and a dangling fibre cable off the edge
  for (let i = 0; i < 5; i++) {
    const x = (R() - 0.5) * (W - 20), z = D / 2 - 3.6;
    box(0.3, 1.2 + R() * 1.2, 0.3, mat(C.soilDark), x, -6.6 - R(), z, g).castShadow = false;
  }
  box(0.35, 4, 0.35, mat(C.yellow), 22, -6.5, D / 2 - 3.7, g);
  // engraved title block on the cliff face, like the corner of a facilities drawing
  const tbTex = markTexture(1040, 192, (c, w, h) => {
    c.fillStyle = SHEET.sheet; c.fillRect(0, 0, w, h);
    c.strokeStyle = SHEET.ink; c.lineWidth = 8; c.strokeRect(4, 4, w - 8, h - 8);
    c.lineWidth = 2.5;
    const col = 700, mid = 112;
    c.beginPath(); c.moveTo(col, 8); c.lineTo(col, h - 8); c.moveTo(8, mid); c.lineTo(w - 8, mid);
    c.moveTo(col + 170, mid); c.lineTo(col + 170, h - 8); c.stroke();
    c.fillStyle = SHEET.teal; c.fillRect(8, 8, 18, mid - 8);
    c.fillStyle = SHEET.ink; c.textBaseline = 'middle';
    c.font = `700 70px ${FONT}`; c.fillText('GPU HALL 01  MAINTENANCE PLAN', 44, mid / 2 + 4, col - 70);
    c.font = `600 40px ${FONT}`; c.fillStyle = SHEET.ink2;
    c.fillText('1,280 × H100,  4 ZONES,  40 RACKS', 44, mid + (h - mid) / 2 + 2, col - 70);
    c.font = `500 26px ${FONT}`; c.fillText('DRAWING', col + 22, 32);
    c.font = `700 62px ${FONT}`; c.fillStyle = SHEET.ink; c.fillText('M-101', col + 22, 76);
    c.font = `500 26px ${FONT}`; c.fillStyle = SHEET.ink2; c.fillText('SCALE', col + 22, mid + 24); c.fillText('REV', col + 192, mid + 24);
    c.font = `700 36px ${FONT}`; c.fillStyle = SHEET.ink; c.fillText('1 : 200', col + 22, mid + 56); c.fillText('C', col + 192, mid + 56);
  });
  const side = mat(0x2b363d);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(16.25, 3.0, 0.14),
    [side, side, side, side, new THREE.MeshLambertMaterial({ map: tbTex, emissive: 0xffffff, emissiveMap: tbTex, emissiveIntensity: 0.12 }), side]);
  plate.position.set(-9, -2.55, D / 2 + 0.08);
  plate.visible = false;   // decoration off: the hall is the main show
  g.add(plate);
  return g;
}

// ================================================================== CAMPUS (outside the hall)
function buildCampus(parent, R, anim) {
  const g = new THREE.Group();
  parent.add(g);
  const lamps = [];
  const nightMats = [];

  // concrete apron + paths
  box(36 * HALL_SCALE, 0.3, 26 * HALL_SCALE, mat(C.concrete), 0, 0.15, 0, g);
  // campus extras below (paths, chillers, towers, generators, substation, dock, parking, gate, fence)
  // stay built for their animations but are hidden: the data hall is the main show
  const extrasFrom = g.children.length;
  const sec = [['paths', extrasFrom]];   // [section, first child index]: each section is moved out below
  box(4, 0.25, 12, mat(C.concreteDark), 6, 0.12, 19, g);        // drive to loading dock
  box(26, 0.22, 3, mat(C.concreteDark), -14, 0.11, 15, g);       // footpath
  box(3, 0.22, 10, mat(C.concreteDark), 21, 0.11, 2, g);         // path to generators

  sec.push(['chillers', g.children.length]);
  // ---- chiller yard (north): 6 air-cooled chillers with spinning fans
  const fanMat = mat(C.steelDark);
  const fans = [];
  box(30, 0.4, 7, mat(C.concreteDark), -2, 0.2, -16.5, g);
  for (let i = 0; i < 6; i++) {
    const x = -14 + i * 4.8;
    box(4, 2.2, 5, mat(C.white), x, 1.5, -16.5, g);
    box(4.1, 0.25, 5.1, mat(C.steel), x, 2.65, -16.5, g);
    for (const dz of [-1.2, 1.2]) {
      cyl(0.9, 0.9, 0.2, mat(C.steelDark), x, 2.85, -16.5 + dz, g, 12);
      const fan = box(1.6, 0.08, 0.28, fanMat, x, 3.0, -16.5 + dz, g);
      fans.push(fan);
    }
  }
  // blue chilled-water pipes into the hall
  box(0.5, 0.5, 5, mat(0x4a8fd1), -6, 0.9, -13.5, g);
  box(0.5, 0.5, 5, mat(0xd1574a), -4.5, 0.9, -13.5, g);

  sec.push(['towers', g.children.length]);
  // ---- cooling towers (west) with vapour
  const steam = [];
  const steamGeo = new THREE.BoxGeometry(1, 1, 1);
  const steamMat = new THREE.MeshLambertMaterial({ color: 0xf4f6f5, transparent: true, opacity: 0.55, depthWrite: false });
  const steamMesh = new THREE.InstancedMesh(steamGeo, steamMat, 60);
  steamMesh.castShadow = false;
  g.add(steamMesh);
  const towers = [[-27, -8], [-27, 0]];
  for (const [x, z] of towers) {
    box(7, 0.4, 7, mat(C.concreteDark), x, 0.2, z, g);
    const t = cyl(2.6, 3.4, 6, mat(C.white), x, 3.4, z, g, 8);
    t.rotation.y = Math.PI / 8;
    cyl(2.7, 2.7, 0.5, mat(C.steel), x, 6.6, z, g, 8);
    cyl(1.4, 1.4, 0.3, mat(C.steelDark), x, 6.95, z, g, 10);
  }
  for (let i = 0; i < 60; i++) steam.push({ tw: i % 2, t: R(), ox: (R() - 0.5) * 2, oz: (R() - 0.5) * 2, s: 0.6 + R() * 0.7 });
  const dummy = new THREE.Object3D();

  sec.push(['generators', g.children.length]);
  // ---- diesel generators + fuel tank (east)
  for (let i = 0; i < 3; i++) {
    const z = -8 + i * 5.2;
    box(5.6, 2.6, 3.4, mat(i === 1 ? 0x5f7f6a : 0x6d8a75), 25.5, 1.3, z, g);
    box(5.7, 0.2, 3.5, mat(C.steelDark), 25.5, 2.7, z, g);
    cyl(0.25, 0.25, 1.6, mat(C.steelDark), 27.5, 3.4, z, g, 6);
    box(0.8, 0.8, 0.1, mat(C.yellow), 23.5, 1.6, z + 1.75, g);
  }
  const tank = cyl(1.3, 1.3, 7, mat(C.white), 30.5, 1.4, -2, g, 12);
  tank.rotation.x = Math.PI / 2;
  box(0.3, 1.0, 6, mat(C.steelDark), 30.5, 0.5, -2, g);

  sec.push(['substation', g.children.length]);
  // ---- substation (south-east) with transformers and a pylon line off the edge
  box(10, 0.3, 8, mat(0x9b958a), 26, 0.15, 17, g);
  for (let i = 0; i < 3; i++) {
    const x = 22.8 + i * 3.2;
    box(2.2, 2.2, 2.2, mat(0x7c858c), x, 1.4, 16, g);
    for (let k = -1; k <= 1; k++) cyl(0.12, 0.18, 1.2, mat(0xd9d2c0), x + k * 0.6, 3.1, 16, g, 6);
  }
  const fence = mat(C.steel);
  for (let i = 0; i <= 10; i++) box(0.12, 1.6, 0.12, fence, 21 + i, 0.95, 13, g);
  box(10, 0.08, 0.08, fence, 26, 1.6, 13, g);
  box(10, 0.08, 0.08, fence, 26, 0.9, 13, g);
  for (const x of [24, 32]) {
    const p = box(0.3, 9, 0.3, mat(C.steelDark), x, 4.5, 21.5, g);
    box(3, 0.2, 0.2, mat(C.steelDark), x, 8.6, 21.5, g);
    p.castShadow = true;
  }
  box(8, 0.06, 0.06, mat(C.ink), 28, 8.4, 21.5, g);
  box(0.06, 0.06, 6, mat(C.ink), 32, 8.4, 24.5, g);

  sec.push(['dock', g.children.length]);
  // ---- loading dock + truck (south) delivering GPU crates
  box(8, 1.2, 3, mat(C.concreteDark), 6, 0.6, 12.5, g);
  const truck = new THREE.Group();
  box(2.6, 2.6, 7.5, mat(C.white), 0, 1.9, 0, truck);
  box(2.62, 0.5, 7.52, mat(C.ours), 0, 1.0, 0, truck);
  box(2.4, 2.0, 2.2, mat(C.truck), 0, 1.6, 4.9, truck);
  box(2.2, 0.8, 0.1, mat(C.glass, { emissive: 0x000000 }), 0, 2.1, 6.0, truck);
  for (const [x, z] of [[-1.2, 4.6], [1.2, 4.6], [-1.2, -2.2], [1.2, -2.2], [-1.2, -1], [1.2, -1]]) {
    const wh = cyl(0.55, 0.55, 0.4, mat(C.ink), x, 0.55, z, truck, 10);
    wh.rotation.z = Math.PI / 2;
  }
  truck.position.set(6, 0.3, 19);
  g.add(truck);
  for (let i = 0; i < 4; i++) box(1.1, 0.9, 1.1, mat(0xc79a5b), 3.6 + i * 1.3, 1.65, 12.2, g);   // crates on the dock
  // forklift
  const lift = new THREE.Group();
  box(1.2, 1.0, 1.8, mat(C.yellow), 0, 0.8, 0, lift);
  box(0.1, 1.8, 0.1, mat(C.ink), -0.4, 1.4, 1.0, lift);
  box(0.1, 1.8, 0.1, mat(C.ink), 0.4, 1.4, 1.0, lift);
  box(1.0, 0.6, 1.0, mat(0xc79a5b), 0, 0.7, 1.6, lift);
  lift.position.set(10, 0.3, 15.5);
  g.add(lift);

  sec.push(['parking', g.children.length]);
  // ---- parking with a solar canopy (south-west)
  box(16, 0.22, 8, mat(0x8f8b84), -16, 0.11, 20, g);
  for (let i = 0; i < 5; i++) box(0.12, 0.02, 3, mat(C.white), -22.5 + i * 3.2, 0.24, 20.5, g);
  const carCols = [0x3f6fb0, 0xe8572e, 0xf7f4ec, 0x2f8f7b];
  for (let i = 0; i < 4; i++) {
    const car = new THREE.Group();
    box(1.8, 0.8, 3.2, mat(carCols[i]), 0, 0.7, 0, car);
    box(1.6, 0.6, 1.8, mat(carCols[i]), 0, 1.35, -0.2, car);
    box(1.62, 0.4, 1.4, mat(C.glass), 0, 1.4, -0.2, car);
    car.position.set(-21 + i * 3.2, 0.2, 20.8);
    g.add(car);
  }
  for (const x of [-22, -10]) for (const z of [17.5, 23.5]) box(0.25, 3.2, 0.25, mat(C.steel), x, 1.8, z, g);
  const solar = box(13, 0.25, 7, mat(0x2b3a55), -16, 3.5, 20.5, g);
  solar.rotation.x = -0.12;
  box(13.2, 0.1, 7.2, mat(C.steel), -16, 3.35, 20.5, g).rotation.x = -0.12;

  sec.push(['gate', g.children.length]);
  // ---- gatehouse + boom gate
  box(3, 2.6, 3, mat(C.white), -27, 1.5, 15, g);
  box(3.4, 0.3, 3.4, mat(C.ours), -27, 2.95, 15, g);
  box(1.6, 0.8, 0.1, mat(C.glass), -27, 1.8, 16.5, g);
  const boom = box(5, 0.15, 0.15, mat(0xe8572e), -23.2, 1.3, 16.8, g);

  sec.push(['fence', g.children.length]);
  // ---- fence around the campus edge (instanced posts)
  const postGeo = new THREE.BoxGeometry(0.14, 1.6, 0.14);
  const posts = [];
  for (let x = -33; x <= 33; x += 2.2) { posts.push([x, -25.5]); posts.push([x, 25.5]); }
  for (let z = -23.3; z <= 23.3; z += 2.2) { posts.push([-33.5, z]); posts.push([33.5, z]); }
  const postMesh = new THREE.InstancedMesh(postGeo, mat(C.steel), posts.length);
  posts.forEach(([x, z], i) => { dummy.position.set(x, 0.8, z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); postMesh.setMatrixAt(i, dummy.matrix); });
  postMesh.castShadow = true;
  g.add(postMesh);
  for (const z of [-25.5, 25.5]) box(66, 0.06, 0.06, mat(C.steel), 0, 1.4, z, g);
  for (const x of [-33.5, 33.5]) box(0.06, 0.06, 47, mat(C.steel), x, 1.4, 0, g);

  // the hall is drawn HALL_SCALE x on a bigger apron: move each campus section outward so it frames
  // the apron instead of overlapping it (x, z offsets in world units)
  sec.push(['end', g.children.length]);
  for (let k = 0; k < sec.length - 1; k++) {
    const [dx, dz] = CAMPUS_OFFSET[sec[k][0]] || [0, 0];
    for (const o of g.children.slice(sec[k][1], sec[k + 1][1])) { o.position.x += dx; o.position.z += dz; }
  }
  // paths: drive to the dock, footpath to parking, path to generators
  const [drive, foot, genPath] = g.children.slice(extrasFrom, extrasFrom + 3);
  drive.position.z += CAMPUS_OFFSET.dock[1];
  foot.position.z += CAMPUS_OFFSET.parking[1];
  genPath.position.x += CAMPUS_OFFSET.generators[0];

  // ---- trees (instanced pines + round trees), seeded, avoiding built areas
  const AX = 18 * HALL_SCALE + 1, AZ = 13 * HALL_SCALE + 1;   // keep trees off the (bigger) apron
  const moved = (name, r) => { const [dx, dz] = CAMPUS_OFFSET[name]; return [r[0] + dx, r[1] + dx, r[2] + dz, r[3] + dz]; };
  const busy = [[-AX, AX, -AZ, AZ],
    moved('chillers', [-18, 14, -21, -12]), moved('towers', [-31, -22, -12, 4]), moved('generators', [21, 33, -11, 6]),
    moved('substation', [20, 32, 12, 22]), moved('parking', [-25, -7, 15, 25]), moved('dock', [1, 12, 11, 25]),
    moved('gate', [-30, -24, 12, 18]), moved('generators', [16, 24, -4, 8])];
  const free = (x, z) => !busy.some(([a, b, c, d]) => x > a - 1 && x < b + 1 && z > c - 1 && z < d + 1);
  const spots = [];
  for (let i = 0; i < 500 && spots.length < 50; i++) {
    const x = (R() - 0.5) * 64, z = (R() - 0.5) * 48;
    if (free(x, z) && spots.every(([sx, sz]) => (sx - x) ** 2 + (sz - z) ** 2 > 5)) spots.push([x, z, 0.8 + R() * 0.7, R()]);
  }
  const coneGeo = new THREE.ConeGeometry(1.4, 3.2, 6);
  const cone2 = new THREE.ConeGeometry(1.05, 2.4, 6);
  const trunkGeo = new THREE.BoxGeometry(0.4, 1.2, 0.4);
  const ballGeo = new THREE.IcosahedronGeometry(1.5, 0);
  const pines = spots.filter(s => s[3] < 0.7), rounds = spots.filter(s => s[3] >= 0.7);
  const mk = (geo, m, n) => { const im = new THREE.InstancedMesh(geo, m, n); im.castShadow = true; im.receiveShadow = true; g.add(im); return im; };
  const pineLow = mk(coneGeo, mat(C.pine), pines.length), pineTop = mk(cone2, mat(C.pineDark), pines.length);
  const trunks = mk(trunkGeo, mat(C.trunk), spots.length);
  const balls = mk(ballGeo, mat(C.grassDark), rounds.length);
  pines.forEach(([x, z, s], i) => {
    dummy.scale.setScalar(s); dummy.rotation.set(0, i, 0);
    dummy.position.set(x, 0.6 + 2.6 * s, z); dummy.updateMatrix(); pineLow.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 0.6 + 4.3 * s, z); dummy.updateMatrix(); pineTop.setMatrixAt(i, dummy.matrix);
  });
  rounds.forEach(([x, z, s], i) => {
    dummy.scale.setScalar(s); dummy.rotation.set(i, i * 2, 0);
    dummy.position.set(x, 1.0 + 2.2 * s, z); dummy.updateMatrix(); balls.setMatrixAt(i, dummy.matrix);
  });
  spots.forEach(([x, z, s], i) => {
    dummy.scale.setScalar(s); dummy.rotation.set(0, 0, 0);
    dummy.position.set(x, 0.6 * s, z); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
  });

  const lampsFrom = g.children.length;
  // ---- lamp posts (emissive heads light up at night)
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xfff3c4, emissive: 0xffd36b, emissiveIntensity: 0 });
  nightMats.push(lampMat);
  for (const [x, z] of [[-18, 13], [-8, 13], [14, 13], [18, -13], [-18, -13], [18, 8], [-20, 2], [12, 22]]) {
    box(0.18, 4, 0.18, mat(C.steelDark), x, 2, z, g);
    box(0.8, 0.25, 0.4, lampMat, x + 0.3, 4.05, z, g).castShadow = false;
    lamps.push([x, z]);
  }

  // ---- people walking loops (security guard + a tech carrying a crate)
  const walkers = [
    { path: [[-20, 13.5], [16, 13.5], [16, -13.5], [-20, -13.5]], speed: 1.6, color: 0x2f3b52, crate: false },
    { path: [[6, 14], [6, 11.5]], speed: 1.0, color: C.vest, crate: true },
    { path: [[-26, 10], [-26, -12], [-20, -12], [-20, 10]], speed: 1.2, color: C.shirt, crate: false },
  ].map(wk => {
    const p = person(wk.color);
    if (wk.crate) box(0.7, 0.5, 0.5, mat(0xc79a5b), 0, 1.1, 0.35, p);
    g.add(p);
    const segs = wk.path.map((a, i) => { const b = wk.path[(i + 1) % wk.path.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]); });
    return { ...wk, p, segs, len: segs.reduce((s, v) => s + v, 0) };
  });

  for (const o of g.children.slice(lampsFrom)) { o.position.x *= 1.25; o.position.z *= 1.25; }   // lamps to the apron edge
  for (const wk of walkers) {   // walk loops around the bigger hall
    wk.path = wk.path.map(([x, z]) => [x * 1.1, z * 1.1]);
    wk.segs = wk.path.map((a, i) => { const b = wk.path[(i + 1) % wk.path.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]); });
    wk.len = wk.segs.reduce((t, v) => t + v, 0);
  }

  anim.push((t, dt) => {
    for (const f of fans) f.rotation.y += dt * 9;
    // steam: rise, drift, grow, fade (scale to 0)
    steam.forEach((s, i) => {
      // wrap with modulo (a long frame gap or a time jump must never push t past 1:
      // the (1 - t²) fade would go negative and blow a puff up over the whole island)
      s.t = (((s.t + Math.min(Math.max(dt, 0), 0.25) * 0.18) % 1) + 1) % 1;
      const [x, z] = towers[s.tw];
      dummy.position.set(x + s.ox + s.t * 3.5, 7.3 + s.t * 9, z + s.oz - s.t * 1.5);
      dummy.rotation.set(s.t * 2, s.t * 3, 0);
      dummy.scale.setScalar(Math.min(1.6, Math.max(0, s.s * (0.6 + s.t * 1.8) * (1 - s.t * s.t))));
      dummy.updateMatrix();
      steamMesh.setMatrixAt(i, dummy.matrix);
    });
    steamMesh.instanceMatrix.needsUpdate = true;
    // walkers
    for (const wk of walkers) {
      // closed loop through the path points (a 2-point path walks there and back)
      let d = (t * wk.speed) % wk.len;
      const pts = wk.path, segs = wk.segs;
      let i = 0;
      while (i < segs.length - 1 && d > segs[i]) { d -= segs[i]; i++; }
      const a = pts[i % pts.length], b = pts[(i + 1) % pts.length];
      const f = segs[i] ? d / segs[i] : 0;
      wk.p.position.set(lerp(a[0], b[0], f), 0.3 + Math.abs(Math.sin(t * 8)) * 0.08, lerp(a[1], b[1], f));
      wk.p.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
    }
    boom.rotation.z = Math.max(0, Math.sin(t * 0.4)) * 1.2;
    boom.position.x = -23.2 + CAMPUS_OFFSET.gate[0] - (1 - Math.cos(boom.rotation.z)) * 2.5;
    boom.position.y = 1.3 + Math.sin(boom.rotation.z) * 2.5;
  });

  return {
    setNight(n) {
      for (const m of nightMats) m.emissiveIntensity = n * 2.2;
    },
  };
}

function person(color) {
  const p = new THREE.Group();
  box(0.5, 0.7, 0.35, mat(color), 0, 0.85, 0, p);
  box(0.2, 0.5, 0.25, mat(C.ink), -0.13, 0.25, 0, p);
  box(0.2, 0.5, 0.25, mat(C.ink), 0.13, 0.25, 0, p);
  box(0.36, 0.36, 0.36, mat(C.skin), 0, 1.4, 0, p);
  box(0.4, 0.12, 0.4, mat(C.yellow), 0, 1.62, 0, p);   // hard hat
  return p;
}

// ================================================================== HALL (inside the footprint)
function buildHall(parent, R, anim) {
  const g = new THREE.Group();
  parent.add(g);
  g.scale.setScalar(HALL_SCALE);
  const { x0, x1, z0, z1, wallH } = HALL;
  const W = x1 - x0, D = z1 - z0;

  // slab + raised floor with tile grid
  box(W + 0.6, 0.6, D + 0.6, mat(C.concreteDark), 0, 0.3, 0, g);
  const tileTex = canvasTexture(16, 16, (c, w, h) => {
    c.fillStyle = '#e3e7e6'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#c9d1d2'; c.fillRect(0, 0, w, 1); c.fillRect(0, 0, 1, h);
  }, [W / 1.2, D / 1.2]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: tileTex }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.61; floor.receiveShadow = true;
  g.add(floor);
  const Y = 0.62; // floor top

  // cold aisles (blue perforated) and hot aisle (warm) between row pairs
  const perf = canvasTexture(8, 8, (c, w, h) => {
    c.fillStyle = '#a9cfe9'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#7fb0d6'; for (let i = 1; i < w; i += 2) for (let j = 1; j < h; j += 2) c.fillRect(i, j, 1, 1);
  }, [10, 1]);
  for (const z of [-5, 5]) {
    const a = new THREE.Mesh(new THREE.PlaneGeometry(20, 2.6), new THREE.MeshLambertMaterial({ map: perf }));
    a.rotation.x = -Math.PI / 2; a.position.set(-2, Y + 0.01, z); a.receiveShadow = true; g.add(a);
  }
  const hotAisle = new THREE.Mesh(new THREE.PlaneGeometry(20, 2.6), new THREE.MeshLambertMaterial({ color: C.hot }));
  hotAisle.rotation.x = -Math.PI / 2; hotAisle.position.set(-2, Y + 0.01, 0); hotAisle.receiveShadow = true;
  g.add(hotAisle);
  // hot-aisle containment: tinted glass end doors + roof panels
  const glassMat = new THREE.MeshLambertMaterial({ color: 0xffc59a, transparent: true, opacity: 0.35, depthWrite: false });
  for (const x of [-12.3, 8.3]) { const d = box(0.1, RACK.h, 2.4, glassMat, x, Y + RACK.h / 2, 0, g); d.castShadow = false; }

  // zone floor bands (highlight + overheat glow) under each row
  const zoneBands = ZONES.map((zn, i) => {
    const m = new THREE.MeshBasicMaterial({ color: C.zone[zn], transparent: true, opacity: 0, depthWrite: false });
    const band = new THREE.Mesh(new THREE.PlaneGeometry(21.5, 3.4), m);
    band.rotation.x = -Math.PI / 2; band.position.set(-2, Y + 0.03, ROW_Z[i]);
    g.add(band);
    const heatLight = new THREE.PointLight(0xff4a2a, 0, 22, 1.8);
    heatLight.position.set(-2, 4, ROW_Z[i]);
    g.add(heatLight);
    return { zn, m, heatLight };
  });

  // ---- floor paint: row grid bubbles A-D, zone chips Z1-Z4, hazard striping at the hot-aisle doors
  {
    const PX = 40, cw = W * PX, ch = D * PX;
    const X = (x) => (x - x0) * PX, Z = (z) => (z - z0) * PX;
    const tex = markTexture(cw, ch, (c) => {
      c.textAlign = 'center'; c.textBaseline = 'middle';
      ROWS.split('').forEach((row, i) => {
        const z = ROW_Z[i];
        // grid bubble between the row end and its CDU
        c.strokeStyle = SHEET.ink; c.fillStyle = SHEET.sheet; c.lineWidth = 3;
        c.beginPath(); c.arc(X(8.33), Z(z), 0.4 * PX, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = SHEET.ink; c.font = `700 ${0.56 * PX}px ${FONT}`;
        c.fillText(row, X(8.33), Z(z) + 1.5);
        // zone chip in the east service corridor, same colours as the UI chips
        const zc = '#' + C.zone[ZONES[i]].toString(16).padStart(6, '0');
        c.fillStyle = zc; c.beginPath(); c.roundRect(X(10.35), Z(z - 0.42), 1.15 * PX, 0.84 * PX, 5); c.fill();
        c.fillStyle = SHEET.sheet; c.font = `700 ${0.62 * PX}px ${FONT}`;
        c.fillText(ZONES[i], X(10.925), Z(z) + 1.5);
      });
      // safety striping across both hot-aisle containment doors
      hazard(c, X(8.45), Z(-1.3), 0.55 * PX, 2.6 * PX, 9);
      hazard(c, X(-12.95), Z(-1.3), 0.55 * PX, 2.6 * PX, 9);
      // painted keep-clear box in front of the UPS room door
      c.strokeStyle = SHEET.yellow; c.lineWidth = 5;
      c.strokeRect(X(11.8), Z(-3.9), 3.6 * PX, 1.6 * PX);
    });
    decal(W, D, tex, 0, Y + 0.02, 0, g);
  }

  // ---- racks
  const dots = canvasTexture(16, 32, (c, w, h) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    for (let y = 2; y < h - 2; y += 3) for (let x = 2; x < w - 2; x += 3) {
      const r = (x * 7 + y * 13) % 5;
      c.fillStyle = r === 0 ? '#ffffff' : r === 1 ? '#9a9a9a' : r === 2 ? '#5a5a5a' : '#000';
      c.fillRect(x, y, 1, 1);
    }
  });
  const racks = [], byId = new Map(), pickables = [];
  const beaconMat = new THREE.MeshBasicMaterial({ color: C.amberHot });
  ROWS.split('').forEach((row, ri) => {
    for (let i = 0; i < 10; i++) {
      const id = `${row}${String(i + 1).padStart(2, '0')}`;
      const x = RACK_X0 + i * RACK_DX, z = ROW_Z[ri];
      const body = box(RACK.w, RACK.h, RACK.d, new THREE.MeshLambertMaterial({ color: C.rack }), x, Y + RACK.h / 2, z, g);
      box(RACK.w + 0.04, 0.08, RACK.d + 0.04, mat(C.rackTop), x, Y + RACK.h + 0.04, z, g);
      const ledMat = new THREE.MeshLambertMaterial({ color: 0x0b0d10, emissive: C.led, emissiveMap: dots, emissiveIntensity: 1 });
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(RACK.w * 0.82, RACK.h * 0.86), ledMat);
        p.position.set(x, Y + RACK.h / 2, z + s * (RACK.d / 2 + 0.011));
        if (s < 0) p.rotation.y = Math.PI;
        g.add(p);
      }
      const status = box(0.18, 0.18, 0.06, new THREE.MeshLambertMaterial({ color: 0x111111, emissive: C.led }), x + RACK.w * 0.32, Y + RACK.h - 0.25, z + RACK.d / 2 + 0.04, g);
      status.castShadow = false;
      const beacon = new THREE.Group();
      cyl(0.18, 0.22, 0.32, beaconMat, 0, 0, 0, beacon, 8).castShadow = false;
      beacon.position.set(x, Y + RACK.h + 0.3, z);
      beacon.visible = false;
      g.add(beacon);
      const ring = maintRing(1.95, 2.6, g);
      ring.position.set(x, Y + 0.025, z);
      const r = { id, row: ri, zone: ZONES[ri], x, z, body, ledMat, status, beacon, ring, state: 'online', phase: R() * 10, speed: 1.5 + R() * 3 };
      body.userData.rack = r;
      racks.push(r); byId.set(id, r); pickables.push(body);
    }
  });

  // overhead: yellow fibre trays + black busway per row, cold-water pipes under the floor edge
  const fiberTrays = ROWS.split('').map((row, ri) => {
    const m = new THREE.MeshLambertMaterial({ color: C.yellow });
    box(21, 0.18, 0.7, m, -2, Y + RACK.h + 0.9, ROW_Z[ri] - 0.3, g).castShadow = false;
    box(21, 0.22, 0.3, mat(C.busway), -2, Y + RACK.h + 1.25, ROW_Z[ri] + 0.4, g).castShadow = false;
    return m;
  });
  for (let i = 0; i < 11; i++) for (const ri of [0, 1, 2, 3]) {
    box(0.08, 1.2, 0.08, mat(C.steelDark), RACK_X0 - 1 + i * 2, Y + RACK.h + 1.5, ROW_Z[ri], g).castShadow = false;
  }

  // ---- equipment: CRAC units on the west wall (one per zone), PDUs at row west ends,
  // CDUs at row east ends, UPS room (south-east), NOC (north-east)
  const equipment = new Map();
  function addEquip(key, group, tintMats, beaconY, techPos, ringWD) {
    const ring = maintRing(ringWD[0], ringWD[1], g);
    ring.position.set(group.position.x, Y + 0.025, group.position.z);
    const beacon = new THREE.Group();
    cyl(0.22, 0.26, 0.36, beaconMat, 0, 0, 0, beacon, 8).castShadow = false;
    beacon.position.copy(group.position).add(new THREE.Vector3(0, beaconY, 0));
    beacon.visible = false;
    g.add(beacon);
    const tech = person(C.vest);
    tech.position.set(techPos[0], Y, techPos[1]);
    tech.visible = false;
    g.add(tech);
    equipment.set(key, { state: 'normal', beacon, tech, ring, tint: tintMats });
  }
  const cracFans = [];
  ZONES.forEach((zn, i) => {
    const grp = new THREE.Group();
    grp.position.set(-14.6, Y, ROW_Z[i]);
    const m = new THREE.MeshLambertMaterial({ color: 0xe8e4da });
    box(1.6, 3.4, 3.2, m, 0, 1.7, 0, grp);
    box(1.62, 0.5, 3.22, mat(C.zone[zn]), 0, 3.1, 0, grp);
    box(0.05, 1.8, 2.4, mat(0x8b9097), 0.82, 1.4, 0, grp);
    const fan = box(0.08, 0.2, 1.6, mat(C.steelDark), 0.86, 1.4, 0, grp);
    cracFans.push({ fan, key: `CRAC-${i + 1}` });
    g.add(grp);
    addEquip(`CRAC-${i + 1}`, grp, [m], 3.7, [-13.2, ROW_Z[i] + 1.9], [2.3, 4.0]);

    const pdu = new THREE.Group();
    pdu.position.set(-12.6, Y, ROW_Z[i]);
    const pm = new THREE.MeshLambertMaterial({ color: 0x4b5058 });
    box(0.9, 2.4, 1.4, pm, 0, 1.2, 0, pdu);
    box(0.6, 0.3, 0.05, mat(C.white, { emissive: 0x3f6fb0 }), 0, 1.9, 0.72, pdu);
    g.add(pdu);
    addEquip(`PDU-${ROWS[i]}`, pdu, [pm], 2.7, [-12.6, ROW_Z[i] + 1.8], [1.5, 2.1]);

    const cdu = new THREE.Group();
    cdu.position.set(9.4, Y, ROW_Z[i]);
    const cm = new THREE.MeshLambertMaterial({ color: 0xdfe6ec });
    box(1.2, 2.6, 1.6, cm, 0, 1.3, 0, cdu);
    cyl(0.14, 0.14, 2.6, mat(0x4a8fd1), 0.7, 1.3, -0.4, cdu, 6);
    cyl(0.14, 0.14, 2.6, mat(0xd1574a), 0.7, 1.3, 0.4, cdu, 6);
    g.add(cdu);
    addEquip(`CDU-${i + 1}`, cdu, [cm], 2.9, [10.8, ROW_Z[i] + 1.2], [2.0, 2.3]);

    equipment.set(`FIBER-${ROWS[i]}`, { state: 'normal', beacon: { visible: false }, tech: { visible: false }, tint: [], fiber: fiberTrays[i] });
  });
  // UPS room with glass partition
  box(0.15, 3.2, 6.5, glassMat, 11.6, Y + 1.6, -7.6, g).castShadow = false;
  ['A', 'B'].forEach((u, k) => {
    const ups = new THREE.Group();
    ups.position.set(13.2 + k * 1.8, Y, -7.6);
    const um = new THREE.MeshLambertMaterial({ color: 0x3b4048 });
    for (let j = -2; j <= 2; j++) box(1.2, 2.2, 0.9, um, 0, 1.1, j * 1.15, ups);
    box(1.0, 0.25, 0.05, mat(C.ink, { emissive: k ? 0x2f8f7b : 0x76b900 }), -0.62, 1.9, 0, ups).rotation.y = Math.PI / 2;
    g.add(ups);
    addEquip(`UPS-${u}`, ups, [um], 2.6, [12.4, -4.2], [1.7, 6.4]);
  });
  // NOC desk with a glowing screen wall
  box(4, 1, 1.2, mat(0x6d5a48), 13.2, Y + 0.5, 6.5, g);
  const screenMat = new THREE.MeshLambertMaterial({ color: 0x0c1a12, emissive: 0x76b900, emissiveIntensity: 0.8 });
  for (let k = 0; k < 3; k++) box(1.2, 0.8, 0.08, screenMat, 12 + k * 1.25, Y + 2.2, 9.6, g).castShadow = false;
  const noc = person(0x3f6fb0); noc.position.set(13.2, Y, 5.4); noc.rotation.y = Math.PI; g.add(noc);

  // ---- walls (dollhouse cutaway: walls facing the camera drop to knee height)
  const wallTex = canvasTexture(32, 32, (c, w, h) => {
    c.fillStyle = '#eef1ef'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#dde3e3'; for (let y = 0; y < h; y += 8) c.fillRect(0, y, w, 1);
  }, [6, 1]);
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
  const walls = [
    { n: [0, -1], m: box(W, wallH, 0.4, wallMat, 0, Y + wallH / 2, z0 + 0.2, g) },
    { n: [0, 1], m: box(W, wallH, 0.4, wallMat, 0, Y + wallH / 2, z1 - 0.2, g) },
    { n: [-1, 0], m: box(0.4, wallH, D, wallMat, x0 + 0.2, Y + wallH / 2, 0, g) },
    { n: [1, 0], m: box(0.4, wallH, D, wallMat, x1 - 0.2, Y + wallH / 2, 0, g) },
  ];
  for (const wl of walls) { wl.k = 1; wl.base = wl.m.position.y; wl.m.visible = false; }   // open-plan: no walls
  // signage + louvres on each wall (children follow the wall's cutaway)
  const sign = canvasTexture(128, 32, (c, w, h) => {
    c.fillStyle = '#17232b'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#1F7A4D'; c.fillRect(0, h - 3, w, 3);
    c.fillStyle = '#f7f4ec'; c.font = 'bold 15px monospace'; c.textBaseline = 'middle';
    c.fillText('HALL 01 · 1,280 H100', 6, h / 2 - 1);
  });
  const signMat = new THREE.MeshLambertMaterial({ map: sign, emissive: 0xffffff, emissiveMap: sign, emissiveIntensity: 0.15 });
  const louvre = mat(0xb9b2a3);
  for (const wl of walls) {
    const horiz = wl.n[0] === 0;
    const sgn = horiz ? wl.n[1] : wl.n[0];
    const s = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), signMat);
    s.position.set(horiz ? -4 : sgn * 0.21, 1.2, horiz ? sgn * 0.21 : 3);
    s.rotation.y = horiz ? (sgn > 0 ? 0 : Math.PI) : sgn * Math.PI / 2;
    wl.m.add(s);
    for (let k = 0; k < 3; k++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(horiz ? 2.4 : 0.1, 1.4, horiz ? 0.1 : 2.4), louvre);
      l.position.set(horiz ? 6 + k * 3 : sgn * 0.22, 0.6, horiz ? sgn * 0.22 : -6 - k * 3);
      wl.m.add(l);
    }
  }
  // exterior roof edge trim at the top of every wall
  const trimMat = mat(C.wallTrim);
  for (const wl of walls) {
    const horiz = wl.n[0] === 0;
    const t = new THREE.Mesh(new THREE.BoxGeometry(horiz ? W + 0.2 : 0.6, 0.3, horiz ? 0.6 : D + 0.2), trimMat);
    t.position.y = wallH / 2 + 0.15;
    wl.m.add(t);
  }

  // ceiling light strips over the aisles (glow at night)
  const stripMat = new THREE.MeshLambertMaterial({ color: 0xfffbe8, emissive: 0xfff1c4, emissiveIntensity: 0 });
  for (const z of [-5, 0, 5]) box(20, 0.12, 0.35, stripMat, -2, Y + RACK.h + 2.0, z, g).castShadow = false;

  // ---- patrolling techs and the maintenance tech pool
  const patrol = [person(C.shirt), person(0x2f8f7b)];
  patrol.forEach(p => g.add(p));
  const techPool = Array.from({ length: 12 }, () => { const p = person(C.vest); p.visible = false; g.add(p); return p; });
  // server-lift cart parked near the NOC
  const cart = new THREE.Group();
  box(1.2, 0.2, 0.9, mat(C.steel), 0, 0.5, 0, cart);
  box(0.1, 1.8, 0.1, mat(C.steelDark), -0.55, 1.3, -0.4, cart);
  box(0.1, 1.8, 0.1, mat(C.steelDark), -0.55, 1.3, 0.4, cart);
  box(0.9, 0.35, 0.8, mat(C.rack), 0, 0.85, 0, cart);
  cart.position.set(11, Y, 2.2);
  g.add(cart);

  // ---- embers rising over overheating zones
  const EMB = 80;
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xff6a2a });
  const embers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), emberMat, EMB);
  embers.castShadow = false;
  g.add(embers);
  const emberSeeds = Array.from({ length: EMB }, (_, i) => ({ zi: i % 4, x: -12 + R() * 20, t: R(), dz: (R() - 0.5) * 2.6, sp: 0.35 + R() * 0.4 }));
  const dummy = new THREE.Object3D();

  return {
    racks, byId, pickables, equipment, techPool,
    setCutaway(cx, cz) {
      // camera direction (from target to camera) in xz; walls whose outward normal faces it go low
      return;   // walls are hidden (open-plan hall), nothing to cut away
      for (const wl of walls) {
        const facing = wl.n[0] * cx + wl.n[1] * cz;
        const want = facing > 0.25 ? 0.16 : 1;
        wl.k += (want - wl.k) * 0.18;
        wl.m.scale.y = wl.k;
        wl.m.position.y = Y + (wallH * wl.k) / 2;
        for (const ch of wl.m.children) ch.visible = wl.k > 0.6;
      }
    },
    setNight(n) {
      stripMat.emissiveIntensity = n * 2.4;
      signMat.emissiveIntensity = 0.15 + n * 0.9;
      screenMat.emissiveIntensity = 0.8 + n * 1.2;
    },
    tick(t, wall, st) {
      const night = st.night;
      // LED shimmer: each rack blinks at its own pace; brighter at night
      for (const r of racks) {
        const heat = st.alerts[r.zone];
        if (r.state === 'online') {
          r.body.material.emissive.setHex(heat > 0 ? 0xff2a10 : 0x000000);
          r.body.material.emissiveIntensity = heat > 0 ? heat * (0.35 + 0.35 * Math.sin(wall * 7 + r.phase * 0.3)) : 0;
        }
        if (r.state === 'online') r.ledMat.emissiveIntensity = (0.75 + 0.45 * Math.sin(t * r.speed + r.phase) ** 8) * (1 + night * 0.9);
        else if (r.state === 'maintenance') {
          const p = 0.5 + 0.5 * Math.sin(wall * 6 + r.phase);
          // the hall lights drop at night, so work in progress glows harder (daytime look unchanged)
          r.body.material.emissiveIntensity = (0.4 + p * 0.9) * (1 + night * 1.4);
          r.ledMat.emissiveIntensity = 0;
          r.beacon.rotation.y = wall * 6;
          r.beacon.scale.setScalar(1 + night * 0.45);
          r.beacon.children[0].material.color.setHex(Math.sin(wall * 10) > 0 ? C.amberHot : C.amber);
        } else r.ledMat.emissiveIntensity = 0;
        r.status.material.emissiveIntensity = r.state === 'offline' ? (Math.sin(wall * 5) > 0 ? 1.4 : 0.2)
          : r.state === 'maintenance' ? 1 + night * 2.5 : 1 + night;
      }
      for (const { fan, key } of cracFans) if (equipment.get(key)?.state !== 'maintenance') fan.rotation.x += 0.25;
      for (const e of equipment.values()) {
        if (e.beacon.visible && e.beacon.rotation) { e.beacon.rotation.y = wall * 6; e.beacon.scale.setScalar(1 + night * 0.45); }
        if (e.state === 'maintenance') for (const m of e.tint) m.emissiveIntensity = 1 + night * 1.4;
        if (e.fiber) e.fiber.emissive.setHex(e.state === 'maintenance' && Math.sin(wall * 6) > 0 ? 0x8a5a00 : 0x000000);
      }
      // zones: selection highlight (soft) and overheat (red pulse + light + embers)
      for (const b of zoneBands) {
        const a = st.alerts[b.zn];
        const hi = st.zoneHi === b.zn ? 0.22 + 0.12 * Math.sin(wall * 3) : 0;
        if (a > 0) {
          b.m.color.setHex(0xff3b1f);
          b.m.opacity = 0.35 + 0.3 * a * (0.5 + 0.5 * Math.sin(wall * 7));
          b.heatLight.intensity = a * (140 + 80 * Math.sin(wall * 7));
        } else {
          b.m.color.setHex(C.zone[b.zn]);
          b.m.opacity = hi;
          b.heatLight.intensity = 0;
        }
      }
      emberSeeds.forEach((e, i) => {
        const a = st.alerts[ZONES[e.zi]];
        e.t = (e.t + 0.016 * e.sp) % 1;
        const s = a > 0 ? 1 - e.t : 0;
        dummy.position.set(e.x + Math.sin(e.t * 9 + i) * 0.3, Y + 0.4 + e.t * 6, ROW_Z[e.zi] + e.dz);
        dummy.rotation.set(e.t * 4, e.t * 5, 0);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        embers.setMatrixAt(i, dummy.matrix);
      });
      embers.instanceMatrix.needsUpdate = true;
      // patrol loops around the outer aisles
      const loop = (p, phase, speed) => {
        const L = 2 * (22 + 19);
        let d = ((t * speed + phase) % L + L) % L;
        let x, z, ang;
        if (d < 22) { x = -12.5 + d; z = -10; ang = Math.PI / 2; }
        else if ((d -= 22) < 19) { x = 9.5 + 0.5; z = -10 + d; ang = 0; }
        else if ((d -= 19) < 22) { x = 10 - d; z = 9.6; ang = -Math.PI / 2; }
        else { d -= 22; x = -12.5; z = 9.6 - d; ang = Math.PI; }
        p.position.set(x, Y + Math.abs(Math.sin(t * 8 + phase)) * 0.06, z);
        p.rotation.y = ang;
      };
      loop(patrol[0], 0, 1.4);
      loop(patrol[1], 40, 1.1);
      for (const tp of techPool) if (tp.visible) tp.children[0].rotation.x = Math.sin(wall * 5) * 0.15;
    },
  };
}

// ================================================================== PROVIDERS (replacement compute)
// Small floating islands for provider data centers + a negotiator drone that flies between them.
function createProviders(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const ROOF = { nebius: 0x3f6fb0, coreweave: 0x8463b4 };
  // perpendicular to the default camera direction (az = 45deg), so they sit left/right on screen
  const SLOTS = [new THREE.Vector3(-56, -3, 56), new THREE.Vector3(56, -3, -56), new THREE.Vector3(0, -6, -80)];
  const HOME = new THREE.Vector3(0, 14, 0);
  const islands = new Map();          // id -> {group, base, born, dying, beaconMat, light, state}

  function label(text) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const c = cv.getContext('2d');
    c.fillStyle = 'rgba(23,35,43,0.92)'; c.fillRect(0, 0, 256, 64);
    c.fillStyle = '#76b900'; c.fillRect(0, 58, 256, 6);
    c.fillStyle = '#f6f8f8'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, 128, 30);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(16, 4, 1);
    s.renderOrder = 10;
    return s;
  }

  // same LED dot pattern as the main hall's rack faces
  const dots = canvasTexture(16, 32, (c, w, h) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    for (let y = 2; y < h - 2; y += 3) for (let x = 2; x < w - 2; x += 3) {
      const r = (x * 7 + y * 13) % 5;
      c.fillStyle = r === 0 ? '#ffffff' : r === 1 ? '#9a9a9a' : r === 2 ? '#5a5a5a' : '#000';
      c.fillRect(x, y, 1, 1);
    }
  });
  const tileTex = canvasTexture(16, 16, (c, w, h) => {
    c.fillStyle = '#e4dfd3'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#cfc8b8'; c.fillRect(0, 0, w, 1); c.fillRect(0, 0, 1, h);
  }, [14, 10]);
  const perfTex = canvasTexture(8, 8, (c, w, h) => {
    c.fillStyle = '#a9cfe9'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#7fb0d6'; for (let i = 1; i < w; i += 2) for (let j = 1; j < h; j += 2) c.fillRect(i, j, 1, 1);
  }, [8, 1]);

  function signTex(name, roof) {
    return canvasTexture(128, 32, (c, w, h) => {
      c.fillStyle = '#1b1b1b'; c.fillRect(0, 0, w, h);
      c.fillStyle = `#${roof.toString(16).padStart(6, '0')}`; c.fillRect(0, h - 3, w, 3);
      c.fillStyle = '#f7f4ec'; c.font = 'bold 15px monospace'; c.textBaseline = 'middle';
      c.fillText(name.toUpperCase().slice(0, 15), 6, h / 2 - 1);
    });
  }

  function build(id, name) {
    const g = new THREE.Group();
    const R = rng(id.length * 977 + id.charCodeAt(0));
    const W = 34, D = 26;
    const roof = ROOF[id] ?? 0x2f8f7b;
    // island: grass cap, cliff face, stepped strata tapering to a rocky point
    box(W, 1.0, D, mat(C.grass), 0, -0.5, 0, g);
    box(W - 1.6, 0.2, D - 1.6, mat(C.grassDark), 0, -1.05, 0, g);
    const layers = [[W, 1.4, D, C.soil, -1.7], [W - 0.5, 1.0, D - 0.5, 0x8a6142, -2.9], [W - 4, 1.8, D - 4, C.rock, -4.3],
      [W - 10, 2.0, D - 9, C.rockDark, -6.2], [W - 17, 2.2, D - 14, C.rock, -8.3], [W - 24, 2.0, D - 19, C.rockDark, -10.3],
      [W - 29, 1.8, D - 22, C.rock, -12.1]];
    for (const [w, h, d, c, y] of layers) box(w, h, d, mat(c), 0, y, 0, g);
    for (let i = 0; i < 16; i++) {
      const s = 1 + R() * 2;
      const side = R() < 0.5;
      const along = (R() - 0.5);
      const x = side ? along * (W - 8) : (R() < 0.5 ? -1 : 1) * (W / 2 - 3 - R() * 4);
      const z = side ? (R() < 0.5 ? -1 : 1) * (D / 2 - 3 - R() * 3) : along * (D - 8);
      box(s, s * (0.7 + R() * 0.6), s, mat(R() < 0.5 ? C.rock : C.rockDark), x, -4 - R() * 6, z, g).rotation.y = R() * 3;
    }
    // concrete apron, chiller yard and trees outside the hall
    box(26, 0.25, 18, mat(C.concrete), 0, 0.12, -0.5, g);
    box(22, 0.3, 4, mat(C.concreteDark), 0, 0.15, -10.5, g);
    const fanMat = mat(C.steelDark);
    const fans = [];
    for (let i = 0; i < 4; i++) {
      const x = -8.25 + i * 5.5;
      box(4, 1.8, 3, mat(C.white), x, 1.2, -10.5, g);
      box(4.1, 0.2, 3.1, mat(C.steel), x, 2.2, -10.5, g);
      cyl(0.8, 0.8, 0.15, fanMat, x, 2.35, -10.5, g, 12);
      fans.push(box(1.4, 0.06, 0.24, fanMat, x, 2.45, -10.5, g));
    }
    for (let i = 0; i < 9; i++) {
      const x = (R() - 0.5) * (W - 4), z = (R() < 0.5 ? -1 : 1) * (D / 2 - 1.5);
      if (Math.abs(x) < 4 && z > 0) continue;
      const s = 0.6 + R() * 0.5;
      box(0.35 * s, 1.0 * s, 0.35 * s, mat(C.trunk), x, 0.5 * s, z, g);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.2 * s, 2.8 * s, 6), mat(R() < 0.5 ? C.pine : C.pineDark));
      cone.position.set(x, 1.0 * s + 1.4 * s, z); cone.castShadow = true; g.add(cone);
    }

    // hall: raised tiled floor, cold aisles, hot aisle with containment glass
    const Y = 0.62, HX = 22, HZ = 14;
    box(HX + 0.4, 0.5, HZ + 0.4, mat(C.concreteDark), 0, 0.37, 0, g);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HX, HZ), new THREE.MeshLambertMaterial({ map: tileTex }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = Y; floor.receiveShadow = true; g.add(floor);
    for (const z of [-3.6, 3.6]) {
      const a = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.6), new THREE.MeshLambertMaterial({ map: perfTex }));
      a.rotation.x = -Math.PI / 2; a.position.set(-1, Y + 0.01, z); g.add(a);
    }
    const hot = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.6), new THREE.MeshLambertMaterial({ color: C.hot }));
    hot.rotation.x = -Math.PI / 2; hot.position.set(-1, Y + 0.01, 0); g.add(hot);
    const glass = new THREE.MeshLambertMaterial({ color: 0xffc59a, transparent: true, opacity: 0.35, depthWrite: false });
    for (const x of [-8.3, 6.3]) box(0.08, 2.4, 1.6, glass, x, Y + 1.2, 0, g).castShadow = false;

    // 2 rows x 7 racks facing the cold aisles, with dotted LED faces, top caps and status LEDs
    const racks = [];
    const RW = 1.5, RH = 2.4, RD = 1.3;
    for (const rz of [-1.7, 1.7]) for (let i = 0; i < 7; i++) {
      const x = -7 + i * 2.0;
      box(RW, RH, RD, mat(C.rack), x, Y + RH / 2, rz, g);
      box(RW + 0.04, 0.07, RD + 0.04, mat(C.rackTop), x, Y + RH + 0.035, rz, g);
      const ledMat = new THREE.MeshLambertMaterial({ color: 0x0b0d10, emissive: C.led, emissiveMap: dots, emissiveIntensity: 1 });
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(RW * 0.82, RH * 0.86), ledMat);
        p.position.set(x, Y + RH / 2, rz + s * (RD / 2 + 0.011));
        if (s < 0) p.rotation.y = Math.PI;
        g.add(p);
      }
      const face = rz < 0 ? -1 : 1;
      box(0.15, 0.15, 0.05, new THREE.MeshLambertMaterial({ color: 0x111111, emissive: C.led }),
        x + RW * 0.3, Y + RH - 0.2, rz + face * (RD / 2 + 0.03), g).castShadow = false;
      racks.push({ ledMat, phase: R() * 10, speed: 1.5 + R() * 3 });
    }
    // overhead fibre trays + busway per row
    for (const rz of [-1.7, 1.7]) {
      box(15, 0.15, 0.55, mat(C.yellow), -1, Y + RH + 0.7, rz - 0.25, g).castShadow = false;
      box(15, 0.18, 0.25, mat(C.busway), -1, Y + RH + 1.0, rz + 0.3, g).castShadow = false;
    }
    // CRAC units (west wall), CDU + PDU (row ends), UPS cabinets and a NOC desk
    for (const rz of [-3.6, 3.6]) {
      box(1.3, 2.8, 2.4, mat(0xe8e4da), -10, Y + 1.4, rz, g);
      box(1.32, 0.4, 2.42, mat(roof), -10, Y + 2.6, rz, g);
      box(0.05, 1.4, 1.8, mat(0x8b9097), -9.33, Y + 1.2, rz, g);
    }
    for (const rz of [-1.7, 1.7]) {
      box(0.8, 2.0, 1.2, mat(0x4b5058), -8.9, Y + 1.0, rz, g);
      box(1.0, 2.2, 1.3, mat(0xdfe6ec), 7.1, Y + 1.1, rz, g);
      cyl(0.11, 0.11, 2.2, mat(0x4a8fd1), 7.7, Y + 1.1, rz - 0.3, g, 6);
      cyl(0.11, 0.11, 2.2, mat(0xd1574a), 7.7, Y + 1.1, rz + 0.3, g, 6);
    }
    for (let j = -1; j <= 1; j++) box(1.0, 1.9, 0.8, mat(0x3b4048), 9.6, Y + 0.95, -4.4 + j * 0.95, g);
    box(2.6, 0.8, 0.9, mat(0x6d5a48), 9.4, Y + 0.4, 4.6, g);
    const screen = new THREE.MeshLambertMaterial({ color: 0x0c1a12, emissive: roof, emissiveIntensity: 0.9 });
    for (let k = 0; k < 2; k++) box(1.0, 0.65, 0.06, screen, 8.9 + k * 1.05, Y + 1.7, 6.6, g).castShadow = false;
    const staff = person(C.shirt); staff.position.set(9.4, Y, 3.7); staff.rotation.y = Math.PI; g.add(staff);

    // walls: dollhouse style (back + sides full height, front low) with roof trim and a company sign
    const wallTex = canvasTexture(32, 32, (c, w, h) => {
      c.fillStyle = '#efe9dc'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#e2dbcb'; for (let y = 0; y < h; y += 8) c.fillRect(0, y, w, 1);
    }, [4, 1]);
    const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
    const WH = 4.2;
    box(HX, WH, 0.3, wallMat, 0, Y + WH / 2, -HZ / 2 + 0.15, g);
    box(0.3, WH, HZ, wallMat, -HX / 2 + 0.15, Y + WH / 2, 0, g);
    box(0.3, WH, HZ, wallMat, HX / 2 - 0.15, Y + WH / 2, 0, g);
    box(HX, 0.7, 0.3, wallMat, 0, Y + 0.35, HZ / 2 - 0.15, g);
    box(HX + 0.2, 0.3, 0.5, mat(roof), 0, Y + WH + 0.15, -HZ / 2 + 0.15, g);
    box(0.5, 0.3, HZ + 0.2, mat(roof), -HX / 2 + 0.15, Y + WH + 0.15, 0, g);
    box(0.5, 0.3, HZ + 0.2, mat(roof), HX / 2 - 0.15, Y + WH + 0.15, 0, g);
    const st = signTex(name, roof);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshLambertMaterial({ map: st, emissive: 0xffffff, emissiveMap: st, emissiveIntensity: 0.25 }));
    sign.position.set(-3, Y + 2.6, -HZ / 2 + 0.32);
    g.add(sign);
    const strip = new THREE.MeshLambertMaterial({ color: 0xfffbe8, emissive: 0xfff1c4, emissiveIntensity: 0.6 });
    for (const z of [-3.6, 0, 3.6]) box(14, 0.1, 0.3, strip, -1, Y + RH + 1.6, z, g).castShadow = false;

    // status mast + beacon (talking / deal / no deal)
    box(0.25, 6, 0.25, mat(C.steelDark), HX / 2 - 1, 3.6, HZ / 2 - 1, g);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), beaconMat);
    beacon.position.set(HX / 2 - 1, 7.1, HZ / 2 - 1);
    g.add(beacon);
    const light = new THREE.PointLight(0xffc14d, 0, 30, 1.6);
    light.position.set(0, 8, 0);
    g.add(light);
    const tag = label(name);
    tag.position.set(0, 13, 0);
    g.add(tag);
    g.traverse(o => { o.raycast = () => {}; });   // never picked as a rack
    return { group: g, beaconMat, light, racks, fans, state: 'idle' };
  }

  // ---- negotiator drone (styled after a delivery drone: rounded white fuselage, ducted rear fan,
  // side rotor pods, small fins, antenna; carries the contract back on a tether)
  const drone = new THREE.Group();
  const body = new THREE.Group();          // nose points +x; the whole drone yaws toward its target
  drone.add(body);
  const shell = new THREE.MeshLambertMaterial({ color: 0xf4f3ee });
  const shellShade = new THREE.MeshLambertMaterial({ color: 0xdcdad3 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x23262b });
  const fus = new THREE.Mesh(new THREE.CapsuleGeometry(0.85, 2.6, 6, 14), shell);
  fus.rotation.z = Math.PI / 2; fus.scale.set(1, 1, 0.82);   // long axis along x, slightly flattened
  fus.castShadow = true; body.add(fus);
  box(3.0, 0.28, 1.5, shellShade, -0.1, -0.62, 0, body);                 // belly pan
  box(2.4, 0.06, 0.08, dark, 0.1, 0.78, 0, body);                        // top seam
  box(0.18, 0.5, 1.0, dark, 2.25, 0.05, 0, body);                        // nose sensor window
  // ducted fan at the tail with a hex-grille face
  const duct = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.22, 10, 24), shell);
  duct.rotation.y = Math.PI / 2; duct.position.set(-2.55, 0.05, 0); body.add(duct);
  const grilleTex = canvasTexture(32, 32, (c, w, h) => {
    c.fillStyle = '#9aa3ab'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2a2d31';
    for (let y = 0; y < h; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < w; x += 4) c.fillRect(x, y, 2, 2);
  });
  const grille = new THREE.Mesh(new THREE.CircleGeometry(0.82, 20),
    new THREE.MeshLambertMaterial({ map: grilleTex, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  grille.rotation.y = -Math.PI / 2; grille.position.set(-2.72, 0.05, 0); body.add(grille);
  const tailFan = new THREE.Group();
  box(0.05, 1.4, 0.18, dark, 0, 0, 0, tailFan);
  box(0.05, 0.18, 1.4, dark, 0, 0, 0, tailFan);
  tailFan.position.set(-2.5, 0.05, 0); body.add(tailFan);
  // side rotor pods near the nose
  const pods = [];
  for (const s of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.5, 14), shell);
    pod.rotation.x = Math.PI / 2; pod.position.set(1.3, -0.05, s * 1.1); body.add(pod);
    const hub = new THREE.Mesh(new THREE.CircleGeometry(0.3, 14), dark);
    hub.position.set(1.3, -0.05, s * 1.36); if (s < 0) hub.rotation.y = Math.PI; body.add(hub);
    const prop = new THREE.Group();
    box(0.7, 0.08, 0.04, dark, 0, 0, 0, prop);
    prop.position.set(1.3, -0.05, s * 1.38); body.add(prop);
    pods.push(prop);
  }
  // downward fins front and rear, antenna on top
  for (const [x, z] of [[1.6, -0.5], [1.6, 0.5], [-1.9, -0.45], [-1.9, 0.45]]) {
    const fin = box(0.55, 0.55, 0.1, shellShade, x, -0.95, z, body);
    fin.rotation.z = x > 0 ? 0.35 : -0.35;
  }
  cyl(0.03, 0.03, 0.9, dark, -0.3, 1.2, 0, body, 6);
  // NVIDIA-green running light under the nose
  const runMat = new THREE.MeshBasicMaterial({ color: 0x76b900 });
  box(0.5, 0.06, 0.6, runMat, 1.5, -0.78, 0, body);
  // tethered parcel (the contract), shown on the flight home after a deal
  const tether = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 4), dark);
  tether.position.set(0, -1.9, 0); drone.add(tether);
  const parcel = new THREE.Group();
  box(0.9, 0.7, 0.9, mat(0xc79a5b), 0, 0, 0, parcel);
  box(0.92, 0.12, 0.3, mat(0xa77c43), 0, 0.2, 0, parcel);
  parcel.position.set(0, -3.4, 0); drone.add(parcel);
  tether.visible = parcel.visible = false;
  drone.scale.setScalar(1.15);
  const dLight = new THREE.PointLight(0x9cff4a, 0, 18, 1.5);
  drone.add(dLight);
  drone.visible = false;
  drone.position.copy(HOME);
  drone.traverse(o => { o.raycast = () => {}; });
  root.add(drone);
  const TRAIL = 24;
  const trailMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.35, 0.35),
    new THREE.MeshBasicMaterial({ color: 0xb6ff6a }), TRAIL);
  trailMesh.raycast = () => {};
  trailMesh.castShadow = false;
  root.add(trailMesh);
  const trail = Array.from({ length: TRAIL }, () => ({ p: new THREE.Vector3(0, -999, 0), age: 9 }));
  let trailIdx = 0, lastDrop = 0, lastT = 0;
  let flight = null;   // {from, to, t0, dur, resolve, back}
  const dummy = new THREE.Object3D();
  const now = () => performance.now() / 1000;

  function hover(id) {
    const isl = islands.get(id);
    return isl ? isl.base.clone().add(new THREE.Vector3(0, 17, 0)) : HOME.clone();
  }

  return {
    /** world position of the drone (or null when it isn't flying) */
    dronePos() { return drone.visible ? drone.position : null; },
    show(list) {
      list.forEach((p, i) => {
        if (islands.has(p.id)) { islands.get(p.id).dying = 0; return; }
        const e = build(p.id, p.name || p.id);
        e.base = SLOTS[i % SLOTS.length].clone();
        e.born = now(); e.dying = 0;
        e.group.position.copy(e.base).add(new THREE.Vector3(0, -30, 0));
        e.group.scale.setScalar(0.001);
        root.add(e.group);
        islands.set(p.id, e);
      });
    },
    hide() {
      for (const e of islands.values()) if (!e.dying) e.dying = now();
      if (flight) { const f = flight; flight = null; f.resolve(); }
      drone.visible = false;
    },
    setState(id, st) {
      const e = islands.get(id);
      if (e) e.state = ['idle', 'talking', 'deal', 'no_deal'].includes(st) ? st : 'idle';
    },
    fly(id, out) {
      const from = drone.visible ? drone.position.clone() : HOME.clone();
      const to = out ? hover(id) : HOME.clone();
      if (flight) { const f = flight; flight = null; f.resolve(); }
      drone.visible = true;
      drone.position.copy(from);
      // carry the contract home only if a deal was struck
      const carrying = !out && [...islands.values()].some(e => e.state === 'deal');
      tether.visible = parcel.visible = carrying;
      const dx = to.x - from.x, dz = to.z - from.z;
      if (dx * dx + dz * dz > 1) drone.rotation.y = Math.atan2(-dz, dx);   // nose (+x) toward the target
      return new Promise(resolve => { flight = { from, to, t0: now(), dur: 1.8, resolve, back: !out }; });
    },
    tick(t) {
      const dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
      for (const [id, e] of islands) {
        const born = clamp01((t - e.born) / 1.0);
        const ease = 1 - Math.pow(1 - born, 3);
        let k = ease, dy = (1 - ease) * -30;
        if (e.dying) {
          const d = clamp01((t - e.dying) / 0.8);
          k = 1 - d; dy = -d * 30;
          if (d >= 1) { root.remove(e.group); islands.delete(id); continue; }
        }
        e.group.scale.setScalar(Math.max(0.001, k));
        e.group.position.set(e.base.x, e.base.y + dy + Math.sin(t * 0.8 + e.base.x) * 0.4, e.base.z);
        for (const r of e.racks) r.ledMat.emissiveIntensity = 0.75 + 0.45 * Math.sin(t * r.speed + r.phase) ** 8;
        for (const f of e.fans) f.rotation.y += dt * 9;
        const pulse = 0.5 + 0.5 * Math.sin(t * 7);
        if (e.state === 'talking') { e.beaconMat.color.setHex(pulse > 0.5 ? 0xffc14d : 0xf2a33a); e.light.color.setHex(0xffc14d); e.light.intensity = 40 + 60 * pulse; }
        else if (e.state === 'deal') { e.beaconMat.color.setHex(0x76b900); e.light.color.setHex(0x76b900); e.light.intensity = 90; }
        else if (e.state === 'no_deal') { e.beaconMat.color.setHex(0xff3b2e); e.light.color.setHex(0xff3b2e); e.light.intensity = 70; }
        else { e.beaconMat.color.setHex(0x333333); e.light.intensity = 0; }
      }
      if (flight) {
        const f = clamp01((t - flight.t0) / flight.dur);
        const s = f * f * (3 - 2 * f);
        drone.position.lerpVectors(flight.from, flight.to, s);
        drone.position.y += Math.sin(Math.PI * s) * 12;      // arc
        body.rotation.z = Math.cos(Math.PI * s) * 0.18;      // pitch up on the climb, down on the descent
        if (f >= 1) {
          const done = flight; flight = null;
          body.rotation.z = 0;
          if (done.back) { drone.visible = false; tether.visible = parcel.visible = false; }
          done.resolve();
        }
      }
      if (drone.visible) {
        tailFan.rotation.x = t * 40;
        for (const p of pods) p.rotation.z = t * 45;
        if (!flight) drone.position.y += Math.sin(t * 2.2) * 0.01;   // gentle hover
        parcel.rotation.y = Math.sin(t * 1.5) * 0.3;
        dLight.intensity = 30;
        if (flight && t - lastDrop > 0.05) {
          lastDrop = t;
          trail[trailIdx].p.copy(drone.position); trail[trailIdx].age = 0;
          trailIdx = (trailIdx + 1) % TRAIL;
        }
      } else dLight.intensity = 0;
      trail.forEach((p, i) => {
        p.age += dt;
        const sc = Math.max(0, 1 - p.age * 1.6);
        dummy.position.copy(p.p); dummy.scale.setScalar(sc); dummy.updateMatrix();
        trailMesh.setMatrixAt(i, dummy.matrix);
      });
      trailMesh.instanceMatrix.needsUpdate = true;
    },
  };
}
