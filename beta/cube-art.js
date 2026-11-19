'use strict';

// One square of the close-up (tiles.js) as a block of the world of its own, lifted out: as tall as it is wide
// and deep. Water is a tank, see-through over its floor; land is a block of soil and rock under its ground, with
// its trees or grass on top; a mountain steps up from its top. cube.js shows it and puts who lives there in it.
// Pure: what the square is in, pixels out (relative to the canvas), colors packed as the canvas stores them.
// Loads after tile-paint.js.

/** The block: its top a diamond `w` wide, its sides `side` tall, `floor` rows of ground under water; room above. */
const CUBE = Object.freeze({ w: 48, side: 24, floor: 6, room: 40, margin: 4 });
const CUBE_LEFT = CUBE.margin,
  CUBE_TOP = CUBE.room;
/** The canvas it is drawn on. */
const CUBE_SIZE = Object.freeze({ w: CUBE.w + 2 * CUBE.margin, h: CUBE.room + CUBE.w / 2 + CUBE.side + CUBE.margin });

/**
 * A pixel, opaque or (with `a`) mixed over what is under it.
 * @typedef {{ x: number, y: number, color: number, a?: number }} CubePixel
 */
/**
 * What a square is, for its block: `top` its ground's or its water's color, `under` and `side` its soil's, `lip`
 * how many rows of its ground show on the sides before the soil, `steps` how many steps of mountain stand on it.
 * @typedef {{ water: boolean, name: string, seed: number, light: number, top: number, side: number, under: number,
 *   lip: number, steps: number, peak: number }} CubeSquare
 */

/** @param {number} n */
const cubeCount = n => Array.from({ length: Math.max(0, n) }, (_, i) => i);
/** @param {number} x @param {number} w a multiple of 4 */
const cubeRows = (x, w) => {
  const e = Math.floor(Math.min(x, w - 1 - x) / 2);
  return { y1: w / 4 - 1 - e, y2: w / 4 + e };
};
const CUBE_ROCK = [0x4a, 0x40, 0x38],
  CUBE_SAND = [0xb8, 0xa0, 0x70],
  CUBE_CORAL = [
    [0xe8, 0x70, 0x80],
    [0xf0, 0xa0, 0x50],
    [0xc0, 0x60, 0xc0],
  ];

/**
 * A box: its top a diamond `w` wide, left edge at ox and top corner at oy, and its sides `h` tall.
 * @param {number} ox
 * @param {number} oy
 * @param {{ w: number, h: number }} size
 * @param {{ top: (x: number, y: number) => number, side: (d: number, right: boolean) => number }} paint
 * @returns {CubePixel[]}
 */
const cubeBox = (ox, oy, { w, h }, paint) =>
  cubeCount(w).flatMap(x => {
    const { y1, y2 } = cubeRows(x, w);
    return [
      ...cubeCount(y2 - y1 + 1).map(j => ({ x: ox + x, y: oy + y1 + j, color: paint.top(x, y1 + j) })),
      ...cubeCount(h).map(d => ({ x: ox + x, y: oy + y2 + 1 + d, color: paint.side(d, x >= w / 2) })),
    ];
  });

/** The sun is to the right: the right sides are lit, the left in shade. @param {boolean} right @param {number} d */
const cubeLight = (right, d) => (right ? 0.86 : 0.66) * (d === 0 ? (right ? 1.05 : 0.95) : 1);

/**
 * The sides of a block of ground: its ground for `lip` rows, then soil, then rock, in bands.
 * @param {CubeSquare} sq
 * @returns {(d: number, right: boolean) => number}
 */
const cubeGroundSides = sq => (d, right) => {
  const base =
      d < sq.lip ? sq.side : d < CUBE.side * 0.55 ? sq.under : TilePaint.pack(CUBE_ROCK.map(v => v * sq.light)),
    band = d >= sq.lip && Math.floor(d / 4) % 2 === 1;
  return TilePaint.scale(base, cubeLight(right, d) * (band ? 0.93 : 1));
};

/**
 * A little light and shade in 2×2 cells on a top.
 * @param {number} color
 * @param {number} seed
 * @returns {(x: number, y: number) => number}
 */
const cubeSpeckled = (color, seed) => (x, y) => {
  const n = TileBlocks.hash(seed, (x >> 1) + 32 * (y >> 1));
  return n < 0.2 ? TilePaint.scale(color, 0.93) : n > 0.85 ? TilePaint.scale(color, 1.06) : color;
};

/**
 * A place on the block's top, the same for a square and a slot: away from its edges.
 * @param {number} seed
 * @param {number} s
 */
const cubeSpot = (seed, s) => {
  const a = 0.14 + 0.72 * TileBlocks.hash(seed, s),
    b = 0.14 + 0.72 * TileBlocks.hash(seed, s + 1);
  return {
    x: CUBE_LEFT + Math.round(CUBE.w / 2 + ((a - b) * CUBE.w) / 2),
    y: CUBE_TOP + Math.round(((a + b) * CUBE.w) / 4),
  };
};

