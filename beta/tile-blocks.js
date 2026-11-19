'use strict';

// The shapes of the tile view's blocks (tiles.js draws them). A block's top need not be flat: each of its four
// corners has a height of its own, so a beach slopes down into the water and the sea floor rises to the shore.
// Water is a see-through sheet at its own height over a floor further down. Everything here is pure: heights in,
// pixel places out. Loads before tiles.js.

/** A tile's top: a diamond this many pixels wide and half as high (as in tiles.js). */
const BLOCK_W = 16,
  BLOCK_H = BLOCK_W / 2;
/** The highest land that slopes to the water; higher land stands over it as a cliff. */
const RAMP_MAX = 8;
/** How deep the floor lies under each kind of water, in pixels, by cover name. */
const WATER_DEPTH = { DEEP: 7, SHALLOW: 4, REEF: 3, BLEACHED: 3, RED_TIDE: 4, RIVER: 2, LAKE: 3, FLOOD: 1 };

/**
 * The heights of a top's corners, in pixels above the water line: n at the back (a, b), e on the right (a + 1, b),
 * s at the front (a + 1, b + 1), w on the left (a, b + 1).
 * @typedef {{ n: number, e: number, s: number, w: number }} Corners
 */

/** @param {number} h */
const flatCorners = h => ({ n: h, e: h, s: h, w: h });

/** @param {number} f */
const unit = f => Math.min(1, Math.max(0, f));

/**
 * How high the top stands at pixel (x, y) of its diamond, between the heights of its corners.
 * @param {Corners} c
 * @param {number} x
 * @param {number} y
 */
const blockHeightAt = (c, x, y) => {
  const k = (x + 0.5 - BLOCK_W / 2) / (BLOCK_W / 2),
    t = (y + 0.5) / (BLOCK_H / 2),
    a = unit((t + k) / 2),
    b = unit((t - k) / 2);
  return c.n * (1 - a) * (1 - b) + c.e * a * (1 - b) + c.s * a * b + c.w * (1 - a) * b;
};

/**
 * The rows the flat diamond covers in pixel column x: from y1 at the back to y2 at the front.
 * @param {number} x
 */
const blockRows = x => {
  const e = Math.floor(Math.min(x, BLOCK_W - 1 - x) / 2);
  return { y1: BLOCK_H / 2 - 1 - e, y2: BLOCK_H / 2 + e };
};

/**
 * The top in pixel column x, back to front: where each of its pixels goes (y from the flat diamond's top at height
 * 0, up being negative) and which row of the flat diamond it shows. Where the top falls away towards the viewer the
 * rows stretch, so it has no gaps. The last pixel is the front edge, where the sides begin.
 * @param {Corners} c
 * @param {number} x
 * @returns {{ y: number, row: number }[]}
 */
const blockColumn = (c, x) => {
  const { y1, y2 } = blockRows(x),
    rows = Array.from({ length: y2 - y1 + 1 }, (_, i) => y1 + i),
    ys = rows.map(r => r - Math.round(blockHeightAt(c, x, r)));
  return rows.flatMap((row, i) => {
    const y = ys[i] ?? row,
      from = Math.min(y, i ? (ys[i - 1] ?? y) + 1 : y);
    return Array.from({ length: y - from + 1 }, (_, j) => ({ y: from + j, row }));
  });
};

/**
 * How far a top falls to the right and towards the viewer, as the light on it counts it (as tiles.js counts it
 * between neighbours, two tiles apart).
 * @param {Corners} c
 */
const blockFall = c => c.n + c.w - c.e - c.s + 0.5 * (c.w + c.s - c.n - c.e);

/**
 * @typedef {{ a: number, b: number, height: number, water: boolean, relief: unknown, cover: number }} BlockTile
 * @typedef {{ top: Corners, floor: Corners, depth: number, kind: string, openLeft: boolean, openRight: boolean }} BlockShape
 */

