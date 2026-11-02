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
  // Star layers for parallax: how fast each turns compared to the star signs, and how bright it is.
  const STAR_DEPTHS = [{ speed: 0.6, light: 0.45 }, { speed: 0.8, light: 0.7 }, { speed: 1, light: 0.85 }, { speed: 1.35, light: 1 }];
  const STAR_TINTS = [[160, 185, 255], [210, 225, 255], [255, 255, 255], [255, 240, 190], [255, 200, 140], [255, 150, 120]];
  const AIR_TAP_PX = 24;                     // minimum height of the tappable air above the planet
  const SPIN_SECONDS = 150;
  const MAX_CLOUDS = 16;   // clouds all round the planet; about half are on the side facing the viewer
  // Which clouds show as cover grows: spread evenly round the planet, so a few clouds are not all bunched up.
  const CLOUD_ORDER = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15];

  const RAMPS = {
    deep: [[-59, '#1b3566'], [0, '#1d4f9a'], [6, '#1f5a6a'], [12, '#3a4a3a'], [20, '#4a2418']],
    shallow: [[-59, '#2a5a9a'], [0, '#2f7fd0'], [6, '#3a8a8a'], [12, '#5a6a4a'], [20, '#6a3a22']],
    desert: [[0, '#d8b870'], [10, '#c8884a'], [20, '#9a4a2a']],
    horizon: [[-59, '#6a9ae0'], [-20, '#7ab4ec'], [0, '#a8dcff'], [5, '#d8d0a0'], [12, '#ff9a50'], [20, '#ff5a20']],
    zenith: [[-59, '#14286e'], [0, '#2a64c0'], [5, '#4a6aa0'], [12, '#7a3048'], [20, '#4a0e10']],
    space: [[-59, '#05060f'], [10, '#0a0610'], [20, '#140406']],
    heat: [[-60, '#140a3a'], [-25, '#3a1a8a'], [-5, '#8a2a9a'], [10, '#d83a3a'], [25, '#ff8a1a'], [40, '#ffe24a'], [150, '#ffffff']],
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
  const RED_TIDE = hex('#9a3a2a');
  const BLEACHED = hex('#ece4d4');
  const RIVER = hex('#3a7ad0');
  const FIRE = hex('#ff6a1a'), BURNT = hex('#3a3030'), LAVA = hex('#ff3a1a'), FLOOD = hex('#6a8a9a');
  const LAKE = hex('#2a5aa8');

  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
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
  let skyColors = [], spaceColor = 0, atmosphere = 10, air = 10;
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
  let landed = 0, skyAngle = 0, lastHour = null;
  let cinema = null, bangHeat = 0, warpT = 0, warpV = 0, warpFlash = 0, warpStars = [], onBangFn = () => {};
  let onSun = () => {}, onCloud = () => {}, onComet = () => {}, onMoon = () => {}, onSpinFn = () => {};
  // The night sky: star signs and planets found so far (their lines and names show), and game days since the spin locked.
  let onSky = () => {}, signsFound = new Set(), planetsFound = new Set(), skyDays = 0;
  let starsOn = false, signsOn = false, planetsOn = false, tonightSign = null, tonightNight = 0;
  // A star is born: star colors, nebulae and the Milky Way once researched; a supernova blazes for a while.
  let starColors = false, nebulaeOn = false, milkyWayOn = false, supernovaT = 0, supernovaMax = 1, galaxy = [], nebulae = [], supernovaAt = null;
  // Disasters on screen: the ground shaking (seconds left), auroras (seconds left), hurricanes, and an asteroid.
  let shakeT = 0, auroraT = 0, hurricanes = [], onAsteroid = () => {}, onAurora = () => {}, onEclipse = () => {};
  let eclipseT = 0, eclipseMax = 1;
  let rainbow = null, onRainbow = () => {};   // { x, base, r, t, max } while a rainbow stands in the sky

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
    return elev[pixV[i] * TEX_W + texU(i)] < Terrain.sea() ? 'ocean' : 'ground';
  }

  // The texture column under screen pixel i, as the planet has turned.
  const texU = i => ((pixU[i] * TEX_W + spin * TEX_W) | 0) % TEX_W;

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
      [COVER.FIRE]: FIRE, [COVER.BURNT]: BURNT, [COVER.LAVA]: LAVA, [COVER.FLOOD]: FLOOD, [COVER.RED_TIDE]: RED_TIDE,
    });
    const shades = colors.map(c => [pack(c, 1.18 * light), pack(c, light), pack(c, 0.68 * light)]);
    if (heatView) {
      // Infrared: every texel colored by how warm it is, like a heat camera.
      for (let i = 0; i < cover.length; i++) {
        const c = ramp(RAMPS.heat, Terrain.texelTemp(i));
        texColors[i * 3] = pack(c, 1.1);
        texColors[i * 3 + 1] = pack(c, 1);
        texColors[i * 3 + 2] = pack(c, 0.8);
      }
      return;
    }
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
    // Stars sit on a ring around the planet, from its surface out to the far screen corners, evenly by area.
    // Each has a depth: far stars are dim and turn slowly, near ones are bright and turn faster (parallax).
    const outer = Math.hypot(W / 2, cy), ring = Math.PI * (outer * outer - R * R);
    stars = Array.from({ length: Math.round(ring / 250) }, () => {
      const depth = STAR_DEPTHS[Math.floor(rand() * STAR_DEPTHS.length)];
      return {
        a: rand() * Math.PI * 2,
        r: Math.sqrt(R * R + rand() * (outer * outer - R * R)),
        speed: depth.speed,
        c: css([255, 255, 255].map(v => v * depth.light * (0.75 + rand() * 0.25))),
        // Its real color, shown once Star Colors is known: hot stars blue, cool ones orange and red.
        tint: css(STAR_TINTS[Math.floor(rand() * STAR_TINTS.length)].map(v => v * depth.light)),
      };
    });
    // The Milky Way: a band of faint stars across the sky, turning slowly with the far stars.
    const tilt = 0.5, along = [Math.cos(tilt), Math.sin(tilt)];
    galaxy = [];
    for (let k = 0; k < Math.round(ring / 40); k++) {
      const t = (rand() - 0.5) * 2 * outer, off = (rand() + rand() + rand() - 1.5) * H * 0.06;
      const x = cx + along[0] * t - along[1] * off, y = cy - H * 0.32 + along[1] * t + along[0] * off;
      const r = Math.hypot(x - cx, y - cy);
      if (r > R) galaxy.push({ a: Math.atan2(x - cx, cy - y), r, speed: 0.4, c: rand() < 0.5 ? '#9a9ab0' : '#c8c8d8' });
    }
    // Nebulae: three glowing clouds of gas where stars are born.
    nebulae = [['#d87aa8', 0.7], ['#7a9ad8', 2.6], ['#d8a07a', 4.4]].map(([c, a]) => ({
      c, a, r: R + (outer - R) * (0.35 + rand() * 0.3), size: 6 + rand() * 4,
      dots: Array.from({ length: 40 }, () => [(rand() + rand() - 1) * 1.2, (rand() + rand() - 1) * 0.8]),
    }));
    supernovaAt = { a: 5.6, r: R + (outer - R) * 0.45 };


    // Each cloud circles the planet at its own height and speed, like the stars turn round it.
    clouds = Array.from({ length: MAX_CLOUDS }, (_, k) => ({
      a: (k / MAX_CLOUDS) * Math.PI * 2 + rand() * 0.3, alt: 0.3 + rand() * 0.4, w: 10 + Math.floor(rand() * 10), speed: 1.5 + rand() * 3,
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

  // By day the air's light fills the whole sky; at night the air is clear and space shows down to the ground.
  // Without air there is nothing to scatter sunlight: the sky stays black by day too, as on the moon.
  const airGlow = () => clamp01(pressure * 2 + haze);
  function renderBackground() {
    const n = W * H, shift = spin * TEX_W, top = Math.hypot(W / 2, cy) - R;
    air = dayShown ? lerp(0.5, Math.max(atmosphere, top), smooth(daylight()) * airGlow()) : atmosphere;
    for (let i = 0; i < n; i++) {
      const u0 = pixU[i];
      if (u0 >= 0) {
        const u = ((u0 * TEX_W + shift) | 0) % TEX_W;
        bgPixels[i] = texColors[(pixV[i] * TEX_W + u) * 3 + pixShade[i]];
      } else {
        const band = Math.floor((pixAlt[i] / air + pixDither[i]) * SKY_BANDS);
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
  // How much of the sun the moon hides during an eclipse (0..1): it slides in, covers it, slides out.
  const eclipseCover = () => (eclipseT > 0 ? Math.min(1, 1.3 * Math.sin(Math.PI * (1 - eclipseT / eclipseMax))) : 0);
  const daylight = () => (dayShown ? clamp01((Math.min(dayHour - 5, 19 - dayHour)) / 2) : 1) * (1 - 0.85 * eclipseCover());

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

  // Once researched, stars fill the dark sky at night, everywhere but the planet.
  // A point of the night sky turning around the planet, on screen, or null where the planet or its air hides it.
  function skyAt(a, r, speed) {
    a += skyAngle * speed;
    const x = Math.floor(cx + r * Math.sin(a)), y = Math.floor(cy - r * Math.cos(a)), i = y * W + x;
    return x < 0 || x >= W || y < 0 || y >= H || pixU[i] >= 0 || pixAlt[i] <= air ? null : [x, y + camY];
  }

  function drawStars(night) {
    if (!starsOn || night <= 0) return;
    if (milkyWayOn) {
      ctx.globalAlpha = night * 0.55;
      for (const g of galaxy) {
        const p = skyAt(g.a, g.r, g.speed);
        if (!p) continue;
        ctx.fillStyle = g.c;
        ctx.fillRect(p[0], p[1], 1, 1);
      }
    }
    if (nebulaeOn) {
      ctx.globalAlpha = night * 0.35;
      for (const n of nebulae) {
        ctx.fillStyle = n.c;
        for (const [dx, dy] of n.dots) {
          const p = skyAt(n.a + dx * n.size / n.r, n.r + dy * n.size, 0.5);
          if (p) ctx.fillRect(p[0], p[1], 1, 1);
        }
      }
    }
    ctx.globalAlpha = night;
    for (const st of stars) {
      const p = skyAt(st.a, st.r, st.speed);
      if (!p) continue;
      ctx.fillStyle = starColors ? st.tint : st.c;
      ctx.fillRect(p[0], p[1], 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // A supernova: a new star that outshines everything, by day too, then fades.
  function drawSupernova(dt) {
    if (supernovaT <= 0 || !supernovaAt) return;
    supernovaT = Math.max(0, supernovaT - dt);
    const p = skyAt(supernovaAt.a, supernovaAt.r, 0.5);
    if (!p) return;
    const k = supernovaT / supernovaMax, arm = Math.round(1 + 4 * k);
    ctx.globalAlpha = Math.min(1, 0.3 + k);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(p[0] - arm, p[1], arm * 2 + 1, 1);
    ctx.fillRect(p[0], p[1] - arm, 1, arm * 2 + 1);
    ctx.fillStyle = '#cfe0ff';
    ctx.fillRect(p[0] - 1, p[1] - 1, 3, 3);
    ctx.globalAlpha = 1;
  }

  /* ---------- night sky: star signs and planets ---------- */

  // The signs sit evenly along a band of sky three screens around, which sweeps past with the hours,
  // so each night shows a different few. Planets move along the same band, slowly, against the stars.
  const skyAround = () => W * 3;
  const bandY = u => Math.round(H * 0.17 + Math.sin(u / skyAround() * Math.PI * 2) * H * 0.05);

  // Distance from the planet's centre to the star sign band: the sky turns around the planet at this radius.
  const skyRadius = () => cy - H * 0.17;

  // Bends a point of the flat band onto its circle around the planet: `ax, ay` is the anchor that sets
  // the angle, so a whole sign turns together and keeps its shape.
  function onArc(x, y, ax, ay) {
    const rb = cy - ay, t = (ax - cx) / rb, dx = x - ax, dy = y - ay, r = rb - dy;
    return [Math.round(cx + Math.sin(t) * r + Math.cos(t) * dx), Math.round(cy - Math.cos(t) * r + Math.sin(t) * dx)];
  }

  function skyX(u) {
    const around = skyAround(), perHour = (layout.colRight - layout.colLeft) / 12;
    let x = (u + skyDays * 24 * perHour) % around;
    if (x > W + 30) x -= around;
    return x;
  }

  // Star signs and planets on screen now, with their pixels in screen coordinates.
  function skyObjects() {
    if (!dayShown || !starsOn) return [];
    const out = [], around = skyAround();
    // Tonight's sign only, placed so it is overhead at midnight and crosses the sky through the night.
    const perHour = (layout.colRight - layout.colLeft) / 12;
    if (signsOn) Sky.SIGNS.filter(s => s.id === tonightSign).forEach(s => {
      const u = (((cx - Sky.SIGN_W / 2 - tonightNight * 24 * perHour) % around) + around) % around;
      const x = Math.round(skyX(u)), y = bandY(u) - Sky.SIGN_H / 2;
      if (x < -Sky.SIGN_W * 2 || x > W + Sky.SIGN_W) return;
      const ax = x + Sky.SIGN_W / 2, ay = y + Sky.SIGN_H / 2, [mx, my] = onArc(ax, ay, ax, ay);
      out.push({ kind: 'sign', id: s.id, x: mx, y: my, stars: s.stars.map(([sx, sy]) => onArc(x + sx, y + sy, ax, ay)), sign: s });
    });
    if (planetsOn) for (const p of Sky.PLANETS) {
      if (!Sky.planetUp(p, skyDays, dayHour)) continue;
      const u = ((p.at + skyDays * p.speed) % 1) * around, [x, y] = onArc(Math.round(skyX(u)), bandY(u) + 3, Math.round(skyX(u)), bandY(u) + 3);
      if (x < 0 || x >= W) continue;
      out.push({ kind: 'planet', id: p.id, x, y, planet: p });
    }
    return out;
  }

  // Sky pixels only: not in front of the planet or its lit air.
  const inSky = (x, y) => x >= 0 && x < W && y >= 0 && y < H && pixU[y * W + x] < 0 && pixAlt[y * W + x] > air;

  function drawSky(night) {
    if (night <= 0.05) return;
    for (const o of skyObjects()) {
      if (o.kind === 'sign') {
        // A found sign shows its lines, dotted, before its stars.
        if (signsFound.has(o.id)) {
          ctx.globalAlpha = 0.45 * night;
          ctx.fillStyle = '#6a8aff';
          for (const [a, b] of o.sign.lines) {
            const [x0, y0] = o.stars[a], [x1, y1] = o.stars[b], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
            for (let k = 1; k < n; k += 2) {
              const x = Math.round(x0 + (x1 - x0) * k / n), y = Math.round(y0 + (y1 - y0) * k / n);
              if (inSky(x, y)) ctx.fillRect(x, y, 1, 1);
            }
          }
        }
        // Sign stars are brighter than the rest, with a faint glow around them.
        for (const [x, y] of o.stars) {
          if (!inSky(x, y)) continue;
          ctx.globalAlpha = 0.35 * night;
          ctx.fillStyle = '#fff8d0';
          ctx.fillRect(x - 1, y, 3, 1);
          ctx.fillRect(x, y - 1, 1, 3);
          ctx.globalAlpha = night;
          ctx.fillRect(x, y, 1, 1);
        }
      } else if (inSky(o.x, o.y)) {
        const s = o.planet.size || 1;
        ctx.globalAlpha = night * (o.planet.faint || 1);
        ctx.fillStyle = o.planet.color;
        ctx.fillRect(o.x - (s >> 1), o.y - (s >> 1), s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  // A tap at night on a star of a sign or on a planet. Returns true if it hit one.
  function tapSky(x, y) {
    if (daylight() > 0.5 || !inSky(Math.round(x), Math.round(y))) return false;
    let best = null, bestD = 6;
    for (const o of skyObjects()) {
      const points = o.kind === 'sign' ? o.stars : [[o.x, o.y]];
      for (const [px, py] of points) {
        const d = Math.hypot(px - x, py - y);
        if (d < bestD) {
          bestD = d;
          best = o;
        }
      }
    }
    if (!best) return false;
    onSky(best.kind, best.id, x * P, y * P);
    return true;
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

  // Visible clouds, with storm clouds first. Each circles the planet (angle a, 0 at the top) at a height in
  // the air; only those over the side facing the viewer and on screen are drawn. Each gets its screen box for
  // drawing and tapping. Storm clouds are spread round the planet so one is usually in view.
  function visibleClouds() {
    const n = Math.min(MAX_CLOUDS, Math.ceil(cloudCover * MAX_CLOUDS * 3));
    const out = [];
    for (let k = 0; k < n; k++) {
      const c = clouds[CLOUD_ORDER[k]], storm = k < storms * 2, w = c.w + (storm ? 6 : 0);
      const rr = R + c.alt * Math.max(atmosphere, 40), x = cx + rr * Math.sin(c.a), y = cy - rr * Math.cos(c.a) + camY;
      if (Math.cos(c.a) < 0.2 || x < -w || x > W + w) continue;
      out.push({ cloud: c, storm, x: Math.round(x - w / 2), y: Math.round(y), w });
    }
    return out;
  }

  // Clouds keep circling even while out of view.
  function moveClouds(dt) {
    for (const c of clouds) c.a = (c.a + c.speed * dt / (R + 30)) % (Math.PI * 2);
  }

  function drawClouds(now, dt) {
    const white = css([245, 248, 255]), whiteShade = css([200, 210, 225]);
    moveClouds(dt);
    for (const v of visibleClouds()) {
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
    const i = (hitY - 2 - camY) * W + x, onPlanet = pixU[i] >= 0;
    return { zone: zoneAt(x, hitY), x: x * P, y: hitY * P, u: onPlanet ? texU(i) : -1, v: pixV[i] };
  }

  // Drops fall from the cloud to the surface. Returns the share of them that land on ground rather than sea.
  function rain(v) {
    let onLand = 0;
    for (let k = 0; k < 14; k++) {
      const x = v.x + 1 + Math.random() * (v.w - 2), hitY = groundY(x), time = 0.4 + Math.random() * 0.3;
      particles.push({ x, y: v.y + 3, vx: 0, vy: (hitY - v.y - 3) / time, life: time, max: time, size: 1, color: '#7ab8ff' });
      if (zoneAt(x, Math.round(hitY) + 2) === 'ground') onLand++;
    }
    return onLand / 14;
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

  // A comet drifts across the sky with a tail in the colors of the atoms it carries. Once tapped it dives
  // into the planet and bursts on impact.
  function drawComet(dt) {
    if (!comet) return;
    comet.x += comet.vx * dt;
    comet.y += comet.vy * dt;
    if (comet.crash && comet.y >= comet.crash.y) {
      const { x, y } = comet.crash;
      particles.push({ x: x - 3, y: y - 3, vx: 0, vy: 0, life: 0.15, max: 0.15, size: 7, color: '#ffffff' });
      for (let k = 0; k < 70; k++) {
        const a = Math.PI + Math.random() * Math.PI, sp = 20 + Math.random() * 90;
        particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.2, max: 1.2, size: k < 25 ? 2 : 1,
          color: k % 4 ? comet.colors[k % comet.colors.length] : '#fff3a0' });
      }
      if (comet.asteroid) {
        shakeT = 2;
        for (let k = 0; k < 120; k++) {
          const a = Math.PI + Math.random() * Math.PI, sp = 30 + Math.random() * 140;
          particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 2, max: 2, size: 2, color: k % 2 ? '#ff6a1a' : '#8a8478' });
        }
        onAsteroid(x * P, y * P);
      } else onComet(x * P, y * P, comet.atoms);
      comet = null;
      return;
    }
    if (comet.x > W + 10) {
      comet = null;
      return;
    }
    const speed = Math.hypot(comet.vx, comet.vy);
    // One tail strand per atom, side by side, so each color reads as its own stripe.
    const n = comet.colors.length, ux = -comet.vx / speed, uy = -comet.vy / speed;
    comet.colors.forEach((color, k) => {
      const off = (k - (n - 1) / 2) * 1.5;
      particles.push({ x: comet.x - uy * off, y: comet.y + ux * off, vx: ux * 5 - uy * off * 1.5, vy: uy * 5 + ux * off * 1.5,
        life: 1.6, max: 1.6, size: comet.crash ? 2 : 1, color });
    });
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

  // Every frame goes through the colors discovered so far (Hues, in sprites.js).
  function draw(now, dt) {
    if (!W) return;
    drawFrame(now, dt);
    if (Hues.full()) return;
    const img = ctx.getImageData(0, 0, W, H);
    Hues.apply(img.data);
    ctx.putImageData(img, 0, 0);
  }

  function drawFrame(now, dt) {
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
      skyAngle = (skyAngle + hours * perHour / skyRadius() * smooth(landed)) % (Math.PI * 2);
    }
    lastHour = dayShown ? dayHour : null;
    if (now - lastBg > (turn > 0.03 ? 33 : 120)) {
      renderBackground();
      lastBg = now;
    }
    updateBodies(dt);
    if (moonDrag) moon.cur = { ...moon.cur, x: moonDrag.x };
    // During the opening the planet sits lower; fill the sky above it with the top of the background.
    ctx.drawImage(bg, 0, camY);
    if (camY > 0) ctx.drawImage(bg, 0, 0, W, camY, 0, 0, W, camY);
    const night = 1 - daylight();
    if (night > 0) {
      ctx.fillStyle = `rgba(2, 4, 16, ${(0.55 * night).toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    }
    drawStars(Math.max(night, 1 - airGlow()));
    drawSupernova(dt);
    drawSky(night);
    drawAurora(now, dt, night);
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
      drawSunspots(dt);
      drawEclipse(dt);
      ctx.restore();
    }
    drawTide();
    drawMeteors(dt);
    drawRainbow(dt);
    drawBolts(dt);
    drawWaves(now);
    drawLandmarks(now, dt);
    drawSpots(now, dt);
    drawHurricanes(now, dt);
    drawComet(dt);
    drawParticles(dt);
    // An earthquake shakes the whole picture.
    shakeT = Math.max(0, shakeT - dt);
    canvas.style.transform = shakeT > 0 ? `translate(${Math.round((Math.random() - 0.5) * 8)}px, ${Math.round((Math.random() - 0.5) * 6)}px)` : '';
  }

  // A rainbow: six colored bands in an arc standing on the planet, fading in and out. Clipped to the sky.
  const RAINBOW = ['#d83a2a', '#ff8a1a', '#ffd23f', '#4aa84a', '#3a6ad8', '#b07aff'];
  function drawRainbow(dt) {
    if (!rainbow) return;
    rainbow.t -= dt;
    if (rainbow.t <= 0) {
      rainbow = null;
      return;
    }
    const age = rainbow.max - rainbow.t, fade = Math.min(1, age / 2, rainbow.t / 2) * 0.75;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(cx, cy + camY, R, 0, Math.PI * 2);
    ctx.clip('evenodd');
    ctx.globalAlpha = fade;
    RAINBOW.forEach((color, k) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(rainbow.x, rainbow.base, rainbow.r - k * 1.2, Math.PI, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();
  }

  // Auroras: green and purple curtains waving high in the night sky during a solar storm.
  function drawAurora(now, dt, night) {
    auroraT = Math.max(0, auroraT - dt);
    if (auroraT <= 0 || night < 0.2) return;
    const fade = Math.min(1, auroraT / 3) * night;
    for (let x = 0; x < W; x++) {
      const top = Math.round(H * 0.13 + Math.sin(x * 0.05 + now / 900) * H * 0.025);
      const len = Math.round(H * 0.07 + Math.sin(x * 0.13 + now / 600) * H * 0.03);
      for (let y = top; y < top + len; y++) {
        if (!inSky(x, y)) continue;
        ctx.globalAlpha = fade * 0.5 * (1 - (y - top) / len);
        ctx.fillStyle = (x + y) % 9 < 6 ? '#6aff9a' : '#c07aff';
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  // A hurricane: a white spiral turning over the sea, drifting onto the coast where it makes landfall.
  function drawHurricanes(now, dt) {
    hurricanes = hurricanes.filter(h => (h.t -= dt) > 0);
    for (const h of hurricanes) {
      const k = 1 - h.t / h.max, x = h.x0 + (h.x1 - h.x0) * Math.min(1, k * 1.4), y = h.y0 + (h.y1 - h.y0) * Math.min(1, k * 1.4);
      ctx.globalAlpha = Math.min(1, h.t / 1.5) * 0.9;
      ctx.fillStyle = '#ffffff';
      for (let arm = 0; arm < 3; arm++) {
        for (let s = 0; s < 22; s++) {
          const a = arm * 2.09 + s * 0.28 - now / 300, r = s * 0.6;
          ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.6), 2, 1);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- minigames ---------- */
  // Things that invite a touch and open a story (game.js decides when each shows, see MINIGAMES there).
  // Spots sit on the planet's surface (texture u, v) so they turn with it:
  //   crack  glowing lava crack on land: one tap breaks it open
  //   seed   green sparkle on land: one tap sprouts it
  //   ice    crack in the ice on the sea: it takes ICE_TAPS taps, growing with each
  //   spring blue spring at a peak: trace a river from it down to the sea
  //   plates two plate edges on land: drag one into the other
  // Sunspots drift over the sun's face: tap them before they flare. The moon can be dragged across the sky,
  // pulling a bulge of sea along under it.
  const ICE_TAPS = 4;
  const SPOT_LIFE = { crack: 10, seed: 15, ice: 20, spring: 30, plates: 30, flower: 12, meteorite: 15, plankton: 12 };
  const PETALS = ['#ff5a4a', '#7a8aff', '#fff0a0', '#f0f0ff', '#ffb43a'];
  let meteorT = 0, meteorRadiant = null, streaks = [];
  let spots = [], sunspots = [], moonPlay = false, moonDrag = null, trace = null, plateDrag = null;
  let onPlay = () => {}, heatView = false;

  // A texture spot of the wanted kind of ground ('ground' or 'ocean') somewhere in view, or null.
  function findTexel(want) {
    for (let k = 0; k < 60; k++) {
      const x = Math.floor(W * (0.15 + Math.random() * 0.7)), y = Math.floor(H * (0.6 + Math.random() * 0.35));
      if (zoneAt(x, y) !== want) continue;
      const i = Math.floor(y - camY) * W + x;
      return { u: texU(i), v: pixV[i] };
    }
    return null;
  }

  function spawnSpot(kind) {
    let at, to;
    if (kind === 'spring') {
      const peaks = Terrain.peaks().filter(p => project(p));
      if (!peaks.length) return false;
      at = peaks[Math.floor(Math.random() * peaks.length)];
    } else if (kind === 'ice' || kind === 'plankton') at = findTexel('ocean');
    else at = findTexel('ground');
    if (!at) return false;
    if (kind === 'plates') to = { u: (at.u + 9) % TEX_W, v: at.v };
    spots.push({ kind, at, to, t: SPOT_LIFE[kind], max: SPOT_LIFE[kind], taps: 0, off: { x: 0, y: 0 } });
    return true;
  }

  function burst(x, y, color, n = 10, speed = 25) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.5 + Math.random() * 0.5);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10, life: 0.6, max: 0.6, size: 1, color });
    }
  }

  // A jagged line of pixels, the same each frame for the same seed.
  function jag(x, y, len, seed, color) {
    let px = x - len / 2, py = y, r = seed;
    ctx.fillStyle = color;
    for (let k = 0; k < len; k++) {
      r = (r * 9301 + 49297) % 233280;
      py += r % 3 - 1;
      py = Math.max(y - 2, Math.min(y + 2, py));
      ctx.fillRect(Math.round(px + k), Math.round(py), 1, 1);
    }
  }

  function drawSpots(now, dt) {
    spots = spots.filter(o => (o.t -= dt) > 0);
    const pulse = 0.6 + 0.4 * Math.sin(now / 180);
    for (const o of spots) {
      const at = o.sky || project(o.at);
      o.screen = at;
      if (!at) continue;
      const fade = Math.min(1, o.t / 2, (o.max - o.t) / 0.5);
      ctx.globalAlpha = fade * pulse;
      const seed = o.at ? Math.floor(o.at.u * 31 + o.at.v * 17) : 7;
      // A ring of twinkles turns around every spot, so it catches the eye.
      if (o.kind === 'band') {
        // Light you can't see: a shimmer of rings rippling out, white and grey.
        for (let k = 0; k < 3; k++) {
          const r = ((now / 300 + k) % 3) * 3 + 1;
          ctx.fillStyle = k % 2 ? '#ffffff' : '#b0b0c0';
          for (let a = 0; a < 12; a++) {
            const ang = a * Math.PI / 6 + now / 900;
            ctx.fillRect(Math.round(at.x + Math.cos(ang) * r), Math.round(at.y + Math.sin(ang) * r), 1, 1);
          }
        }
        if (o.band === 'gamma') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(at.x - 2, at.y, 5, 1);
          ctx.fillRect(at.x, at.y - 2, 1, 5);
        }
        continue;
      }
      const ring = { crack: '#ffd23f', seed: '#d8ffd0', ice: '#ffffff', spring: '#8ad8ff', plates: '#ffd23f', flower: '#fff0a0', meteorite: '#ffffff', plankton: '#5ad8ff' }[o.kind];
      ctx.fillStyle = ring;
      for (let k = 0; k < 4; k++) {
        const a = now / 400 + k * Math.PI / 2, r = 7 + Math.sin(now / 250 + k) * 1.5;
        ctx.fillRect(Math.round(at.x + Math.cos(a) * r), Math.round(at.y - 1 + Math.sin(a) * r * 0.7), 1, 1);
      }
      if (o.kind === 'crack') {
        jag(at.x, at.y + 1, 13, seed, '#3a1a10');
        jag(at.x, at.y, 13, seed, '#ff8a1a');
        jag(at.x, at.y, 7, seed + 1, '#fff0a0');
      } else if (o.kind === 'ice') {
        jag(at.x, at.y, 7 + o.taps * 4, seed, '#1d4f9a');
        jag(at.x, at.y + 1, 5 + o.taps * 3, seed + 2, '#3a7ad0');
      } else if (o.kind === 'seed') {
        ctx.fillStyle = '#2f7a3a';
        ctx.fillRect(at.x - 2, at.y - 1, 5, 3);
        ctx.fillRect(at.x - 1, at.y - 2, 3, 5);
        ctx.fillStyle = '#7af0a0';
        const k = Math.floor(now / 150) % 4;
        ctx.fillRect(at.x, at.y - 1, 1, 3);
        ctx.fillRect(at.x - 1, at.y, 3, 1);
        ctx.fillStyle = '#d8ffd0';
        ctx.fillRect(at.x + [2, -2, 1, -1][k], at.y - [2, 1, -2, 2][k], 1, 1);
      } else if (o.kind === 'flower') {
        ctx.fillStyle = PETALS[seed % PETALS.length];
        ctx.fillRect(at.x - 1, at.y - 2, 3, 1);
        ctx.fillRect(at.x - 1, at.y, 3, 1);
        ctx.fillRect(at.x - 2, at.y - 1, 1, 1);
        ctx.fillRect(at.x + 2, at.y - 1, 1, 1);
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(at.x, at.y - 1, 1, 1);
        ctx.fillStyle = '#2f7a3a';
        ctx.fillRect(at.x, at.y + 1, 1, 2);
      } else if (o.kind === 'plankton') {
        ctx.fillStyle = '#5ad8ff';
        ctx.fillRect(at.x - 2, at.y, 5, 1);
        ctx.fillRect(at.x - 1, at.y - 1, 3, 3);
        ctx.fillStyle = '#e0fbff';
        ctx.fillRect(at.x, at.y, 1, 1);
      } else if (o.kind === 'meteorite') {
        ctx.fillStyle = '#2a2420';
        ctx.fillRect(at.x - 2, at.y - 1, 4, 3);
        ctx.fillStyle = '#5a5048';
        ctx.fillRect(at.x - 1, at.y - 1, 2, 1);
        if (Math.floor(now / 200) % 3 === 0) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(at.x + 1, at.y - 2, 1, 1);
        }
      } else if (o.kind === 'spring') {
        ctx.fillStyle = '#1d4f9a';
        ctx.fillRect(at.x - 2, at.y - 6, 5, 5);
        ctx.fillStyle = '#8ad8ff';
        ctx.fillRect(at.x - 1, at.y - 5, 3, 3);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(at.x, at.y - 4, 1, 1);
      } else if (o.kind === 'plates') {
        const to = project(o.to);
        o.toScreen = to;
        if (!to) continue;
        const a = { x: at.x + o.off.x, y: at.y + o.off.y };
        ctx.fillStyle = '#ffd23f';
        for (let k = 0; k < 4; k++) {
          ctx.fillRect(a.x + k, a.y - 3 + k, 1, 1);
          ctx.fillRect(a.x + k, a.y + 3 - k, 1, 1);
          ctx.fillRect(to.x - k, to.y - 3 + k, 1, 1);
          ctx.fillRect(to.x - k, to.y + 3 - k, 1, 1);
        }
      }
    }
    ctx.globalAlpha = 1;
    if (trace && trace.pts.length > 1) {
      ctx.fillStyle = '#5ab0ff';
      for (const [x, y] of trace.pts) ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
    }
  }

  // The moon's dark disc crossing the sun, with the pale corona showing round it at totality.
  function drawEclipse(dt) {
    if (eclipseT <= 0) return;
    eclipseT = Math.max(0, eclipseT - dt);
    const k = 1 - eclipseT / eclipseMax, x = sun.x + (k * 2 - 1) * sun.r * 2.2, r = sun.r * 1.02;
    if (eclipseCover() >= 1) {
      ctx.fillStyle = 'rgba(240, 240, 255, 0.35)';
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, sun.r * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#0a0a14';
    ctx.beginPath();
    ctx.arc(Math.round(x), sun.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSunspots(dt) {
    sunspots = sunspots.filter(o => {
      o.t -= dt;
      o.dx += o.vx * dt;
      if (o.t <= 0 || Math.abs(o.dx) > 0.8) {
        // Missed: it flares.
        burst(sun.x + o.dx * sun.r, sun.y + o.dy * sun.r, '#fff0a0', 14, 40);
        return false;
      }
      return true;
    });
    for (const o of sunspots) {
      const x = Math.round(sun.x + o.dx * sun.r), y = Math.round(sun.y + o.dy * sun.r), r = o.t < 2 && Math.floor(o.t * 6) % 2 ? 2 : 1;
      ctx.fillStyle = '#3a1a10';
      ctx.fillRect(x - r, y - r, r * 2 + 1, r * 2 + 1);
      ctx.fillStyle = '#7a3a1a';
      ctx.fillRect(x - r - 1, y, 1, 1);
      ctx.fillRect(x + r + 1, y, 1, 1);
    }
  }

  // A meteor shower: short bright streaks flying out from one point in the night sky, the radiant.
  function drawMeteors(dt) {
    meteorT = Math.max(0, meteorT - dt);
    if (meteorT > 0 && daylight() < 0.6 && Math.random() < dt * 4) {
      const a = Math.random() * Math.PI * 2, d = 8 + Math.random() * 20;
      streaks.push({ x: meteorRadiant.x + Math.cos(a) * d, y: meteorRadiant.y + Math.sin(a) * d, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, t: 0.5 });
    }
    streaks = streaks.filter(m => (m.t -= dt) > 0);
    for (const m of streaks) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      for (let k = 0; k < 5; k++) {
        const x = Math.round(m.x - m.vx * k * 0.012), y = Math.round(m.y - m.vy * k * 0.012);
        if (!inSky(x, y)) continue;
        ctx.globalAlpha = (1 - k / 5) * Math.min(1, m.t * 3);
        ctx.fillStyle = k ? '#c8c8e0' : '#ffffff';
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Waves (once researched): white crests come and go on the open sea, turning with the planet.
  let waveLevel = 0, waveSpots = [], waveGlow = false;
  function drawWaves(now) {
    if (waveLevel <= 0) return;
    if (!waveSpots.length) {
      for (let k = 0; k < 2000 && waveSpots.length < 260; k++) {
        const u = Math.floor(Math.random() * TEX_W), v = Math.floor(TEX_H * (0.15 + Math.random() * 0.7));
        if (elev[v * TEX_W + u] < Terrain.sea()) waveSpots.push({ u, v, phase: Math.random() * Math.PI * 2, speed: 0.8 + Math.random() });
      }
    }
    // On a glowing night the crests shine electric blue: bioluminescent plankton flashing as the waves break.
    const glow = waveGlow && daylight() < 0.5;
    ctx.fillStyle = glow ? '#5ad8ff' : '#e8f4ff';
    for (const w of waveSpots) {
      const c = cover[w.v * TEX_W + w.u];
      if (c !== COVER.DEEP && c !== COVER.SHALLOW) continue;   // not under ice or new land
      const k = Math.sin(now / 700 * w.speed + w.phase);
      if (k < 0.2) continue;
      const at = project(w);
      if (!at) continue;
      ctx.globalAlpha = Math.min(1, (k - 0.2) / 0.8 * waveLevel * (glow ? 1.6 : 1));
      const len = k > 0.8 ? 3 : 2, dx = Math.round(Math.sin(now / 1500 + w.phase) * 1.5);
      ctx.fillRect(at.x + dx - 1, at.y, len, 1);
      if (k > 0.9) ctx.fillRect(at.x + dx, at.y - 1, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // The sea bulges under the dragged moon: the tide follows it.
  function drawTide() {
    if (!moonDrag) return;
    const mx = moon.cur.x;
    ctx.fillStyle = '#7ac8ff';
    for (let x = Math.max(0, Math.round(mx - 26)); x < Math.min(W, mx + 26); x++) {
      const h = Math.round(3 * Math.cos((x - mx) / 26 * Math.PI / 2) ** 2), gy = Math.round(groundY(x));
      if (h > 0) ctx.fillRect(x, gy - h, 1, h);
    }
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
    // Minigame spots on the planet: the nearest one in reach wins.
    const spot = spots.filter(o => o.screen && Math.hypot(x - o.screen.x - o.off.x, y - o.screen.y - o.off.y) <= 8)
      .sort((a, b) => Math.hypot(x - a.screen.x, y - a.screen.y) - Math.hypot(x - b.screen.x, y - b.screen.y))[0];
    if (spot) {
      e.preventDefault();
      const { x: sx, y: sy } = spot.screen;
      if (spot.kind === 'spring') {
        trace = { spot, pts: [[sx, sy - 3]] };
        canvas.setPointerCapture?.(e.pointerId);
      } else if (spot.kind === 'plates') {
        plateDrag = { spot, x, y };
        canvas.setPointerCapture?.(e.pointerId);
      } else if (spot.kind === 'ice' && ++spot.taps < ICE_TAPS) {
        burst(sx, sy, '#ffffff', 4, 15);
      } else {
        spots.splice(spots.indexOf(spot), 1);
        burst(sx, sy, { crack: '#ff8a1a', seed: '#7af0a0', ice: '#8ad8ff', band: '#ffffff', flower: '#fff0a0', meteorite: '#c8c0b0', plankton: '#5ad8ff' }[spot.kind], 14, 30);
        onPlay(spot.kind, e.clientX, e.clientY, spot.band);
      }
      return;
    }
    if (comet && !comet.crash && Math.hypot(x - comet.x, y - comet.y) < 12) {
      e.preventDefault();
      const tx = Math.max(W * 0.15, Math.min(W * 0.85, comet.x + W * 0.2)), ty = Math.min(groundY(tx), H - 4), time = 0.7;
      comet.crash = { x: tx, y: ty };
      comet.vx = (tx - comet.x) / time;
      comet.vy = (ty - comet.y) / time;
      return;
    }
    if (sunVisible() && Math.hypot(x - sun.x, y - sun.y) <= sun.r + 10) {
      e.preventDefault();
      if (eclipseCover() >= 1) {
        burst(sun.x, sun.y, '#f0f0ff', 16, 30);
        onEclipse(e.clientX, e.clientY);
        return;
      }
      const si = sunspots.findIndex(o => Math.hypot(x - (sun.x + o.dx * sun.r), y - (sun.y + o.dy * sun.r)) <= 5);
      if (si >= 0) {
        const o = sunspots.splice(si, 1)[0];
        burst(sun.x + o.dx * sun.r, sun.y + o.dy * sun.r, '#ff8a1a', 8, 15);
        onPlay('sunspot', e.clientX, e.clientY);
        return;
      }
      sunPress = 1;
      onSun(e.clientX, e.clientY);
      return;
    }
    // A tap on an aurora curtain, high in the night sky.
    if (auroraT > 0 && daylight() < 0.8 && y >= H * 0.1 && y <= H * 0.27 && inSky(Math.floor(x), Math.floor(y))) {
      e.preventDefault();
      burst(x, y, Math.random() < 0.5 ? '#6aff9a' : '#c07aff', 12, 20);
      onAurora(e.clientX, e.clientY);
      return;
    }
    if (rainbow && y <= rainbow.base && Math.abs(Math.hypot(x - rainbow.x, y - rainbow.base) - (rainbow.r - 3)) <= 7) {
      e.preventDefault();
      for (let k = 0; k < 12; k++) {
        const a = Math.PI + Math.random() * Math.PI, d = rainbow.r - Math.random() * 7;
        particles.push({ x: rainbow.x + Math.cos(a) * d, y: rainbow.base + Math.sin(a) * d, vx: 0, vy: -15, life: 0.6, max: 0.6, size: 1, color: RAINBOW[k % 6] });
      }
      rainbow = null;
      onRainbow(e.clientX, e.clientY);
      return;
    }
    if (tapSky(x, y)) {
      e.preventDefault();
      return;
    }
    if (moon.visible && moon.wake >= 1 && moonUp() && Math.hypot(x - moon.cur.x, y - moon.cur.y) <= moon.cur.r + 8) {
      e.preventDefault();
      if (moonPlay) {
        moonDrag = { x0: moon.cur.x, x: moon.cur.x, y: moon.cur.y, far: 0, won: false };
        canvas.setPointerCapture?.(e.pointerId);
      }
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
        onCloud('storm', s.zone, s.x, s.y, s);
      } else {
        onCloud('rain', null, e.clientX, e.clientY, { land: rain(hit) });
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
  }

  canvas.addEventListener('pointermove', e => {
    const px = e.clientX / P, py = e.clientY / P;
    if (moonDrag) {
      moonDrag.far = Math.max(moonDrag.far, Math.abs(px - moonDrag.x0));
      moonDrag.x = Math.max(4, Math.min(W - 4, px));
      if (!moonDrag.won && moonDrag.far > W * 0.4) {
        moonDrag.won = true;
        onPlay('moon', e.clientX, e.clientY);
      }
      return;
    }
    if (trace) {
      const [lx, ly] = trace.pts.at(-1);
      if (Math.hypot(px - lx, py - ly) >= 1.5) trace.pts.push([px, py]);
      return;
    }
    if (plateDrag) {
      const o = plateDrag.spot;
      o.off = { x: px - plateDrag.x, y: py - plateDrag.y };
      if (o.screen && o.toScreen && Math.hypot(o.screen.x + o.off.x - o.toScreen.x, o.screen.y + o.off.y - o.toScreen.y) < 5) {
        spots.splice(spots.indexOf(o), 1);
        burst(o.toScreen.x, o.toScreen.y, '#c8a070', 18, 30);
        shakeT = 1;
        plateDrag = null;
        onPlay('plates', e.clientX, e.clientY);
      }
      return;
    }
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
  // A river traced from a spring counts once it reaches the sea and runs a little way.
  function endPlay(e) {
    if (trace) {
      const [lx, ly] = trace.pts.at(-1);
      if (trace.pts.length > 10 && zoneAt(lx, ly) === 'ocean' && spots.includes(trace.spot)) {
        spots.splice(spots.indexOf(trace.spot), 1);
        burst(lx, ly, '#5ab0ff', 12, 25);
        onPlay('river', e.clientX, e.clientY);
      }
      trace = null;
    }
    if (plateDrag) {
      plateDrag.spot.off = { x: 0, y: 0 };
      plateDrag = null;
    }
    moonDrag = null;
  }
  canvas.addEventListener('pointerup', e => {
    endPlay(e);
    if (drag && drag.moved <= 8) zoneTap(drag.zone, drag.px, drag.py);
    drag = null;
  });
  canvas.addEventListener('pointercancel', e => {
    endPlay(e);
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
    // The map texel under a screen point in CSS pixels, or null off the planet (for tests).
    texelAt(cssX, cssY) {
      const x = Math.floor(cssX / P), y = Math.floor(cssY / P) - camY, i = y * W + x;
      return x >= 0 && x < W && y >= 0 && y < H && pixU[i] >= 0 ? { u: texU(i), v: pixV[i] } : null;
    },
    // Repaint the map, for changes the climate does not drive (wildfires).
    repaint() {
      if (climate !== null) updateTexture(climate);
    },
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
    // Disasters: shake the picture, light auroras, send a hurricane onto a coast spot, throw the asteroid.
    shake(seconds) {
      shakeT = seconds;
    },
    aurora(seconds) {
      auroraT = seconds;
    },
    eclipse(seconds = 14) {
      eclipseT = eclipseMax = seconds;
    },
    eclipseUp: () => eclipseT > 0,
    setWaves(level, glow = false) {
      waveLevel = level;
      waveGlow = glow;
    },
    meteorShower(seconds) {
      meteorT = seconds;
      meteorRadiant = { x: Math.round(W * (0.25 + Math.random() * 0.5)), y: Math.round(H * (0.1 + Math.random() * 0.15)) };
    },
    sunScreen: () => (sunVisible() ? { x: sun.x * P, y: sun.y * P } : null),
    eclipseTotal: () => eclipseCover() >= 1,
    onEclipseTap(fn) {
      onEclipse = fn;
    },
    auroraUp: () => auroraT > 0 && daylight() < 0.8,
    onAuroraTap(fn) {
      onAurora = fn;
    },
    // A rainbow stands for a while on the side of the sky away from the sun, as real ones do.
    showRainbow(seconds = 25) {
      const x = Math.round(sun.x < W / 2 ? W * 0.68 : W * 0.32), r = Math.round(Math.min(W * 0.22, 60));
      rainbow = { x, base: Math.round(groundY(x)) + 4, r, t: seconds, max: seconds };
    },
    // The top of the standing rainbow in screen pixels, or null.
    rainbowUp: () => rainbow && { x: rainbow.x * P, y: (rainbow.base - rainbow.r + 3) * P },
    hurricane(spot, seconds = 6) {
      const p = spot && project(spot);
      if (!p) return;
      hurricanes.push({ x0: p.x - W * 0.4, y0: p.y - 20, x1: p.x, y1: p.y - 4, t: seconds, max: seconds });
    },
    asteroid() {
      const tx = Math.round(cx + (Math.random() - 0.5) * W * 0.3), ty = Math.min(groundY(tx), H - 4), time = 2.2;
      comet = { x: -10, y: H * 0.05, atoms: [], colors: ['#ff6a1a', '#ffb02e', '#ffffff'], asteroid: true, crash: { x: tx, y: ty } };
      comet.vx = (tx - comet.x) / time;
      comet.vy = (ty - comet.y) / time;
    },
    onAsteroidHit(fn) {
      onAsteroid = fn;
    },
    // The texture spot in the middle of the view.
    centre: () => viewCentre(),
    // Where the comet is on screen, in CSS pixels (for tests).
    cometPoint() {
      return comet && [comet.x * P, comet.y * P];
    },
    // atoms: what the comet carries, handed back on impact; colors: one tail color per atom.
    launchComet(atoms = [], colors = ['#bfe8ff']) {
      comet = { x: -5, y: H * (0.12 + Math.random() * 0.12), vx: W / 9, vy: H * 0.012, atoms, colors };
    },
    onSunTap(fn) {
      onSun = fn;
    },
    onCloudTap(fn) {
      onCloud = fn;
    },
    onCometTap(fn) {
      onComet = fn;
    },
    onRainbowTap(fn) {
      onRainbow = fn;
    },
    // Minigames: show one spot of a kind; how many of a kind are up; a sunspot; whether the moon can be dragged.
    spawnSpot,
    // A shimmer of light beyond the rainbow at a screen point (CSS pixels) or a texture spot, for `seconds`.
    glimmer(band, where, seconds = 6) {
      const sky = where.x !== undefined ? { x: Math.round(where.x / P), y: Math.round(where.y / P) } : null;
      spots.push({ kind: 'band', band, sky, at: sky ? null : where, t: seconds, max: seconds, taps: 0, off: { x: 0, y: 0 } });
    },
    // A random point in the sky (CSS pixels), or by the sun.
    skyPoint: () => ({ x: (W * (0.1 + Math.random() * 0.8)) * P, y: (H * (0.08 + Math.random() * 0.3)) * P }),
    sunPoint: () => ({ x: (sun.x - sun.r - 4) * P, y: (sun.y + sun.r * 0.5) * P }),
    setHeatView(on) {
      if (on === heatView) return;
      heatView = on;
      if (climate !== null) updateTexture(climate);
      lastBg = -1e9;
    },
    spotCount: kind => spots.filter(o => o.kind === kind).length + (kind === 'sunspot' ? sunspots.length : 0),
    sunspot() {
      if (!sunVisible()) return false;
      const dy = (Math.random() - 0.5) * 1.1;
      sunspots.push({ dx: -0.7, dy, vx: 0.12 + Math.random() * 0.06, t: 9 });
      return true;
    },
    sparkleMoon() {
      if (moon.visible && moonUp()) burst(moon.cur.x + (Math.random() - 0.5) * moon.cur.r * 2, moon.cur.y + (Math.random() - 0.5) * moon.cur.r * 2, '#ffffff', 3, 8);
    },
    setMoonPlay(on) {
      moonPlay = on;
    },
    // Screen points (CSS pixels) of what is up, for tests and the pacing bot.
    playPoints: () => [
      ...spots.filter(o => o.screen).map(o => ({ kind: o.kind, band: o.band, x: (o.screen.x + 0.5) * P, y: (o.screen.y + 0.5) * P, to: o.toScreen && { x: (o.toScreen.x + 0.5) * P, y: (o.toScreen.y + 0.5) * P } })),
      ...sunspots.map(o => ({ kind: 'sunspot', x: (sun.x + o.dx * sun.r + 0.5) * P, y: (sun.y + o.dy * sun.r + 0.5) * P })),
    ],
    zoneAtCss: (x, y) => zoneAt(x / P, y / P),
    moonPoint: () => (moon.visible && moonUp() ? { x: moon.cur.x * P, y: moon.cur.y * P } : null),
    onPlay(fn) {
      onPlay = fn;
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
      if (Terrain.raiseVolcanoes(spots)) {
        Terrain.setLand(land, mountains);
        if (climate !== null) updateTexture(climate);
        lastBg = -1e9;
      }
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
      const spot = v ? Terrain.volcanoSpot(v.spot) : null;
      if (v && !v.at) return spot;
      const x = v ? v.at.x : cx + (Math.random() - 0.5) * R * 0.8, y = v ? v.at.y - 11 : groundY(x);
      for (let k = 0; k < 25 * size; k++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.9, v = 15 + Math.random() * 35 * size;
        particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.8, max: 0.8, size: 1, color: Math.random() < 0.5 ? '#ff5a1a' : '#ffb02e' });
      }
      for (let k = 0; k < 30 * size; k++) {
        particles.push({ x: x + (Math.random() - 0.5) * 4, y, vx: (Math.random() - 0.3) * 8, vy: -(10 + Math.random() * 25 * size), life: 2.5, max: 2.5, size: Math.random() < 0.5 ? 1 : 2, color: Math.random() < 0.5 ? '#8a8478' : '#5a5650' });
      }
      return spot;
    },
    // Day and night: shown once the planet spins steadily, and the hour of the day (0..24).
    setDay(shown, hour, days = 0) {
      // A saved planet that already has days starts settled, so map features stay where they were placed.
      if (dayFirst && shown) landed = 1;
      dayFirst = false;
      dayShown = shown;
      dayHour = hour;
      skyDays = days;
    },
    // Which parts of the night sky research has opened: the stars, the star signs, the planets.
    // The one star sign in the sky tonight (or null), and the night's number (game days at its midnight).
    setTonight(sign, night) {
      tonightSign = sign || null;
      tonightNight = night || 0;
    },
    setStarExtras(colors, nebulaOn, milkyWay) {
      starColors = colors;
      nebulaeOn = nebulaOn;
      milkyWayOn = milkyWay;
    },
    supernova(seconds) {
      supernovaT = supernovaMax = seconds;
    },
    supernovaOn: () => supernovaT > 0,
    setStars(stars, signs, planets) {
      starsOn = stars;
      signsOn = stars && signs;
      planetsOn = stars && planets;
    },
    setSky(signs, planets) {
      signsFound = new Set(signs);
      planetsFound = new Set(planets);
    },
    onSkyTap(fn) {
      onSky = fn;
    },
    // Where the star signs and planets in the sky are now, in CSS pixels (for tests).
    skyPoints() {
      return skyObjects().map(o => ({
        kind: o.kind, id: o.id, x: o.x * P, y: o.y * P,
        stars: (o.stars || []).filter(([x, y]) => inSky(x, y)).map(([x, y]) => [(x + 0.5) * P, (y + 0.5) * P]),
      }));
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
