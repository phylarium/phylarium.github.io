'use strict';

// The tile view: a tap on the ground opens a close-up of that spot of the map, a small square of texels drawn as
// isometric pixel-art blocks. Each texel is one tile: its top in the colors the planet shows there, its height
// from the ground's height above the sea and from the mountains and volcanoes standing on it.
//
// The tiles are a model of their own (buildTiles), apart from the drawing (drawTiles), so later things can be
// placed on a tile and drawn on top of it.
const Tiles = (() => {
  const { TEX_W, TEX_H, COVER, elev, cover } = Terrain;
  const N = 11, // tiles along each side of the square, odd so the tapped texel is in the middle
    TW = 16, // a tile's top: a diamond this many pixels wide and half as high
    TH = TW / 2,
    LAND_MIN = 2, // the lowest land stands this high above the water
    LAND_H = 12, // and the highest land this much more, before mountains
    RELIEF_K = 2.5, // tile pixels per pixel of a mountain column's height on the planet
    SLAB = 6, // how deep the ground and water show below the water line at the edges of the square
    TOP_ROOM = 64, // room above the square for the tallest mountains
    REDRAW_MS = 400; // water glints, fire and lava flicker this often
  const SEA = new Set([COVER.DEEP, COVER.SHALLOW, COVER.REEF, COVER.BLEACHED, COVER.RED_TIDE, COVER.SEA_ICE]),
    // Water standing on land, a step below the ground round it.
    INLAND = new Set([COVER.RIVER, COVER.LAKE, COVER.FLOOD]);
  const SOIL = [0x6a, 0x4c, 0x34],
    TRUNK = [0x5a, 0x3e, 0x2a],
    STONE = [0x8a, 0x80, 0x76],
    DEEP_ROCK = [0x4a, 0x40, 0x38];

  /* ---------- the model ---------- */

  /**
   * @typedef {{
   *   a: number, b: number, // place in the square: a along u (to the lower right), b along v (to the lower left)
   *   u: number, v: number, i: number, // the map texel
   *   cover: number,
   *   height: number, // pixels above the water line
   *   water: boolean, // the top is water: sea, a lake or a river
   *   relief: {h: number, tone: number, cap: boolean, volcano: number, crater: boolean, lava: number} | null,
   * }} Tile
   */

  // The tiles of the N×N square around texel (u, v), back to front. Rows past a pole are left out.
  function buildTiles(u0, v0) {
    const sea = Terrain.sea();
    let top = sea;
    for (let i = 0; i < elev.length; i++) if (elev[i] > top) top = elev[i];
    const span = Math.max(0.01, top - sea),
      half = (N - 1) / 2;
    const groundOf = i => LAND_MIN + Math.round(Math.max(0, (elev[i] - sea) / span) ** 0.8 * LAND_H);
    /** @type {Tile[]} */
    const tiles = [];
    for (let b = 0; b < N; b++)
      for (let a = 0; a < N; a++) {
        const v = v0 - half + b;
        if (v < 0 || v >= TEX_H) continue;
        const u = (((u0 - half + a) % TEX_W) + TEX_W) % TEX_W,
          i = v * TEX_W + u,
          c = cover[i],
          atSea = elev[i] < sea || SEA.has(c),
          relief = atSea ? null : Scene.reliefAt(i);
        let height = 0;
        if (!atSea) height = groundOf(i);
        // Rivers and floods run a step below the land they cross.
        if (c === COVER.RIVER || c === COVER.FLOOD) height = Math.max(1, height - 1);
        if (relief) height += Math.round(relief.h * RELIEF_K);
        tiles.push({ a, b, u, v, i, cover: c, height, water: (atSea && c !== COVER.SEA_ICE) || INLAND.has(c), relief });
      }
    // A lake is one flat sheet of water, at the height of its lowest shore in view.
    const lake = tiles.filter(t => t.cover === COVER.LAKE && !t.relief);
    if (lake.length) {
      const level = Math.max(1, Math.min(...lake.map(t => t.height)) - 1);
      for (const t of lake) t.height = level;
    }
    tiles.sort((p, q) => p.a + p.b - (q.a + q.b));
    return { u: u0, v: v0, n: N, tiles };
  }

  /* ---------- drawing ---------- */

  const W = N * TW + 4,
    H = TOP_ROOM + N * TH + SLAB + 4,
    OX = W / 2 - TW / 2, // where tile (0, 0)'s diamond starts at height 0
    OY = TOP_ROOM;
  const canvas = document.createElement('canvas'),
    g = context2d(canvas);
  canvas.width = W;
  canvas.height = H;
  const image = g.createImageData(W, H),
    px = new Uint32Array(image.data.buffer),
    owner = new Int16Array(W * H); // which tile each pixel shows (-1 for none), for taps on a tile

  // Repeatable noise per texel and slot, so the details stay put between redraws.
  const hash = (i, k) => (((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1) + 1) % 1;
  /** @param {number[]} rgb */
  const packRgb = (rgb, f = 1) => {
    const c = x => Math.max(0, Math.min(255, Math.round(x * f)));
    return ((255 << 24) | (c(rgb[2]) << 16) | (c(rgb[1]) << 8) | c(rgb[0])) >>> 0;
  };
  const hexRgb = h => [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16));
  const scaled = (p, f) => packRgb([p & 255, (p >>> 8) & 255, (p >>> 16) & 255].map(x => x * f).map(Math.round), 1);
  function put(x, y, color, t) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    px[y * W + x] = color;
    owner[y * W + x] = t;
  }

  // A column's colors: its top (per pixel, so it can vary), and its two visible sides from the top down.
  function columnColors(t, colors, now) {
    const c = t.cover,
      r = t.relief;
    if (r) {
      let top = colors.rock.top[1],
        side = colors.rock.side[1];
      if (r.volcano >= 0) {
        const e = Scene.eruption(r.volcano),
          flicker = (Math.floor(now / 120) + t.i) % 3 === 0 ? 0 : 1;
        if (r.crater) top = e === 0 ? colors.crater.hot : e < 0.6 ? colors.lava[0] : colors.crater.cold;
        else if (r.lava >= 0 && e > 0 && r.lava <= Math.min(1, e * 4)) {
          const age = e - r.lava / 4;
          top = age < 0.45 ? colors.lava[flicker] : age < 0.75 ? colors.lava[2] : colors.lava[3];
        }
      } else if (r.cap && colors.snowy) {
        top = colors.snow[1];
        side = colors.snow[2];
      } else if (c === COVER.RIVER) top = colors.river[1];
      return { top: packRgb(hexRgb(top)), side: packRgb(hexRgb(side)), lip: 0, under: packRgb(hexRgb(side)) };
    }
    const top = Scene.coverColor(c);
    if (t.water) return { top, side: scaled(top, 0.85), lip: 99, under: scaled(top, 0.85) };
    const rocky = c === COVER.ROCK || c === COVER.MOUNTAIN || c === COVER.LAVA || c === COVER.BURNT,
      sandy = c === COVER.SAND || c === COVER.BARE,
      icy = c === COVER.LAND_ICE || c === COVER.SEA_ICE;
    const under = icy
      ? scaled(top, 0.85)
      : rocky
        ? packRgb(DEEP_ROCK, colors.light)
        : sandy
          ? scaled(top, 0.78)
          : packRgb(SOIL, colors.light); // soil under plants
    return { top, side: scaled(top, 0.82), lip: icy || sandy ? 3 : 2, under };
  }

  // One tile: its top diamond and the two sides below it, down to the slab under the water line. `slope` lights
  // a top that faces the sun and shades one that faces away, in small steps.
  function drawColumn(t, k, slope, colors, now) {
    const x0 = OX + (t.a - t.b) * (TW / 2),
      y0 = OY + (t.a + t.b) * (TH / 2) - t.height,
      colorsHere = columnColors(t, colors, now),
      { side, lip, under } = colorsHere,
      top = t.water ? colorsHere.top : scaled(colorsHere.top, 1 + Math.max(-3, Math.min(3, slope)) * 0.06),
      floor = OY + (t.a + t.b) * (TH / 2) + SLAB; // the slab's floor under this tile's diamond
    for (let x = 0; x < TW; x++) {
      const e = Math.floor(Math.min(x, TW - 1 - x) / 2),
        y1 = TH / 2 - 1 - e, // the top face spans y1..y2 in this pixel column
        y2 = TH / 2 + e,
        right = x >= TW / 2;
      for (let y = y1; y <= y2; y++) {
        // A little light and shade in 2×2 cells, so the ground reads as ground.
        const n = hash(t.i, ((x >> 1) + 8 * (y >> 1)) | 0),
          f = t.water ? 1 : n < 0.2 ? 0.93 : n > 0.85 ? 1.06 : 1;
        put(x0 + x, y0 + y, f === 1 ? top : scaled(top, f), k);
      }
      // The sides: lit on the right (the sun is to the right), in shade on the left.
      const light = right ? 0.86 : 0.66,
        edge = right ? 1.05 : 0.95;
      for (let y = y0 + y2 + 1, d = 0; y <= floor + y2; y++, d++) {
        // Layers of rock and soil in bands, level all round the square.
        const band = !t.water && d >= lip && Math.floor((floor - SLAB + y2 - y) / 4) % 2 !== 0,
          base = d < lip ? side : under,
          f = (d === 0 ? light * edge : light) * (band ? 0.93 : 1);
        put(x0 + x, y, scaled(base, f), k);
      }
    }
    drawDetail(t, k, x0, y0, colors, now);
  }

  // Small things on a tile's top: trees, tufts of grass, stones, glints on water, flames.
  function drawDetail(t, k, x0, y0, colors, now) {
    const c = t.cover,
      top = Scene.coverColor(c),
      h = s => hash(t.i, s),
      tick = Math.floor(now / REDRAW_MS);
    // Spots on the top face, in its own coordinates (the diamond is TW wide, TH high).
    const spot = s => {
      const x = 3 + Math.floor(h(s) * (TW - 6)),
        w = Math.max(0, TH / 2 - 1 - Math.abs(x + 0.5 - TW / 2) / 2), // the diamond's half height at x
        y = Math.round(TH / 2 - w + 1 + h(s + 1) * Math.max(0, 2 * w - 2));
      return [x0 + x, y0 + y];
    };
    if (t.relief) {
      if (t.relief.crater && Scene.eruption(t.relief.volcano) === 0 && tick % 2)
        put(x0 + TW / 2, y0 + TH / 2, packRgb(hexRgb(colors.lava[0])), k);
      return;
    }
    if (t.water) {
      // Glints on the water that come and go.
      for (let s = 0; s < 2; s++) {
        if (hash(t.i, s + tick * 3) < 0.6) continue;
        const [x, y] = spot(s * 5 + 40);
        put(x, y, scaled(top, 1.3), k);
        put(x + 1, y, scaled(top, 1.3), k);
      }
      if (c === COVER.REEF) for (let s = 0; s < 3; s++) put(...spot(s * 7 + 60), scaled(top, 1.15), k);
      return;
    }
    if (c === COVER.FOREST || c === COVER.WETLAND) {
      const trees = c === COVER.FOREST ? 3 : 1;
      for (let s = 0; s < trees; s++) tree(...spot(s * 3), top, h(s * 3 + 2) < 0.5 ? 1 : 0, k);
    }
    if (c === COVER.SAVANNA && h(9) < 0.4) flatTree(...spot(9), top, k);
    if (c === COVER.GRASS || c === COVER.SAVANNA || c === COVER.TUNDRA || c === COVER.WETLAND) {
      const tufts = c === COVER.TUNDRA ? 2 : 4;
      for (let s = 0; s < tufts; s++) {
        const [x, y] = spot(20 + s * 3),
          light = scaled(top, 1.22);
        put(x, y - 1, light, k);
        put(x - 1, y, scaled(top, 0.8), k);
        put(x + 1, y, scaled(top, 0.8), k);
      }
    }
    if (c === COVER.WETLAND)
      for (let s = 0; s < 2; s++) {
        const [x, y] = spot(30 + s * 3);
        put(x, y, Scene.coverColor(COVER.LAKE), k);
        put(x + 1, y, Scene.coverColor(COVER.LAKE), k);
      }
    if (c === COVER.ROCK || c === COVER.MOUNTAIN || c === COVER.TUNDRA || c === COVER.BARE)
      for (let s = 0; s < 2; s++) {
        if (h(50 + s) < 0.4) continue;
        const [x, y] = spot(52 + s * 3);
        put(x, y, packRgb(STONE, 1.1), k);
        put(x + 1, y, packRgb(STONE, 0.8), k);
      }
    if (c === COVER.SAND)
      for (let s = 0; s < 3; s++) {
        const [x, y] = spot(70 + s * 3);
        put(x, y, scaled(top, 0.86), k);
      }
    if (c === COVER.LAND_ICE && (tick + t.i) % 5 === 0) put(...spot(80), packRgb([255, 255, 255]), k);
    if (c === COVER.FIRE)
      for (let s = 0; s < 3; s++) {
        const [x, y] = spot(90 + s * 3),
          tall = 1 + ((tick + s + t.i) % 3);
        for (let d = 0; d < tall; d++) put(x, y - d, packRgb(hexRgb(colors.lava[d ? 0 : 1])), k);
      }
    if (c === COVER.BURNT)
      for (let s = 0; s < 2; s++) {
        const [x, y] = spot(100 + s * 3);
        for (let d = 0; d < 4; d++) put(x, y - d, packRgb([0x2a, 0x22, 0x20]), k);
      }
    if (c === COVER.LAVA && tick % 2) put(...spot(110), packRgb(hexRgb(colors.lava[0])), k);
  }

  // A small tree standing at (x, y): a round crown, lit on the right, on a short trunk.
  const CROWNS = [
    ['..aa..', '.aabb.', 'aaabbb', 'aaabbb', '.aabb.', '..tt..'],
    ['.ab.', 'aabb', 'aabb', '.tt.'],
  ];
  function tree(x, y, leaf, small, k) {
    const rows = CROWNS[small],
      w = rows[0].length,
      dark = scaled(leaf, 0.72),
      lit = scaled(leaf, 1.12),
      trunk = packRgb(TRUNK);
    rows.forEach((row, r) =>
      [...row].forEach((ch, dx) => {
        if (ch === '.') return;
        put(x - (w >> 1) + dx, y - rows.length + 1 + r, ch === 'a' ? dark : ch === 'b' ? lit : trunk, k);
      }),
    );
  }
  // A savanna tree: a flat crown on a thin trunk.
  function flatTree(x, y, leaf, k) {
    const crown = scaled(leaf, 0.75),
      trunk = packRgb(TRUNK);
    for (let dx = -2; dx <= 2; dx++) put(x + dx, y - 3, crown, k);
    put(x - 1, y - 4, crown, k);
    put(x + 1, y - 4, crown, k);
    put(x, y - 2, trunk, k);
    put(x, y - 1, trunk, k);
    put(x, y, trunk, k);
  }

  function drawTiles(model, now) {
    px.fill(0);
    owner.fill(-1);
    const colors = Scene.reliefColors(),
      heights = new Map(model.tiles.map(t => [t.a + t.b * N, t.height]));
    model.tiles.forEach((t, k) => {
      // Like the planet's hills: lit where the ground falls away to the right (+a) and towards the viewer (-b).
      const h = (a, b) => (a < 0 || a >= N ? t.height : (heights.get(a + b * N) ?? t.height)),
        fall = h(t.a - 1, t.b) - h(t.a + 1, t.b) + 0.5 * (h(t.a, t.b + 1) - h(t.a, t.b - 1));
      drawColumn(t, k, Math.round(fall / 3), colors, now);
    });
    Hues.apply(image.data); // in the colors found so far, like the planet
    g.putImageData(image, 0, 0);
  }

  /* ---------- the overlay ---------- */

  const layer = document.createElement('div');
  layer.id = 'tiles';
  layer.className = 'tiles hidden';
  layer.appendChild(canvas);
  document.body.appendChild(layer);
  /** @type {{u: number, v: number, n: number, tiles: Tile[]} | null} */
  let model = null,
    scale = 1,
    timer = 0;

  // As large as fits, in whole pixels.
  function fit() {
    scale = Math.max(1, Math.floor(Math.min((innerWidth * 0.96) / W, (innerHeight * 0.8) / H)));
    canvas.style.width = `${W * scale}px`;
    canvas.style.height = `${H * scale}px`;
  }

  function redraw() {
    if (!model) return;
    model = buildTiles(model.u, model.v);
    drawTiles(model, performance.now());
  }

  // The tile under a point on the screen (CSS pixels), or null.
  function tileAt(cssX, cssY) {
    if (!model) return null;
    const r = canvas.getBoundingClientRect(),
      x = Math.floor((cssX - r.left) / scale),
      y = Math.floor((cssY - r.top) / scale);
    if (x < 0 || x >= W || y < 0 || y >= H) return null;
    const k = owner[y * W + x];
    return k >= 0 ? model.tiles[k] : null;
  }

  function open(u, v) {
    if (!model) history.pushState({ tiles: true }, '');
    model = buildTiles(Math.round(u), Math.round(v));
    fit();
    drawTiles(model, performance.now());
    layer.classList.remove('hidden');
    clearInterval(timer);
    timer = setInterval(redraw, REDRAW_MS);
  }

  function hide() {
    model = null;
    clearInterval(timer);
    layer.classList.add('hidden');
  }

  function close() {
    if (!model) return;
    if (history.state?.tiles) history.back();
    else hide();
  }

  // A tap beside the square closes the view; a tap on a tile keeps it open.
  layer.addEventListener('click', e => {
    if (!tileAt(e.clientX, e.clientY)) close();
  });
  // Back (and Escape) closes it too.
  window.addEventListener('popstate', () => {
    if (model && !history.state?.tiles) hide();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && model) close();
  });
  window.addEventListener('resize', () => model && fit());

  return {
    open,
    close,
    isOpen: () => !!model,
    // The square on show (for tests, and later for what stands on the tiles).
    model: () => model,
    tileAt,
  };
})();
