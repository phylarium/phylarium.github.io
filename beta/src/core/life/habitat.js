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
