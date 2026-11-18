// What a card does once it is known, beyond the plain numbers in data/research.yaml (those are added up,
// multiplied or compared as they stand). Three things a card can have here:
//
//   tick     what it changes as time passes: fields of the saved state, given whole (a patch)
//   climax   what happens once, the moment it is developed: effects, as the disasters give them
//   values   numbers that depend on the world now, for the same sums as the plain ones (cloudRate, albedo, ...)
//
// All three read a view of the world and nothing else. A card with nothing to say here needs no line.

/** @typedef {import('../disasters/rules.js').Effect} Effect */
/**
 * What a card may ask about the world.
 * @typedef {object} CardView
 * @property {number} pressure the air, in bar
 * @property {number} ch4 methane in the air, ppm
 * @property {number} ch4Ice methane still frozen
 * @property {number} co2 carbon dioxide in the air, ppm
 * @property {number} co2Ice carbon dioxide still frozen
 * @property {number} he helium, ppm
 * @property {number} ar argon, ppm
 * @property {number} rn radon, atoms per litre
 * @property {number} mountains share of the land that is mountains
 * @property {number} volcanoes
 * @property {number} clouds share of the sky under cloud
 * @property {number} cloudFormation cloud cover the sea steams up per second
 * @property {number} glacierIce share of the peaks under snow
 * @property {number} riverFlow how full the rivers run, 0 to 1
 * @property {number} wetlandMethane ppm of methane a second from the wetlands
 * @property {Readonly<Record<string, number>>} species the share of its home each species fills
 * @property {number} daySeconds real seconds per day
 */
/** Fields of the saved state with their new values. @typedef {Readonly<Record<string, unknown>>} Patch */
/**
 * @typedef {object} CardBehaviour
 * @property {(view: CardView, dt: number) => Patch} [tick]
 * @property {(view: CardView) => Effect[]} [climax]
 * @property {Readonly<Record<string, (view: CardView) => number>>} [values]
 */

const THAW = Object.freeze({ n2: 0.01, ch4: 0.1, co2: 25 }); // bar, ppm and ppm a second
const ARGON_PPM = 9340; // today's air
const RADON_HALF_LIFE_DAYS = 3.8;

/**
 * A frozen gas thaws into the air, up to `rate` a second.
 * @param {'ch4' | 'co2'} gas
 * @param {number} rate
 * @returns {(view: CardView, dt: number) => Patch}
 */
const thaw = (gas, rate) => (view, dt) => {
  const out = Math.min(view[`${gas}Ice`], rate * dt);
  return { [`${gas}Ice`]: view[`${gas}Ice`] - out, [gas]: view[gas] + out };
};

/** @type {Readonly<Record<string, CardBehaviour>>} */
export const CARD_BEHAVIOUR = {
  // The frozen air thaws: nitrogen first, then methane and carbon dioxide.
  thawN2: { tick: (view, dt) => ({ pressure: Math.min(1, view.pressure + THAW.n2 * dt) }) },
  thawCH4: { tick: thaw('ch4', THAW.ch4) },
  thawCO2: { tick: thaw('co2', THAW.co2) },
  // Helium seeps out of the rock and leaks away to space: it settles where the two balance.
  helium: { tick: (view, dt) => ({ he: view.he + (0.1 - view.he * 0.02) * dt }) },
  // Argon comes out of the volcanoes and stays.
  argon: { tick: (view, dt) => ({ ar: Math.min(ARGON_PPM, view.ar + 0.5 * view.volcanoes * dt) }) },
  // Radon rises from the ground and decays with a half-life of 3.8 days.
  radon: {
    tick: (view, dt) => {
      const decay = (view.rn * Math.LN2) / (RADON_HALF_LIFE_DAYS * view.daySeconds);
      return { rn: view.rn + (1000 / view.daySeconds - decay) * dt };
    },
  },
  // Colliding plates pile up mountains, ever more slowly.
  mountains: { tick: (view, dt) => ({ mountains: Math.min(1, view.mountains + 0.004 * (1 - view.mountains) * dt) }) },
  // The first cell: a little life in the sea, unless it is there already.
  firstcell: {
    climax: view => [{ kind: 'patch', fields: { species: { ...view.species, cell: view.species['cell'] ?? 0.02 } } }],
  },
  // The Thunderstorm opens with a storm.
  thunderstorm: { climax: () => [{ kind: 'burst', strikes: 10 }] },
  clouds: { values: { cloudRate: view => view.cloudFormation } },
  // Heavier clouds rain harder: up to three times as much from 25% cloud cover on.
  rain: { values: { rainMult: view => 1 + 2 * Math.max(0, Math.min(1, (view.clouds - 0.1) / 0.15)) } },
  glaciers: { values: { albedo: view => 0.02 * view.glacierIce } },
  rivers: { values: { weatherMult: view => 1 + 0.5 * view.riverFlow } },
  wetlands: { values: { ch4: view => view.wetlandMethane } },
};

/**
 * How many comets come in a night, by the setting of the comet dial (0, 0.5, 1 or 4, as every dial): none, one
 * every other night, one a night, four a night.
 * @param {number} night the number of the night
 * @param {number} pace the dial's setting
 */
export const cometsPerNight = (night, pace) => (pace >= 1 ? pace : pace > 0 && night % 2 === 0 ? 1 : 0);
