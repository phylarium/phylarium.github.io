// What happens inside one region in a moment of time: every species there grows or dwindles, and the animals
// contest each other. Plants live on light and crowd each other; animals need the plants of the region.
import { bite, winner } from './contest.js';

/** @typedef {import('./species.js').Species} Species */
/** @typedef {import('./world.js').Region} Region */
/** @typedef {{ tempC: number }} Climate the planet as life feels it */

export const RATES = Object.freeze({
  grow: 0.25, // share of itself a species at home gains a second, with room to spare
  dwindle: 0.3, // share it loses a second where it cannot live
  food: 0.5, // animals a region feeds per plant
  contest: 0.4, // how hard a won contest bites
  least: 1e-4, // under this a species is gone from a region
});

/** @param {Species} species @param {Region} region @param {Climate} climate */
const atHome = (species, region, climate) =>
  species.home.includes(region.zone) && climate.tempC >= species.temp[0] && climate.tempC <= species.temp[1];

/**
 * How much of the region the species of one level fill together.
 * @param {Region} region
 * @param {Readonly<Record<string, Species>>} species
 * @param {'plant' | 'animal'} level
 */
const crowd = (region, species, level) =>
  Object.entries(region.pops).reduce((sum, [id, pop]) => sum + (species[id]?.level === level ? pop : 0), 0);

/**
 * The share of itself a species gains (or, below zero, loses) a second in a region.
 * @param {Species} one
 * @param {Region} region
 * @param {{ species: Readonly<Record<string, Species>>, climate: Climate }} world
 */
const growth = (one, region, world) => {
  if (!atHome(one, region, world.climate)) return -RATES.dwindle;
  const plants = crowd(region, world.species, 'plant');
  if (one.level === 'plant') return RATES.grow * (1 - plants);
  const room = plants * RATES.food;
  return room <= 0
    ? -RATES.dwindle
    : Math.max(-RATES.dwindle, RATES.grow * (1 - crowd(region, world.species, 'animal') / room));
};

/**
 * What an animal gains or loses a second from its contests with the other animals of the region.
 * @param {Species} one
 * @param {Region} region
 * @param {Readonly<Record<string, Species>>} species
 */
const contests = (one, region, species) =>
  Object.entries(region.pops).reduce((sum, [id, pop]) => {
    const other = species[id];
    if (!other || other.id === one.id || other.level !== 'animal') return sum;
    const won = winner(one, other);
    const taken = won === 1 ? bite(one, other) : won === -1 ? -bite(other, one) : 0;
    return sum + RATES.contest * taken * pop;
  }, 0);

/**
 * The region a moment later.
 * @param {Region} region
 * @param {{ species: Readonly<Record<string, Species>>, climate: Climate }} world
 * @param {number} dt seconds
 * @returns {Region}
 */
export const liveOn = (region, world, dt) => ({
  ...region,
  pops: Object.fromEntries(
    Object.entries(region.pops).flatMap(([id, pop]) => {
      const one = world.species[id];
      if (!one) return [];
      const fights = one.level === 'animal' ? contests(one, region, world.species) : 0;
      const next = Math.min(1, pop + pop * (growth(one, region, world) + fights) * dt);
      return next >= RATES.least ? [[id, next]] : [];
    }),
  ),
});
