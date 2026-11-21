// The raid's field (src/core/humans/raid.js): a road that winds from the top of the screen to the village at the
// bottom, the spots beside it where people stand, the creatures that walk it and what people fight them with.

/** Cells across and down. The village is at the bottom, below the last row. */
export const RAID_W = 7,
  RAID_H = 12;

/** @typedef {{ x: number, y: number }} Point */
/** The road's corners, in cells: it comes in at the top and ends at the village. @type {readonly Point[]} */
export const ROAD = [
  { x: 3, y: -1 },
  { x: 3, y: 2 },
  { x: 1, y: 2 },
  { x: 1, y: 5 },
  { x: 5, y: 5 },
  { x: 5, y: 8 },
  { x: 2, y: 8 },
  { x: 2, y: 10 },
  { x: 3, y: 10 },
  { x: 3, y: 12 },
];

const legs = ROAD.slice(1).map((p, n) => {
  const from = ROAD[n] ?? p;
  return { from, to: p, len: Math.abs(p.x - from.x) + Math.abs(p.y - from.y) };
});
/** How long the road is, in cells. */
export const ROAD_LEN = legs.reduce((s, l) => s + l.len, 0);

/** The point a distance d along the road. @param {number} d @returns {Point} */
export const roadAt = d => {
  /** @type {(rest: number, n: number) => Point} */
  const along = (rest, n) => {
    const leg = legs[n];
    if (!leg) return ROAD.at(-1) ?? { x: 0, y: 0 };
    if (rest > leg.len && n < legs.length - 1) return along(rest - leg.len, n + 1);
    const f = Math.min(1, Math.max(0, rest / leg.len));
    return { x: leg.from.x + (leg.to.x - leg.from.x) * f, y: leg.from.y + (leg.to.y - leg.from.y) * f };
  };
  return along(d, 0);
};

/** The road's points, a quarter of a cell apart. */
const SAMPLES = Array.from({ length: ROAD_LEN * 4 + 1 }, (_, n) => roadAt(n / 4));
const ROAD_CELLS = new Set(SAMPLES.map(p => `${Math.round(p.x)},${Math.round(p.y)}`));
/** Whether a cell is on the road. @param {number} x @param {number} y */
export const onRoad = (x, y) => ROAD_CELLS.has(`${x},${y}`);

/** The spots beside the road where people can stand, by number. @type {readonly Point[]} */
export const SPOTS = Array.from({ length: RAID_W * RAID_H }, (_, n) => ({ x: n % RAID_W, y: Math.floor(n / RAID_W) }))
  .filter(p => !onRoad(p.x, p.y))
  .filter(p => SAMPLES.some(s => Math.max(Math.abs(s.x - p.x), Math.abs(s.y - p.y)) <= 1));

/** @typedef {'stones' | 'torch' | 'spear'} Defender */
/**
 * What people fight with: the building that opens it (none for stones), what it costs in hands, its reach in
 * cells, how hard it hits, seconds between blows, and whether it hits everything in reach (fire) or one.
 * @type {Readonly<Record<Defender, { needs: string | null, cost: number, reach: number, hit: number, every: number, all: boolean, icon: string }>>}
 */
export const DEFENDERS = Object.freeze({
  stones: { needs: null, cost: 2, reach: 1.6, hit: 2, every: 0.8, all: false, icon: 'rockPile' },
  torch: { needs: 'firepit', cost: 4, reach: 1.3, hit: 2, every: 0.7, all: true, icon: 'campfire' },
  spear: { needs: 'spearmaker', cost: 5, reach: 2.6, hit: 8, every: 1.2, all: false, icon: 'spear' },
});
/** @type {readonly Defender[]} */
export const DEFENDER_ORDER = ['stones', 'torch', 'spear'];

/**
 * The creatures that walk the road: blows they take, cells a second, bites they take out of the village when
 * they reach it, and the hands a people gain for each one killed.
 * @type {Readonly<Record<string, { hp: number, speed: number, bite: number, bounty: number }>>}
 */
export const CREATURES = Object.freeze({
  spider: { hp: 4, speed: 1.1, bite: 1, bounty: 0.5 },
  scorpion: { hp: 7, speed: 0.9, bite: 1, bounty: 0.5 },
  snake: { hp: 9, speed: 1.3, bite: 1, bounty: 1 },
  wolf: { hp: 12, speed: 1.9, bite: 2, bounty: 1 },
  boar: { hp: 24, speed: 1.2, bite: 2, bounty: 1.5 },
  bear: { hp: 45, speed: 0.8, bite: 3, bounty: 2 },
  bigcat: { hp: 34, speed: 1.8, bite: 3, bounty: 2 },
  elephant: { hp: 110, speed: 0.6, bite: 5, bounty: 3 },
});

/** How much of the road each spot reaches with each defender: the stretch it can hit, in road points. */
export const COVERAGE = Object.freeze(
  SPOTS.map(p =>
    Object.fromEntries(
      DEFENDER_ORDER.map(kind => [
        kind,
        SAMPLES.filter(s => Math.hypot(s.x - p.x, s.y - p.y) <= DEFENDERS[kind].reach).length,
      ]),
    ),
  ),
);
