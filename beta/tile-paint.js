'use strict';

// The tile view's pixels (tiles.js sets them): a block's top and sides, the sea floor with its coral, water
// mixed over what lies under it, and little trees, all from the shapes in tile-blocks.js. Pure: colors and
// shapes in, lists of pixels out. Colors are packed as the canvas stores them. Loads after tile-blocks.js.

/**
 * One pixel of a block, a sheet of water or a tree, from its origin.
 * @typedef {{ x: number, y: number, color: number }} BlockPixel
 */

/**
 * A color packed as the canvas stores it (alpha, blue, green, red from the top byte down).
 * @param {readonly number[]} rgb
 */
const packColor = rgb => {
  const c = (/** @type {number | undefined} */ x) => Math.max(0, Math.min(255, Math.round(x ?? 0)));
  return ((255 << 24) | (c(rgb[2]) << 16) | (c(rgb[1]) << 8) | c(rgb[0])) >>> 0;
};
/** @param {number} p */
const unpackColor = p => [p & 255, (p >>> 8) & 255, (p >>> 16) & 255];
/** @param {number} p @param {number} f */
const scaleColor = (p, f) => packColor(unpackColor(p).map(x => Math.round(x * f)));
/**
 * What shows through water: `p` under it, `q` the water, `a` how much of the water.
 * @param {number} p @param {number} q @param {number} a
 */
const mixColor = (p, q, a) => {
  const w = unpackColor(q);
  return packColor(unpackColor(p).map((x, i) => x * (1 - a) + (w[i] ?? 0) * a));
};

/**
 * A block: its top, and its sides down to `slab` below the water line, lit on the right (the sun is to the right)
 * and in shade on the left, in bands of rock and soil level all round. `lip` rows of `side` come before `under`.
 * @param {Corners} c
 * @param {{ top: number, side: number, lip: number, under: number, openLeft?: boolean, openRight?: boolean }} paint
 *   which sides show (both unless said: a floor's do only where no water stands in front)
 * @param {(x: number, row: number) => number} shade the light on the top at a pixel, about 1
 * @param {number} slab
 * @returns {BlockPixel[]}
 */
const blockPixels = (c, paint, shade, slab) =>
  Array.from({ length: TileBlocks.W }, (_, x) => x).flatMap(x => {
    const column = TileBlocks.column(c, x),
      { y2 } = TileBlocks.rows(x),
      light = x >= TileBlocks.W / 2 ? 0.86 : 0.66,
      edge = x >= TileBlocks.W / 2 ? 1.05 : 0.95,
      from = (column.at(-1)?.y ?? y2) + 1;
    const top = column.map(({ y, row }) => {
      const f = shade(x, row);
      return { x, y, color: f === 1 ? paint.top : scaleColor(paint.top, f) };
    });
    const shown = x >= TileBlocks.W / 2 ? (paint.openRight ?? true) : (paint.openLeft ?? true),
      sides = Array.from({ length: shown ? Math.max(0, slab + y2 - from + 1) : 0 }, (_, d) => {
        const y = from + d,
          band = d >= paint.lip && Math.floor((y2 - y) / 4) % 2 !== 0;
        return {
          x,
          y,
          color: scaleColor(
            d < paint.lip ? paint.side : paint.under,
            (d === 0 ? light * edge : light) * (band ? 0.93 : 1),
          ),
        };
      });
    return [...top, ...sides];
  });

/** What water lies over where nothing was drawn yet: dark rock. */
const WATER_BED = packColor([0x25, 0x20, 0x1c]);

/**
 * A sheet of water at its tile's height, and its sides down to the floor where no water stands in front, mixed
 * over what is drawn under them already; the deeper, the less of that shows.
 * @param {{ height: number, depth: number, floor: Corners, openLeft: boolean, openRight: boolean }} t
 * @param {number} top the water's color
 * @param {(x: number, y: number) => number} under the color drawn at a pixel so far, 0 for none
 * @returns {BlockPixel[]}
 */
