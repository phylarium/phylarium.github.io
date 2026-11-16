// Names for made-up species: a word for what it last gained and a word for where it lives, as in "Shellfin" or
// "Sandrunner". A founder keeps the name it was given.
import { pick, traitsOf } from './species.js';

/** @typedef {import('./species.js').Species} Species */
/** @typedef {import('./species.js').Feature} Feature */

/** What a creature of each zone is called, by level. */
const BODIES = Object.freeze({
  plant: {
    sea: ['weed', 'bloom', 'drift'],
    reef: ['frond', 'kelp'],
    fresh: ['reed', 'lily'],
    wet: ['moss', 'fern'],
    moist: ['leaf', 'vine'],
    dry: ['thorn', 'scrub'],
    cold: ['lichen', 'tuft'],
    air: ['spore', 'seed'],
  },
  animal: {
    sea: ['fin', 'swimmer', 'drifter'],
    reef: ['darter', 'snapper'],
    fresh: ['skimmer', 'minnow'],
    wet: ['hopper', 'wader'],
    moist: ['runner', 'prowler'],
    dry: ['runner', 'digger'],
    cold: ['strider', 'burrower'],
    air: ['glider', 'flier'],
  },
});
const FALLBACK = 'ling';

/** The zone a species has taken to last: where it is at home now. @param {Species} species */
const frontier = species => species.home.at(-1) ?? 'sea';

/**
 * A name for a species from its newest feature and its newest home, picked by chance among the words for each.
 * @param {Species} species
 * @param {Readonly<Record<string, Feature>>} features by id
 * @param {() => number} random
 */
export const nameOf = (species, features, random) => {
  const newest = traitsOf(species).at(-1);
  const head = pick((newest === undefined ? undefined : features[newest]?.words) ?? [], random) ?? species.name;
  const body = pick(BODIES[species.level][frontier(species)], random) ?? FALLBACK;
  return `${head}${body}`;
};

/**
 * The same, but a name no living or lost species has: a second word is added until it is new.
 * @param {Species} species
 * @param {Readonly<Record<string, Feature>>} features by id
 * @param {{ taken: ReadonlySet<string>, random: () => number }} given
 * @returns {string}
 */
export const freshName = (species, features, given) => {
  const name = nameOf(species, features, given.random);
  if (!given.taken.has(name)) return name;
  const more = pick(BODIES[species.level][frontier(species)], given.random) ?? FALLBACK;
  const longer = `${name} ${more[0]?.toUpperCase() ?? ''}${more.slice(1)}`;
  return given.taken.has(longer) ? `${longer} ${given.taken.size + 1}` : longer;
};
