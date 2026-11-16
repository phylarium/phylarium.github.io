// One step of the evolution game: time passes over the whole map. Every region lives on (region.js), every
// species spreads to the regions next to it where it can live, and a species that has been nearly gone for a
// minute dies out. The step has no chance in it: the same world and climate give the same next world.
import { RATES, liveOn } from './region.js';
import { totals } from './world.js';

/** @typedef {import('./species.js').Species} Species */
/** @typedef {import('./species.js').Zone} Zone */
/** @typedef {import('./world.js').Life} Life */
/** @typedef {import('./world.js').Region} Region */
/** @typedef {import('./region.js').Climate} Climate */

export const LIFE = Object.freeze({
  spread: 0.02, // share of itself a species sends to each neighbouring region a second
  floor: 0.02, // under this much of the map in all, a species is nearly gone
  fadeSeconds: 60, // nearly gone for this long is extinct
  full: 0.3, // a region counts as filled from this share on
  evolveShare: 0.6, // with this much of its habitat filled, a species has won an evolution
});

/** How a zone is travelled. @type {Readonly<Record<Zone, 'land' | 'sea' | 'air'>>} */
const WAY = {
  sea: 'sea',
  reef: 'sea',
  fresh: 'sea',
  wet: 'land',
  moist: 'land',
  dry: 'land',
  cold: 'land',
  air: 'air',
};

/** The regions next to one: east and west round the planet, north and south to the poles. @param {Life} life @param {number} i */
const neighbours = (life, i) => {
  const row = Math.floor(i / life.width),
    col = i % life.width;
  const across = [(col + 1) % life.width, (col + life.width - 1) % life.width].map(c => row * life.width + c);
  return [...across, i - life.width, i + life.width].filter(n => n >= 0 && n < life.regions.length && n !== i);
};

/** The share of itself a species sends into a region a second: none where it cannot live. @param {Species} one @param {Region} to */
const sends = (one, to) => (one.home.includes(to.zone) ? LIFE.spread * (one.reach?.[WAY[to.zone]] ?? 1) : 0);

/**
 * A region after its species have spread: what each sends to its neighbours leaves, what the neighbours send
 * arrives.
 * @param {Life} life
 * @param {number} i
 * @param {number} dt
 * @returns {Region}
 */
const spreadInto = (life, i, dt) => {
  const here = /** @type {Region} */ (life.regions[i]);
  const around = neighbours(life, i).map(n => /** @type {Region} */ (life.regions[n]));
  const ids = [...new Set([here, ...around].flatMap(region => Object.keys(region.pops)))];
  return {
    ...here,
    pops: Object.fromEntries(
      ids.flatMap(id => {
        const one = life.species[id];
        if (!one) return [];
        const pop = here.pops[id] ?? 0;
        const out = Math.min(0.5, around.reduce((sum, to) => sum + sends(one, to), 0) * dt) * pop;
        const arriving = around.reduce(
          (sum, from) => sum + (from.pops[id] ?? 0) * Math.min(0.125, sends(one, here) * dt),
          0,
        );
        const next = Math.min(1, pop - out + arriving);
        return next >= RATES.least ? [[id, next]] : [];
      }),
    ),
  };
};

/**
 * The species that are nearly gone, with how long they have been, and the ones whose time is up.
 * @param {Life} life the world after this step's living and spreading
 * @param {number} dt
 */
const fade = (life, dt) => {
  const sum = totals(life);
  const low = Object.keys(life.species).filter(id => (sum[id] ?? 0) < LIFE.floor);
  const fading = Object.fromEntries(low.map(id => [id, (life.fading[id] ?? 0) + dt]));
  return { fading, lost: low.filter(id => (fading[id] ?? 0) >= LIFE.fadeSeconds) };
};

/** @param {Readonly<Record<string, T>>} record @param {readonly string[]} ids @template T @returns {Record<string, T>} */
const without = (record, ids) => Object.fromEntries(Object.entries(record).filter(([id]) => !ids.includes(id)));

/**
 * The world `dt` seconds later.
 * @param {Life} life
 * @param {Climate} climate
 * @param {number} dt
 * @returns {Life}
 */
export const stepLife = (life, climate, dt) => {
  const lived = {
    ...life,
    regions: life.regions.map(region => liveOn(region, { species: life.species, climate }, dt)),
  };
  const spread = { ...lived, regions: lived.regions.map((_, i) => spreadInto(lived, i, dt)) };
  const { fading, lost } = fade(spread, dt);
  return {
    ...spread,
    time: life.time + dt,
    species: without(spread.species, lost),
    regions: lost.length
      ? spread.regions.map(region => ({ ...region, pops: without(region.pops, lost) }))
      : spread.regions,
    fading: without(fading, lost),
    extinct: [...life.extinct, ...lost],
  };
};

/**
 * The species that have won an evolution: enough of the regions they can live in are filled with them.
 * @param {Life} life
 * @returns {string[]} ids
 */
export const readyToEvolve = life =>
  Object.values(life.species)
    .filter(one => {
      const habitat = life.regions.filter(region => one.home.includes(region.zone));
      const filled = habitat.filter(region => (region.pops[one.id] ?? 0) >= LIFE.full);
      return habitat.length > 0 && filled.length / habitat.length >= LIFE.evolveShare;
    })
    .map(one => one.id);
