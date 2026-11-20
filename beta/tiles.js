'use strict';

// The tile view: a tap on the planet opens a close-up of that spot of the map, a square of texels drawn as isometric
// pixel-art blocks. A texel is a tile: its top in the planet's colors there, its height from the ground's and its peaks'.
// The tiles are a model (buildTiles) apart from the drawing (drawTiles), so things can later be placed on a tile.
// Their shapes (tops that slope to the water, the floor under it) come from tile-blocks.js.
const Tiles = (() => {
  const { TEX_W, TEX_H, COVER, elev, cover } = Terrain;
  const N = 9, // tiles along each side of the square, odd so the tapped texel is in the middle
    TW = TileBlocks.W, // a tile's top: a diamond this many pixels wide and half as high
    TH = TW / 2,
    LAND_MIN = 2, // the lowest land stands this high above the water
    LAND_H = 12, // and the highest land this much more, before mountains
    RELIEF_K = 2.5, // tile pixels per pixel of a mountain column's height on the planet
    SLAB = TileBlocks.W, // how deep the ground shows below the water line at the square's edges: as deep as wide
    TOP_ROOM = 64, // room above the square for the tallest mountains
    REDRAW_MS = 400; // water glints, fire and lava flicker this often
  const SEA = new Set([COVER.DEEP, COVER.SHALLOW, COVER.REEF, COVER.BLEACHED, COVER.RED_TIDE, COVER.SEA_ICE]),
    // Water standing on land, a step below the ground round it.
    INLAND = new Set([COVER.RIVER, COVER.LAKE, COVER.FLOOD]);
  const SOIL = [0x6a, 0x4c, 0x34],
    STONE = [0x8a, 0x80, 0x76],
    DEEP_ROCK = [0x4a, 0x40, 0x38];
  const COVER_NAME = Object.fromEntries(Object.entries(COVER).map(([name, c]) => [c, name]));

  /* ---------- the model ---------- */
  /**
   * @typedef {{
   *   a: number, b: number, // place in the square: a along u (to the lower right), b along v (to the lower left)
   *   u: number, v: number, i: number, // the map texel
   *   cover: number,
   *   height: number, // pixels above the water line
   *   water: boolean, // the top is water: sea, a lake or a river
   *   relief: {h: number, tone: number, cap: boolean, volcano: number, crater: boolean, lava: number} | null,
   * } & BlockShape} Tile
   */

  // The tiles of the N×N square around texel (u, v), back to front. Rows past a pole are left out.
  function buildTiles(u0, v0) {
    const sea = Terrain.sea();
    let top = sea;
    for (let i = 0; i < elev.length; i++) if (elev[i] > top) top = elev[i];
    const span = Math.max(0.01, top - sea),
      half = (N - 1) / 2;
    const groundOf = i => LAND_MIN + Math.round(Math.max(0, (elev[i] - sea) / span) ** 0.8 * LAND_H);
    /** @type {Omit<Tile, keyof BlockShape>[]} */
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
    const shaped = TileBlocks.shapes(
      tiles,
      N,
      c => COVER_NAME[c],
      c => c !== COVER.LAND_ICE,
    );
    return { u: u0, v: v0, n: N, tiles: shaped };
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
  const hash = TileBlocks.hash;
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

  // One tile: its top, tilted where it slopes to the water, and its two sides down to the slab; or the floor
  // under water and the see-through water over it (tile-blocks.js). `slope` lights a top that faces the sun.
  function drawColumn(t, k, slope, colors, now) {
    const at = [OX + (t.a - t.b) * (TW / 2), OY + (t.a + t.b) * (TH / 2)], // the diamond's top at the water line
      c = columnColors(t, colors, now),
      shade = TileBlocks.noise(t.i);
    if (t.water) {
      stamp(
        TilePaint.floor(t, colors.light, () => 1, SLAB),
        at,
        k,
      );
      stamp(
        TilePaint.water(t, c.top, (x, y) => px[(at[1] + y) * W + at[0] + x] ?? 0),
        at,
        k,
      );
    } else
      stamp(
        TilePaint.block(t.top, { ...c, top: scaled(c.top, 1 + Math.max(-3, Math.min(3, slope)) * 0.06) }, shade, SLAB),
        at,
        k,
      );
    drawDetail(t, k, at[0], at[1], colors, now);
  }

  /** Pixels from tile-paint.js, set from `at`. @param {readonly BlockPixel[]} pixels @param {number[]} at @param {number} k */
  const stamp = (pixels, [x = 0, y = 0], k) => pixels.forEach(p => put(x + p.x, y + p.y, p.color, k));

  // Small things on a tile's top: trees, tufts of grass, stones, glints on water, flames.
  function drawDetail(t, k, x0, y0, colors, now) {
    const c = t.cover,
      top = Scene.coverColor(c),
      h = s => hash(t.i, s),
      tick = Math.floor(now / REDRAW_MS);
    const spot = s => TileBlocks.spot(t.top, t.i, s).map((d, j) => d + (j ? y0 : x0));
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
      return;
    }
    if (c === COVER.FOREST || c === COVER.WETLAND) {
      const trees = c === COVER.FOREST ? 3 : 1;
      for (let s = 0; s < trees; s++)
        stamp(TilePaint.tree(h(s * 3 + 2) < 0.5 ? 'small' : 'round', top), spot(s * 3), k);
    }
    if (c === COVER.SAVANNA && h(9) < 0.4) stamp(TilePaint.tree('flat', top), spot(9), k);
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
    if (c === COVER.FIELD) [0, 3, 6, 9, 12].map(s => stamp(TilePaint.crop(colors.light), spot(120 + s), k)); // crops
  }

  function drawTiles(model, now) {
    px.fill(0);
    owner.fill(-1);
    const colors = Scene.reliefColors(),
      heights = new Map(model.tiles.map(t => [t.a + t.b * N, t.height]));
    model.tiles.forEach((t, k) => {
      // Like the planet's hills: lit where the ground falls away to the right (+a) and towards the viewer (-b).
      const h = (a, b) => (a < 0 || a >= N ? t.height : (heights.get(a + b * N) ?? t.height)),
        fall = TileBlocks.fall(t.top) || h(t.a - 1, t.b) - h(t.a + 1, t.b) + 0.5 * (h(t.a, t.b + 1) - h(t.a, t.b - 1));
      drawColumn(t, k, Math.round(fall / 3), colors, now);
    });
    Hues.apply(image.data); // in the colors found so far, like the planet
    g.putImageData(image, 0, 0);
    layer.dispatchEvent(new CustomEvent('drawn')); // what stands on the tiles is drawn now (tile-life.js)
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
    timer = 0,
    armed = false; // a tap began on the open view: only such a tap may close it

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
      x = Math.floor(((cssX - r.left) / r.width) * W),
      y = Math.floor(((cssY - r.top) / r.height) * H);
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

  // A tap beside the square closes the view, if it began on the view: a finger's tap that opened it ends here too.
  layer.addEventListener('pointerdown', () => (armed = true));
  layer.addEventListener('click', e => {
    if (armed && !tileAt(e.clientX, e.clientY)) close();
    armed = false;
  });
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
    // The square on show, and where the middle of a tile's top is on the canvas, for what stands on the tiles.
    model: () => model,
    top: (/** @type {Tile} */ t) => [
      OX + (t.a - t.b + 1) * (TW / 2),
      OY + (t.a + t.b + 1) * (TH / 2) - Math.round(TileBlocks.heightAt(t.top, TW / 2, TH / 2)),
    ],
    colors: (/** @type {Tile} */ t) => columnColors(t, Scene.reliefColors(), 0), // before the hues
    tileAt,
  };
})();
