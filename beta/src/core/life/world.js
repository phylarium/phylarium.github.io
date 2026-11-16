// The living world of the evolution game: a map of regions, each holding how much of it every species fills, and
// the species themselves. Plain data, with the few ways to change it that are not the passing of time (step.js):
// putting a species somewhere, and splitting a child off its parent.

/** @typedef {import('./species.js').Species} Species */
/** @typedef {import('./species.js').Zone} Zone */
/**
 * @typedef {object} Region
 * @property {Zone} zone
 * @property {Readonly<Record<string, number>>} pops the share of the region each species fills, by id
 */
/**
 * @typedef {object} Life
 * @property {number} width regions in a row; the rows run from pole to pole, and a row wraps round the planet
 * @property {readonly Region[]} regions row by row
 * @property {Readonly<Record<string, Species>>} species the living, by id
 * @property {Readonly<Record<string, number>>} fading seconds a species has been nearly gone, by id
 * @property {readonly string[]} extinct the ids of the lost, oldest first
 * @property {number} time game seconds since life began
 */

/**
 * An empty world over a map of zones.
 * @param {readonly Zone[]} zones row by row
 * @param {number} width
 * @returns {Life}
 */
export const emptyLife = (zones, width) => ({
  width,
  regions: zones.map(zone => ({ zone, pops: {} })),
  species: {},
  fading: {},
  extinct: [],
  time: 0,
});

/** How much of the whole map each species fills, summed over the regions. @param {Life} life @returns {Record<string, number>} */
export const totals = life =>
  Object.fromEntries(
    Object.keys(life.species).map(id => [id, life.regions.reduce((sum, region) => sum + (region.pops[id] ?? 0), 0)]),
  );

/**
 * Puts a species into the world: `share` of each region it is given.
 * @param {Life} life
 * @param {Species} species
 * @param {{ regions: readonly number[], share: number }} where
 * @returns {Life}
 */
export const settle = (life, species, where) => ({
  ...life,
  species: { ...life.species, [species.id]: species },
  regions: life.regions.map((region, i) =>
    where.regions.includes(i) ? { ...region, pops: { ...region.pops, [species.id]: where.share } } : region,
  ),
});

/**
 * A child splits off its parent: everywhere the parent lives, `share` of it becomes the child.
 * @param {Life} life
 * @param {Species} child its `parent` names the species it splits from
 * @param {number} [share]
 * @returns {Life}
 */
export const split = (life, child, share = 0.1) => {
  const from = child.parent ?? '';
  return {
    ...life,
    species: { ...life.species, [child.id]: child },
    regions: life.regions.map(region => {
      const pop = region.pops[from] ?? 0;
      return pop > 0
        ? { ...region, pops: { ...region.pops, [from]: pop * (1 - share), [child.id]: pop * share } }
        : region;
    }),
  };
};
