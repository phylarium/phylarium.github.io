// Who lives on a square of the map. The close-up of the planet (the tile view) shows one square per map texel,
// and a living species has homes on the squares whose climate suits it. Which square is whose is fixed by the
// world's seed, so a creature found once is still there the next time the square is opened.

/**
 * A living species as this rule sees it.
 * @typedef {object} Dweller
 * @property {string} id
 * @property {number} mask the climate zones it lives in, as bits (Terrain.ZONE_BIT)
 * @property {number} share how much of its home it fills, 0 to 1: more of it means more squares
 */

/** About one square in five of a species' home ground has someone on it when the planet is full of life. */
const DENSITY = 0.22;

/** A number from 0 to 1 that is always the same for the same square, seed and purpose. @param {number} n */
const unit = n => {
  const a = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d),
    b = Math.imul(a ^ (a >>> 12), 0x297a2d39);
  return ((b ^ (b >>> 15)) >>> 0) / 2 ** 32;
};

/**
 * The species living on a square, or none.
 * @param {number} texel the square's number on the map
 * @param {number} zones the climate zones of the square, as bits
 * @param {readonly Dweller[]} living the species alive now
 * @param {number} seed the world's seed
 * @returns {string | undefined}
 */
export const dweller = (texel, zones, living, seed) => {
  const here = living.filter(one => (one.mask & zones) !== 0 && one.share > 0);
  // The square always asks for the same one of the species at home here; that one is in when enough of it lives.
  const pick = here[Math.floor(unit(seed ^ Math.imul(texel + 1, 0x9e3779b1)) * here.length)];
  const roll = unit(seed ^ Math.imul(texel + 7, 0x85ebca6b));
  return pick && roll < DENSITY * Math.min(1, pick.share * 2) ? pick.id : undefined;
};

// Animals are rarer than plants and live as they do in nature: alone, in pairs, or in groups (a herd, a pride, a
// flock, a school) on squares next to each other. The map is cut into ranges RANGE squares wide; nearly one range in
// two holds one group of one species, which wanders a little from day to day.

/**
 * How a species lives, and how many of it are seen together.
 * @typedef {'solitary' | 'pair' | 'pack' | 'pride' | 'herd' | 'flock' | 'school' | 'troop' | 'colony' | 'pod'} Group
 */
/** @type {Readonly<Record<Group, readonly [number, number]>>} */
export const GROUP_SIZE = Object.freeze({
  solitary: [1, 1],
  pair: [2, 2],
  pack: [3, 6],
  pride: [3, 5],
  herd: [4, 9],
  flock: [4, 9],
  school: [4, 9],
  troop: [3, 6],
  colony: [3, 7],
  pod: [2, 4],
});
const RANGE = 6,
  GROUP_CHANCE = 0.45,
  ROAM = 2; // how far a group's middle strays from its range's middle

/**
 * A living animal as this rule sees it.
 * @typedef {object} Herd
 * @property {string} id
 * @property {number} share how much of its home it fills, 0 to 1: more of it means more ranges
 * @property {Group} group
 */
/**
 * The world the groups live in.
 * @typedef {object} Range
 * @property {number} seed the world's seed
 * @property {number} day the game day: groups move from one day to the next
 * @property {number} width squares round the planet (u wraps, v does not)
 * @property {readonly Herd[]} living the animals alive now
 * @property {(id: string, u: number, v: number) => boolean} fits whether a square is home to a species
 */

/** The same number from 0 to 1 for the same numbers. @param {number[]} ns */
const unitOf = (...ns) => unit(ns.reduce((h, n) => Math.imul(h ^ (n | 0), 0x9e3779b1) ^ (h >>> 13), 0x2545f491));

/** The squares near a group's middle, nearest (with some scatter) first. @param {number} salt */
const nearOffsets = salt =>
  Array.from({ length: 25 }, (_, k) => ({ du: (k % 5) - 2, dv: Math.floor(k / 5) - 2 }))
    .map(o => ({ ...o, d: Math.hypot(o.du, o.dv) + unitOf(salt, o.du, o.dv) * 1.6 }))
    .toSorted((a, b) => a.d - b.d);

/**
 * The group living in a range, or none: its species and the squares it stands on today.
 * @param {number} ru @param {number} rv the range
 * @param {Range} world
 */
export const groupIn = (ru, rv, world) => {
  const salt = unitOf(world.seed, ru, rv) * 2 ** 31,
    mu = ru * RANGE + RANGE / 2,
    mv = rv * RANGE + RANGE / 2,
    here = world.living.filter(one => one.share > 0 && world.fits(one.id, mu % world.width, mv)),
    one = here[Math.floor(unitOf(salt, 1) * here.length)];
  if (!one || unitOf(salt, 2) >= GROUP_CHANCE * Math.min(1, one.share * 2)) return undefined;
  const [lo, hi] = GROUP_SIZE[one.group] ?? GROUP_SIZE.solitary,
    n = lo + Math.floor(unitOf(salt, 3) * (hi - lo + 1)),
    cu = mu + Math.round((unitOf(salt, 4, world.day) * 2 - 1) * ROAM),
    cv = mv + Math.round((unitOf(salt, 5, world.day) * 2 - 1) * ROAM);
  return {
    id: one.id,
    squares: nearOffsets(salt + world.day)
      .slice(0, n)
      .map(o => ({ u: (((cu + o.du) % world.width) + world.width) % world.width, v: cv + o.dv }))
      .filter(sq => world.fits(one.id, sq.u, sq.v)),
  };
};

/**
 * The animal standing on a square today, or none.
 * @param {number} u @param {number} v the square
 * @param {Range} world
 * @returns {string | undefined}
 */
export const animalAt = (u, v, world) => {
  const ru = Math.floor(u / RANGE),
    rv = Math.floor(v / RANGE),
    ranges = Math.ceil(world.width / RANGE);
  return [-1, 0, 1]
    .flatMap(dv => [-1, 0, 1].map(du => ({ ru: (((ru + du) % ranges) + ranges) % ranges, rv: rv + dv })))
    .map(r => groupIn(r.ru, r.rv, world))
    .find(g => g?.squares.some(sq => sq.u === u && sq.v === v))?.id;
};