/**
 * Each tile's shape in an n × n square. Low land by water slopes down to it at the corners it shares with the
 * water. The sea floor is one sheet: each corner of it lies as deep as the water round it, and just under the
 * surface where it meets the land. A
 * side of water shows only where no water stands in front of it.
 * @template {BlockTile} T
 * @param {readonly T[]} tiles
 * @param {number} n
 * @param {(cover: number) => string} coverName
 * @param {(cover: number) => boolean} ramps whether ground of this cover may slope (not ice)
 * @returns {(T & BlockShape)[]}
 */
const blockShapes = (tiles, n, coverName, ramps) => {
  const at = new Map(tiles.map(t => [t.a + t.b * n, t])),
    tileAt = (/** @type {number} */ a, /** @type {number} */ b) =>
      a >= 0 && a < n && b >= 0 && b < n ? at.get(a + b * n) : undefined,
    // The tiles that share the corner at (a, b) of the square.
    sharing = (/** @type {number} */ a, /** @type {number} */ b) =>
      [tileAt(a - 1, b - 1), tileAt(a, b - 1), tileAt(a - 1, b), tileAt(a, b)].filter(t => t !== undefined),
    corners = (/** @type {T} */ t, /** @type {(q: T[]) => number} */ height) => ({
      n: height(sharing(t.a, t.b)),
      e: height(sharing(t.a + 1, t.b)),
      s: height(sharing(t.a + 1, t.b + 1)),
      w: height(sharing(t.a, t.b + 1)),
    }),
    wet = (/** @type {T | undefined} */ t) => !!t?.water,
    depthOf = (/** @type {T} */ t) => WATER_DEPTH[/** @type {keyof typeof WATER_DEPTH} */ (coverName(t.cover))] ?? 3;
  return tiles.map(t => {
    const depth = t.water ? depthOf(t) : 0,
      slopes = !t.water && !t.relief && t.height <= RAMP_MAX && ramps(t.cover),
      top = slopes ? corners(t, q => Math.min(t.height, ...q.filter(wet).map(w => w.height))) : flatCorners(t.height),
      floor = t.water
        ? corners(t, q => t.height - (q.every(wet) ? q.reduce((d, w) => d + depthOf(w), 0) / q.length : 1))
        : flatCorners(t.height);
    return {
      ...t,
      top,
      floor,
      depth,
      kind: coverName(t.cover),
      openLeft: !wet(tileAt(t.a, t.b + 1)),
      openRight: !wet(tileAt(t.a + 1, t.b)),
    };
  });
};

/**
 * A number from 0 to 1 that is always the same for a texel and a slot, so details stay put between redraws.
 * @param {number} i
 * @param {number} k
 */
const blockHash = (i, k) => (((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1) + 1) % 1;

/**
 * A little light and shade on a texel's top in 2×2 cells, so the ground reads as ground.
 * @param {number} i
 * @returns {(x: number, row: number) => number}
 */
const blockNoise = i => (x, row) => {
  const n = blockHash(i, ((x >> 1) + 8 * (row >> 1)) | 0);
  return n < 0.2 ? 0.93 : n > 0.85 ? 1.06 : 1;
};

/**
 * A spot on a top, away from its edges, at the top's height there: the same one for a texel and a slot.
 * @param {Corners} c
 * @param {number} i the texel
 * @param {number} s the slot
 * @returns {[number, number]}
 */
const blockSpot = (c, i, s) => {
  const x = 3 + Math.floor(blockHash(i, s) * (BLOCK_W - 6)),
    w = Math.max(0, BLOCK_H / 2 - 1 - Math.abs(x + 0.5 - BLOCK_W / 2) / 2), // the diamond's half height at x
    y = Math.round(BLOCK_H / 2 - w + 1 + blockHash(i, s + 1) * Math.max(0, 2 * w - 2));
  return [x, y - Math.round(blockHeightAt(c, x, y))];
};

const TileBlocks = Object.freeze({
  W: BLOCK_W,
  H: BLOCK_H,
  rows: blockRows,
  column: blockColumn,
  heightAt: blockHeightAt,
  fall: blockFall,
  shapes: blockShapes,
  spot: blockSpot,
  hash: blockHash,
  noise: blockNoise,
});

// oxlint-disable-next-line fp/no-mutating-methods -- the one way a classic script hands itself to Node
if (typeof module !== 'undefined') Object.assign(module, { exports: TileBlocks }); // for Node (tests)