/** What grows on each kind of ground, and how much of it. */
const CUBE_GROWTH = {
  FOREST: { trees: 14, tufts: 4 },
  WETLAND: { trees: 2, tufts: 8 },
  SAVANNA: { flat: 2, tufts: 8 },
  GRASS: { tufts: 16 },
  TUNDRA: { tufts: 5, stones: 4 },
  ROCK: { stones: 6 },
  MOUNTAIN: { stones: 6 },
  BARE: { stones: 4 },
  SAND: { specks: 10 },
};

/**
 * Trees, grass and stones on a block's top, back to front.
 * @param {CubeSquare} sq
 * @returns {CubePixel[]}
 */
const cubeGrowth = sq => {
  const g = /** @type {{ trees?: number, flat?: number, tufts?: number, stones?: number, specks?: number }} */ (
      CUBE_GROWTH[/** @type {keyof typeof CUBE_GROWTH} */ (sq.name)] ?? {}
    ),
    stone = TilePaint.pack([0x8a, 0x80, 0x76].map(v => v * sq.light)),
    at = (/** @type {number} */ s, /** @type {{ x: number, y: number, color: number }[]} */ pixels) => {
      const p = cubeSpot(sq.seed, s);
      return { y: p.y, pixels: pixels.map(q => ({ x: p.x + q.x, y: p.y + q.y, color: q.color })) };
    },
    tuft = [
      { x: 0, y: -1, color: TilePaint.scale(sq.top, 1.22) },
      { x: -1, y: 0, color: TilePaint.scale(sq.top, 0.8) },
      { x: 1, y: 0, color: TilePaint.scale(sq.top, 0.8) },
    ];
  return [
    ...cubeCount(g.trees ?? 0).map(s =>
      at(s * 3, TilePaint.tree(TileBlocks.hash(sq.seed, s + 50) < 0.5 ? 'small' : 'round', sq.top)),
    ),
    ...cubeCount(g.flat ?? 0).map(s => at(100 + s * 3, TilePaint.tree('flat', sq.top))),
    ...cubeCount(g.tufts ?? 0).map(s => at(200 + s * 3, tuft)),
    ...cubeCount(g.stones ?? 0).map(s =>
      at(300 + s * 3, [
        { x: 0, y: 0, color: TilePaint.scale(stone, 1.1) },
        { x: 1, y: 0, color: TilePaint.scale(stone, 0.8) },
      ]),
    ),
    ...cubeCount(g.specks ?? 0).map(s => at(400 + s * 3, [{ x: 0, y: 0, color: TilePaint.scale(sq.top, 0.86) }])),
  ]
    .toSorted((p, q) => p.y - q.y)
    .flatMap(p => p.pixels);
};

/**
 * A block of ground, with what grows on it and the steps of its mountain.
 * @param {CubeSquare} sq
 * @returns {CubePixel[]}
 */
const cubeLand = sq => [
  ...cubeBox(
    CUBE_LEFT,
    CUBE_TOP,
    { w: CUBE.w, h: CUBE.side },
    { top: cubeSpeckled(sq.top, sq.seed), side: cubeGroundSides(sq) },
  ),
  ...(sq.steps ? [] : cubeGrowth(sq)),
  ...cubeCount(sq.steps).flatMap(k => {
    const w = CUBE.w - 12 * (k + 1),
      last = k === sq.steps - 1;
    return cubeBox(
      CUBE_LEFT + (CUBE.w - w) / 2,
      CUBE_TOP + CUBE.w / 4 - 8 * (k + 1) - w / 4,
      { w, h: 8 },
      {
        top: cubeSpeckled(last ? sq.peak : sq.top, sq.seed + k),
        side: (d, right) => TilePaint.scale(sq.side, cubeLight(right, d)),
      },
    );
  }),
];

/**
 * A tank of water, in three layers: `back` (its far walls and its floor, with coral on a reef), and `front` and
 * `top`, see-through, to lay over what swims in it. `now` (ms) makes the glints on its surface come and go.
 * @param {CubeSquare} sq
 * @param {number} now
 */
const cubeWater = (sq, now) => ({ back: cubeTankBack(sq), ...cubeTankFront(sq, now) });

/** The floor of a tank: sand in the shallows, rock in the deep. @param {CubeSquare} sq */
const cubeTankGround = sq => TilePaint.pack((sq.name === 'DEEP' ? CUBE_ROCK : CUBE_SAND).map(v => v * sq.light));

/**
 * A tank's far walls, darker the deeper, and its floor, with coral on a reef.
 * @param {CubeSquare} sq
 * @returns {CubePixel[]}
 */
