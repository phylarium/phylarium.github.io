// The camp's square (src/core/humans/camp.js): its squares, how far apart they are, its numbers, and luck.

/** Squares along each side of the close-up (as in tiles.js). */
export const CAMP_N = 9;

/** @typedef {'water' | 'rock' | 'forest' | 'open'} Ground */

export const START_WOOD = 4,
  WOOD_MAX = 20,
  WOOD_PER_DAY = 0.25, // a day, for each forest square within reach of a hut
  REACH = 2, // how far a hut reaches for wood, and for building next to it
  THROW = 3, // and with a spear, once Spears is known
  SPEAR_S = 1, // seconds between a hut's throws
  FENCE_HP = 3, // bites a fence takes before it breaks
  RAIDS = 0.6; // raiders a night for each taken² / land

/** Luck from 0 to 1, the same for the same seed and draw. */
export const luck = (/** @type {number} */ seed, /** @type {number} */ n) => {
  const h = Math.imul(seed ^ Math.imul(n + 1, 0x9e3779b1), 0x85ebca6b) >>> 0,
    m = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((m ^ (m >>> 16)) >>> 0) / 2 ** 32;
};

export const col = (/** @type {number} */ k) => k % CAMP_N,
  row = (/** @type {number} */ k) => Math.floor(k / CAMP_N);
/** Squares apart, counting a diagonal step as one. */
export const apart = (/** @type {number} */ p, /** @type {number} */ q) =>
  Math.max(Math.abs(col(p) - col(q)), Math.abs(row(p) - row(q)));
/** The squares next to k, not across a corner. */
export const nextTo = (/** @type {number} */ k) =>
  [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
    .map(([da = 0, db = 0]) => [col(k) + da, row(k) + db])
    .filter(([a = -1, b = -1]) => a >= 0 && a < CAMP_N && b >= 0 && b < CAMP_N)
    .map(([a = 0, b = 0]) => a + b * CAMP_N);
export const SQUARES = Array.from({ length: CAMP_N * CAMP_N }, (_, k) => k);
export const EDGE = SQUARES.filter(k => col(k) === 0 || row(k) === 0 || col(k) === CAMP_N - 1 || row(k) === CAMP_N - 1);
export const onLand = (/** @type {Ground | undefined} */ g) => g === 'forest' || g === 'open';
