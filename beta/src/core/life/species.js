// Species of the evolution game and how one becomes another. A species is plain data; evolving makes a new one
// from a parent and a feature (data/features.yaml), and a mutation makes one that differs a little. Nothing here
// knows of the map or of time: that is step.js.

/** @typedef {'sea' | 'reef' | 'fresh' | 'wet' | 'moist' | 'dry' | 'cold' | 'air'} Zone */
/** The hand in a contest: claw beats venom, venom beats speed, speed beats claw. @typedef {'claw' | 'venom' | 'speed'} Style */
/** Plants live on light; animals eat plants and fight each other. @typedef {'plant' | 'animal'} Level */
/** @typedef {Readonly<Partial<Record<'land' | 'sea' | 'air', number>>>} Reach */
/**
 * @typedef {object} Species
 * @property {string} id
 * @property {string} name
 * @property {string} [parent] the species it came from
 * @property {number} [born] the time it appeared, in game seconds
 * @property {Level} level
 * @property {readonly Zone[]} home where it can live
 * @property {Style} style
 * @property {number} attack 0 to 5
 * @property {number} defense 0 to 5
 * @property {readonly [number, number]} temp the global mean, in °C, it stands
 * @property {readonly string[]} [traits] the features it has gained, oldest first
 * @property {Reach} [reach] how many times faster it spreads over land, through water and by air
 */
/**
 * @typedef {object} Feature
 * @property {string} id
 * @property {string} name
 * @property {Level} [level] which species can take it; both when left out
 * @property {readonly string[]} [requires]
 * @property {readonly Zone[]} [in] it must live in one of these
 * @property {Level} [makes] the level of the child
 * @property {number} [attack]
 * @property {number} [defense]
 * @property {readonly Zone[]} [homes]
 * @property {readonly [number, number]} [temp] degrees of global mean it stands beyond its range: colder, warmer
 * @property {Reach} [reach]
 * @property {boolean} [poison]
 * @property {readonly string[]} [words]
 */

export const STYLES = /** @type {const} */ (['claw', 'venom', 'speed']);
const MAX_STRENGTH = 5;
/** @param {number} n */
const strength = n => Math.max(0, Math.min(MAX_STRENGTH, n));
/** @template T @param {readonly T[]} list @param {() => number} random @returns {T | undefined} */
export const pick = (list, random) => list[Math.floor(random() * list.length)];

/** @param {Species} species @returns {readonly string[]} */
export const traitsOf = species => species.traits ?? [];

/**
 * Whether a species can gain a feature: it has not got it, it is of the right level, it has what the feature
 * builds on, and it lives where the feature makes sense.
 * @param {Species} species
 * @param {Feature} feature
 */
export const fits = (species, feature) =>
  !traitsOf(species).includes(feature.id) &&
  (feature.level === undefined || feature.level === species.level) &&
  (feature.requires ?? []).every(id => traitsOf(species).includes(id)) &&
  (feature.in === undefined || feature.in.some(zone => species.home.includes(zone)));

/**
 * Up to three features to choose from at "Evolve!": the known ones that fit, in an order of chance.
 * @param {Species} species
 * @param {readonly Feature[]} features the ones the player has developed
 * @param {() => number} random
 * @returns {Feature[]}
 */
export const offers = (species, features, random) =>
  features
    .filter(feature => fits(species, feature))
    .map(feature => ({ feature, at: random() }))
    .toSorted((a, b) => a.at - b.at)
    .slice(0, 3)
    .map(one => one.feature);

/**
 * The child of a species that gains a feature. `as` gives what only the caller knows: its id, name and time.
 * @param {Species} parent
 * @param {Feature} feature
 * @param {{ id: string, name: string, born: number }} as
 * @returns {Species}
 */
export const evolve = (parent, feature, as) => {
  const [colder, warmer] = feature.temp ?? [0, 0];
  return {
    ...parent,
    ...as,
    parent: parent.id,
    level: feature.makes ?? parent.level,
    home: [...new Set([...parent.home, ...(feature.homes ?? [])])],
    attack: strength(parent.attack + (feature.attack ?? 0)),
    defense: strength(parent.defense + (feature.defense ?? 0)),
    temp: [parent.temp[0] - colder, parent.temp[1] + warmer],
    traits: [...traitsOf(parent), feature.id],
    reach: { ...parent.reach, ...feature.reach },
  };
};

/** The small changes that happen by themselves, each a function of the parent. */
const MUTATIONS = /** @type {const} */ ([
  /** @param {Species} s */ s => ({ attack: strength(s.attack + 1) }),
  /** @param {Species} s */ s => ({ attack: strength(s.attack - 1) }),
  /** @param {Species} s */ s => ({ defense: strength(s.defense + 1) }),
  /** @param {Species} s */ s => ({ defense: strength(s.defense - 1) }),
  /** @param {Species} s */ s => ({ style: STYLES[(STYLES.indexOf(s.style) + 1) % STYLES.length] ?? s.style }),
]);

/**
 * A child that differs from its parent by one small change, picked by chance.
 * @param {Species} parent
 * @param {{ id: string, name: string, born: number }} as
 * @param {() => number} random
 * @returns {Species}
 */
export const mutate = (parent, as, random) => {
  const change = pick(MUTATIONS, random);
  return { ...parent, ...as, parent: parent.id, ...(change ? change(parent) : {}) };
};
