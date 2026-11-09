'use strict';

// Pixel-art scene: space, a sky whose atmosphere thickens as the planet warms,
// a tappable sun and clouds, and a huge planet whose top edge sits at the middle of the screen.
const Scene = (() => {
  const { TEX_W, TEX_H, COVER, elev, cover, NEIGHBOURS, rng, lerp, smooth } = Terrain;
  const TILT = (50 * Math.PI) / 180; // pole tipped away from the viewer, so the horizon is temperate
  const LIGHT = norm([0.4, 0.85, 0.4]); // the sun is above and to the right of the planet
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => v / 16 - 0.5);
  const SKY_BANDS = 8;
  // Star layers for parallax: how fast each turns compared to the star signs, and how bright it is.
  const STAR_DEPTHS = [
    { speed: 0.6, light: 0.45 },
    { speed: 0.8, light: 0.7 },
    { speed: 1, light: 0.85 },
    { speed: 1.35, light: 1 },
  ];
  const STAR_TINTS = [
    [160, 185, 255],
    [210, 225, 255],
    [255, 255, 255],
    [255, 240, 190],
    [255, 200, 140],
    [255, 150, 120],
  ];
  const AIR_TAP_PX = 24; // minimum height of the tappable air above the planet
  const SPIN_SECONDS = 150;
  const MAX_CLOUDS = 16; // clouds all round the planet; about half are on the side facing the viewer
  // Which clouds show as cover grows: spread evenly round the planet, so a few clouds are not all bunched up.
  const CLOUD_ORDER = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15];

  const RAMPS = {
    deep: [
      [-59, '#1b3566'],
      [0, '#1d4f9a'],
      [6, '#1f5a6a'],
      [12, '#3a4a3a'],
      [20, '#4a2418'],
    ],
    shallow: [
      [-59, '#2a5a9a'],
      [0, '#2f7fd0'],
      [6, '#3a8a8a'],
      [12, '#5a6a4a'],
      [20, '#6a3a22'],
    ],
    desert: [
      [0, '#d8b870'],
      [10, '#c8884a'],
      [20, '#9a4a2a'],
    ],
    horizon: [
      [-59, '#6a9ae0'],
      [-20, '#7ab4ec'],
      [0, '#a8dcff'],
      [5, '#d8d0a0'],
      [12, '#ff9a50'],
      [20, '#ff5a20'],
    ],
    zenith: [
      [-59, '#14286e'],
      [0, '#2a64c0'],
      [5, '#4a6aa0'],
      [12, '#7a3048'],
      [20, '#4a0e10'],
    ],
    space: [
      [-59, '#05060f'],
      [10, '#0a0610'],
      [20, '#140406'],
    ],
    heat: [
      [-60, '#140a3a'],
      [-25, '#3a1a8a'],
      [-5, '#8a2a9a'],
      [10, '#d83a3a'],
      [25, '#ff8a1a'],
      [40, '#ffe24a'],
      [150, '#ffffff'],
    ],
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
  const FIRE = hex('#ff6a1a'),
    BURNT = hex('#3a3030'),
    LAVA = hex('#ff3a1a'),
    MAGMA = hex('#ff7a1a'), // the young planet's molten surface
    MAGMA_BRIGHT = hex('#ff9a30'), // ... at the top of its breath
    BASALT = hex('#4a4040'), // young rock, dark: the setting crust and the dry basins
    EMBER = hex('#7a2010'), // magma cooling, a dim red glow
    FLOOD = hex('#6a8a9a');
  const LAKE = hex('#2a5aa8');

  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('scene'));
  const ctx = context2d(canvas);
  const bg = document.createElement('canvas');
  const bgCtx = context2d(bg);

  const texColors = new Uint32Array(TEX_W * TEX_H * 3);
  let texShown = texColors; // texColors in the colors shown (the same array when everything is in full color)

  let W = 0,
    H = 0,
    P = 1,
    cx = 0,
    cy = 0,
    skyCy = 0, // the sky's centre: where the planet's centre is when not zoomed
    R0 = 0, // the planet's radius when not zoomed
    planetZoom = 1, // how far the view is zoomed in on the planet (ZOOM_RANGE)
    zoomDirty = false,
    R = 0;
  let sun = { x: 0, y: 0, r: 1 };
  // Placed by layout() (or setOpening) before anything reads it.
  /** @type {{ x: number, y: number, r: number }} */
  let sunF = /** @type {{ x: number, y: number, r: number }} */ (/** @type {unknown} */ (null)); // rounded position for drawing, smooth float position
  /** @type {HTMLCanvasElement | null} */
  let sunBody = null;
  /** @type {string | null} */
  let sunMood = null;
  // Camera for the opening: zoom 0 = close on a giant sun, 1 = normal layout with the planet in view.
  let zoom = 1,
    zoomTarget = 1,
    zoomSet = false,
    camY = 0,
    sunBg = false,
    layout = {};
  // moon.cur is placed by layout() (or flingMoon) before anything reads it.
  const moon = {
    visible: false,
    wake: 0,
    bg: false,
    cur: /** @type {{ x: number, y: number, r: number }} */ (/** @type {unknown} */ (null)),
    fling: 0,
    phase: 0.5,
  };
  /** @type {HTMLCanvasElement | null} */
  let moonBody = null;
  /** @type {string | null} */
  let moonKey = null;
  let bgImage,
    bgPixels,
    pixU,
    pixV,
    pixShade,
    pixAlt,
    pixDither,
    stars = [];
  let skyColors = [],
    spaceColor = 0,
    skyShown = [],
    spaceShown = 0,
    atmosphere = 10,
    air = 10;
  /** @type {number | null} */
  let climate = null;
  let spin = 0,
    lastBg = -1e9;
  let landLife = 0,
    oceanLife = 0,
    ozone = 0,
    land = 0.3,
    mountains = 0,
    aerosols = 0;
  let iceCoverValue = 1,
    pressure = 0,
    haze = 0,
    sunBright = 1;
  // Volcanoes stand on the map and turn with the planet: tap a glowing one to make it erupt; it then cools for a while.
  const VOLCANO_COOL_S = 8;
  let volcanoes = [],
    onVolcanoFn = (..._) => {};
  const critterHits = [];
  let onZone = (..._) => {};
  let onCritterFn = (..._) => {};
  // How each critter moves on the map, by sprite.
  // prettier-ignore
  const MOVES = {
    fly: 'fly', spBird: 'fly', spBat: 'fly', spDragonfly: 'fly', spBee: 'fly', spButterfly: 'fly',
    fish: 'swim', reeffish: 'swim', jelly: 'swim', worm: 'swim', spJawless: 'swim', spWhale: 'swim',
    spOctopus: 'swim', spAmmonite: 'swim', spCrustacean: 'swim',
    frog: 'hop', bug: 'hop', spSalamander: 'hop', spSpider: 'hop', spAnt: 'hop', spBeetle: 'hop', spMammal: 'hop',
    spMonkey: 'hop',
  };
  let clouds = [],
    cloudCover = 0,
    storms = 0;
  const particles = [];
  let bolts = [];
  let sunPress = 0;
  /** @type {{ x: number, y: number, vx: number, vy: number, atoms: any[], colors: string[], asteroid?: boolean, crash?: { x: number, y: number } } | null} */
  let comet = null;
  let spinLevel = 0;
  /** @type {{ x: number, y: number, moved: number, zone: string, px: number, py: number } | null} */
  let drag = null;
  // The opening: 'pre' = the singularity waits for taps, 'dark' = the dark after the bang, with one star.
  // Day and night: once the planet spins steadily, the sun rises at 6 and sets at 18 o'clock.
  let dayShown = false,
    dayHour = 12,
    dayFirst = true;
  let viewTilt = TILT,
    tiltDirty = false; // the player can tip the planet to look at it from other angles
  // Once days run, the view settles on the planet: it stops turning and the sky turns instead.
  let landed = 0,
    skyAngle = 0;
  /** @type {number | null} */
  let lastHour = null;
  /** @type {string | null} */
  let cinema = null;
  let bangHeat = 0,
    flashT = 0,
    cinemaAt = 0,
    onBangFn = (..._) => {};
  let onSun = (..._) => {},
    onCloud = (..._) => {},
    onComet = (..._) => {},
    onMoon = (..._) => {},
    onSpinFn = (..._) => {};
  // The night sky: star signs and planets found so far (their lines and names show), and game days since the spin locked.
  let onSky = (..._) => {},
    signsFound = new Set(),
    skyDays = 0;
  // The stars light up one after another over STAR_RISE_S once the opening's dark ends (setCinema).
  const STAR_RISE_S = 3;
  let starRiseT = 0;
  let starsOn = false,
    signsOn = false,
    planetsOn = false;
  /** @type {string | null} */
  let tonightSign = null;
  let tonightNight = 0;
  /** @type {string | null} */
  let tonightPlanet = null;
  // A cow on the road: star colors, nebulae and the Milky Way once researched; a supernova blazes for a while.
  let starColors = false,
    nebulaeOn = false,
    milkyWayOn = false,
    supernovaT = 0,
    supernovaMax = 1,
    galaxy = [],
    nebulae = [];
  /** @type {{ a: number, r: number } | null} */
  let supernovaAt = null;
  // Disasters on screen: the ground shaking (seconds left), auroras (seconds left), hurricanes, and an asteroid.
  let shakeT = 0,
    auroraT = 0,
    hurricanes = [],
    onAsteroid = (..._) => {},
    onAurora = (..._) => {},
    onEclipse = (..._) => {};
  let eclipseT = 0,
    eclipseMax = 1;
  /** @type {{ x: number, base: number, r: number, t: number, max: number } | null} */
  let rainbow = null; // { x, base, r, t, max } while a rainbow stands in the sky
  let onRainbow = (..._) => {};

  /* ---------- helpers ---------- */

  function norm(v) {
    const l = Math.hypot(...v);
    return v.map(x => x / l);
  }

  function clamp01(k) {
    return Math.max(0, Math.min(1, k));
  }

  function hex(h) {
    const n = parseInt(h.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }

  function mix(a, b, k) {
    return a.map((v, i) => v + (b[i] - v) * k);
  }

  /** @param {number[]} rgb */
  function css([r, g, b]) {
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  function ramp(stops, t) {
    if (t <= stops[0][0]) return hex(stops[0][1]);
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const [t0, c0] = stops[i - 1],
          [t1, c1] = stops[i];
        return mix(hex(c0), hex(c1), (t - t0) / (t1 - t0));
      }
    }
    return hex(stops[stops.length - 1][1]);
  }

  // ImageData is little-endian RGBA, so pack as ABGR.
  /** @param {number[]} rgb */
  function pack([r, g, b], f = 1) {
    const c = v => Math.max(0, Math.min(255, Math.round(v * f)));
    return ((255 << 24) | (c(b) << 16) | (c(g) << 8) | c(r)) >>> 0;
  }

  /* ---------- colors found (Hues, in sprites.js) ---------- */

  // Once Starlight is known the scene is drawn straight in the colors found so far: every fill and stroke color,
  // the background's palettes, the sun and moon bodies and the sprites go through Hues.shade on their way in, so
  // no frame has to be read back. Before Starlight the silhouettes depend on the finished picture, so that phase
  // (the opening, which is nearly all black) still recolors the frame afterwards.
  let hueVersion = -1,
    tinting = false;
  const tintedCss = new Map(),
    tintedPacked = new Map(),
    tintedSprites = {};
  function shadeCss(v) {
    if (!tinting || typeof v !== 'string') return v;
    let t = tintedCss.get(v);
    if (t === undefined && tintedCss.size > 1024) tintedCss.clear();
    if (t === undefined) tintedCss.set(v, (t = Hues.css(v, true)));
    return t;
  }
  function shadePacked(p) {
    if (!tinting) return p;
    let t = tintedPacked.get(p);
    if (t === undefined) {
      if (tintedPacked.size > 4096) tintedPacked.clear();
      const [r, g, b] = Hues.shade(p & 255, (p >>> 8) & 255, (p >>> 16) & 255);
      tintedPacked.set(p, (t = ((p & 0xff000000) | (b << 16) | (g << 8) | r) >>> 0));
    }
    return t;
  }
  for (const prop of ['fillStyle', 'strokeStyle']) {
    const native = /** @type {{ get(): unknown, set(v: unknown): void }} */ (
      Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, prop)
    );
    Object.defineProperty(ctx, prop, {
      get() {
        return native.get.call(this);
      },
      set(v) {
        native.set.call(this, shadeCss(v));
      },
    });
  }
  // A small canvas (a sprite) in the colors shown.
  function shadeCanvas(src) {
    if (!tinting) return src;
    const c = document.createElement('canvas'),
      g = context2d(c, { willReadFrequently: true });
    c.width = src.width;
    c.height = src.height;
    g.drawImage(src, 0, 0);
    const img = g.getImageData(0, 0, c.width, c.height),
      px = new Uint32Array(img.data.buffer);
    for (let i = 0; i < px.length; i++) if (px[i] >>> 24) px[i] = shadePacked(px[i]);
    g.putImageData(img, 0, 0);
    return c;
  }
  const sprite = id => (tintedSprites[id] ||= shadeCanvas(Sprites.canvas(id)));
  // When the colors shown change, everything cached in the old colors is painted again.
  function syncHues() {
    if (Hues.version() === hueVersion) return;
    hueVersion = Hues.version();
    tinting = !Hues.full() && !Hues.dark();
    tintedCss.clear();
    tintedPacked.clear();
    for (const k in tintedSprites) delete tintedSprites[k];
    for (const k in outlines) delete outlines[k];
    sunMood = moonKey = null;
    shadeTexture();
    shadeSky();
    lastBg = -1e9;
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
    const ix = Math.floor(x),
      iy = Math.floor(y - camY);
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
  const atmosphereHeight = t =>
    Math.max(
      0.5,
      (H / 2) * pressure * (t < 0 ? lerp(0.25, 0.6, clamp01((t + 59) / 59)) : lerp(0.6, 1.3, clamp01(t / 20))),
    );
  // Planets lit by a dim sun look darker.
  const surfaceLight = () => 0.25 + 0.75 * Math.sqrt(clamp01(sunBright / 0.7));

  // Work out the map for the climate, then paint each texel's cover in three shades (lit, mid, shadow).
  // The ground stands up from the sphere by its height above the sea, a few pixels at most, and is shaded by its
  // slope. groundH holds each texel's height in pixels, hillStep its shading step (an index into HILL_STEPS).
  const GROUND_H = 6,
    HILL_STEPS = [0.8, 0.9, 1, 1.1, 1.2],
    HILL_FLAT = 2;
  const groundH = new Uint8Array(TEX_W * TEX_H),
    hillStep = new Uint8Array(TEX_W * TEX_H).fill(HILL_FLAT);
  let groundVersion = 0; // counts updateGround runs, for what is worked out from groundH (addRelief)
  function updateGround() {
    groundVersion++;
    const sea = Terrain.sea();
    let top = sea;
    for (let i = 0; i < elev.length; i++) if (elev[i] > top) top = elev[i];
    const span = Math.max(0.01, top - sea),
      e = (u, v) => elev[Math.max(0, Math.min(TEX_H - 1, v)) * TEX_W + ((u + TEX_W) % TEX_W)];
    for (let v = 0; v < TEX_H; v++)
      for (let u = 0; u < TEX_W; u++) {
        const i = v * TEX_W + u,
          land = elev[i] >= sea && cover[i] !== COVER.LAKE && cover[i] !== COVER.RIVER;
        // The land stands up only once there are mountains: a young planet is a smooth ball.
        groundH[i] = land && mountains > 0 ? Math.round(clamp01((elev[i] - sea) / span) ** 0.8 * GROUND_H) : 0;
        if (!land) {
          hillStep[i] = HILL_FLAT;
          continue;
        }
        const slope = ((e(u - 1, v) - e(u + 1, v)) * 1 + (e(u, v + 1) - e(u, v - 1)) * 0.5) / span;
        hillStep[i] = Math.max(0, Math.min(HILL_STEPS.length - 1, HILL_FLAT + Math.round(slope * 40)));
      }
  }

  // Each cover's color for the climate now, and the sun's light on the planet, as the map was last painted
  // (shared with the tile view in tiles.js, so both show the same ground).
  /** @type {number[][]} */
  let coverRgb = [],
    coverLight = 1;
  function updateTexture(t) {
    Terrain.update(t, iceCoverValue, landLife, viewCentre());
    paintTexture(t);
  }
  // The molten surface breathes: its glow brightens and dims (0..1, set each frame; repaints the colors only).
  let glowPulse = 0;
  function paintTexture(t) {
    const light = surfaceLight(),
      colors = [];
    coverRgb = colors;
    coverLight = light;
    colors[COVER.DEEP] = mix(ramp(RAMPS.deep, t), BLOOM, oceanLife * 0.3);
    colors[COVER.SHALLOW] = mix(ramp(RAMPS.shallow, t), BLOOM, oceanLife * 0.45);
    colors[COVER.BARE] = ramp(RAMPS.desert, t);
    Object.assign(colors, {
      [COVER.REEF]: REEF,
      [COVER.BLEACHED]: BLEACHED,
      [COVER.SEA_ICE]: SEA_ICE,
      [COVER.LAND_ICE]: LAND_ICE,
      [COVER.RIVER]: RIVER,
      [COVER.LAKE]: LAKE,
      [COVER.MOUNTAIN]: MOUNTAIN,
      [COVER.ROCK]: ROCK,
      [COVER.TUNDRA]: TUNDRA,
      [COVER.WETLAND]: WETLAND,
      [COVER.FOREST]: FOREST,
      [COVER.GRASS]: GRASS,
      [COVER.SAVANNA]: SAVANNA,
      [COVER.SAND]: SAND,
      [COVER.FIRE]: FIRE,
      [COVER.BURNT]: BURNT,
      [COVER.LAVA]: LAVA,
      [COVER.MAGMA]: mix(MAGMA, MAGMA_BRIGHT, glowPulse),
      [COVER.BASALT]: BASALT,
      [COVER.EMBER]: mix(EMBER, LAVA, glowPulse * 0.4),
      [COVER.FLOOD]: FLOOD,
      [COVER.RED_TIDE]: RED_TIDE,
    });
    // Glowing ground gives its own light: magma, lava and fire are as bright in the dark as by day.
    const glow = new Set([COVER.MAGMA, COVER.LAVA, COVER.EMBER, COVER.FIRE]),
      lit = k => (glow.has(k) ? 1 : light);
    const shades = colors.map((c, k) => [pack(c, 1.18 * lit(k)), pack(c, lit(k)), pack(c, 0.68 * lit(k))]);
    updateGround();
    // Hill shading: land that slopes towards the sun is a little brighter, land that slopes away a little darker,
    // in a few steps so it stays pixel art.
    const hills = HILL_STEPS.map(k =>
      colors.map((c, j) => [pack(c, 1.18 * lit(j) * k), pack(c, lit(j) * k), pack(c, 0.68 * lit(j) * k)]),
    );
    if (heatView) {
      // Infrared: every texel colored by how warm it is, like a heat camera.
      for (let i = 0; i < cover.length; i++) {
        const c = ramp(RAMPS.heat, Terrain.texelTemp(i));
        texColors[i * 3] = pack(c, 1.1);
        texColors[i * 3 + 1] = pack(c, 1);
        texColors[i * 3 + 2] = pack(c, 0.8);
      }
    } else {
      for (let i = 0; i < cover.length; i++) {
        // Glowing ground is flat, and so is the land until there are mountains: no hill shading before then.
        const sh =
          hillStep[i] === HILL_FLAT || mountains <= 0 || glow.has(cover[i])
            ? shades[cover[i]]
            : hills[hillStep[i]][cover[i]];
        texColors[i * 3] = sh[0];
        texColors[i * 3 + 1] = sh[1];
        texColors[i * 3 + 2] = sh[2];
      }
    }
    shadeTexture();
  }

  function shadeTexture() {
    if (!tinting) {
      texShown = texColors;
      return;
    }
    if (texShown === texColors) texShown = new Uint32Array(texColors.length);
    for (let i = 0; i < texColors.length; i++) texShown[i] = shadePacked(texColors[i]);
  }

  function shadeSky() {
    skyShown = skyColors.map(shadePacked);
    spaceShown = shadePacked(spaceColor);
  }

  function updateSky(t) {
    atmosphere = atmosphereHeight(t);
    // Methane haze without oxygen tints the sky orange, like Titan.
    const horizon = mix(ramp(RAMPS.horizon, t), HAZE, haze * 0.85),
      zenith = mix(ramp(RAMPS.zenith, t), HAZE, haze * 0.6);
    skyColors = [];
    for (let k = 0; k < SKY_BANDS; k++) {
      let c = mix(horizon, zenith, k / (SKY_BANDS - 1));
      if (k === SKY_BANDS - 2) c = mix(c, OZONE, ozone * 0.25); // the ozone layer, high in the sky
      c = mix(c, ASH, aerosols * 0.5); // eruption aerosols dim the whole sky
      skyColors.push(pack(c));
    }
    spaceColor = pack(ramp(RAMPS.space, t));
    shadeSky();
  }

  /* ---------- layout ---------- */

  // Lays the scene out for the window. Nothing is rebuilt when the pixel grid stays the same; otherwise what sits
  // at screen points moves with the new size.
  function resize() {
    const vw = window.innerWidth,
      vh = window.innerHeight;
    const p = Math.max(2, Math.round(Math.min(vw, vh * 0.55) / 180)),
      w = Math.ceil(vw / p),
      h = Math.ceil(vh / p);
    if (bgImage && p === P && w === W && h === H) return;
    const oldW = W,
      oldH = H;
    P = p;
    W = w;
    H = h;
    canvas.width = bg.width = W;
    canvas.height = bg.height = H;
    canvas.style.width = `${W * P}px`;
    canvas.style.height = `${H * P}px`;
    ctx.imageSmoothingEnabled = false;

    // Circle whose top is the middle of the screen and which passes through both bottom corners. Zooming in makes
    // it bigger with its top in the same place; the sky keeps turning round the unzoomed circle.
    R0 = (W * W + H * H) / (4 * H);
    cx = W / 2;
    skyCy = H / 2 + R0;
    R = R0 * planetZoom;
    cy = H / 2 + R;
    // The sun sits on the right, within thumb reach, inside the same column as the UI on wide screens.
    const rn = Math.round(Math.min(W * 0.1, H * 0.055)),
      column = Math.min(vw, 520) / P;
    layout = {
      rn,
      rb: Math.round(rn * 0.6),
      rm: Math.round(rn * 0.55),
      rmb: Math.round(rn * 0.4),
      colRight: (W + column) / 2,
      colLeft: (W - column) / 2,
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
    const outer = Math.hypot(W / 2, skyCy),
      ring = Math.PI * (outer * outer - R0 * R0);
    stars = Array.from({ length: Math.round(ring / 250) }, () => {
      const depth = STAR_DEPTHS[Math.floor(rand() * STAR_DEPTHS.length)];
      return {
        a: rand() * Math.PI * 2,
        r: Math.sqrt(R0 * R0 + rand() * (outer * outer - R0 * R0)),
        speed: depth.speed,
        c: css([255, 255, 255].map(v => v * depth.light * (0.75 + rand() * 0.25))),
        // Its real color, shown once Star Colors is known: hot stars blue, cool ones orange and red.
        tint: css(STAR_TINTS[Math.floor(rand() * STAR_TINTS.length)].map(v => v * depth.light)),
      };
    });
    // The Milky Way: a band of faint stars across the sky, turning slowly with the far stars.
    const tilt = 0.5,
      along = [Math.cos(tilt), Math.sin(tilt)];
    galaxy = [];
    for (let k = 0; k < Math.round(ring / 40); k++) {
      const t = (rand() - 0.5) * 2 * outer,
        off = (rand() + rand() + rand() - 1.5) * H * 0.06;
      const x = cx + along[0] * t - along[1] * off,
        y = skyCy - H * 0.32 + along[1] * t + along[0] * off;
      const r = Math.hypot(x - cx, y - skyCy);
      if (r > R0)
        galaxy.push({ a: Math.atan2(x - cx, skyCy - y), r, speed: 0.4, c: rand() < 0.5 ? '#9a9ab0' : '#c8c8d8' });
    }
    // Nebulae: three glowing clouds of gas where stars are born.
    nebulae = [
      ['#d87aa8', 0.7],
      ['#7a9ad8', 2.6],
      ['#d8a07a', 4.4],
    ].map(([c, a]) => ({
      c,
      a,
      r: R0 + (outer - R0) * (0.35 + rand() * 0.3),
      size: 6 + rand() * 4,
      dots: Array.from({ length: 40 }, () => [(rand() + rand() - 1) * 1.2, (rand() + rand() - 1) * 0.8]),
    }));
    supernovaAt = { a: 5.6, r: R0 + (outer - R0) * 0.45 };

    // Each cloud circles the planet at its own height and speed, like the stars turn round it. They keep
    // their place round the planet when the window changes size.
    if (!clouds.length) {
      clouds = Array.from({ length: MAX_CLOUDS }, (_, k) => ({
        a: (k / MAX_CLOUDS) * Math.PI * 2 + rand() * 0.3,
        alt: 0.3 + rand() * 0.4,
        w: 10 + Math.floor(rand() * 10),
        speed: 1.5 + rand() * 3,
      }));
    }
    if (oldW) rescale(W / oldW, H / oldH);

    if (climate !== null) updateSky(climate);
    lastBg = -1e9;
  }

  // Moves what is kept in screen pixels (sky spots, the meteor radiant, the rainbow, hurricanes, the comet and
  // what the player is dragging) to the same place on a resized screen.
  function rescale(sx, sy) {
    const at = o => {
      if (!o) return;
      o.x = Math.round(o.x * sx);
      o.y = Math.round(o.y * sy);
    };
    for (const o of spots) at(o.sky);
    at(meteorRadiant);
    for (const m of streaks) {
      m.x *= sx;
      m.y *= sy;
    }
    if (rainbow) {
      rainbow.x = Math.round(rainbow.x * sx);
      rainbow.r = Math.round(Math.min(W * 0.22, 60));
      rainbow.base = Math.round(groundY(rainbow.x)) + 4;
    }
    for (const h of hurricanes) {
      h.x0 *= sx;
      h.x1 *= sx;
      h.y0 *= sy;
      h.y1 *= sy;
    }
    if (comet) {
      comet.x *= sx;
      comet.y *= sy;
      comet.vx *= sx;
      comet.vy *= sy;
      if (comet.crash) comet.crash = { x: comet.crash.x * sx, y: comet.crash.y * sy };
    }
    if (plateDrag) {
      plateDrag.x *= sx;
      plateDrag.y *= sy;
    }
    if (moonDrag) {
      moonDrag.x0 *= sx;
      moonDrag.x *= sx;
    }
    for (const p of particles) {
      p.x *= sx;
      p.y *= sy;
    }
    bolts.length = 0;
  }

  // Which texture point each screen pixel of the planet shows, for the current view tilt, and the sky's
  // height above the planet for every other pixel.
  function mapPlanet() {
    const cosT = Math.cos(viewTilt),
      sinT = Math.sin(viewTilt);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x,
          dx = x + 0.5 - cx,
          dy = y + 0.5 - cy,
          d = Math.hypot(dx, dy);
        const dither = BAYER[(y & 3) * 4 + (x & 3)];
        if (d <= R) {
          const nx = dx / R,
            ny = -dy / R,
            nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
          const wy = ny * cosT - nz * sinT,
            wz = ny * sinT + nz * cosT;
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
    const a = ((((((s.u + 0.5) / TEX_W - spin) % 1) + 1) % 1) - 0.5) * 2 * Math.PI;
    const lat = (0.5 - (s.v + 0.5) / TEX_H) * Math.PI;
    const wy = Math.sin(lat),
      nx = Math.cos(lat) * Math.sin(a),
      wz = Math.cos(lat) * Math.cos(a);
    const cosT = Math.cos(viewTilt),
      sinT = Math.sin(viewTilt);
    const ny = wy * cosT + wz * sinT,
      nz = -wy * sinT + wz * cosT;
    if (nz < 0.12) return null;
    const g =
      planetZoom *
      groundH[
        Math.max(0, Math.min(TEX_H - 1, Math.floor(s.v))) * TEX_W + (((Math.floor(s.u) % TEX_W) + TEX_W) % TEX_W)
      ];
    const p = { x: Math.round(cx + nx * R), y: Math.round(cy - ny * R + camY - g) };
    return p.y > H + 4 ? null : p;
  }

  /* ---------- drawing ---------- */

  // By day the air's light fills the whole sky; at night the air is clear and space shows down to the ground.
  // Without air there is nothing to scatter sunlight: the sky stays black by day too, as on the moon.
  const airGlow = () => clamp01(pressure * 2 + haze);
  function renderBackground() {
    const n = W * H,
      shift = spin * TEX_W,
      top = Math.hypot(W / 2, cy) - R;
    air = dayShown ? lerp(0.5, Math.max(atmosphere, top), smooth(daylight()) * airGlow()) : atmosphere;
    for (let i = 0; i < n; i++) {
      const u0 = pixU[i];
      if (u0 >= 0) {
        const u = ((u0 * TEX_W + shift) | 0) % TEX_W;
        bgPixels[i] = texShown[(pixV[i] * TEX_W + u) * 3 + pixShade[i]];
      } else {
        const band = Math.floor((pixAlt[i] / air + pixDither[i]) * SKY_BANDS);
        bgPixels[i] = band < SKY_BANDS ? skyShown[Math.max(0, band)] : spaceShown;
      }
    }
    raiseGround(shift);
    bgCtx.putImageData(bgImage, 0, 0);
  }

  // Each screen column, from the nearest ground up to the horizon: raised ground hides what lies behind it, and its
  // front shows as a darker side.
  function raiseGround(shift) {
    for (let x = 0; x < W; x++) {
      let ceil = H;
      for (let y = H - 1; y >= 0; y--) {
        const i = y * W + x,
          u0 = pixU[i];
        if (u0 < 0) {
          if (y < ceil) break; // sky above all the ground in this column
          continue;
        }
        const t = pixV[i] * TEX_W + (((u0 * TEX_W + shift) | 0) % TEX_W),
          h = Math.round(groundH[t] * planetZoom),
          top = y - h;
        if (top >= ceil) continue;
        const face = texShown[t * 3 + pixShade[i]],
          side = texShown[t * 3 + 2];
        for (let r = Math.min(y, ceil - 1); r >= Math.max(0, top); r--) bgPixels[r * W + x] = r === top ? face : side;
        ceil = top;
      }
    }
  }

  // A round body (the sun or the moon) painted in one pass into a reused canvas: color(x, y) gives each pixel's
  // packed color, or 0 to leave it clear. Returns the canvas's context, for the face drawn on top.
  function paintBody(c, size, color) {
    c.width = c.height = size;
    const g = context2d(c),
      img = g.createImageData(size, size),
      px = new Uint32Array(img.data.buffer);
    for (let y = 0, i = 0; y < size; y++) {
      for (let x = 0; x < size; x++, i++) px[i] = color(x, y);
    }
    g.putImageData(img, 0, 0);
    return g;
  }
  const sunCanvas = document.createElement('canvas'),
    moonCanvas = document.createElement('canvas');

  const SUN_RINGS = ['#fff6b0', '#ffd23f', '#ffa62a', '#e0701a', '#ff9a2a'].map(hex);
  function renderSunBody(mood, bright) {
    const dim = 1 - clamp01(bright / 0.7);
    const r = sun.r,
      size = Math.ceil(r * 2.3) + 4,
      c = sunCanvas,
      m = size / 2;
    const ring = SUN_RINGS.map(col => shadePacked(pack(mix(col, [58, 22, 14], dim * 0.85).map(Math.floor))));
    const g = paintBody(c, size, (x, y) => {
      const d = Math.hypot(x + 0.5 - m, y + 0.5 - m) / r + BAYER[(y & 3) * 4 + (x & 3)] * 0.12;
      return d < 0.45
        ? ring[0]
        : d < 0.75
          ? ring[1]
          : d < 0.93
            ? ring[2]
            : d < 1
              ? ring[3]
              : d < 1.12 && (x + y) % 2 === 0
                ? ring[4]
                : 0;
    });
    const face = dim > 0.6 ? '#1a0a06' : '#7a3a00',
      ex = Math.round(r * 0.33),
      ey = Math.round(m - r * 0.15);
    g.fillStyle = shadeCss(face);
    // Closed, sleepy eyes until the sun is properly lit.
    const eyeH = dim > 0.6 ? 1 : 3;
    g.fillRect(Math.round(m - ex - 1), ey + (3 - eyeH), 2, eyeH);
    g.fillRect(Math.round(m + ex - 1), ey + (3 - eyeH), 2, eyeH);
    const mw = Math.round(r * 0.4);
    for (let x = -mw; x <= mw; x++) {
      const y = Math.round(m + r * 0.32 - x * x * (0.9 / r) * (mood < 0 ? -0.6 : 1));
      g.fillRect(Math.round(m + x), y, 1, 2);
    }
    if (mood > 0) {
      g.fillStyle = shadeCss('#8ad8ff');
      g.fillRect(Math.round(m + r * 0.6), Math.round(m - r * 0.4), 2, 3);
      g.fillRect(Math.round(m + r * 0.6) + 2, Math.round(m - r * 0.4) + 3, 1, 1);
    }
    return sunCanvas;
  }

  const sunVisible = () => dayShown && dayHour >= 6 && dayHour <= 18;
  // 1 in full daylight, 0 at night, with an hour of dawn and dusk on each side.
  // How much of the sun the moon hides during an eclipse (0..1): it slides in, covers it, slides out.
  const eclipseCover = () => (eclipseT > 0 ? Math.min(1, 1.3 * Math.sin(Math.PI * (1 - eclipseT / eclipseMax))) : 0);
  const daylight = () =>
    (dayShown ? clamp01(Math.min(dayHour - 5, 19 - dayHour) / 2) : 1) * (1 - 0.85 * eclipseCover());

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
    return {
      x: lerp(layout.colLeft + r + 12, layout.colRight - r - 12, t),
      y: H / 2 + r * 0.6 - Math.sin(Math.PI * t) * H * 0.3,
      r,
    };
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
    const k = Math.min(1, dt * 4),
      t = sunTarget(),
      m = moonTarget();
    // A moon just thrown off the planet drifts slowly up to its place in the sky.
    const km = moon.fling > 0 ? Math.min(1, dt * 1.2) : dayShown ? 1 : k;
    moon.fling = Math.max(0, moon.fling - dt);
    for (const key of ['x', 'y', 'r']) {
      sunF[key] += (t[key] - sunF[key]) * (dayShown ? 1 : k);
      moon.cur[key] += (m[key] - moon.cur[key]) * km;
    }
    sun = { x: Math.round(sunF.x), y: Math.round(sunF.y), r: Math.max(2, Math.round(sunF.r)) };
  }

  // The moon in its phase (0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter): the sunlit part waxes from
  // the right and wanes to the left; the dark part shows only as a faint earthshine.
  const moonLit = (nx, ny, phase) => {
    const edge = Math.sqrt(Math.max(0, 1 - ny * ny)) * Math.cos(phase * Math.PI * 2);
    return phase <= 0.5 ? nx > edge : nx < -edge;
  };

  function renderMoonBody(r, wake, phase = 0.5) {
    const size = r * 2 + 3,
      m = size / 2,
      rand = rng(5);
    const base = mix([58, 58, 72], [208, 208, 220], wake);
    const craters = Array.from({ length: 5 }, () => ({
      x: (rand() - 0.5) * r * 1.2,
      y: (rand() - 0.5) * r * 1.2,
      r: 1 + rand() * r * 0.25,
    }));
    const g = paintBody(moonCanvas, size, (x, y) => {
      const dx = x + 0.5 - m,
        dy = y + 0.5 - m;
      if (Math.hypot(dx, dy) > r) return 0;
      // Lit from the right, where the sun is.
      let f = 0.75 + 0.35 * (dx / r) + BAYER[(y & 3) * 4 + (x & 3)] * 0.12;
      if (craters.some(k => Math.hypot(dx - k.x, dy - k.y) < k.r)) f -= 0.18;
      if (wake >= 1 && !moonLit(dx / r, dy / r, phase)) f = 0.22 + BAYER[(y & 3) * 4 + (x & 3)] * 0.05; // earthshine
      // Whole channels, as the old fills had them, so the shades stay few.
      return shadePacked(pack(base.map(v => Math.floor(v * Math.max(0.2, Math.min(1.15, f))))));
    });
    // Asleep: closed eyes. Awake: open eyes and a small smile.
    g.fillStyle = shadeCss(wake >= 1 ? '#3a3a4a' : '#24242e');
    const ex = Math.max(2, Math.round(r * 0.35)),
      ey = Math.round(m - r * 0.15);
    const eyeH = wake >= 1 ? 2 : 1;
    g.fillRect(Math.round(m - ex - 1), ey + (2 - eyeH), 2, eyeH);
    g.fillRect(Math.round(m + ex - 1), ey + (2 - eyeH), 2, eyeH);
    if (wake >= 1) g.fillRect(Math.round(m - 2), Math.round(m + r * 0.35), 4, 1);
    return moonCanvas;
  }

  function drawMoon() {
    if (!moon.visible) return;
    const r = Math.max(2, Math.round(moon.cur.r)),
      key = `${r}|${Math.round(moon.wake * 10)}|${Math.round(moon.phase * 32)}`;
    if (key !== moonKey) {
      moonKey = key;
      moonBody = renderMoonBody(r, moon.wake, moon.phase);
    }
    const body = /** @type {HTMLCanvasElement} */ (moonBody); // rendered on the first call, as moonKey starts null
    ctx.drawImage(body, Math.round(moon.cur.x - body.width / 2), Math.round(moon.cur.y - body.height / 2));
  }

  // Once researched, stars fill the dark sky at night, everywhere but the planet.
  // A point of the night sky turning around the planet, on screen, or null where the planet or its air hides it.
  function skyAt(a, r, speed) {
    a += skyAngle * speed;
    const x = Math.floor(cx + r * Math.sin(a)),
      y = Math.floor(skyCy - r * Math.cos(a)),
      i = y * W + x;
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
          const p = skyAt(n.a + (dx * n.size) / n.r, n.r + dy * n.size, 0.5);
          if (p) ctx.fillRect(p[0], p[1], 1, 1);
        }
      }
    }
    // While the stars rise, each lights up at its own moment, and the stars tapped in the dark fade into them.
    const rise = starRiseT > 0 ? 1 - starRiseT / STAR_RISE_S : 1;
    ctx.globalAlpha = night;
    stars.forEach((st, i) => {
      const p = skyAt(st.a, st.r, st.speed);
      if (!p) return;
      if (rise < 1) {
        const k = Math.min(1, Math.max(0, (rise - (((i * 7) % 23) / 23) * 0.7) / 0.3));
        if (k <= 0) return;
        ctx.globalAlpha = night * k;
      }
      ctx.fillStyle = starColors ? st.tint : st.c;
      ctx.fillRect(p[0], p[1], 1, 1);
    });
    if (rise < 1) {
      ctx.globalAlpha = 1 - rise;
      ctx.fillStyle = '#ffffff';
      for (const s of lit) ctx.fillRect(s.x, s.y, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // A supernova: a new star that outshines everything, by day too, then fades.
  function drawSupernova(dt) {
    if (supernovaT <= 0 || !supernovaAt) return;
    supernovaT = Math.max(0, supernovaT - dt);
    const p = skyAt(supernovaAt.a, supernovaAt.r, 0.5);
    if (!p) return;
    const k = supernovaT / supernovaMax,
      arm = Math.round(1 + 4 * k);
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
  const bandY = u => Math.round(H * 0.17 + Math.sin((u / skyAround()) * Math.PI * 2) * H * 0.05);

  // Distance from the planet's centre to the star sign band: the sky turns around the planet at this radius.
  const skyRadius = () => skyCy - H * 0.17;

  // Bends a point of the flat band onto its circle around the planet: `ax, ay` is the anchor that sets
  // the angle, so a whole sign turns together and keeps its shape.
  function onArc(x, y, ax, ay) {
    const rb = skyCy - ay,
      t = (ax - cx) / rb,
      dx = x - ax,
      dy = y - ay,
      r = rb - dy;
    return [
      Math.round(cx + Math.sin(t) * r + Math.cos(t) * dx),
      Math.round(skyCy - Math.cos(t) * r + Math.sin(t) * dx),
    ];
  }

  function skyX(u) {
    const around = skyAround(),
      perHour = (layout.colRight - layout.colLeft) / 12;
    let x = (u + skyDays * 24 * perHour) % around;
    if (x > W + 30) x -= around;
    return x;
  }

  // Star signs and planets on screen now, with their pixels in screen coordinates.
  function skyObjects() {
    if (!dayShown || !starsOn) return [];
    const out = [],
      around = skyAround();
    // Tonight's sign only, placed so it is overhead at midnight and crosses the sky through the night.
    const perHour = (layout.colRight - layout.colLeft) / 12;
    if (signsOn)
      Sky.SIGNS.filter(s => s.id === tonightSign).forEach(s => {
        const u = (((cx - Sky.SIGN_W / 2 - tonightNight * 24 * perHour) % around) + around) % around;
        const x = Math.round(skyX(u)),
          y = bandY(u) - Sky.SIGN_H / 2;
        if (x < -Sky.SIGN_W * 2 || x > W + Sky.SIGN_W) return;
        const ax = x + Sky.SIGN_W / 2,
          ay = y + Sky.SIGN_H / 2,
          [mx, my] = onArc(ax, ay, ax, ay);
        out.push({
          kind: 'sign',
          id: s.id,
          x: mx,
          y: my,
          stars: s.stars.map(([sx, sy]) => onArc(x + sx, y + sy, ax, ay)),
          sign: s,
        });
      });
    if (planetsOn)
      for (const p of Sky.PLANETS) {
        if (p.id !== tonightPlanet || !Sky.planetUp(p, skyDays, dayHour)) continue;
        const u = ((p.at + skyDays * p.speed) % 1) * around,
          [x, y] = onArc(Math.round(skyX(u)), bandY(u) + 3, Math.round(skyX(u)), bandY(u) + 3);
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
            const [x0, y0] = o.stars[a],
              [x1, y1] = o.stars[b],
              n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
            for (let k = 1; k < n; k += 2) {
              const x = Math.round(x0 + ((x1 - x0) * k) / n),
                y = Math.round(y0 + ((y1 - y0) * k) / n);
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
        const s = o.planet.size || 2;
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
    /** @type {ReturnType<typeof skyObjects>[number] | null} */
    let best = null;
    let bestD = 6;
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
    const mood = (climate ?? 0) > 8 ? 1 : (climate ?? 0) < -40 ? -1 : 0,
      key = `${mood}|${Math.round(sunBright * 20)}|${sun.r}`;
    if (key !== sunMood) {
      sunMood = key;
      sunBody = renderSunBody(mood, sunBright);
    }
    return /** @type {HTMLCanvasElement} */ (sunBody); // rendered on the first call, as sunMood starts null
  }

  function drawSun(now, dt) {
    const body = sunSprite();
    sunPress = Math.max(0, sunPress - dt * 8);
    const press = sunPress > 0 ? 1 : 0,
      { x, y, r } = sun,
      a0 = now / 6000;
    const rayScale = clamp01((sunBright - 0.05) / 0.65);
    for (let k = 0; rayScale > 0 && k < 12; k++) {
      const a = a0 + (k * Math.PI) / 6,
        long = k % 2 === 0,
        len = Math.round(((long ? 8 : 5) - press * 2) * rayScale),
        w = long ? 2 : 1;
      ctx.fillStyle = long ? '#ffd23f' : '#ffb02e';
      for (let s = r + 4; s < r + 4 + len; s++) {
        ctx.fillRect(Math.round(x + Math.cos(a) * s - w / 2), Math.round(y + Math.sin(a) * s - w / 2), w, w);
      }
    }
    ctx.drawImage(body, Math.round(x - body.width / 2), Math.round(y - body.height / 2) + press);
  }

  // Visible clouds, with storm clouds first. Each circles the planet (angle a, 0 at the top) at a height in
  // the air; only those over the side facing the viewer and on screen are drawn. Each gets its screen box for
  // drawing and tapping. Storm clouds are spread round the planet so one is usually in view.
  function visibleClouds() {
    const n = Math.min(MAX_CLOUDS, Math.ceil(cloudCover * MAX_CLOUDS * 3));
    const out = [];
    for (let k = 0; k < n; k++) {
      const c = clouds[CLOUD_ORDER[k]],
        storm = k < storms * 2,
        w = c.w + (storm ? 6 : 0);
      const rr = R + c.alt * Math.max(atmosphere, 40),
        x = cx + rr * Math.sin(c.a),
        y = cy - rr * Math.cos(c.a) + camY;
      if (Math.cos(c.a) < 0.2 || x < -w || x > W + w) continue;
      // Storm clouds and three in five of the others carry rain (or snow, in freezing air).
      out.push({ cloud: c, storm, x: Math.round(x - w / 2), y: Math.round(y), w, k, wet: storm || k % 5 < 3 });
    }
    return out;
  }

  // What falls from the clouds, from research: rain, snow in freezing air, hail from storm clouds.
  let weather = { rain: false, snow: false, hail: false };
  // Air cools about 6.5 °C per km going up: a low cloud (1.5 km) is 10 °C colder than the ground under it, a high
  // one (6 km) 40 °C colder. Null when no ground is under the cloud.
  const cloudChill = v => 10 + ((v.cloud.alt - 0.3) / 0.4) * 30;
  function cloudTemp(v) {
    const x = Math.round(v.x + v.w / 2),
      i = (Math.round(groundY(x)) + 1 - camY) * W + x;
    if (x < 0 || x >= W || i < 0 || i >= W * H || !(pixU[i] >= 0)) return null;
    return Terrain.texelTemp(pixV[i] * TEX_W + texU(i)) - cloudChill(v);
  }
  // 'rain', 'snow' or null: what falls from a cloud now. Until Snow is known, cold clouds rain too.
  function precip(v) {
    if (!weather.rain || !v.wet) return null;
    const t = cloudTemp(v);
    if (t === null) return null;
    return t < 0 && weather.snow ? 'snow' : 'rain';
  }
  // Rain streaks fast, snow drifts down and sways, hail drops as white pellets among a storm's rain.
  function drawFall(v, kind, now) {
    const { x, y, w, k: seed } = v,
      top = y + 3,
      len = Math.max(4, Math.min(160, Math.round(groundY(x + w / 2)) - top)),
      n = Math.max(3, Math.round((len / 8) * (v.storm ? 1.5 : 1)));
    for (let k = 0; k < n; k++) {
      const ox = 1 + ((k * 37 + seed * 13) % Math.max(1, w - 2)),
        hail = kind === 'rain' && v.storm && weather.hail && k % 3 === 0,
        speed = kind === 'snow' ? 0.012 : hail ? 0.12 : 0.09,
        dy = (now * speed + (k * len) / n) % len;
      if (kind === 'snow') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + ox + Math.round(Math.sin(now / 400 + k)), Math.round(top + dy), 1, 1);
      } else if (hail) {
        ctx.fillStyle = '#e8f4ff';
        ctx.fillRect(x + ox, Math.round(top + dy), 2, 2);
      } else {
        ctx.fillStyle = '#7ab8ff';
        ctx.fillRect(x + ox, Math.round(top + dy), 1, 2);
      }
    }
  }

  // Snow on a mountain (the river minigame): while it is on, a snowing cloud right above a peak in view snows on it.
  // Turn the planet to bring a mountain under a cloud. Counts at most once every MOUNTAIN_SNOW_S.
  let mountainSnow = false,
    lastMountainSnow = -1e9;
  const MOUNTAIN_SNOW_S = 15;
  function peakUnder(v) {
    buildRelief();
    for (const p of summits) {
      const s = project(p);
      if (s && s.x >= v.x - 2 && s.x <= v.x + v.w + 2 && s.y - peakHeight(p) > v.y)
        return { x: s.x, y: s.y - peakHeight(p) };
    }
    return null;
  }
  function snowOnMountain(v, kind, now) {
    const s = kind === 'snow' && peakUnder(v);
    if (!s) return;
    // The snow reaches down to the peak.
    ctx.fillStyle = kind === 'snow' ? '#ffffff' : '#7ab8ff';
    const top = v.y + 3,
      len = Math.max(4, s.y - top),
      speed = kind === 'snow' ? 0.02 : 0.09;
    for (let k = 0; k < 6; k++)
      ctx.fillRect(s.x - 3 + k, Math.round(top + ((now * speed + (k * len) / 6) % len)), 1, kind === 'snow' ? 1 : 2);
    if (now - lastMountainSnow < MOUNTAIN_SNOW_S * 1000) return;
    lastMountainSnow = now;
    burst(s.x, s.y, '#ffffff', 14, 20);
    onPlay('river', (s.x + 0.5) * P, s.y * P);
  }

  // Clouds keep circling even while out of view.
  function moveClouds(dt) {
    for (const c of clouds) c.a = (c.a + (c.speed * dt) / (R + 30)) % (Math.PI * 2);
  }

  const CLOUD_WHITE = css([245, 248, 255]),
    CLOUD_SHADE = css([200, 210, 225]);
  function drawClouds(now, dt) {
    const white = CLOUD_WHITE,
      whiteShade = CLOUD_SHADE;
    moveClouds(dt);
    for (const v of visibleClouds()) {
      const { x, y, w, storm } = v;
      const fall = precip(v);
      if (fall) drawFall(v, fall, now);
      if (fall && mountainSnow) snowOnMountain(v, fall, now);
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
    let x = v.x + Math.floor(v.w / 2),
      y = v.y + 4;
    const hitY = Math.round(groundY(x)) + 2,
      points = [];
    while (y < hitY) {
      points.push([x, y]);
      y += 1;
      if (Math.random() < 0.35) x += Math.random() < 0.5 ? -1 : 1;
    }
    bolts.push({ points, life: 0.25 });
    for (let k = 0; k < 6; k++) {
      particles.push({
        x,
        y: hitY - 2,
        vx: (Math.random() - 0.5) * 40,
        vy: -Math.random() * 30,
        life: 0.4,
        max: 0.4,
        size: 1,
        color: '#fff3a0',
      });
    }
    const i = (hitY - 2 - camY) * W + x,
      onPlanet = pixU[i] >= 0;
    return { zone: zoneAt(x, hitY), x: x * P, y: hitY * P, u: onPlanet ? texU(i) : -1, v: pixV[i] };
  }

  // Drops fall from the cloud to the surface. Returns the share of them that land on ground rather than sea.
  function rain(v) {
    let onLand = 0;
    for (let k = 0; k < 14; k++) {
      const x = v.x + 1 + Math.random() * (v.w - 2),
        hitY = groundY(x),
        time = 0.4 + Math.random() * 0.3;
      particles.push({
        x,
        y: v.y + 3,
        vx: 0,
        vy: (hitY - v.y - 3) / time,
        life: time,
        max: time,
        size: 1,
        color: '#7ab8ff',
      });
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
    const src = sprite(id),
      c = document.createElement('canvas'),
      g = context2d(c);
    c.width = src.width + 2;
    c.height = src.height + 2;
    for (const [dx, dy] of NEIGHBOURS) g.drawImage(src, 1 + dx, 1 + dy);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = shadeCss('#1a1420');
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    g.drawImage(src, 1, 1);
    return (outlines[id] = c);
  }

  // Mountains rise from the map as stacks of pixels: every texel of a range is a column as tall as the ground
  // there, drawn back to front among the other landmarks. Each peak in use is the summit of a range: a ridge that
  // winds away on both sides, falling in smaller peaks to its ends, and grows longer as the mountains grow. Tops
  // that face the sun (to the right and up) are lit, the rest in shade, and the high tops are snowy once glaciers
  // form.
  const RELIEF_H = 20, // a summit's height in pixels
    RELIEF_FOOT = 5.5, // texels from the ridge to the foot, under the summit
    RANGE_LEN = [5, 16], // texels from the summit to each end of a range, as the mountains grow
    MOUNTAIN_ROCK = { top: ['#a89a86', '#857664', '#625545'], side: ['#857664', '#625545', '#4b4037'] },
    MOUNTAIN_SNOW = ['#ffffff', '#e2eaf4', '#b4c2d8'],
    VOLCANO_H = 16, // a volcano's height in pixels, to the rim of its crater
    VOLCANO_FOOT = 5.5, // texels from a volcano's crater to its foot
    LAVA_FLOW = ['#ffb02e', '#ff6a1a', '#c8401a', '#7a2a1a'],
    CRATER = { hot: '#ff5a1a', cold: '#3a2a26' },
    MOUNTAIN_RIVER = ['#5a9ae0', '#3a7ad0', '#2a5aa0'];
  const reliefHash = i => (((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1;
  let reliefKey = '',
    /** @type {{u: number, v: number, i: number, h: number, tone: number, cap: boolean, volcano: number, crater: boolean, lava: number}[]} */
    relief = [],
    /** @type {{u: number, v: number}[]} */
    summits = []; // the high points along the ridges, where snow on a mountain counts
  const reliefAt = new Map(), // texel index to height in pixels
    reliefOf = new Map(), // texel index to its entry in relief
    volcanoAt = new Map(), // texel index to the volcano spot whose cone it is on
    craterAt = new Set(),
    lavaAt = new Map(); // texel index to how far down its volcano's lava path it lies (0 at the crater, 1 at the foot)
  function buildRelief() {
    const peaks = Terrain.peaks(),
      cones = volcanoes.map(v => ({ k: v.spot, ...Terrain.volcanoSpot(v.spot) })),
      key = `${[...peaks, ...cones].map(p => `${p.u},${p.v}`).join(' ')}|${Terrain.sea()}|${mountains.toFixed(2)}`;
    if (key === reliefKey) return;
    reliefKey = key;
    reliefAt.clear();
    reliefOf.clear();
    volcanoAt.clear();
    craterAt.clear();
    lavaAt.clear();
    summits = [];
    const len = lerp(RANGE_LEN[0], RANGE_LEN[1], clamp01(mountains));
    const stamp = (cu, cv, h) => {
      const foot = 2 + (RELIEF_FOOT - 2) * (h / RELIEF_H),
        r = Math.ceil(foot);
      for (let dv = -r; dv <= r; dv++)
        for (let du = -r; du <= r; du++) {
          const u = (Math.round(cu) + du + TEX_W) % TEX_W,
            v = Math.round(cv) + dv,
            i = v * TEX_W + u,
            d = Math.hypot(Math.round(cu) + du - cu, v - cv) / foot;
          if (d >= 1 || v < 0 || v >= TEX_H || elev[i] < Terrain.sea()) continue;
          reliefAt.set(i, Math.max(reliefAt.get(i) || 0, h * (1 - d) ** 1.15 * (0.92 + 0.16 * reliefHash(i))));
        }
    };
    for (const p of peaks) {
      // The ridge's heading and its bends and lesser peaks come from the summit's place, so they stay put.
      const seed = p.v * TEX_W + p.u,
        a = reliefHash(seed) * Math.PI,
        du = Math.cos(a),
        dv = Math.sin(a) * 0.6,
        bend = 2 + 2.5 * reliefHash(seed + 1),
        phase = reliefHash(seed + 2) * 6;
      for (let k = -Math.floor(len * 2); k <= len * 2; k++) {
        const t = k / 2,
          f = Math.abs(t) / len,
          wobble = Math.sin(t * 0.22 + phase) * bend,
          bumps = 0.55 + 0.45 * Math.cos(t * 0.6 + phase) ** 2,
          h = RELIEF_H * (t === 0 ? 1 : (1 - f) ** 0.9 * bumps),
          cu = p.u + du * t - dv * wobble,
          cv = p.v + dv * t + du * wobble * 0.6;
        if (h < 2) continue;
        stamp(cu, cv, h);
        if (h > RELIEF_H * 0.35 && k % 2 === 0) summits.push({ u: Math.round(cu), v: Math.round(cv) });
      }
    }
    // Volcanoes are mountains of their own: a cone with a crater on top, and a path down its front side (towards
    // the viewer) that its lava pours along.
    for (const c of cones) {
      const r = Math.ceil(VOLCANO_FOOT);
      for (let dv = -r; dv <= r; dv++)
        for (let du = -r; du <= r; du++) {
          const u = (c.u + du + TEX_W) % TEX_W,
            v = c.v + dv,
            i = v * TEX_W + u,
            d = Math.hypot(du, dv) / VOLCANO_FOOT;
          if (d >= 1 || v < 0 || v >= TEX_H || elev[i] < Terrain.sea()) continue;
          const crater = d < 0.22,
            h = crater ? VOLCANO_H * 0.75 : VOLCANO_H * ((1 - d) / 0.78) ** 1.6 * (0.95 + 0.1 * reliefHash(i));
          if (h < (reliefAt.get(i) || 0)) continue;
          reliefAt.set(i, Math.min(VOLCANO_H, h));
          volcanoAt.set(i, c.k);
          if (crater) craterAt.add(i);
        }
      const a = Math.PI / 2 + (reliefHash(c.v * TEX_W + c.u + 7) - 0.5) * 1.4,
        len = VOLCANO_FOOT + 1;
      for (let t = 0; t <= len; t += 0.5) {
        const w = Math.sin(t * 0.9 + c.u) * 0.6,
          u = Math.round(c.u + Math.cos(a) * t - Math.sin(a) * w),
          v = Math.round(c.v + Math.sin(a) * t + Math.cos(a) * w),
          f = t / len;
        // Two texels wide, so it shows on the slope.
        for (const j of [v * TEX_W + ((u + TEX_W) % TEX_W), v * TEX_W + ((u + 1 + TEX_W) % TEX_W)])
          if (volcanoAt.get(j) === c.k && !craterAt.has(j) && !lavaAt.has(j)) lavaAt.set(j, f);
      }
    }
    const at = (u, v) => reliefAt.get(v * TEX_W + ((u + TEX_W) % TEX_W)) || 0;
    relief = [...reliefAt].map(([i, h]) => {
      const u = i % TEX_W,
        v = Math.floor(i / TEX_W),
        slope = at(u - 1, v) - at(u + 1, v) + 0.5 * (at(u, v + 1) - at(u, v - 1));
      return {
        u,
        v,
        i,
        h: Math.max(1, Math.round(h)),
        tone: slope > 1 ? 0 : slope < -1 ? 2 : 1,
        cap: h > RELIEF_H * 0.55 && !volcanoAt.has(i),
        volcano: volcanoAt.has(i) ? /** @type {number} */ (volcanoAt.get(i)) : -1,
        crater: craterAt.has(i),
        lava: lavaAt.has(i) ? /** @type {number} */ (lavaAt.get(i)) : -1,
      };
    });
    for (const r of relief) reliefOf.set(r.i, r);
  }
  // A peak's height in pixels (0 for no relief there).
  const peakHeight = p => Math.round((reliefAt.get(p.v * TEX_W + p.u) || 0) * planetZoom);
  // Each volcano's state this frame, by spot: 0 when ready (its crater glows), else how far its last eruption
  // has gone, from just erupted to cooled (0..1).
  const eruptionAt = new Map();
  // Where each relief column lands on screen is worked out again only when the view moves (spin, tilt, zoom,
  // camera, canvas size) or the relief or ground changes; a still planet reuses the last list.
  let reliefMarks = /** @type {{ x: number, y: number, w: number, dy: number, col: object }[]} */ ([]),
    reliefMarksKey = '';
  function addRelief() {
    buildRelief();
    eruptionAt.clear();
    for (const v of volcanoes) eruptionAt.set(v.spot, v.cool > 0 ? 1 - v.cool / VOLCANO_COOL_S : 0);
    const key = `${reliefKey}|${spin}|${viewTilt}|${planetZoom}|${camY}|${R}|${cx}|${cy}|${H}|${groundVersion}`;
    if (key !== reliefMarksKey) {
      reliefMarksKey = key;
      reliefMarks = [];
      for (const r of relief) {
        const at = project(r);
        if (!at) continue;
        const east = project({ u: r.u + 1, v: r.v }),
          south = project({ u: r.u, v: r.v + 1 });
        reliefMarks.push({
          x: at.x,
          y: at.y,
          col: r,
          w: east ? Math.max(1, east.x - at.x) : 1,
          dy: south ? Math.max(1, south.y - at.y) : 1,
        });
      }
    }
    for (const r of reliefMarks) {
      const m = (markPool[marks.length] ||= {});
      m.x = r.x;
      m.y = r.y;
      m.img = null;
      m.size = 1;
      m.col = r.col;
      m.w = r.w;
      m.dy = r.dy;
      marks.push(m);
    }
  }
  // The top of a column: the crater, lava pouring down, a river running off the snow, snow or rock. Its side shows
  // lava too where the lava pours over it.
  function drawColumn(m, now) {
    const { tone, cap, volcano, crater, lava, i } = m.col,
      h = Math.round(m.col.h * planetZoom),
      top = m.y - h,
      snow = cap && Terrain.features().snow;
    let topColor = snow ? MOUNTAIN_SNOW[tone] : MOUNTAIN_ROCK.top[tone],
      sideColor = MOUNTAIN_ROCK.side[tone];
    if (volcano >= 0) {
      const e = eruptionAt.get(volcano) || 0;
      if (crater) topColor = e === 0 ? CRATER.hot : e < 0.6 ? LAVA_FLOW[0] : CRATER.cold;
      else if (lava >= 0 && e > 0 && lava <= Math.min(1, e * 4)) {
        // The lava pours down fast, glows, then cools dark from the top down.
        const age = e - lava / 4,
          flicker = (Math.floor(now / 120) + i) % 3 === 0 ? 0 : 1;
        topColor = age < 0.45 ? LAVA_FLOW[flicker] : age < 0.75 ? LAVA_FLOW[2] : LAVA_FLOW[3];
        sideColor = age < 0.45 ? LAVA_FLOW[2] : LAVA_FLOW[3];
      }
    } else if (cover[i] === COVER.RIVER && !snow) {
      topColor = MOUNTAIN_RIVER[tone];
      sideColor = MOUNTAIN_RIVER[2];
    }
    ctx.fillStyle = topColor;
    ctx.fillRect(m.x, top, m.w, m.dy);
    // A snowy top is white down to the snow line, the rock below.
    const snowy = snow ? Math.min(h, Math.max(2, Math.round(h - RELIEF_H * 0.55 * planetZoom))) : 0;
    if (snowy) {
      ctx.fillStyle = MOUNTAIN_SNOW[Math.min(2, tone + 1)];
      ctx.fillRect(m.x, top + m.dy, m.w, snowy);
    }
    ctx.fillStyle = sideColor;
    ctx.fillRect(m.x, top + m.dy + snowy, m.w, h - snowy);
  }

  // Mountains and volcanoes stand on the map as columns, drawn back to front. Critters stand among them at their
  // own size and move a little.
  // The marks and critter hit boxes are pooled objects, refilled each frame.
  const marks = [],
    markPool = [],
    hitPool = [];
  const byDepth = (a, b) => a.y - b.y;
  function addMark(x, y, img, size) {
    const m = (markPool[marks.length] ||= {});
    m.x = x;
    m.y = y;
    m.img = img;
    m.size = size;
    marks.push(m);
  }
  function drawLandmarks(now, dt) {
    marks.length = 0;
    for (const v of volcanoes) {
      v.cool = Math.max(0, v.cool - dt);
      v.at = project(Terrain.volcanoSpot(v.spot));
    }
    addRelief();
    const t = now / 1000;
    critterHits.length = 0;
    for (const c of Terrain.critters()) {
      const move = MOVES[c.sprite];
      for (const s of c.spots) {
        const at = project(s);
        if (!at) continue;
        const k = Math.sin(t * 2 + s.phase);
        const dx = move === 'swim' ? Math.round(k) : 0;
        const dy = move === 'fly' ? Math.round(k * 1.5) - 5 : move === 'hop' ? -Math.round(Math.max(0, k) * 2) : 0;
        const img = outlined(c.sprite),
          x = at.x + dx,
          y = at.y + dy;
        addMark(x, y, img, 1);
        const hit = (hitPool[critterHits.length] ||= {});
        hit.id = c.id;
        hit.x = x;
        hit.y = y;
        hit.w = img.width;
        hit.h = img.height;
        critterHits.push(hit);
      }
    }
    marks.sort(byDepth);
    for (const m of marks) {
      if (!m.img) {
        drawColumn(m, now);
        continue;
      }
      const c = m.img,
        w = c.width * m.size,
        h = c.height * m.size;
      ctx.drawImage(c, m.x - Math.floor(w / 2), m.y - h + m.size, w, h);
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
        const a = Math.PI + Math.random() * Math.PI,
          sp = 20 + Math.random() * 90;
        particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1.2,
          max: 1.2,
          size: k < 25 ? 2 : 1,
          color: k % 4 ? comet.colors[k % comet.colors.length] : '#fff3a0',
        });
      }
      if (comet.asteroid) {
        shakeT = 2;
        for (let k = 0; k < 120; k++) {
          const a = Math.PI + Math.random() * Math.PI,
            sp = 30 + Math.random() * 140;
          particles.push({
            x,
            y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            life: 2,
            max: 2,
            size: 2,
            color: k % 2 ? '#ff6a1a' : '#8a8478',
          });
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
    const n = comet.colors.length,
      ux = -comet.vx / speed,
      uy = -comet.vy / speed;
    const c = comet; // for the callback
    comet.colors.forEach((color, k) => {
      const off = (k - (n - 1) / 2) * 1.5;
      particles.push({
        x: c.x - uy * off,
        y: c.y + ux * off,
        vx: ux * 5 - uy * off * 1.5,
        vy: uy * 5 + ux * off * 1.5,
        life: 1.6,
        max: 1.6,
        size: c.crash ? 2 : 1,
        color,
      });
    });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(comet.x) - 1, Math.round(comet.y) - 1, 3, 3);
    ctx.fillStyle = '#bfe8ff';
    ctx.fillRect(Math.round(comet.x) - 2, Math.round(comet.y), 1, 1);
  }

  // Dead particles are dropped in place; ones born this frame (trails, bursts when a particle ends) join after.
  const born = [];
  function drawParticles(dt) {
    let n = 0;
    for (let k = 0; k < particles.length; k++) {
      const p = particles[k];
      p.life -= dt;
      if (p.life <= 0) {
        p.done?.(born);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.trail) born.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.15, max: 0.15, size: 1, color: '#ffe066' });
      ctx.globalAlpha = Math.max(0.15, Math.ceil((p.life / p.max) * 4) / 4);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      particles[n++] = p;
    }
    particles.length = n;
    for (const p of born) particles.push(p);
    born.length = 0;
    ctx.globalAlpha = 1;
    if (particles.length > 600) particles.splice(0, particles.length - 600);
  }

  /* ---------- opening movie ---------- */

  function disc(x, y, r) {
    for (let dy = -Math.ceil(r); dy <= r; dy++) {
      const w = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
      ctx.fillRect(Math.round(x - w), Math.round(y + dy), w * 2 + 1, 1);
    }
  }

  // The singularity: a dot that wobbles, swells and heats from red to white as the player taps.
  const PIXEL_FONT = getComputedStyle(document.documentElement).getPropertyValue('--pixel-font').trim() || 'monospace';
  // Before it, the word Singularity types out in the middle of the screen, waits, and is sucked into the middle,
  // letter by letter, until it is the dot. A tap before that starts the pull at once.
  const WORD = 'Singularity',
    TYPE_MS = 140, // per letter
    TYPE_AT = 300,
    SUCK_MS = 900;
  let suckAt = Infinity;
  const typedLetters = t => Math.max(0, Math.min(WORD.length, Math.floor((t - TYPE_AT) / TYPE_MS)));
  function drawWord(t) {
    if (t >= suckAt + SUCK_MS) return;
    const size = Math.max(6, Math.round(W / 14));
    ctx.save();
    ctx.font = `${size}px ${PIXEL_FONT}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const cw = ctx.measureText('M').width,
      x0 = W / 2 - (WORD.length * cw) / 2 + cw / 2,
      shown = typedLetters(t),
      pull = clamp01((t - suckAt) / SUCK_MS);
    for (let k = 0; k < shown; k++) {
      // Each letter is pulled in a little after the one before it from the outside in, faster as it goes.
      const order = Math.abs(k - (WORD.length - 1) / 2) / (WORD.length / 2),
        p = clamp01((pull - (1 - order) * 0.35) / 0.65) ** 2,
        x = lerp(x0 + k * cw, W / 2, p),
        s = 1 - p;
      if (s <= 0.05) continue;
      ctx.globalAlpha = 1;
      ctx.fillStyle = css(mix(hex('#ffe08a'), hex('#ff3a1a'), p));
      ctx.setTransform(s, 0, 0, s, x * (1 - s), (H / 2) * (1 - s));
      ctx.fillText(WORD[k], x, H / 2);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // The typewriter's cursor blinks after the last letter until the pull begins.
    if (pull <= 0 && Math.floor(t / 400) % 2 === 0) {
      ctx.fillStyle = '#ffe08a';
      ctx.fillText('_', x0 + shown * cw, H / 2);
    }
    ctx.restore();
  }

  function drawSingularity(now) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const t = now - cinemaAt;
    // The word is sucked in once typed and read, or at the first tap.
    if (suckAt === Infinity && (bangHeat > 0 || t > TYPE_AT + WORD.length * TYPE_MS + 1100)) suckAt = t;
    drawWord(t);
    // The dot appears as the last letters vanish into it, then each tap swells it.
    const fadeIn = clamp01((t - suckAt - SUCK_MS * 0.7) / 300);
    if (fadeIn <= 0) return;
    const h = bangHeat,
      shake = h * h * 3;
    const x = W / 2 + (Math.random() - 0.5) * shake * 2,
      y = H / 2 + (Math.random() - 0.5) * shake * 2;
    const r = 1.5 + h * 7 + Math.sin(now / 90) * h * 1.5;
    const hot = mix(hex('#ff3a1a'), [255, 255, 255], h);
    for (let k = 3; k >= 1; k--) {
      ctx.globalAlpha = (0.06 + (0.12 * h * (4 - k)) / 3) * fadeIn;
      ctx.fillStyle = css(mix(hex('#ff7a2a'), [255, 255, 255], h * 0.6));
      disc(x, y, r + k * (2 + 4 * h));
    }
    ctx.globalAlpha = fadeIn;
    ctx.fillStyle = css(hot);
    disc(x, y, r);
    ctx.globalAlpha = 1;
  }

  // After the bang: a flash that fades to black, and then the dark, where a star twinkles. Each tapped star stays
  // lit (lit), a small glow around it, until the sky lights up with the fifth.
  let lit = [],
    relitN = 0;
  function drawDark(now, dt) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    // Stars tapped before a reload come back, anywhere in the open sky, once the screen has a size.
    for (; relitN > 0; relitN--)
      lit.push({ x: Math.round(W * (0.15 + Math.random() * 0.7)), y: Math.round(H * (0.2 + Math.random() * 0.2)) });
    for (const s of lit) {
      ctx.globalAlpha = 0.35 + 0.1 * Math.sin(now / 400 + s.x);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(s.x - 1, s.y, 3, 1);
      ctx.fillRect(s.x, s.y - 1, 1, 3);
      ctx.globalAlpha = 1;
      ctx.fillRect(s.x, s.y, 1, 1);
    }
    if (flashT > 0) {
      ctx.globalAlpha = Math.min(1, flashT);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      // The bang names itself, in black on the white.
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.font = `${Math.max(8, Math.round(W / 11))}px ${PIXEL_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BIG BANG!', W / 2, H / 2);
      ctx.restore();
      ctx.globalAlpha = 1;
      flashT = Math.max(0, flashT - dt * 0.8);
    }
    drawSpots(now, dt);
  }

  // Every frame is in the colors discovered so far (Hues, in sprites.js). After Starlight the colors are shaded on
  // the way in (see syncHues); before it the finished frame is turned into silhouettes, at most 30 times a second.
  const SILHOUETTE_MS = 33;
  let silhouetteAt = -1e9,
    silhouetteDt = 0;
  function draw(now, dt) {
    if (!W) return;
    syncHues();
    if (!Hues.dark()) {
      drawFrame(now, dt);
      return;
    }
    silhouetteDt += dt;
    if (now - silhouetteAt < SILHOUETTE_MS) return;
    silhouetteAt = now;
    drawFrame(now, silhouetteDt);
    silhouetteDt = 0;
    const img = ctx.getImageData(0, 0, W, H);
    Hues.apply(img.data);
    ctx.putImageData(img, 0, 0);
  }

  // Clips drawing to the sky, so what sets there goes behind the planet. The caller restores the context.
  function clipToSky() {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(cx, cy + camY, R, 0, Math.PI * 2);
    ctx.clip('evenodd');
  }

  function drawFrame(now, dt) {
    starRiseT = Math.max(0, starRiseT - dt);
    if (cinema) {
      updateBodies(dt);
      if (cinema === 'pre') drawSingularity(now);
      else drawDark(now, dt);
      drawParticles(dt);
      return;
    }
    // The player's spin turns the planet much faster than its slow idle drift.
    landed = dayShown ? Math.min(1, landed + dt / 3) : 0;
    const turn = (1 / SPIN_SECONDS + spinLevel ** 2 * 0.5) * (1 - smooth(landed));
    spin = (spin + dt * turn) % 1;
    if (tiltDirty || zoomDirty) {
      if (zoomDirty) {
        R = R0 * planetZoom;
        cy = H / 2 + R;
        lastBg = -1e9;
      }
      tiltDirty = zoomDirty = false;
      mapPlanet();
    }
    // The stars sweep across the sky at the same pace as the sun and moon.
    if (dayShown && lastHour !== null) {
      const hours = (dayHour - lastHour + 24) % 24,
        perHour = (layout.colRight - layout.colLeft) / 12;
      skyAngle = (skyAngle + ((hours * perHour) / skyRadius()) * smooth(landed)) % (Math.PI * 2);
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
    clipToSky();
    if (moonUp() || moon.fling > 0) drawMoon();
    ctx.restore();
    drawClouds(now, dt);
    if (sunVisible()) {
      // In front of clouds so it stays tappable.
      clipToSky();
      drawSun(now, dt);
      drawSunspots(dt);
      drawEclipse(dt);
      ctx.restore();
    }
    drawTide(dt);
    drawMeteors(dt);
    drawRainbow(dt);
    drawBolts(dt);
    drawWaves(now);
    drawLandmarks(now, dt);
    drawSpots(now, dt);
    drawHurricanes(now, dt);
    drawComet(dt);
    drawParticles(dt);
    // An earthquake shakes the whole picture; the style is only written while it shakes and once when it stops.
    const wasShaking = shakeT > 0;
    shakeT = Math.max(0, shakeT - dt);
    if (shakeT > 0)
      canvas.style.transform = `translate(${Math.round((Math.random() - 0.5) * 8)}px, ${Math.round((Math.random() - 0.5) * 6)}px)`;
    else if (wasShaking) canvas.style.transform = '';
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
    const age = rainbow.max - rainbow.t,
      fade = Math.min(1, age / 2, rainbow.t / 2) * 0.75;
    ctx.save();
    ctx.globalAlpha = fade;
    const bow = rainbow; // for the callback
    // The bow stands on the land in front of the horizon: its feet sit on the planet's face, below the horizon,
    // so it is seen standing on the ground rather than behind it.
    bow.base = Math.round(groundY(bow.x) + bow.r * 0.55);
    RAINBOW.forEach((color, k) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(bow.x, bow.base, bow.r - k * 1.2, Math.PI, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();
  }

  // Auroras: green and purple curtains waving high in the night sky during a solar storm. Painted pixel by pixel
  // into one image, which is laid over the sky in a single draw.
  const AURORA = ['#6aff9a', '#c07aff'].map(hex);
  const auroraCanvas = document.createElement('canvas');
  /** @type {ImageData | null} */
  let auroraImage = null;
  /** @type {Uint32Array | null} */
  let auroraPixels = null;
  function drawAurora(now, dt, night) {
    auroraT = Math.max(0, auroraT - dt);
    if (auroraT <= 0 || night < 0.2) return;
    const fade = Math.min(1, auroraT / 3) * night;
    const y0 = Math.max(0, Math.floor(H * 0.1) - 1),
      h = Math.min(H - y0, Math.ceil(H * 0.16) + 3);
    if (!auroraImage || auroraImage.width !== W || auroraImage.height !== h) {
      auroraCanvas.width = W;
      auroraCanvas.height = h;
      auroraImage = context2d(auroraCanvas).createImageData(W, h);
      auroraPixels = new Uint32Array(auroraImage.data.buffer);
    }
    const pixels = /** @type {Uint32Array} */ (auroraPixels); // made with auroraImage
    pixels.fill(0);
    const [green, purple] = AURORA.map(c => shadePacked(pack(c)) & 0xffffff);
    for (let x = 0; x < W; x++) {
      const top = Math.round(H * 0.13 + Math.sin(x * 0.05 + now / 900) * H * 0.025);
      const len = Math.round(H * 0.07 + Math.sin(x * 0.13 + now / 600) * H * 0.03);
      for (let y = Math.max(top, y0); y < Math.min(top + len, y0 + h); y++) {
        if (!inSky(x, y)) continue;
        const a = Math.round(255 * fade * 0.5 * (1 - (y - top) / len));
        pixels[(y - y0) * W + x] = ((a << 24) | ((x + y) % 9 < 6 ? green : purple)) >>> 0;
      }
    }
    context2d(auroraCanvas).putImageData(auroraImage, 0, 0);
    ctx.drawImage(auroraCanvas, 0, y0);
  }

  // A hurricane: a white spiral turning over the sea, drifting onto the coast where it makes landfall.
  function drawHurricanes(now, dt) {
    hurricanes = hurricanes.filter(h => (h.t -= dt) > 0);
    for (const h of hurricanes) {
      const k = 1 - h.t / h.max,
        x = h.x0 + (h.x1 - h.x0) * Math.min(1, k * 1.4),
        y = h.y0 + (h.y1 - h.y0) * Math.min(1, k * 1.4);
      ctx.globalAlpha = Math.min(1, h.t / 1.5) * 0.9;
      ctx.fillStyle = '#ffffff';
      for (let arm = 0; arm < 3; arm++) {
        for (let s = 0; s < 22; s++) {
          const a = arm * 2.09 + s * 0.28 - now / 300,
            r = s * 0.6;
          ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.6), 2, 1);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- minigames ---------- */
  // Things that invite a touch and open a story (game.js decides when each shows, see MINIGAMES there).
  // Spots sit on the planet's surface (texture u, v) so they turn with it:
  //   crack  glowing lava crack on land, where the next volcano will stand: one tap raises its cone
  //   seed   green sparkle on land: one tap sprouts it
  //   ice    crack in the ice on the sea: it takes ICE_TAPS taps, growing with each
  //   plates two plate edges on land: drag one into the other
  // Sunspots drift over the sun's face: tap them before they flare. The moon can be dragged across the sky,
  // pulling a bulge of sea along under it.
  const ICE_TAPS = 4;
  const SPOT_LIFE = {
    twinkle: 2.2,
    crack: 10,
    seed: 15,
    ice: 20,
    plates: 30,
    flower: 12,
    meteorite: 15,
    plankton: 12,
    gem: 15,
    treasure: 20,
  };
  const PETALS = ['#ff5a4a', '#7a8aff', '#fff0a0', '#f0f0ff', '#ffb43a'];
  let meteorT = 0;
  /** @type {{ x: number, y: number } | null} */
  let meteorRadiant = null;
  let streaks = [];
  let spots = [],
    sunspots = [],
    moonPlay = false;
  /** @type {{ x0: number, x: number, y: number, far: number, won: boolean } | null} */
  let moonDrag = null;
  /** @type {{ spot: any, x: number, y: number } | null} */
  let plateDrag = null;
  let onPlay = (..._) => {},
    heatView = false;

  // A texture spot of the wanted kind of ground ('ground' or 'ocean') somewhere in view, or null.
  function findTexel(want) {
    for (let k = 0; k < 60; k++) {
      const x = Math.floor(W * (0.15 + Math.random() * 0.7)),
        y = Math.floor(H * (0.6 + Math.random() * 0.35));
      if (zoneAt(x, y) !== want) continue;
      const i = Math.floor(y - camY) * W + x;
      return { u: texU(i), v: pixV[i] };
    }
    return null;
  }

  // A point of open sea on the planet's face in view (not ice), for the sun's ray to warm; null when none shows.
  function openWaterPoint() {
    for (let k = 0; k < 40; k++) {
      const x = Math.floor(Math.random() * W),
        iy = Math.floor(Math.random() * H),
        i = iy * W + x;
      if (!(pixU[i] >= 0) || Math.hypot(x - cx, iy - cy) > R * 0.9) continue;
      const c = cover[pixV[i] * TEX_W + texU(i)];
      if (c === COVER.DEEP || c === COVER.SHALLOW) return { x, y: iy + camY };
    }
    return null;
  }

  // Where a lava crack glows: a spot of dry ground anywhere on the planet's face, clear of the cones that stand and the
  // cracks that glow, and of those the one farthest from them, so the volcanoes spread over the globe. Null once
  // all the cones stand, or when no such spot is in view. The spot of a tapped crack is where its cone rises
  // (pendingCone, see setVolcanoes).
  /** @type {{ u: number, v: number } | null} */
  let pendingCone = null;
  // The screen corner the book buttons cover, in CSS pixels (see .book-btn and its row in style.css).
  const UI_RIGHT_CSS = 100,
    UI_BOTTOM_CSS = 350;
  // Covers a crack cannot glow through: water, ice and the basins the sea has filled. A dry basin is ground.
  const WET = new Set([
    COVER.DEEP,
    COVER.SHALLOW,
    COVER.REEF,
    COVER.BLEACHED,
    COVER.SEA_ICE,
    COVER.LAND_ICE,
    COVER.RIVER,
    COVER.LAKE,
    COVER.FLOOD,
    COVER.RED_TIDE,
  ]);
  function nextVolcanoSpot() {
    if (volcanoes.length >= Terrain.VOLCANO_COUNT) return null;
    const taken = [
      ...volcanoes.map(v => Terrain.volcanoSpot(v.spot)),
      ...spots.filter(o => o.kind === 'crack').map(o => o.at),
    ];
    const room = at => Math.min(Infinity, ...taken.map(t => Terrain.texDist(t, at)));
    for (let gap = Terrain.VOLCANO_GAP; gap > 2; gap *= 0.7) {
      /** @type {{ u: number, v: number } | null} */
      let best = null;
      let bestRoom = -1;
      for (let k = 0; k < 60; k++) {
        // Anywhere on the face in view, short of the horizon where the ground is seen edge-on, and clear of the
        // column of buttons at the bottom right.
        const x = Math.floor(Math.random() * W),
          iy = Math.floor(Math.random() * H),
          y = iy + camY;
        if ((W - x) * P < UI_RIGHT_CSS && (H - y) * P < UI_BOTTOM_CSS) continue;
        if (Math.hypot(x - cx, iy - cy) > R * 0.9) continue;
        const i = iy * W + x;
        if (!(pixU[i] >= 0) || WET.has(cover[pixV[i] * TEX_W + texU(i)])) continue;
        const at = { u: texU(i), v: pixV[i] },
          r = room(at);
        if (r >= gap && r > bestRoom) {
          best = at;
          bestRoom = r;
        }
      }
      if (best) return best;
    }
    return null;
  }

  function spawnSpot(kind) {
    let at, to;
    // A star that twinkles alone in the dark sky (A cow on the road), before the stars are known. It sits in open
    // sky, below the date and temperature and clear of the planet.
    if (kind === 'twinkle') {
      for (let k = 0; k < 30; k++) {
        const x = Math.round(W * (0.15 + Math.random() * 0.7)),
          y = Math.round(H * (0.2 + Math.random() * 0.2)),
          i = (y - camY) * W + x;
        if ((i >= 0 && i < W * H && pixU[i] >= 0) || Math.hypot(x - sun.x, y - sun.y) < sun.r + 16) continue;
        spots.push({ kind, sky: { x, y }, t: SPOT_LIFE.twinkle, max: SPOT_LIFE.twinkle, taps: 0, off: { x: 0, y: 0 } });
        return true;
      }
      return false;
    }
    if (kind === 'ice' || kind === 'plankton') at = findTexel('ocean');
    else if (kind === 'crack') at = nextVolcanoSpot();
    else at = findTexel('ground');
    if (!at) return false;
    if (kind === 'plates') to = { u: (at.u + 9) % TEX_W, v: at.v };
    spots.push({ kind, at, to, t: SPOT_LIFE[kind], max: SPOT_LIFE[kind], taps: 0, off: { x: 0, y: 0 } });
    return true;
  }

  function burst(x, y, color, n = 10, speed = 25) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2,
        v = speed * (0.5 + Math.random() * 0.5);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10, life: 0.6, max: 0.6, size: 1, color });
    }
  }

  // A jagged line of pixels, the same each frame for the same seed.
  function jag(x, y, len, seed, color) {
    const px = x - len / 2;
    let py = y,
      r = seed;
    ctx.fillStyle = color;
    for (let k = 0; k < len; k++) {
      r = (r * 9301 + 49297) % 233280;
      py += (r % 3) - 1;
      py = Math.max(y - 2, Math.min(y + 2, py));
      ctx.fillRect(Math.round(px + k), Math.round(py), 1, 1);
    }
  }

  // A lava crack: a dark fissure three pixels wide that wanders across the ground, with two short branches, a
  // glowing core and white heat in the middle. The same shape each frame for the same seed.
  function crack(x, y, len, seed) {
    let r = seed,
      dy = 0;
    const pts = [];
    for (let k = 0; k < len; k++) {
      r = (r * 9301 + 49297) % 233280;
      dy = Math.max(-3, Math.min(3, dy + (r % 3) - 1));
      pts.push([Math.round(x - len / 2 + k), Math.round(y + dy)]);
    }
    const b1 = pts[Math.floor(len / 3)],
      b2 = pts[Math.floor((len * 2) / 3)];
    ctx.fillStyle = '#2a1008';
    for (const [px, py] of pts) ctx.fillRect(px, py - 1, 1, 3);
    for (let k = 1; k <= 4; k++) {
      ctx.fillRect(b1[0] - k, b1[1] - k - 1, 2, 2);
      ctx.fillRect(b2[0] + k - 1, b2[1] + k, 2, 2);
    }
    ctx.fillStyle = '#ff8a1a';
    for (const [px, py] of pts) ctx.fillRect(px, py, 1, 1);
    for (let k = 1; k <= 3; k++) {
      ctx.fillRect(b1[0] - k, b1[1] - k, 1, 1);
      ctx.fillRect(b2[0] + k, b2[1] + k, 1, 1);
    }
    ctx.fillStyle = '#fff0a0';
    for (let k = Math.floor(len / 3); k < Math.floor((len * 2) / 3); k++) ctx.fillRect(pts[k][0], pts[k][1], 1, 1);
  }

  // The ring that marks a minigame spot, by its kind.
  const RING_COLOR = {
    crack: '#ffd23f',
    seed: '#d8ffd0',
    ice: '#ffffff',
    plates: '#ffd23f',
    flower: '#fff0a0',
    meteorite: '#ffffff',
    plankton: '#5ad8ff',
    gem: '#ff6ab0',
    treasure: '#e8f4ff',
  };
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
            const ang = (a * Math.PI) / 6 + now / 900;
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
      if (o.kind === 'twinkle') {
        // One pixel, like every other star: it fades in to white and back out, then shows up somewhere else.
        // The tap area around it stays large.
        ctx.globalAlpha = Math.sin((Math.PI * (o.max - o.t)) / o.max);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(at.x, at.y, 1, 1);
        continue;
      }
      ctx.fillStyle = RING_COLOR[o.kind];
      for (let k = 0; k < 4; k++) {
        const a = now / 400 + (k * Math.PI) / 2,
          r = 7 + Math.sin(now / 250 + k) * 1.5;
        ctx.fillRect(Math.round(at.x + Math.cos(a) * r), Math.round(at.y - 1 + Math.sin(a) * r * 0.7), 1, 1);
      }
      if (o.kind === 'crack') {
        crack(at.x, at.y, 19, seed);
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
      } else if (o.kind === 'gem' || o.kind === 'treasure') {
        // A crystal glinting in the opened ground (gem) or in fresh dark rock (treasure).
        ctx.fillStyle = o.kind === 'gem' ? '#3a1a10' : '#2a2430';
        ctx.fillRect(at.x - 3, at.y, 7, 2);
        ctx.fillStyle = o.kind === 'gem' ? '#ff6ab0' : '#c8e8ff';
        ctx.fillRect(at.x - 1, at.y - 2, 3, 3);
        ctx.fillRect(at.x, at.y - 3, 1, 5);
        if (Math.floor(now / 250) % 3 === 0) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(at.x + 1, at.y - 3, 1, 1);
        }
      } else if (o.kind === 'meteorite') {
        ctx.fillStyle = '#2a2420';
        ctx.fillRect(at.x - 2, at.y - 1, 4, 3);
        ctx.fillStyle = '#5a5048';
        ctx.fillRect(at.x - 1, at.y - 1, 2, 1);
        if (Math.floor(now / 200) % 3 === 0) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(at.x + 1, at.y - 2, 1, 1);
        }
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
  }

  // The moon's dark disc crossing the sun, with the pale corona showing round it at totality.
  function drawEclipse(dt) {
    if (eclipseT <= 0) return;
    eclipseT = Math.max(0, eclipseT - dt);
    const k = 1 - eclipseT / eclipseMax,
      x = sun.x + (k * 2 - 1) * sun.r * 2.2,
      r = sun.r * 1.02;
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
      const x = Math.round(sun.x + o.dx * sun.r),
        y = Math.round(sun.y + o.dy * sun.r),
        r = o.t < 2 && Math.floor(o.t * 6) % 2 ? 2 : 1;
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
      const a = Math.random() * Math.PI * 2,
        d = 8 + Math.random() * 20;
      const radiant = /** @type {{ x: number, y: number }} */ (meteorRadiant); // set with meteorT
      streaks.push({
        x: radiant.x + Math.cos(a) * d,
        y: radiant.y + Math.sin(a) * d,
        vx: Math.cos(a) * 90,
        vy: Math.sin(a) * 90,
        t: 0.5,
      });
    }
    streaks = streaks.filter(m => (m.t -= dt) > 0);
    for (const m of streaks) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      for (let k = 0; k < 5; k++) {
        const x = Math.round(m.x - m.vx * k * 0.012),
          y = Math.round(m.y - m.vy * k * 0.012);
        if (!inSky(x, y)) continue;
        ctx.globalAlpha = (1 - k / 5) * Math.min(1, m.t * 3);
        ctx.fillStyle = k ? '#c8c8e0' : '#ffffff';
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Waves (once researched): white crests come and go on the open sea, turning with the planet.
  const waveSpots = [];
  let waveLevel = 0,
    waveGlow = false;
  function drawWaves(now) {
    if (waveLevel <= 0) return;
    if (!waveSpots.length) {
      for (let k = 0; k < 2000 && waveSpots.length < 260; k++) {
        const u = Math.floor(Math.random() * TEX_W),
          v = Math.floor(TEX_H * (0.15 + Math.random() * 0.7));
        if (elev[v * TEX_W + u] < Terrain.sea())
          waveSpots.push({ u, v, phase: Math.random() * Math.PI * 2, speed: 0.8 + Math.random() });
      }
    }
    // On a glowing night the crests shine electric blue: bioluminescent plankton flashing as the waves break.
    const glow = waveGlow && daylight() < 0.5;
    ctx.fillStyle = glow ? '#5ad8ff' : '#e8f4ff';
    for (const w of waveSpots) {
      const c = cover[w.v * TEX_W + w.u];
      if (c !== COVER.DEEP && c !== COVER.SHALLOW) continue; // not under ice or new land
      const k = Math.sin((now / 700) * w.speed + w.phase);
      if (k < 0.2) continue;
      const at = project(w);
      if (!at) continue;
      ctx.globalAlpha = Math.min(1, ((k - 0.2) / 0.8) * waveLevel * (glow ? 1.6 : 1));
      const len = k > 0.8 ? 3 : 2,
        dx = Math.round(Math.sin(now / 1500 + w.phase) * 1.5);
      ctx.fillRect(at.x + dx - 1, at.y, len, 1);
      if (k > 0.9) ctx.fillRect(at.x + dx, at.y - 1, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // The sea bulges under the dragged moon: the tide follows it. When the drag wins, the bulge lets go as a wave
  // that rolls along the horizon the way the moon went (tideWave), with a white crest.
  /** @type {{ x: number, dir: number, t: number } | null} */
  let tideWave = null;
  const TIDE_WAVE_S = 1.6;
  function bulge(mx, half, hmax, color, crest) {
    for (let x = Math.max(0, Math.round(mx - half)); x < Math.min(W, mx + half); x++) {
      const h = Math.round(hmax * Math.cos((((x - mx) / half) * Math.PI) / 2) ** 2),
        gy = Math.round(groundY(x));
      if (h <= 0) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, gy - h, 1, h);
      if (crest && h >= hmax - 1) {
        ctx.fillStyle = crest;
        ctx.fillRect(x, gy - h, 1, 1);
      }
    }
  }
  function drawTide(dt) {
    if (moonDrag) bulge(moon.cur.x, 26, 3, '#7ac8ff', null);
    if (!tideWave) return;
    tideWave.t += dt;
    const k = tideWave.t / TIDE_WAVE_S;
    if (k >= 1) {
      tideWave = null;
      return;
    }
    const mx = tideWave.x + tideWave.dir * k * (W + 60),
      hmax = 4 * Math.sin(Math.min(1, k * 3) * Math.PI * 0.5);
    bulge(mx, 22, hmax, '#5aa8f0', '#f4f8ff');
  }

  /* ---------- input ---------- */

  // One pointer at a time owns a gesture (a planet drag, a plate or moon drag); other fingers are
  // ignored until it lets go, so a second touch can't take the gesture over or finish it somewhere else.
  /** @type {number | null} */
  let gesturePointer = null;
  const inGesture = () => drag || plateDrag || moonDrag;
  function own(e) {
    gesturePointer = e.pointerId;
    canvas.setPointerCapture?.(e.pointerId);
  }
  const otherPointer = e => inGesture() && e.pointerId !== gesturePointer;
  // A primary pointer going down means no other finger is down (or it is the mouse): a gesture still held by
  // another pointer lost its pointerup somewhere, so it ends.
  const dropStale = e => {
    if (e.isPrimary && inGesture() && e.pointerId !== gesturePointer) endPlay();
  };

  // How far the player can tip the view: until the ground in the lower middle of the screen (where the eye rests)
  // is either pole, so both poles can be looked at straight on and north stays up.
  function clampTilt(t, r = R, c = cy) {
    const centre = Math.asin(Math.max(-1, Math.min(1, (c - H * 0.75) / r)));
    return Math.max(centre - Math.PI / 2 + 0.02, Math.min(centre + Math.PI / 2 - 0.02, t));
  }

  // Zoom: two fingers pinch the planet bigger or smaller, the mouse wheel does the same. A pinch takes over from
  // a planet drag; the fingers it used are ignored until they lift.
  const ZOOM_RANGE = [1, 2];
  // Zoom to z, keeping the ground at screen height fy (canvas pixels) where it is, by tilting the view to match.
  const setZoom = (z, fy = H * 0.75) => {
    z = Math.max(ZOOM_RANGE[0], Math.min(ZOOM_RANGE[1], z));
    if (Math.abs(z - planetZoom) < 0.001) return;
    const R1 = R0 * z,
      cy1 = H / 2 + R1,
      before = (cy - fy) / R,
      after = (cy1 - fy) / R1;
    if (Math.abs(before) < 1 && Math.abs(after) < 1) {
      const tilt = viewTilt + Math.asin(after) - Math.asin(before);
      viewTilt = clampTilt(tilt, R1, cy1);
    }
    planetZoom = z;
    R = R1;
    cy = cy1;
    zoomDirty = true;
  };
  /** @type {Map<number, {x: number, y: number}>} */
  const fingers = new Map(),
    pinchUsed = new Set();
  /** @type {{d0: number, z0: number} | null} */
  let pinch = null;
  const fingerGap = () => {
    const [a, b] = [...fingers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const canZoom = () => dayShown && !cinema && !plateDrag && !moonDrag;
  canvas.addEventListener(
    'pointerdown',
    e => {
      if (e.pointerType === 'mouse') return;
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fingers.size === 2 && canZoom()) {
        pinch = { d0: Math.max(10, fingerGap()), z0: planetZoom };
        for (const id of fingers.keys()) pinchUsed.add(id);
        drag = null;
        gesturePointer = null;
      }
      if (pinchUsed.has(e.pointerId)) e.stopImmediatePropagation();
    },
    true,
  );
  canvas.addEventListener(
    'pointermove',
    e => {
      if (!fingers.has(e.pointerId)) return;
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && fingers.size >= 2) {
        const [a, b] = [...fingers.values()];
        setZoom((pinch.z0 * fingerGap()) / pinch.d0, (a.y + b.y) / 2 / P);
      }
      if (pinchUsed.has(e.pointerId)) e.stopImmediatePropagation();
    },
    true,
  );
  const fingerUp = e => {
    fingers.delete(e.pointerId);
    if (fingers.size < 2) pinch = null;
    if (pinchUsed.delete(e.pointerId)) e.stopImmediatePropagation();
  };
  canvas.addEventListener('pointerup', fingerUp, true);
  canvas.addEventListener('pointercancel', fingerUp, true);
  canvas.addEventListener(
    'wheel',
    e => {
      if (!canZoom()) return;
      e.preventDefault();
      setZoom(planetZoom * Math.exp(-e.deltaY * 0.0015), e.clientY / P);
    },
    { passive: false },
  );

  canvas.addEventListener('pointerdown', e => {
    const x = e.clientX / P,
      y = e.clientY / P;
    // Before the bang the whole screen is the singularity. In the dark after it, only the lone star can be tapped.
    if (cinema === 'pre') {
      e.preventDefault();
      onBangFn(e.clientX, e.clientY);
      return;
    }
    dropStale(e);
    if (otherPointer(e)) return;
    // Minigame spots on the planet: the nearest one in reach wins.
    const spot = spots
      .filter(
        o =>
          o.screen && Math.hypot(x - o.screen.x - o.off.x, y - o.screen.y - o.off.y) <= (o.kind === 'twinkle' ? 14 : 8),
      )
      .sort((a, b) => Math.hypot(x - a.screen.x, y - a.screen.y) - Math.hypot(x - b.screen.x, y - b.screen.y))[0];
    if (spot) {
      e.preventDefault();
      const { x: sx, y: sy } = spot.screen;
      if (spot.kind === 'plates') {
        plateDrag = { spot, x, y };
        own(e);
      } else if (spot.kind === 'ice' && ++spot.taps < ICE_TAPS) {
        burst(sx, sy, '#ffffff', 4, 15);
      } else {
        spots.splice(spots.indexOf(spot), 1);
        if (spot.kind === 'twinkle') lit.push({ x: sx, y: sy });
        burst(
          sx,
          sy,
          {
            twinkle: '#ffffff',
            crack: '#ff8a1a',
            seed: '#7af0a0',
            ice: '#8ad8ff',
            band: '#ffffff',
            flower: '#fff0a0',
            meteorite: '#c8c0b0',
            plankton: '#5ad8ff',
            gem: '#ff6ab0',
            treasure: '#e8f4ff',
          }[spot.kind],
          14,
          30,
        );
        if (spot.kind === 'crack') pendingCone = spot.at;
        onPlay(spot.kind, e.clientX, e.clientY, spot.band);
      }
      return;
    }
    if (cinema) return;
    if (comet && !comet.crash && Math.hypot(x - comet.x, y - comet.y) < 12) {
      e.preventDefault();
      const tx = Math.max(W * 0.15, Math.min(W * 0.85, comet.x + W * 0.2)),
        ty = Math.min(groundY(tx), H - 4),
        time = 0.7;
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
        const a = Math.PI + Math.random() * Math.PI,
          d = rainbow.r - Math.random() * 7;
        particles.push({
          x: rainbow.x + Math.cos(a) * d,
          y: rainbow.base + Math.sin(a) * d,
          vx: 0,
          vy: -15,
          life: 0.6,
          max: 0.6,
          size: 1,
          color: RAINBOW[k % 6],
        });
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
        own(e);
      }
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * Math.PI * 2;
        particles.push({
          x: moon.cur.x,
          y: moon.cur.y,
          vx: Math.cos(a) * 20,
          vy: Math.sin(a) * 20,
          life: 0.4,
          max: 0.4,
          size: 1,
          color: '#e8e8f8',
        });
      }
      onMoon(e.clientX, e.clientY);
      return;
    }
    const vi = volcanoes.findIndex(
      v =>
        v.at &&
        Math.abs(x - v.at.x) <= 14 * planetZoom &&
        y <= v.at.y + 3 &&
        y >= v.at.y - (VOLCANO_H + 3) * planetZoom,
    );
    if (vi >= 0) {
      e.preventDefault();
      if (volcanoes[vi].cool <= 0) onVolcanoFn(vi, e.clientX, e.clientY);
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
      } else if (precip(hit) === 'snow') {
        onCloud('snow', null, e.clientX, e.clientY, { temp: cloudTemp(hit) });
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
      own(e);
      return;
    }
    zoneTap(zone, x, y);
  });

  function zoneTap(zone, x, y) {
    onZone(zone, x * P, y * P);
    const color = { atmosphere: '#a8dcff', ocean: '#3a8ad8', ground: '#c8a070' }[zone];
    for (let k = 0; color && k < 8; k++) {
      const a = (k * Math.PI) / 4;
      particles.push({ x, y, vx: Math.cos(a) * 18, vy: Math.sin(a) * 18, life: 0.3, max: 0.3, size: 1, color });
    }
  }

  canvas.addEventListener('pointermove', e => {
    if (otherPointer(e)) return;
    const px = e.clientX / P,
      py = e.clientY / P;
    if (moonDrag) {
      moonDrag.far = Math.max(moonDrag.far, Math.abs(px - moonDrag.x0));
      moonDrag.x = Math.max(4, Math.min(W - 4, px));
      if (!moonDrag.won && moonDrag.far > W * 0.4) {
        moonDrag.won = true;
        // The pulled sea lets go: a wave rolls across the planet the way the moon went.
        tideWave = { x: moonDrag.x0, dir: Math.sign(moonDrag.x - moonDrag.x0) || 1, t: 0 };
        onPlay('moon', e.clientX, e.clientY);
      }
      return;
    }
    if (plateDrag) {
      const o = plateDrag.spot;
      // The spot ran out while it was held.
      if (!spots.includes(o)) {
        plateDrag = null;
        return;
      }
      o.off = { x: px - plateDrag.x, y: py - plateDrag.y };
      if (
        o.screen &&
        o.toScreen &&
        Math.hypot(o.screen.x + o.off.x - o.toScreen.x, o.screen.y + o.off.y - o.toScreen.y) < 5
      ) {
        spots.splice(spots.indexOf(o), 1);
        burst(o.toScreen.x, o.toScreen.y, '#c8a070', 18, 30);
        shakeT = 1;
        plateDrag = null;
        onPlay('plates', e.clientX, e.clientY);
      }
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved <= 8) return;
    if (dayShown) {
      // Once the planet holds still, dragging turns it to look at it from other sides and angles.
      spin = (spin - (dx / window.innerWidth) * 0.5 + 1) % 1;
      const tilt = clampTilt(viewTilt - (dy / window.innerHeight) * 2);
      if (tilt !== viewTilt) {
        viewTilt = tilt;
        tiltDirty = true;
      }
      lastBg = -1e9;
      return;
    }
    onSpinFn(Math.abs(dx) / window.innerWidth);
    if (Math.random() < 0.5) {
      particles.push({
        x: e.clientX / P,
        y: e.clientY / P,
        vx: Math.sign(dx) * 40,
        vy: 0,
        life: 0.3,
        max: 0.3,
        size: 1,
        color: '#e8eef8',
      });
    }
  });
  // A gesture ends; a dragged plate edge that missed goes back.
  function endPlay() {
    if (plateDrag) {
      plateDrag.spot.off = { x: 0, y: 0 };
      plateDrag = null;
    }
    moonDrag = null;
    drag = null;
    gesturePointer = null;
  }
  canvas.addEventListener('pointerup', e => {
    if (otherPointer(e)) return;
    if (drag && drag.moved <= 8) zoneTap(drag.zone, drag.px, drag.py);
    endPlay();
  });
  canvas.addEventListener('pointercancel', e => {
    if (!otherPointer(e)) endPlay();
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  // Resizing comes in bursts (rotating a phone, dragging a window edge): lay out once it settles.
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });

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
    setGlowPulse(k) {
      const step = Math.round(k * 8) / 8;
      if (step === glowPulse) return;
      glowPulse = step;
      if (cinema || climate === null || Terrain.features().heat <= 0) return;
      paintTexture(climate);
      lastBg = -1e9;
    },
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
    // The map texel under a screen point in CSS pixels, or null off the planet (a tap on the ground, tests).
    // A mountain or volcano column drawn over the point wins over the ground behind it, the front one first.
    texelAt(cssX, cssY) {
      const x = Math.floor(cssX / P),
        y = Math.floor(cssY / P) - camY,
        i = y * W + x;
      for (let k = marks.length - 1; k >= 0; k--) {
        const m = marks[k];
        if (!m.col || m.img) continue;
        const top = m.y - Math.round(m.col.h * planetZoom);
        if (x >= m.x && x < m.x + m.w && y + camY >= top && y + camY < m.y + m.dy) return { u: m.col.u, v: m.col.v };
      }
      return x >= 0 && x < W && y >= 0 && y < H && pixU[i] >= 0 ? { u: texU(i), v: pixV[i] } : null;
    },
    // For the tile view (tiles.js): the screen pixel size, a cover's color as the map paints it (packed like
    // ImageData, times a shade factor), the mountain or volcano column on a texel (or null), and the colors
    // those columns are drawn in.
    pixelSize: () => P,
    coverColor: (c, f = 1) => pack(coverRgb[c] || ROCK, f * coverLight),
    reliefAt: i => reliefOf.get(i) || null,
    reliefColors: () => ({
      rock: MOUNTAIN_ROCK,
      snow: MOUNTAIN_SNOW,
      river: MOUNTAIN_RIVER,
      lava: LAVA_FLOW,
      crater: CRATER,
      snowy: Terrain.features().snow,
      light: coverLight,
    }),
    // How far each volcano's last eruption has gone (0 when ready to erupt, else up to 1 as it cools), by spot.
    eruption: spot => eruptionAt.get(spot) || 0,
    // Repaint the map, for changes the climate does not drive (wildfires).
    repaint() {
      if (climate !== null) updateTexture(climate);
    },
    // Lightning from a random storm cloud, for automatic storms.
    autoStrike() {
      const storm = visibleClouds().find(v => v.storm);
      return storm ? strike(storm) : null;
    },
    // Two hydrogen nuclei collide inside the sun and flash into helium.
    fusion() {
      if (particles.length > 500) return;
      const a = Math.random() * Math.PI * 2,
        d = sun.r * (0.3 + Math.random() * 0.4);
      const mx = sun.x + Math.cos(a) * d * 0.5,
        my = sun.y + Math.sin(a) * d * 0.5,
        time = 0.25;
      for (const side of [-1, 1]) {
        const sx = mx + side * 5 * Math.cos(a + 1.3),
          sy = my + side * 5 * Math.sin(a + 1.3);
        particles.push({
          x: sx - 1,
          y: sy - 1,
          vx: (mx - sx) / time,
          vy: (my - sy) / time,
          life: time,
          max: time,
          size: 2,
          color: side < 0 ? '#ff5a3a' : '#ffffff',
          done:
            side < 0
              ? out => {
                  // Helium: a brighter dot, and a few sparks of released energy.
                  out.push({ x: mx - 1, y: my - 1, vx: 0, vy: 0, life: 0.4, max: 0.4, size: 3, color: '#ffffff' });
                  for (let k = 0; k < 4; k++) {
                    const b = Math.random() * Math.PI * 2;
                    out.push({
                      x: mx,
                      y: my,
                      vx: Math.cos(b) * 25,
                      vy: Math.sin(b) * 25,
                      life: 0.3,
                      max: 0.3,
                      size: 1,
                      color: '#fff3a0',
                    });
                  }
                }
              : null,
        });
      }
    },
    // A ray from the lit sun. It aims at open water in view when there is any (the shine game: the water it warms
    // steams, and Evaporation is known), else at a point on the horizon.
    // `steam` is how many rays have warmed the sea before: each one steams more, until the first cloud.
    ray(steam = 0) {
      const sea = openWaterPoint(),
        tx = sea ? sea.x : cx + (Math.random() - 0.5) * R * 0.9,
        ty = sea ? sea.y : groundY(tx),
        time = 0.35;
      particles.push({
        x: sun.x,
        y: sun.y,
        vx: (tx - sun.x) / time,
        vy: (ty - sun.y) / time,
        life: time,
        max: time,
        size: 2,
        color: '#fff3a0',
        trail: true,
        done: out => {
          for (let k = 0; k < (sea ? 8 + 3 * steam : 5); k++) {
            out.push({
              x: tx + (sea ? (Math.random() - 0.5) * (6 + 2 * steam) : 0),
              y: ty - 1,
              vx: (Math.random() - 0.5) * (sea ? 8 : 30),
              vy: sea ? -8 - 4 * steam - Math.random() * 10 : -Math.random() * 25,
              life: sea ? 0.9 + 0.25 * steam : 0.4,
              max: sea ? 0.9 + 0.25 * steam : 0.4,
              size: sea ? 2 : 1,
              color: sea ? '#f4f8ff' : '#ffb02e',
            });
          }
          if (sea) onPlay('ray', tx * P, ty * P);
        },
      });
    },
    // The first cloud plops out of the gathered steam: a puff of white that swells and drifts up.
    plopCloud(cssX, cssY) {
      const x = cssX / P,
        y = cssY / P - 10;
      for (let k = 0; k < 18; k++) {
        const a = Math.random() * Math.PI * 2,
          v = 6 + Math.random() * 14;
        particles.push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v * 0.5 - 12,
          life: 1.1,
          max: 1.1,
          size: 2,
          color: k % 3 ? '#ffffff' : CLOUD_SHADE,
        });
      }
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
      meteorRadiant = {
        x: Math.round(W * (0.25 + Math.random() * 0.5)),
        y: Math.round(H * (0.1 + Math.random() * 0.15)),
      };
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
      const x = Math.round(sun.x < W / 2 ? W * 0.68 : W * 0.32),
        r = Math.round(Math.min(W * 0.22, 60));
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
      const tx = Math.round(cx + (Math.random() - 0.5) * W * 0.3),
        ty = Math.min(groundY(tx), H - 4),
        time = 2.2;
      comet = /** @type {NonNullable<typeof comet>} */ ({
        x: -10,
        y: H * 0.05,
        atoms: /** @type {any[]} */ ([]),
        colors: ['#ff6a1a', '#ffb02e', '#ffffff'],
        asteroid: true,
        crash: { x: tx, y: ty },
      }); // its speed is set next
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
    // What falls from the clouds: { rain, snow, hail } (research known).
    setWeather(w) {
      weather = w;
    },
    // The air temperatures of the snowing clouds in view (for tests and the pacing bot).
    snowCloudSpans: () =>
      visibleClouds()
        .filter(v => precip(v) === 'snow')
        .map(v => [v.x * P, (v.x + v.w) * P, v.y * P]),
    snowClouds: () =>
      visibleClouds()
        .filter(v => !v.storm && precip(v) === 'snow')
        .map(cloudTemp),
    onCloudTap(fn) {
      onCloud = fn;
    },
    onCometTap(fn) {
      onComet = fn;
    },
    onZoneTap(fn) {
      onZone = fn;
    },
    onRainbowTap(fn) {
      onRainbow = fn;
    },
    // Minigames: show one spot of a kind; how many of a kind are up; a sunspot; whether the moon can be dragged.
    spawnSpot,
    // The stars tapped so far in the dark, lit again after a reload: `n` of them, anywhere in the open sky.
    relight(n) {
      lit = [];
      relitN = n;
    },
    litStars: () => lit.length,
    // A shimmer of light beyond the rainbow at a screen point (CSS pixels) or a texture spot, for `seconds`.
    glimmer(band, where, seconds = 6) {
      const sky = where.x !== undefined ? { x: Math.round(where.x / P), y: Math.round(where.y / P) } : null;
      spots.push({
        kind: 'band',
        band,
        sky,
        at: sky ? null : where,
        t: seconds,
        max: seconds,
        taps: 0,
        off: { x: 0, y: 0 },
      });
    },
    // A random point in the sky (CSS pixels), or by the sun.
    skyPoint: () => ({ x: W * (0.1 + Math.random() * 0.8) * P, y: H * (0.08 + Math.random() * 0.3) * P }),
    sunPoint: () => ({ x: (sun.x - sun.r - 4) * P, y: (sun.y + sun.r * 0.5) * P }),
    setHeatView(on) {
      if (on === heatView) return;
      heatView = on;
      if (climate !== null) updateTexture(climate);
      lastBg = -1e9;
    },
    spotCount: kind => spots.filter(o => o.kind === kind).length + (kind === 'sunspot' ? sunspots.length : 0),
    spotAt: kind => {
      const o = spots.find(s => s.kind === kind && s.screen);
      return o ? { x: (o.screen.x + o.off.x) * P, y: (o.screen.y + o.off.y) * P } : null;
    },
    sunspot() {
      if (!sunVisible()) return false;
      const dy = (Math.random() - 0.5) * 1.1;
      sunspots.push({ dx: -0.7, dy, vx: 0.12 + Math.random() * 0.06, t: 9 });
      return true;
    },
    sparkleMoon() {
      if (moon.visible && moonUp())
        burst(
          moon.cur.x + (Math.random() - 0.5) * moon.cur.r * 2,
          moon.cur.y + (Math.random() - 0.5) * moon.cur.r * 2,
          '#ffffff',
          3,
          8,
        );
    },
    // Whether snow on a mountain counts (the river minigame is ready).
    setMountainSnow(on) {
      mountainSnow = on;
    },
    // The volcano spots in use, for the save, and setting them back from it (before setVolcanoes grows them).
    volcanoSpots: () => volcanoes.map(v => v.spot),
    setVolcanoSpots(spots) {
      volcanoes = spots.map(k => volcanoes.find(v => v.spot === k) || { spot: k, cool: 0, at: null });
      Terrain.raiseVolcanoes(spots);
      lastBg = -1e9;
    },
    // The volcanoes in view, as screen points (CSS pixels) of their craters (for tests).
    volcanoPoints: () =>
      volcanoes.map(v => v.at && { x: (v.at.x + 0.5) * P, y: (v.at.y - VOLCANO_H * planetZoom) * P }),
    // The high points of the ranges in view, as screen points (CSS pixels), with their heights in pixels (for tests).
    peakPoints: () =>
      (buildRelief(), summits)
        .map(p => {
          const s = project(p);
          return s && { x: (s.x + 0.5) * P, y: (s.y - peakHeight(p) + 0.5) * P, h: peakHeight(p) };
        })
        .filter(Boolean),
    // Zoom in on the planet (1 is the whole view; see ZOOM_RANGE), as a pinch or the mouse wheel does.
    setZoom: (z, fy) => setZoom(z, fy === undefined ? undefined : fy / P),
    zoom: () => planetZoom,
    // A snowing cloud over a peak in view, as a screen point (CSS pixels) of the peak, or null (for tests).
    mountainUnderSnow: () => {
      for (const v of visibleClouds()) {
        const s = precip(v) === 'snow' && peakUnder(v);
        if (s) return { x: (s.x + 0.5) * P, y: (s.y + 0.5) * P };
      }
      return null;
    },
    setMoonPlay(on) {
      moonPlay = on;
    },
    // Screen points (CSS pixels) of what is up, for tests and the pacing bot.
    playPoints: () => [
      ...spots
        .filter(o => o.screen)
        .map(o => ({
          kind: o.kind,
          band: o.band,
          x: (o.screen.x + 0.5) * P,
          y: (o.screen.y + 0.5) * P,
          to: o.toScreen && { x: (o.toScreen.x + 0.5) * P, y: (o.toScreen.y + 0.5) * P },
        })),
      ...sunspots.map(o => ({
        kind: 'sunspot',
        x: (sun.x + o.dx * sun.r + 0.5) * P,
        y: (sun.y + o.dy * sun.r + 0.5) * P,
      })),
    ],
    zoneAtCss: (x, y) => zoneAt(x / P, y / P),
    moonPoint: () => (moon.visible && moonUp() ? { x: moon.cur.x * P, y: moon.cur.y * P } : null),
    onPlay(fn) {
      onPlay = fn;
    },
    onMoonTap(fn) {
      onMoon = fn;
    },
    // The opening: 'pre' with the singularity's size (0..1), 'dark' after the bang, or null once it is over.
    setCinema(mode, value) {
      if (mode === 'pre' && cinema !== 'pre') {
        cinemaAt = performance.now();
        suckAt = Infinity;
      }
      if (cinema === 'dark' && !mode) starRiseT = STAR_RISE_S;
      cinema = mode;
      if (mode === 'pre') bangHeat = value;
    },
    // The opening's word as far as it is typed, or '' once it has been sucked into the dot (for tests).
    openingWord: () => {
      const t = performance.now() - cinemaAt;
      return cinema !== 'pre' || t >= suckAt + SUCK_MS ? '' : WORD.slice(0, typedLetters(t));
    },
    // The Big Bang: a white flash and a burst of light from the singularity.
    flash() {
      flashT = 1.6;
      for (let k = 0; k < 80; k++) {
        const a = Math.random() * Math.PI * 2,
          sp = 30 + Math.random() * 120;
        particles.push({
          x: W / 2,
          y: H / 2,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 0.8,
          max: 0.8,
          size: 2,
          color: Math.random() < 0.5 ? '#ffffff' : '#ffd23f',
        });
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
    // How far the continent has split (Continental Drift), 0 to 1. The map is reshaped in steps.
    setDrift(p) {
      if (!Terrain.setDrift(Math.round(p * 16) / 16)) return;
      Terrain.setLand(land, mountains);
      if (climate !== null) updateTexture(climate);
      lastBg = -1e9;
    },
    // How many volcanoes stand on the planet. New ones rise where the player is looking.
    setVolcanoes(n) {
      if (n === volcanoes.length) return;
      // A new cone rises where its crack was tapped; a world short of spots (an old save) gets them picked.
      /** @type {number | null} */
      let prefer = null;
      if (pendingCone && n > volcanoes.length)
        prefer = Terrain.addVolcanoSpot(
          pendingCone.u,
          pendingCone.v,
          volcanoes.map(v => v.spot),
        );
      pendingCone = null;
      if (n > Terrain.volcanoSpotCount()) Terrain.fillVolcanoSpots(n);
      const spots = Terrain.growVolcanoes(
        volcanoes.map(v => v.spot),
        n,
        viewCentre(),
        prefer,
      );
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
    // A volcano rumbles: a puff of smoke and sparks from its crater (the cracks game, a tap short of an eruption).
    rumble(i) {
      const v = volcanoes[i];
      if (!v || !v.at) return;
      const x = v.at.x,
        y = v.at.y - VOLCANO_H * planetZoom;
      for (let k = 0; k < 14; k++) {
        const spark = k < 4;
        particles.push({
          x: x + (Math.random() - 0.5) * 3,
          y,
          vx: (Math.random() - 0.5) * (spark ? 14 : 6),
          vy: -(spark ? 12 + Math.random() * 14 : 4 + Math.random() * 8),
          life: spark ? 0.5 : 1.2,
          max: spark ? 0.5 : 1.2,
          size: 1,
          color: spark ? '#ffb02e' : '#6a5a58',
        });
      }
    },
    erupt(size = 1, i = -1) {
      // Prefer a ready volcano in view; one on the far side erupts unseen.
      const v = volcanoes[i] || volcanoes.find(o => o.cool <= 0 && o.at) || volcanoes.find(o => o.cool <= 0);
      if (v) v.cool = VOLCANO_COOL_S;
      const spot = v ? Terrain.volcanoSpot(v.spot) : null;
      if (v && !v.at) return spot;
      const x = v ? v.at.x : cx + (Math.random() - 0.5) * R * 0.8,
        y = v ? v.at.y - VOLCANO_H * planetZoom : groundY(x);
      for (let k = 0; k < 25 * size; k++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.9,
          v = 15 + Math.random() * 35 * size;
        particles.push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life: 0.8,
          max: 0.8,
          size: 1,
          color: Math.random() < 0.5 ? '#ff5a1a' : '#ffb02e',
        });
      }
      for (let k = 0; k < 30 * size; k++) {
        particles.push({
          x: x + (Math.random() - 0.5) * 4,
          y,
          vx: (Math.random() - 0.3) * 8,
          vy: -(10 + Math.random() * 25 * size),
          life: 2.5,
          max: 2.5,
          size: Math.random() < 0.5 ? 1 : 2,
          color: Math.random() < 0.5 ? '#8a8478' : '#5a5650',
        });
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
    setTonight(sign, night, planet) {
      tonightPlanet = planet || null;
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
    // The star signs found: the planets show by their own rule (tonightPlanet, book.js).
    setSky(signs) {
      signsFound = new Set(signs);
    },
    onSkyTap(fn) {
      onSky = fn;
    },
    // Where the star signs and planets in the sky are now, in CSS pixels (for tests).
    skyPoints() {
      return skyObjects().map(o => ({
        kind: o.kind,
        id: o.id,
        x: o.x * P,
        y: o.y * P,
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
      moon.fling = 3.5; // it flies out from the planet into the sky; story splashes wait for it
      for (let k = 0; k < 40; k++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6,
          v = 20 + Math.random() * 50;
        particles.push({
          x: cx,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life: 1.2,
          max: 1.2,
          size: Math.random() < 0.3 ? 2 : 1,
          color: Math.random() < 0.5 ? '#ff7a2a' : '#ffd23f',
        });
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
    setMoon(visible, wake, bg, phase = 0.5) {
      moon.phase = phase;
      moon.visible = visible;
      moon.wake = wake;
      moon.bg = bg;
    },
  };
})();