const cubeTankBack = sq => {
  const deep = CUBE.side - CUBE.floor,
    ground = cubeTankGround(sq),
    coral = sq.name === 'REEF' ? CUBE_CORAL : sq.name === 'BLEACHED' ? [[0xe8, 0xe8, 0xe0]] : [];
  const walls = cubeCount(CUBE.w).flatMap(x => {
    const { y1 } = cubeRows(x, CUBE.w);
    return cubeCount(deep + 1).map(d => ({
      x: CUBE_LEFT + x,
      y: CUBE_TOP + y1 + d,
      color: TilePaint.scale(sq.top, 0.55 - (0.2 * d) / deep),
    }));
  });
  const floor = cubeBox(
      CUBE_LEFT,
      CUBE_TOP + deep,
      { w: CUBE.w, h: 0 },
      { top: cubeSpeckled(ground, sq.seed), side: () => 0 },
    ),
    corals = cubeCount(coral.length * 4).flatMap(s => {
      const p = cubeSpot(sq.seed, 60 + s * 3),
        c = TilePaint.pack((coral[s % coral.length] ?? CUBE_SAND).map(v => v * sq.light));
      return cubeCount(2 + (s % 3)).map(h => ({ x: p.x + (h === 2 ? 1 : 0), y: p.y + deep - h, color: c }));
    });
  return [...walls, ...floor, ...corals];
};

/**
 * A tank's near sides, see-through down to its floor, and its surface with its rim and glints.
 * @param {CubeSquare} sq
 * @param {number} now
 * @returns {{ front: CubePixel[], top: CubePixel[] }}
 */
const cubeTankFront = (sq, now) => {
  const deep = CUBE.side - CUBE.floor,
    ground = cubeTankGround(sq),
    tick = Math.floor(now / 400);
  const front = cubeCount(CUBE.w).flatMap(x => {
    const { y2 } = cubeRows(x, CUBE.w),
      right = x >= CUBE.w / 2;
    return cubeCount(CUBE.side).map(d =>
      d < deep
        ? { x: CUBE_LEFT + x, y: CUBE_TOP + y2 + 1 + d, color: TilePaint.scale(sq.top, right ? 0.95 : 0.78), a: 0.5 }
        : {
            x: CUBE_LEFT + x,
            y: CUBE_TOP + y2 + 1 + d,
            color: TilePaint.scale(
              d === deep ? ground : TilePaint.pack(CUBE_ROCK.map(v => v * sq.light)),
              cubeLight(right, d),
            ),
          },
    );
  });
  const top = cubeCount(CUBE.w).flatMap(x => {
    const { y1, y2 } = cubeRows(x, CUBE.w);
    return cubeCount(y2 - y1 + 1).map(j => ({
      x: CUBE_LEFT + x,
      y: CUBE_TOP + y1 + j,
      color: TilePaint.scale(sq.top, j === 0 || y1 + j === y2 ? 1.45 : 1.15),
      a: j === 0 || y1 + j === y2 ? 0.7 : 0.3,
    }));
  });
  const glints = cubeCount(6)
    .filter(s => TileBlocks.hash(sq.seed, s + tick * 7) > 0.45)
    .flatMap(s => {
      const p = cubeSpot(sq.seed + tick, 500 + s * 3);
      return [0, 1].map(dx => ({ x: p.x + dx, y: p.y, color: TilePaint.scale(sq.top, 1.6) }));
    });
  return { front, top: [...top, ...glints] };
};

/**
 * Where who lives in the square is drawn, by the foot of its picture: on the ground of the block; on the floor of
 * a tank; or, for one that swims, the `n`th of a few swimming round the middle of the tank, facing where it goes.
 * @param {'ground' | 'floor' | 'swim'} way
 * @param {number} n
 * @param {number} now
 */
const cubePlace = (way, n, now) => {
  const mid = { x: CUBE_LEFT + CUBE.w / 2, y: CUBE_TOP + CUBE.w / 4 };
  if (way === 'ground') return { ...mid, y: mid.y + 4, flip: false };
  if (way === 'floor') return { x: mid.x + (n - 1) * 9, y: mid.y + CUBE.side - CUBE.floor + 4 - n * 2, flip: false };
  const t = now / 1000 + n * 2.1,
    a = 0.5 + 0.32 * Math.sin(t * 0.7),
    b = 0.5 + 0.22 * Math.sin(t * 0.45 + n),
    // How a and b change, for which way it faces: across the screen, x grows with a and falls with b.
    dx = 0.32 * 0.7 * Math.cos(t * 0.7) - 0.22 * 0.45 * Math.cos(t * 0.45 + n);
  return {
    x: Math.round(CUBE_LEFT + CUBE.w / 2 + ((a - b) * CUBE.w) / 2),
    y: Math.round(CUBE_TOP + ((a + b) * CUBE.w) / 4 + 6 + 3 * n),
    flip: dx > 0,
  };
};

const CubeArt = Object.freeze({
  size: CUBE_SIZE,
  land: cubeLand,
  water: cubeWater,
  place: cubePlace,
  mix: TilePaint.mix,
});

// oxlint-disable-next-line fp/no-mutating-methods -- the one way a classic script hands itself to Node
if (typeof module !== 'undefined') Object.assign(module, { exports: CubeArt }); // for Node (tests)