const waterPixels = (t, top, under) =>
  Array.from({ length: TileBlocks.W }, (_, x) => x).flatMap(x => {
    const { y1, y2 } = TileBlocks.rows(x),
      open = x >= TileBlocks.W / 2 ? t.openRight : t.openLeft,
      // Where water goes on in front, its sheet starts on this one's front edge: leave that row to it.
      low = open ? y2 - Math.round(TileBlocks.heightAt(t.floor, x, y2)) : y2 - 1 - t.height,
      side = scaleColor(top, x >= TileBlocks.W / 2 ? 0.86 : 0.7),
      a = 0.55 + t.depth * 0.05;
    return Array.from({ length: Math.max(0, low - y1 + t.height + 1) }, (_, j) => {
      const y = y1 - t.height + j;
      return { x, y, color: mixColor(under(x, y) || WATER_BED, y > y2 - t.height ? side : top, a) };
    });
  });

/** The floor under water: sand in the shallows, rock in the deep; and the coral growing on a reef. */
const SEA_SAND = [0xb8, 0xa0, 0x70],
  SEA_ROCK = [0x4a, 0x40, 0x38],
  CORAL = {
    REEF: [
      [0xe8, 0x70, 0x80],
      [0xf0, 0xa0, 0x50],
      [0xc0, 0x60, 0xc0],
    ],
    BLEACHED: [[0xe8, 0xe8, 0xe0]],
  };

/**
 * The floor of a water tile, in the light of the hour, with its coral.
 * @param {{ i: number, floor: Corners, depth: number, kind: string, openLeft: boolean, openRight: boolean }} t
 * @param {number} light
 * @param {(x: number, row: number) => number} shade
 * @param {number} slab
 * @returns {BlockPixel[]}
 */
const floorPixels = (t, light, shade, slab) => {
  const top = packColor((t.depth > 5 ? SEA_ROCK : SEA_SAND).map(x => x * light)),
    coral = CORAL[/** @type {keyof typeof CORAL} */ (t.kind)] ?? [],
    open = { openLeft: t.openLeft, openRight: t.openRight };
  return [
    ...blockPixels(t.floor, { top, side: scaleColor(top, 0.8), lip: 99, under: top, ...open }, shade, slab),
    ...Array.from({ length: coral.length * 2 }, (_, s) => {
      const [x, y] = TileBlocks.spot(t.floor, t.i, 60 + s * 7),
        rgb = coral[s % coral.length] ?? SEA_SAND;
      return [
        { x, y, color: packColor(rgb.map(v => v * light)) },
        { x: x + (s & 1), y: y - 1, color: packColor(rgb.map(v => v * light * 1.15)) },
      ];
    }).flat(),
  ];
};

/** Little trees on the land, foot at the bottom: a and b leaves in shade and in light, c a flat crown, t trunk. */
const TREES = {
  round: ['..aa..', '.aabb.', 'aaabbb', 'aaabbb', '.aabb.', '..tt..'],
  small: ['.ab.', 'aabb', 'aabb', '.tt.'],
  flat: ['.c.c.', 'ccccc', '..t..', '..t..', '..t..'],
};
const TREE_TRUNK = packColor([0x5a, 0x3e, 0x2a]);

/**
 * A tree of this kind in this leaf color, standing at its origin.
 * @param {keyof typeof TREES} kind
 * @param {number} leaf
 * @returns {BlockPixel[]}
 */
const treePixels = (kind, leaf) => {
  const rows = TREES[kind],
    w = rows[0]?.length ?? 0,
    color = { a: scaleColor(leaf, 0.72), b: scaleColor(leaf, 1.12), c: scaleColor(leaf, 0.75), t: TREE_TRUNK };
  return rows.flatMap((row, r) =>
    [...row].flatMap((ch, dx) =>
      ch in color
        ? [{ x: dx - (w >> 1), y: r - rows.length + 1, color: color[/** @type {keyof typeof color} */ (ch)] }]
        : [],
    ),
  );
};

const TilePaint = Object.freeze({
  block: blockPixels,
  water: waterPixels,
  floor: floorPixels,
  tree: treePixels,
  pack: packColor,
  scale: scaleColor,
  mix: mixColor,
});

// oxlint-disable-next-line fp/no-mutating-methods -- the one way a classic script hands itself to Node
if (typeof module !== 'undefined') Object.assign(module, { exports: TilePaint }); // for Node (tests)
