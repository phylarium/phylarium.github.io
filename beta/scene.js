'use strict';

// Pixel-art scene: space, a sky whose atmosphere thickens as the planet warms,
// a tappable sun and clouds, and a huge planet whose top edge sits at the middle of the screen.
const Scene = (() => {
  const { TEX_W, TEX_H, COVER, elev, cover } = Terrain;
  const TILT = 50 * Math.PI / 180;          // pole tipped away from the viewer, so the horizon is temperate
  const TILT_RANGE = [10 * Math.PI / 180, 85 * Math.PI / 180];   // how far the player can tip the view
  const LIGHT = norm([0.4, 0.85, 0.4]);     // the sun is above and to the right of the planet
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => v / 16 - 0.5);
  const SKY_BANDS = 8;
  const AIR_TAP_PX = 24;                     // minimum height of the tappable air above the planet
  const SPIN_SECONDS = 150;
  const MAX_CLOUDS = 8;

  const RAMPS = {
    deep: [[-59, '#1b3566'], [0, '#1d4f9a'], [6, '#1f5a6a'], [12, '#3a4a3a'], [20, '#4a2418']],
    shallow: [[-59, '#2a5a9a'], [0, '#2f7fd0'], [6, '#3a8a8a'], [12, '#5a6a4a'], [20, '#6a3a22']],
    desert: [[0, '#d8b870'], [10, '#c8884a'], [20, '#9a4a2a']],
    horizon: [[-59, '#7a9ac0'], [-20, '#8ab8e0'], [0, '#a8dcff'], [5, '#d8d0a0'], [12, '#ff9a50'], [20, '#ff5a20']],
    zenith: [[-59, '#121c3a'], [0, '#2a64c0'], [5, '#4a6aa0'], [12, '#7a3048'], [20, '#4a0e10']],
    space: [[-59, '#05060f'], [10, '#0a0610'], [20, '#140406']],
  };
  const ROCK = hex('#7a6a5a');
  const MOUNTAIN = hex('#5a4e48');
  const GRASS = hex('#5ab04a');
  const FOREST = hex('#2f7a3a');
  const LAND_ICE = hex('#f4fbff');
  const SEA_ICE = hex('#d4e8f6');
  const BLOOM = hex('#1f7a5a');
  const OZONE = hex('#b49cff');
  const HAZE = hex('#d88a3a');
  const ASH = hex('#8a8478');
  const SAND = hex('#e0c080');
  const SAVANNA = hex('#a8b050');
  const WETLAND = hex('#3a7a5a');
  const TUNDRA = hex('#8a9a78');
  const REEF = hex('#e0708a');
  const BLEACHED = hex('#ece4d4');
  const RIVER = hex('#3a7ad0');
  const LAKE = hex('#2a5aa8');

  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');
  const bg = document.createElement('canvas');
  const bgCtx = bg.getContext('2d');

  const texColors = new Uint32Array(TEX_W * TEX_H * 3);

  let W = 0, H = 0, P = 1, cx = 0, cy = 0, R = 0;
  let sun = { x: 0, y: 0, r: 1 }, sunF = null;   // rounded position for drawing, smooth float position
  let sunBody = null, sunMood = null;
  // Camera for the opening: zoom 0 = close on a giant sun, 1 = normal layout with the planet in view.
  let zoom = 1, zoomTarget = 1, zoomSet = false, camY = 0, sunBg = false, layout = {};
  let moon = { visible: false, wake: 0, bg: false, cur: null, fling: 0 }, moonBody = null, moonKey = null;
  let bgImage, bgPixels, pixU, pixV, pixShade, pixAlt, pixDither, stars = [];
  let skyColors = [], spaceColor = 0, atmosphere = 10;
  let climate = null, spin = 0, lastBg = -1e9;
  let landLife = 0, oceanLife = 0, ozone = 0, land = 0.3, mountains = 0, aerosols = 0;
  let iceCoverValue = 1, pressure = 0, haze = 0, sunBright = 1;
  // Volcanoes stand on the map and turn with the planet: tap a glowing one to make it erupt; it then cools for a while.
  const VOLCANO_COOL_S = 8;
  let volcanoes = [], onVolcanoFn = () => {};
  const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let critterHits = [], onCritterFn = () => {};
  const MOVES = { fly: 'fly', fish: 'swim', reeffish: 'swim', jelly: 'swim', worm: 'swim', frog: 'hop', bug: 'hop' };
  let clouds = [], cloudCover = 0, storms = 0;
  let particles = [], bolts = [];
  let sunPress = 0, comet = null, spinLevel = 0, drag = null;
  // Opening movie: 'pre' = the singularity waits for taps, 'warp' = the flight through space after the bang.
  // Day and night: once the planet spins steadily, the sun rises at 6 and sets at 18 o'clock.
  let dayShown = false, dayHour = 12, dayFirst = true;
  let viewTilt = TILT, tiltDirty = false;   // the player can tip the planet to look at it from other angles
  // Once days run, the view settles on the planet: it stops turning and the sky turns instead.
  let landed = 0, skyShift = 0, lastHour = null;
  let cinema = null, bangHeat = 0, warpT = 0, warpV = 0, warpFlash = 0, warpStars = [], onBangFn = () => {};
  let onSun = () => {}, onZone = () => {}, onCloud = () => {}, onComet = () => {}, onMoon = () => {}, onSpinFn = () => {};

  /* ---------- helpers ---------- */

  function norm(v) {
    const l = Math.hypot(...v);
    return v.map(x => x / l);
  }

  function rng(seed) {
    return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  function lerp(a, b, k) {
    return a + (b - a) * k;
  }

  function clamp01(k) {
    return Math.max(0, Math.min(1, k));
  }

  function smooth(k) {
    return k * k * (3 - 2 * k);
  }

  function hex(h) {
    const n = parseInt(h.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }

  function mix(a, b, k) {
    return a.map((v, i) => v + (b[i] - v) * k);
  }

  function css([r, g, b]) {
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  function ramp(stops, t) {
    if (t <= stops[0][0]) return hex(stops[0][1]);
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
        return mix(hex(c0), hex(c1), (t - t0) / (t1 - t0));
      }
    }
    return hex(stops[stops.length - 1][1]);
  }

  // ImageData is little-endian RGBA, so pack as ABGR.
  function pack([r, g, b], f = 1) {
    const c = v => Math.max(0, Math.min(255, Math.round(v * f)));
    return ((255 << 24) | (c(b) << 16) | (c(g) << 8) | c(r)) >>> 0;
  }

  function surfaceY(x) {
    return cy - Math.sqrt(Math.max(0, R * R - (x - cx) ** 2));
  }

  // Surface height on screen, including the opening camera offset.
  function groundY(x) {
    return surfaceY(x) + camY;
  }

  // Which domain is drawn at a screen pixel: the sky, or ocean or land on the turning planet.
  function zoneAt(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y - camY);
    if (ix < 0 || ix >= W || y < 0 || y >= H) return null;
    if (iy < 0) return 'space';
    const i = iy * W + ix;
    // The band just above the planet counts as air even when the air is still too thin to see,
    // so the atmosphere can be reached before any gas has thawed.
    if (pixU[i] < 0) return pixAlt[i] > Math.max(atmosphere * 1.05, AIR_TAP_PX) ? 'space' : 'atmosphere';
    const u = ((pixU[i] * TEX_W + spin * TEX_W) | 0) % TEX_W;
    return elev[pixV[i] * TEX_W + u] < Terrain.sea() ? 'ocean' : 'ground';
  }

  /* ---------- climate ---------- */

  // Visible thickness of the air: grows with gas pressure and with heat.
  const atmosphereHeight = t => Math.max(0.5, (H / 2) * pressure * (t < 0 ? lerp(0.25, 0.6, clamp01((t + 59) / 59)) : lerp(0.6, 1.3, clamp01(t / 20))));
  // Planets lit by a dim sun look darker.
  const surfaceLight = () => 0.25 + 0.75 * Math.sqrt(clamp01(sunBright / 0.7));

  // Work out the map for the climate, then paint each texel's cover in three shades (lit, mid, shadow).
  function updateTexture(t) {
    Terrain.update(t, iceCoverValue, landLife, viewCentre());
    const light = surfaceLight(), colors = [];
    colors[COVER.DEEP] = mix(ramp(RAMPS.deep, t), BLOOM, oceanLife * 0.3);
    colors[COVER.SHALLOW] = mix(ramp(RAMPS.shallow, t), BLOOM, oceanLife * 0.45);
    colors[COVER.BARE] = ramp(RAMPS.desert, t);
    Object.assign(colors, {
      [COVER.REEF]: REEF, [COVER.BLEACHED]: BLEACHED, [COVER.SEA_ICE]: SEA_ICE, [COVER.LAND_ICE]: LAND_ICE,
      [COVER.RIVER]: RIVER, [COVER.LAKE]: LAKE, [COVER.MOUNTAIN]: MOUNTAIN, [COVER.ROCK]: ROCK, [COVER.TUNDRA]: TUNDRA,
      [COVER.WETLAND]: WETLAND, [COVER.FOREST]: FOREST, [COVER.GRASS]: GRASS, [COVER.SAVANNA]: SAVANNA, [COVER.SAND]: SAND,
    });
    const shades = colors.map(c => [pack(c, 1.18 * light), pack(c, light), pack(c, 0.68 * light)]);
    for (let i = 0; i < cover.length; i++) {
      const sh = shades[cover[i]];
      texColors[i * 3] = sh[0];
      texColors[i * 3 + 1] = sh[1];
      texColors[i * 3 + 2] = sh[2];
    }
  }

  function updateSky(t) {
    atmosphere = atmosphereHeight(t);
    // Methane haze without oxygen tints the sky orange, like Titan.
    const horizon = mix(ramp(RAMPS.horizon, t), HAZE, haze * 0.85), zenith = mix(ramp(RAMPS.zenith, t), HAZE, haze * 0.6);
    skyColors = [];
    for (let k = 0; k < SKY_BANDS; k++) {
      let c = mix(horizon, zenith, k / (SKY_BANDS - 1));
      const low = 1 - k / (SKY_BANDS * 0.4);
      if (k === SKY_BANDS - 2) c = mix(c, OZONE, ozone * 0.25); // the ozone layer, high in the sky
      c = mix(c, ASH, aerosols * 0.5);                           // eruption aerosols dim the whole sky
      skyColors.push(pack(c));
    }
    spaceColor = pack(ramp(RAMPS.space, t));
  }

  /* ---------- layout ---------- */

  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    P = Math.max(2, Math.round(Math.min(vw, vh * 0.55) / 180));
    W = Math.ceil(vw / P);
    H = Math.ceil(vh / P);
    canvas.width = bg.width = W;
    canvas.height = bg.height = H;
    canvas.style.width = `${W * P}px`;
    canvas.style.height = `${H * P}px`;
    ctx.imageSmoothingEnabled = false;

    // Circle whose top is the middle of the screen and which passes through both bottom corners.
    R = (W * W + H * H) / (4 * H);
    cx = W / 2;
    cy = H / 2 + R;
    // The sun sits on the right, within thumb reach, inside the same column as the UI on wide screens.
    const rn = Math.round(Math.min(W * 0.1, H * 0.055)), column = Math.min(vw, 520) / P;
    layout = {
      rn, rb: Math.round(rn * 0.6), rm: Math.round(rn * 0.55), rmb: Math.round(rn * 0.4),
      colRight: (W + column) / 2, colLeft: (W - column) / 2,
    };
    sunF = sunTarget();
    moon.cur = moonTarget();
    sunMood = moonKey = null;

    bgImage = bgCtx.createImageData(W, H);
    bgPixels = new Uint32Array(bgImage.data.buffer);
    const n = W * H;
    pixU = new Float32Array(n);
    pixV = new Uint16Array(n);
    pixShade = new Uint8Array(n);
    pixAlt = new Float32Array(n);
    pixDither = new Float32Array(n);
    mapPlanet();

    const rand = rng(3);
    stars = Array.from({ length: Math.round(W * H / 900) }, () => ({
      x: Math.floor(rand() * W),
      y: Math.floor(rand() * H * 0.5),
      c: css([255, 255, 255].map(v => v * (0.5 + rand() * 0.5))),
    }));


    clouds = Array.from({ length: MAX_CLOUDS }, () => ({
      x: rand() * W, alt: 0.3 + rand() * 0.4, w: 10 + Math.floor(rand() * 10), speed: 1.5 + rand() * 3,
    }));

    if (climate !== null) updateSky(climate);
    lastBg = -1e9;
  }

  // Which texture point each screen pixel of the planet shows, for the current view tilt, and the sky's
  // height above the planet for every other pixel.
  function mapPlanet() {
    const cosT = Math.cos(viewTilt), sinT = Math.sin(viewTilt);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x, dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
        const dither = BAYER[(y & 3) * 4 + (x & 3)];
        if (d <= R) {
          const nx = dx / R, ny = -dy / R, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
          const wy = ny * cosT - nz * sinT, wz = ny * sinT + nz * cosT;
          const lat = Math.asin(Math.max(-1, Math.min(1, wy)));
          pixU[i] = Math.atan2(nx, wz) / (2 * Math.PI) + 0.5;
          pixV[i] = Math.min(TEX_H - 1, Math.max(0, Math.floor((0.5 - lat / Math.PI) * TEX_H)));
          const b = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2] + dither * 0.12;
          pixShade[i] = b > 0.55 ? 0 : b > 0.2 ? 1 : 2;
        } else {
          pixU[i] = -1;
          pixAlt[i] = d - R;
          pixDither[i] = dither * 0.18;
        }
      }
    }
  }

  /* ---------- features on the map ---------- */

  // The texture spot in the middle of the view, where new features appear so the player sees them.
  function viewCentre() {
    if (!pixU) return { u: TEX_W / 2, v: TEX_H / 2 };
    const i = Math.floor(H * 0.75) * W + Math.floor(cx);
    return { u: ((pixU[i] + spin) % 1) * TEX_W, v: pixV[i] };
  }

  // Screen point of a texture spot on the turning planet, or null when it is on the far side.
  function project(s) {
    const a = ((((s.u + 0.5) / TEX_W - spin) % 1 + 1) % 1 - 0.5) * 2 * Math.PI;
    const lat = (0.5 - (s.v + 0.5) / TEX_H) * Math.PI;
    const wy = Math.sin(lat), nx = Math.cos(lat) * Math.sin(a), wz = Math.cos(lat) * Math.cos(a);
    const cosT = Math.cos(viewTilt), sinT = Math.sin(viewTilt);
    const ny = wy * cosT + wz * sinT, nz = -wy * sinT + wz * cosT;
    if (nz < 0.12) return null;
    const p = { x: Math.round(cx + nx * R), y: Math.round(cy - ny * R + camY) };
    return p.y > H + 4 ? null : p;
  }

  /* ---------- drawing ---------- */

  function renderBackground() {
    const n = W * H, shift = spin * TEX_W;
    for (let i = 0; i < n; i++) {
      const u0 = pixU[i];
      if (u0 >= 0) {
        const u = ((u0 * TEX_W + shift) | 0) % TEX_W;
        bgPixels[i] = texColors[(pixV[i] * TEX_W + u) * 3 + pixShade[i]];
      } else {
        const band = Math.floor((pixAlt[i] / atmosphere + pixDither[i]) * SKY_BANDS);
        bgPixels[i] = band < SKY_BANDS ? skyColors[Math.max(0, band)] : spaceColor;
      }
    }
    bgCtx.putImageData(bgImage, 0, 0);
  }

  function renderSunBody(mood, bright) {
    const dim = 1 - clamp01(bright / 0.7);
    const r = sun.r, size = Math.ceil(r * 2.3) + 4, c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d'), m = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x + 0.5 - m, y + 0.5 - m) / r + BAYER[(y & 3) * 4 + (x & 3)] * 0.12;
        let col = null;
        if (d < 0.45) col = '#fff6b0';
        else if (d < 0.75) col = '#ffd23f';
        else if (d < 0.93) col = '#ffa62a';
        else if (d < 1) col = '#e0701a';
        else if (d < 1.12 && (x + y) % 2 === 0) col = '#ff9a2a';
        if (col) {
          g.fillStyle = css(mix(hex(col), [58, 22, 14], dim * 0.85));
          g.fillRect(x, y, 1, 1);
        }
      }
    }
    const face = dim > 0.6 ? '#1a0a06' : '#7a3a00', ex = Math.round(r * 0.33), ey = Math.round(m - r * 0.15);
    g.fillStyle = face;
    // Closed, sleepy eyes until the sun is properly lit.
    const eyeH = dim > 0.6 ? 1 : 3;
    g.fillRect(Math.round(m - ex - 1), ey + (3 - eyeH), 2, eyeH);
    g.fillRect(Math.round(m + ex - 1), ey + (3 - eyeH), 2, eyeH);
    const mw = Math.round(r * 0.4);
    for (let x = -mw; x <= mw; x++) {
      const y = Math.round(m + r * 0.32 - (x * x) * (0.9 / r) * (mood < 0 ? -0.6 : 1));
      g.fillRect(Math.round(m + x), y, 1, 2);
    }
    if (mood > 0) {
      g.fillStyle = '#8ad8ff';
      g.fillRect(Math.round(m + r * 0.6), Math.round(m - r * 0.4), 2, 3);
      g.fillRect(Math.round(m + r * 0.6) + 2, Math.round(m - r * 0.4) + 3, 1, 1);
    }
    return c;
  }

  const sunVisible = () => dayShown && dayHour >= 6 && dayHour <= 18;
  // 1 in full daylight, 0 at night, with an hour of dawn and dusk on each side.
  const daylight = () => (dayShown ? clamp01((Math.min(dayHour - 5, 19 - dayHour)) / 2) : 1);

  function sunTarget() {
    if (dayShown) {
      // The sun's path across the sky: up on the left at 6, highest at noon, down on the right at 18.
      return skyPath(dayHour, sunBg ? layout.rb : layout.rn);
    }
    const e = smooth(clamp01(zoom));
    const n = sunBg
      ? { x: layout.colRight - layout.rb - 10, y: H * 0.21, r: layout.rb }
      : { x: layout.colRight - layout.rn - 14, y: H * 0.33, r: layout.rn };
    const big = { x: W / 2, y: H * 0.42, r: Math.min(W, H * 0.6) * 0.42 };
    return { x: lerp(big.x, n.x, e), y: lerp(big.y, n.y, e), r: lerp(big.r, n.r, e) };
  }

  // Once days run, the moon has the night sky: it rises at 18 and sets at 6, on the sun's path.
  const moonUp = () => !dayShown || dayHour >= 18 || dayHour <= 6;

  // Where a body sits on the day path at hour h (6 = rising on the left, 18 = setting on the right).
  function skyPath(h, r) {
    const t = clamp01((h - 6) / 12);
    return { x: lerp(layout.colLeft + r + 12, layout.colRight - r - 12, t), y: H / 2 + r * 0.6 - Math.sin(Math.PI * t) * H * 0.3, r };
  }

  function moonTarget() {
    if (dayShown) return skyPath((dayHour + 12) % 24, moon.bg ? layout.rmb : layout.rm);
    return moon.bg
      ? { x: layout.colLeft + layout.rmb + 12, y: H * 0.2, r: layout.rmb }
      : { x: layout.colLeft + layout.rm + 16, y: H * 0.24, r: layout.rm };
  }

  // Moves the sun and moon smoothly toward where they belong (opening zoom, background mode).
  function updateBodies(dt) {
    zoom += (zoomTarget - zoom) * Math.min(1, dt * 3);
    camY = Math.round(lerp(H * 0.62, 0, smooth(clamp01(zoom))));
    const k = Math.min(1, dt * 4), t = sunTarget(), m = moonTarget();
    // A moon just thrown off the planet drifts slowly up to its place in the sky.
    const km = moon.fling > 0 ? Math.min(1, dt * 1.2) : dayShown ? 1 : k;
    moon.fling = Math.max(0, moon.fling - dt);
    for (const key of ['x', 'y', 'r']) {
      sunF[key] += (t[key] - sunF[key]) * (dayShown ? 1 : k);
      moon.cur[key] += (m[key] - moon.cur[key]) * km;
    }
    sun = { x: Math.round(sunF.x), y: Math.round(sunF.y), r: Math.max(2, Math.round(sunF.r)) };
  }

  function renderMoonBody(r, wake) {
    const size = r * 2 + 3, c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d'), m = size / 2, rand = rng(5);
    const base = mix([58, 58, 72], [208, 208, 220], wake);
    const craters = Array.from({ length: 5 }, () => ({ x: (rand() - 0.5) * r * 1.2, y: (rand() - 0.5) * r * 1.2, r: 1 + rand() * r * 0.25 }));
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - m, dy = y + 0.5 - m;
        if (Math.hypot(dx, dy) > r) continue;
        // Lit from the right, where the sun is.
        let f = 0.75 + 0.35 * (dx / r) + BAYER[(y & 3) * 4 + (x & 3)] * 0.12;
        if (craters.some(k => Math.hypot(dx - k.x, dy - k.y) < k.r)) f -= 0.18;
        g.fillStyle = css(base.map(v => v * Math.max(0.4, Math.min(1.15, f))));
        g.fillRect(x, y, 1, 1);
      }
    }
    // Asleep: closed eyes. Awake: open eyes and a small smile.
    g.fillStyle = wake >= 1 ? '#3a3a4a' : '#24242e';
    const ex = Math.max(2, Math.round(r * 0.35)), ey = Math.round(m - r * 0.15);
    const eyeH = wake >= 1 ? 2 : 1;
    g.fillRect(Math.round(m - ex - 1), ey + (2 - eyeH), 2, eyeH);
    g.fillRect(Math.round(m + ex - 1), ey + (2 - eyeH), 2, eyeH);
    if (wake >= 1) g.fillRect(Math.round(m - 2), Math.round(m + r * 0.35), 4, 1);
    return c;
  }

  function drawMoon() {
    if (!moon.visible) return;
    const r = Math.max(2, Math.round(moon.cur.r)), key = `${r}|${Math.round(moon.wake * 10)}`;
    if (key !== moonKey) {
      moonKey = key;
      moonBody = renderMoonBody(r, moon.wake);
    }
    ctx.drawImage(moonBody, Math.round(moon.cur.x - moonBody.width / 2), Math.round(moon.cur.y - moonBody.height / 2));
  }

  // Stars in clear, dark sky only: not on the planet or in the lit air. Brighter at night.
  function drawStars(night) {
    ctx.globalAlpha = dayShown ? 0.35 + 0.65 * night : 1;
    for (const st of stars) {
      const x = Math.floor((st.x + skyShift) % W), i = st.y * W + x;
      if (pixU[i] >= 0 || pixAlt[i] <= atmosphere * 1.05) continue;
      ctx.fillStyle = st.c;
      ctx.fillRect(x, st.y + camY, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // The sun's face for its current mood, brightness and size, rebuilt only when one of them changes.
  function sunSprite() {
    const mood = climate > 8 ? 1 : climate < -40 ? -1 : 0, key = `${mood}|${Math.round(sunBright * 20)}|${sun.r}`;
    if (key !== sunMood) {
      sunMood = key;
      sunBody = renderSunBody(mood, sunBright);
    }
    return sunBody;
  }

  function drawSun(now, dt) {
    sunSprite();
    sunPress = Math.max(0, sunPress - dt * 8);
    const press = sunPress > 0 ? 1 : 0, { x, y, r } = sun, a0 = now / 6000;
    const rayScale = clamp01((sunBright - 0.05) / 0.65);
    for (let k = 0; rayScale > 0 && k < 12; k++) {
      const a = a0 + k * Math.PI / 6, long = k % 2 === 0, len = Math.round(((long ? 8 : 5) - press * 2) * rayScale), w = long ? 2 : 1;
      ctx.fillStyle = long ? '#ffd23f' : '#ffb02e';
      for (let s = r + 4; s < r + 4 + len; s++) {
        ctx.fillRect(Math.round(x + Math.cos(a) * s - w / 2), Math.round(y + Math.sin(a) * s - w / 2), w, w);
      }
    }
    ctx.drawImage(sunBody, Math.round(x - sunBody.width / 2), Math.round(y - sunBody.height / 2) + press);
  }

  // Visible clouds, with storm clouds first. Each gets its screen box for drawing and tapping.
  function visibleClouds() {
    const n = Math.min(MAX_CLOUDS, Math.ceil(cloudCover * MAX_CLOUDS * 1.5));
    const out = [];
    for (let k = 0; k < n; k++) {
      const c = clouds[k], storm = k < storms, w = c.w + (storm ? 6 : 0);
      out.push({ cloud: c, storm, x: Math.round(c.x - w), y: Math.round(H / 2 - c.alt * Math.max(atmosphere, 40) + camY), w });
    }
    return out;
  }

  function drawClouds(now, dt) {
    const white = css([245, 248, 255]), whiteShade = css([200, 210, 225]);
    for (const v of visibleClouds()) {
      v.cloud.x = (v.cloud.x + v.cloud.speed * dt) % (W + v.w);
      const { x, y, w, storm } = v;
      ctx.fillStyle = storm ? '#5a5a78' : white;
      ctx.fillRect(x + 2, y - 1, w - 4, 1);
      if (w > 10) ctx.fillRect(x + 4, y - 2, w - 9, 1);
      if (storm) ctx.fillRect(x + 6, y - 3, w - 14, 1);
      ctx.fillRect(x, y, w, 2);
      ctx.fillStyle = storm ? '#3a3a52' : whiteShade;
      ctx.fillRect(x + 1, y + 2, w - 2, storm ? 2 : 1);
      if (storm && Math.floor(now / 90 + v.cloud.alt * 50) % 23 === 0) {
        ctx.fillStyle = '#ffe066';
        ctx.fillRect(x + Math.floor(w / 2), y + 4, 1, 2);
      }
    }
  }

  // A zigzag bolt from a storm cloud down to the surface. Returns where it hit.
  function strike(v) {
    let x = v.x + Math.floor(v.w / 2), y = v.y + 4;
    const hitY = Math.round(groundY(x)) + 2, points = [];
    while (y < hitY) {
      points.push([x, y]);
      y += 1;
      if (Math.random() < 0.35) x += Math.random() < 0.5 ? -1 : 1;
    }
    bolts.push({ points, life: 0.25 });
    for (let k = 0; k < 6; k++) {
      particles.push({ x, y: hitY - 2, vx: (Math.random() - 0.5) * 40, vy: -Math.random() * 30, life: 0.4, max: 0.4, size: 1, color: '#fff3a0' });
    }
    return { zone: zoneAt(x, hitY), x: x * P, y: hitY * P };
  }

  function rain(v) {
    for (let k = 0; k < 14; k++) {
      const x = v.x + 1 + Math.random() * (v.w - 2), hitY = groundY(x), time = 0.4 + Math.random() * 0.3;
      particles.push({ x, y: v.y + 3, vx: 0, vy: (hitY - v.y - 3) / time, life: time, max: time, size: 1, color: '#7ab8ff' });
    }
  }

  function drawBolts(dt) {
    bolts = bolts.filter(b => (b.life -= dt) > 0);
    for (const b of bolts) {
      ctx.fillStyle = b.life > 0.12 ? '#ffffff' : '#ffe066';
      for (const [x, y] of b.points) ctx.fillRect(x, y, 1, 1);
    }
  }

  // A sprite with a dark outline, so small critters stand out against the ground they are on.
  const outlines = {};
  function outlined(id) {
    if (outlines[id]) return outlines[id];
    const src = Sprites.canvas(id), c = document.createElement('canvas'), g = c.getContext('2d');
    c.width = src.width + 2;
    c.height = src.height + 2;
    for (const [dx, dy] of NEIGHBOURS) g.drawImage(src, 1 + dx, 1 + dy);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#1a1420';
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    g.drawImage(src, 1, 1);
    return (outlines[id] = c);
  }

  // Volcanoes and peaks stand on the map, drawn back to front at double size: they are landmarks. Critters
  // stand among them at their own size and move a little.
  function drawLandmarks(now, dt) {
    const marks = [];
    for (const v of volcanoes) {
      v.cool = Math.max(0, v.cool - dt);
      v.at = project(Terrain.volcanoSpot(v.spot));
      if (v.at) marks.push({ at: v.at, id: v.cool > 0 ? 'volcanoCold' : 'volcano', size: 2 });
    }
    const peak = Terrain.features().snow ? 'peakSnow' : 'peak';
    for (const p of Terrain.peaks()) {
      const at = project(p);
      if (at) marks.push({ at, id: peak, size: 2 });
    }
    const t = now / 1000;
    critterHits = [];
    for (const c of Terrain.critters()) {
      const move = MOVES[c.sprite];
      for (const s of c.spots) {
        const at = project(s);
        if (!at) continue;
        const k = Math.sin(t * 2 + s.phase);
        const dx = move === 'swim' ? Math.round(k) : 0;
        const dy = move === 'fly' ? Math.round(k * 1.5) - 5 : move === 'hop' ? -Math.round(Math.max(0, k) * 2) : 0;
        const img = outlined(c.sprite), x = at.x + dx, y = at.y + dy;
        marks.push({ at: { x, y }, img, size: 1 });
        critterHits.push({ id: c.id, x, y, w: img.width, h: img.height });
      }
    }
    marks.sort((a, b) => a.at.y - b.at.y);
    for (const m of marks) {
      const c = m.img || Sprites.canvas(m.id), w = c.width * m.size, h = c.height * m.size;
      ctx.drawImage(c, m.at.x - Math.floor(w / 2), m.at.y - h + m.size, w, h);
    }
  }

  function drawComet(dt) {
    if (!comet) return;
    comet.x += comet.vx * dt;
    comet.y += comet.vy * dt;
    if (comet.x > W + 10) {
      comet = null;
      return;
    }
    if (Math.random() < 0.9) {
      particles.push({ x: comet.x, y: comet.y, vx: -6, vy: -2, life: 0.8, max: 0.8, size: 1, color: Math.random() < 0.5 ? '#bfe8ff' : '#ffffff' });
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(comet.x) - 1, Math.round(comet.y) - 1, 3, 3);
    ctx.fillStyle = '#bfe8ff';
    ctx.fillRect(Math.round(comet.x) - 2, Math.round(comet.y), 1, 1);
  }

  function drawParticles(dt) {
    const next = [];
    for (const p of particles) {
      p.life -= dt;
      if (p.life <= 0) {
        p.done?.(next);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.trail) next.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.15, max: 0.15, size: 1, color: '#ffe066' });
      ctx.globalAlpha = Math.max(0.15, Math.ceil(p.life / p.max * 4) / 4);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      next.push(p);
    }
    ctx.globalAlpha = 1;
    particles = next.length > 600 ? next.slice(-600) : next;
  }

  /* ---------- opening movie ---------- */

  function disc(x, y, r) {
    for (let dy = -Math.ceil(r); dy <= r; dy++) {
      const w = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
      ctx.fillRect(Math.round(x - w), Math.round(y + dy), w * 2 + 1, 1);
    }
  }

  function line(x0, y0, x1, y1) {
    const n = Math.min(200, Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))));
    for (let k = 0; k <= n; k++) ctx.fillRect(Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n), 1, 1);
  }

  // The singularity: a dot that wobbles, swells and heats from red to white as the player taps.
  function drawSingularity(now) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const h = bangHeat, shake = h * h * 3;
    const x = W / 2 + (Math.random() - 0.5) * shake * 2, y = H / 2 + (Math.random() - 0.5) * shake * 2;
    const r = 1.5 + h * 7 + Math.sin(now / 90) * h * 1.5;
    const hot = mix(hex('#ff3a1a'), [255, 255, 255], h);
    for (let k = 3; k >= 1; k--) {
      ctx.globalAlpha = 0.06 + 0.12 * h * (4 - k) / 3;
      ctx.fillStyle = css(mix(hex('#ff7a2a'), [255, 255, 255], h * 0.6));
      disc(x, y, r + k * (2 + 4 * h));
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = css(hot);
    disc(x, y, r);
  }

  const WARP_COLORS = ['#6a8aff', '#ff8a5a', '#c8a0ff', '#8af0b0', '#ffd23f'];

  function newStar(z) {
    const big = Math.random() < 0.05;
    return {
      x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z, big,
      color: big ? WARP_COLORS[Math.floor(Math.random() * WARP_COLORS.length)] : Math.random() < 0.3 ? '#bfe0ff' : '#ffffff',
    };
  }

  function drawWarp(now, dt) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    // The flight brakes on arrival, when the sun comes up ahead.
    const v = warpT > 0.8 ? Math.max(0.05, warpV * (1 - (warpT - 0.8) / 0.1)) : warpV;
    const f = Math.min(W, H) * 0.5, ox = W / 2, oy = H / 2;
    for (const st of warpStars) {
      st.z -= v * dt * 0.25;
      if (st.z <= 0.02) {
        Object.assign(st, newStar(1));
        continue;
      }
      const x1 = ox + st.x / st.z * f, y1 = oy + st.y / st.z * f;
      ctx.fillStyle = st.color;
      if (st.big) disc(x1, y1, Math.min(14, 0.5 / st.z));
      else {
        // Streaks: where the star was a moment ago, stretched by the speed (light speed lines).
        const zt = Math.min(1, st.z + v * 0.04);
        line(ox + st.x / zt * f, oy + st.y / zt * f, x1, y1);
      }
    }
    // The bang's flash fades out.
    warpFlash = Math.max(0, warpFlash - dt * 2);
    if (warpFlash > 0) {
      ctx.globalAlpha = warpFlash;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    // On arrival the dark, frozen planet fades in.
    if (warpT > 0.8) {
      if (now - lastBg > 120) {
        renderBackground();
        lastBg = now;
      }
      ctx.globalAlpha = smooth(clamp01((warpT - 0.8) / 0.2));
      ctx.drawImage(bg, 0, camY);
      ctx.globalAlpha = 1;
    }
  }

  function draw(now, dt) {
    if (!W) return;
    if (cinema) {
      updateBodies(dt);
      if (cinema === 'pre') drawSingularity(now);
      else drawWarp(now, dt);
      drawParticles(dt);
      return;
    }
    // The player's spin turns the planet much faster than its slow idle drift.
    landed = dayShown ? Math.min(1, landed + dt / 3) : 0;
    const turn = (1 / SPIN_SECONDS + spinLevel ** 2 * 0.5) * (1 - smooth(landed));
    spin = (spin + dt * turn) % 1;
    if (tiltDirty) {
      tiltDirty = false;
      mapPlanet();
    }
    // The stars sweep across the sky at the same pace as the sun and moon.
    if (dayShown && lastHour !== null) {
      const hours = (dayHour - lastHour + 24) % 24, perHour = (layout.colRight - layout.colLeft) / 12;
      skyShift = (skyShift + hours * perHour * smooth(landed)) % W;
    }
    lastHour = dayShown ? dayHour : null;
    if (now - lastBg > (turn > 0.03 ? 33 : 120)) {
      renderBackground();
      lastBg = now;
    }
    updateBodies(dt);
    // During the opening the planet sits lower; fill the sky above it with the top of the background.
    ctx.drawImage(bg, 0, camY);
    if (camY > 0) ctx.drawImage(bg, 0, 0, W, camY, 0, 0, W, camY);
    const night = 1 - daylight();
    if (night > 0) {
      ctx.fillStyle = `rgba(2, 4, 16, ${(0.55 * night).toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    }
    drawStars(night);
    // Sun and moon rise and set behind the planet: clip them to the sky.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(cx, cy + camY, R, 0, Math.PI * 2);
    ctx.clip('evenodd');
    if (moonUp() || moon.fling > 0) drawMoon();
    ctx.restore();
    drawClouds(now, dt);
    if (sunVisible()) {
      // In front of clouds so it stays tappable.
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.arc(cx, cy + camY, R, 0, Math.PI * 2);
      ctx.clip('evenodd');
      drawSun(now, dt);
      ctx.restore();
    }
    drawBolts(dt);
    drawLandmarks(now, dt);
    drawComet(dt);
    drawParticles(dt);
  }

  /* ---------- input ---------- */

  canvas.addEventListener('pointerdown', e => {
    const x = e.clientX / P, y = e.clientY / P;
    // During the opening movie the whole screen is the singularity, and then the throttle.
    if (cinema) {
      e.preventDefault();
      onBangFn(e.clientX, e.clientY);
      return;
    }
    if (comet && Math.hypot(x - comet.x, y - comet.y) < 10) {
      e.preventDefault();
      comet = null;
      onComet(e.clientX, e.clientY);
      return;
    }
    if (sunVisible() && Math.hypot(x - sun.x, y - sun.y) <= sun.r + 10) {
      e.preventDefault();
      sunPress = 1;
      onSun(e.clientX, e.clientY);
      return;
    }
    if (moon.visible && moonUp() && Math.hypot(x - moon.cur.x, y - moon.cur.y) <= moon.cur.r + 8) {
      e.preventDefault();
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * Math.PI * 2;
        particles.push({ x: moon.cur.x, y: moon.cur.y, vx: Math.cos(a) * 20, vy: Math.sin(a) * 20, life: 0.4, max: 0.4, size: 1, color: '#e8e8f8' });
      }
      onMoon(e.clientX, e.clientY);
      return;
    }
    const vi = volcanoes.findIndex(v => v.at && Math.abs(x - v.at.x) <= 14 && y <= v.at.y + 3 && y >= v.at.y - 15);
    if (vi >= 0) {
      e.preventDefault();
      if (volcanoes[vi].cool <= 0) onVolcanoFn(vi);
      return;
    }
    // Critters are small, so the tap area reaches a little past the sprite. The nearest one wins.
    const near = critterHits.filter(c => Math.abs(x - c.x) <= c.w / 2 + 3 && y >= c.y - c.h - 3 && y <= c.y + 3);
    if (near.length) {
      e.preventDefault();
      const c = near.sort((a, b) => Math.hypot(x - a.x, y - a.y) - Math.hypot(x - b.x, y - b.y))[0];
      onCritterFn(c.id, e.clientX, e.clientY);
      return;
    }
    const hit = visibleClouds().find(v => x >= v.x - 3 && x <= v.x + v.w + 3 && y >= v.y - 6 && y <= v.y + 6);
    if (hit) {
      e.preventDefault();
      if (hit.storm) {
        const s = strike(hit);
        onCloud('storm', s.zone, s.x, s.y);
      } else {
        rain(hit);
        onCloud('rain', null, e.clientX, e.clientY);
      }
      return;
    }
    const zone = zoneAt(x, y);
    if (!zone) return;
    // On the planet a press is a tap (opens that zone) or a swipe (spins the planet); release decides.
    if (zone !== 'atmosphere') {
      drag = { x: e.clientX, y: e.clientY, moved: 0, zone, px: x, py: y };
      canvas.setPointerCapture?.(e.pointerId);
      return;
    }
    zoneTap(zone, x, y);
  });

  function zoneTap(zone, x, y) {
    const color = { atmosphere: '#a8dcff', ocean: '#3a8ad8', ground: '#c8a070' }[zone];
    for (let k = 0; color && k < 8; k++) {
      const a = k * Math.PI / 4;
      particles.push({ x, y, vx: Math.cos(a) * 18, vy: Math.sin(a) * 18, life: 0.3, max: 0.3, size: 1, color });
    }
    onZone(zone, x * P, y * P);
  }

  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved <= 8) return;
    if (dayShown) {
      // Once the planet holds still, dragging turns it to look at it from other sides and angles.
      spin = (spin - dx / window.innerWidth * 0.5 + 1) % 1;
      viewTilt = Math.max(TILT_RANGE[0], Math.min(TILT_RANGE[1], viewTilt - dy / window.innerHeight * 2));
      tiltDirty = true;
      lastBg = -1e9;
      return;
    }
    onSpinFn(Math.abs(dx) / window.innerWidth);
    if (Math.random() < 0.5) {
      particles.push({ x: e.clientX / P, y: e.clientY / P, vx: Math.sign(dx) * 40, vy: 0, life: 0.3, max: 0.3, size: 1, color: '#e8eef8' });
    }
  });
  canvas.addEventListener('pointerup', () => {
    if (drag && drag.moved <= 8) zoneTap(drag.zone, drag.px, drag.py);
    drag = null;
  });
  canvas.addEventListener('pointercancel', () => {
    drag = null;
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('resize', resize);

  /* ---------- public API ---------- */

  return {
    init() {
      resize();
    },
    draw,
    setClimate(t) {
      if (climate !== null && Math.abs(t - climate) < 0.05) return;
      climate = t;
      updateTexture(t);
      updateSky(t);
      lastBg = -1e9;
    },
    // How green the land is and how much life colors the ocean (0..1 each), and the ozone layer (0..1).
    setLife(land, ocean, oz) {
      const changed = Math.abs(land - landLife) > 0.02 || Math.abs(ocean - oceanLife) > 0.02;
      const ozChanged = Math.abs(oz - ozone) > 0.02;
      if (!changed && !ozChanged) return;
      landLife = land;
      oceanLife = ocean;
      ozone = oz;
      if (climate === null) return;
      if (changed) updateTexture(climate);
      updateSky(climate);
      lastBg = -1e9;
    },
    // Share of the planet under ice (0..1).
    setIce(cover) {
      if (Math.abs(cover - iceCoverValue) < 0.004) return;
      iceCoverValue = cover;
      if (climate !== null) updateTexture(climate);
      lastBg = -1e9;
    },
    // Air pressure (0..1, nitrogen atmosphere), methane haze (0..1) and sun brightness (0..1, today = 1).
    setAtmosphere(p, h, sun) {
      if (Math.abs(p - pressure) < 0.01 && Math.abs(h - haze) < 0.02 && Math.abs(sun - sunBright) < 0.01) return;
      const lightChanged = Math.abs(sun - sunBright) >= 0.01;
      pressure = p;
      haze = h;
      sunBright = sun;
      if (climate === null) return;
      updateSky(climate);
      if (lightChanged) updateTexture(climate);
      lastBg = -1e9;
    },
    setClouds(cover, stormCount) {
      cloudCover = cover;
      storms = stormCount;
    },
    // Lightning from a random storm cloud, for automatic storms.
    autoStrike() {
      const storm = visibleClouds().find(v => v.storm);
      return storm ? strike(storm) : null;
    },
    // Two hydrogen nuclei collide inside the sun and flash into helium.
    fusion() {
      if (particles.length > 500) return;
      const a = Math.random() * Math.PI * 2, d = sun.r * (0.3 + Math.random() * 0.4);
      const mx = sun.x + Math.cos(a) * d * 0.5, my = sun.y + Math.sin(a) * d * 0.5, time = 0.25;
      for (const side of [-1, 1]) {
        const sx = mx + side * 5 * Math.cos(a + 1.3), sy = my + side * 5 * Math.sin(a + 1.3);
        particles.push({
          x: sx - 1, y: sy - 1, vx: (mx - sx) / time, vy: (my - sy) / time, life: time, max: time, size: 2,
          color: side < 0 ? '#ff5a3a' : '#ffffff',
          done: side < 0 ? out => {
            // Helium: a brighter dot, and a few sparks of released energy.
            out.push({ x: mx - 1, y: my - 1, vx: 0, vy: 0, life: 0.4, max: 0.4, size: 3, color: '#ffffff' });
            for (let k = 0; k < 4; k++) {
              const b = Math.random() * Math.PI * 2;
              out.push({ x: mx, y: my, vx: Math.cos(b) * 25, vy: Math.sin(b) * 25, life: 0.3, max: 0.3, size: 1, color: '#fff3a0' });
            }
          } : null,
        });
      }
    },
    ray() {
      const tx = cx + (Math.random() - 0.5) * R * 0.9, ty = groundY(tx), time = 0.35;
      particles.push({
        x: sun.x, y: sun.y, vx: (tx - sun.x) / time, vy: (ty - sun.y) / time, life: time, max: time,
        size: 2, color: '#fff3a0', trail: true,
        done: out => {
          for (let k = 0; k < 5; k++) {
            out.push({ x: tx, y: ty - 1, vx: (Math.random() - 0.5) * 30, vy: -Math.random() * 25, life: 0.4, max: 0.4, size: 1, color: '#ffb02e' });
          }
        },
      });
    },
    launchComet() {
      comet = { x: -5, y: H * (0.08 + Math.random() * 0.12), vx: W / 9, vy: H * 0.012 };
    },
    onSunTap(fn) {
      onSun = fn;
    },
    onZoneTap(fn) {
      onZone = fn;
    },
    onCloudTap(fn) {
      onCloud = fn;
    },
    onCometTap(fn) {
      onComet = fn;
    },
    onMoonTap(fn) {
      onMoon = fn;
    },
    // Opening movie: 'pre' with the singularity's heat (0..1), 'warp' with the flight's progress (0..1)
    // and speed, or null.
    setCinema(mode, value, speed = 0) {
      if (mode === 'warp' && cinema !== 'warp') {
        warpFlash = 1;
        warpStars = Array.from({ length: 220 }, () => newStar(0.1 + Math.random() * 0.9));
        for (let k = 0; k < 80; k++) {
          const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 120;
          particles.push({ x: W / 2, y: H / 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.8, max: 0.8, size: 2, color: Math.random() < 0.5 ? '#ffffff' : '#ffd23f' });
        }
      }
      cinema = mode;
      if (mode === 'pre') bangHeat = value;
      else if (mode === 'warp') {
        warpT = value;
        warpV = speed;
      }
    },
    onBangTap(fn) {
      onBangFn = fn;
    },
    // Called with the share of the screen width swiped across the planet.
    onSpin(fn) {
      onSpinFn = fn;
    },
    // Land share of the planet (moves the sea line), mountain share of the land, and eruption aerosols (0..1 each).
    setLand(share, peaks, aero) {
      const shape = Math.abs(share - land) > 0.004 || Math.abs(peaks - mountains) > 0.02;
      const sky = Math.abs(aero - aerosols) > 0.02;
      if (!shape && !sky) return;
      if (shape) {
        land = share;
        mountains = peaks;
        Terrain.setLand(land, mountains);
      }
      aerosols = aero;
      if (climate === null) return;
      if (shape) updateTexture(climate);
      updateSky(climate);
      lastBg = -1e9;
    },
    // How many volcanoes stand on the planet. New ones rise where the player is looking.
    setVolcanoes(n) {
      if (n === volcanoes.length) return;
      const spots = Terrain.growVolcanoes(volcanoes.map(v => v.spot), n, viewCentre());
      volcanoes = spots.map(k => volcanoes.find(v => v.spot === k) || { spot: k, cool: 0, at: null });
    },
    // Features from research: how many mountain peaks, whether they have glaciers, whether rivers and lakes
    // run from them, and whether that water is frozen.
    setFeatures(f) {
      if (!Terrain.setFeatures(f, viewCentre())) return;
      if (climate !== null) updateTexture(climate);
      lastBg = -1e9;
    },
    // The living species to show on the map: [{id, sprite, home: zone names, n: how many}].
    setCritters(list) {
      Terrain.setCritters(list, viewCentre());
    },
    // Screen positions of the critters in view (for tests).
    critterPoints() {
      return critterHits.map(c => ({ id: c.id, x: c.x * P, y: (c.y - 3) * P }));
    },
    // Screen positions of the volcanoes in view (for tests).
    volcanoPoints() {
      return volcanoes.map(v => v.at && { x: v.at.x * P, y: v.at.y * P });
    },
    // Called with the species id when a critter on the map is tapped.
    onCritterTap(fn) {
      onCritterFn = fn;
    },
    onVolcanoTap(fn) {
      onVolcanoFn = fn;
    },
    // A volcano erupts: lava, then a column of ash. Index i picks a volcano; otherwise a ready one, if any.
    erupt(size = 1, i = -1) {
      // Prefer a ready volcano in view; one on the far side erupts unseen.
      const v = volcanoes[i] || volcanoes.find(o => o.cool <= 0 && o.at) || volcanoes.find(o => o.cool <= 0);
      if (v) v.cool = VOLCANO_COOL_S;
      if (v && !v.at) return;
      const x = v ? v.at.x : cx + (Math.random() - 0.5) * R * 0.8, y = v ? v.at.y - 11 : groundY(x);
      for (let k = 0; k < 25 * size; k++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.9, v = 15 + Math.random() * 35 * size;
        particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.8, max: 0.8, size: 1, color: Math.random() < 0.5 ? '#ff5a1a' : '#ffb02e' });
      }
      for (let k = 0; k < 30 * size; k++) {
        particles.push({ x: x + (Math.random() - 0.5) * 4, y, vx: (Math.random() - 0.3) * 8, vy: -(10 + Math.random() * 25 * size), life: 2.5, max: 2.5, size: Math.random() < 0.5 ? 1 : 2, color: Math.random() < 0.5 ? '#8a8478' : '#5a5650' });
      }
    },
    // Day and night: shown once the planet spins steadily, and the hour of the day (0..24).
    setDay(shown, hour) {
      // A saved planet that already has days starts settled, so map features stay where they were placed.
      if (dayFirst && shown) landed = 1;
      dayFirst = false;
      dayShown = shown;
      dayHour = hour;
    },
    // How fast the planet turns (0..1).
    setSpin(level) {
      spinLevel = level;
    },
    // The planet throws off a blob of molten rock, which rises into the sky as the moon.
    flingMoon() {
      const y = groundY(cx);
      moon.visible = true;
      moon.cur = { x: cx, y, r: 1 };
      moon.fling = 3;
      for (let k = 0; k < 40; k++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, v = 20 + Math.random() * 50;
        particles.push({ x: cx, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.2, max: 1.2, size: Math.random() < 0.3 ? 2 : 1, color: Math.random() < 0.5 ? '#ff7a2a' : '#ffd23f' });
      }
    },
    // Opening camera: 0 = close on the sun, 1 = normal layout. The first call jumps there directly.
    setOpening(z) {
      zoomTarget = z;
      if (!zoomSet) {
        zoomSet = true;
        zoom = z;
        sunF = sunTarget();
      }
    },
    setSunBackground(b) {
      sunBg = b;
    },
    // Moon: shown or not, how awake (0..1), and whether it has moved to the background.
    setMoon(visible, wake, bg) {
      moon.visible = visible;
      moon.wake = wake;
      moon.bg = bg;
    },
  };
})();
