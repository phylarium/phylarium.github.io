// The natural disasters: one rule each, saying when it can strike and what it does. A rule knows nothing of the
// screen or the saved state: it reads a view of the world (plain numbers and flags) and answers with effects,
// plain data that an adapter carries out (src/adapters/disaster-effects.js). How often a disaster strikes is in
// data/disasters.yaml (`every`); its name and story are content. A new disaster is a rule here and an entry there.

/** @typedef {'drought' | 'solarStorm' | 'redTide' | 'iceAge' | 'supernova' | 'blizzard'} Spell */
/**
 * What a disaster may ask about the world.
 * @typedef {object} WorldView
 * @property {number} tempC the mean temperature
 * @property {number} openOcean share of the planet that is open water
 * @property {number} ice share of the planet under ice
 * @property {number} clouds share of the sky under cloud
 * @property {number} volcanoes
 * @property {boolean} stormCloud a storm cloud is in the sky
 * @property {boolean} surgePending a surge or tsunami is already on its way
 * @property {boolean} lifeSeen
 * @property {number} burst bolts left of a thunderstorm
 * @property {Readonly<Record<Spell, number>>} spells seconds left of each disaster that lasts
 * @property {Readonly<Record<string, number>>} struck how often each disaster has struck
 * @property {ReadonlySet<string>} known the cards developed
 * @property {ReadonlySet<string>} setsDone the collections found in full
 * @property {boolean} zodiacComplete
 * @property {Readonly<Record<string, number>>} controls how hard each dial of the computer drives its disasters
 * @property {number} calm what the Calm boosts leave of the odds
 */
/**
 * What a disaster does, as data. `spell`: it lasts for some seconds. `kill`: a share of every species of a kind
 * dies. `burst`: bolts thrown fast. `spread`: water or fire over the land from a spot of that kind. `surge`: the
 * sea over a coast after a delay, heralded by a hurricane or a rolling tide; a surge that is `required` needs a
 * coast in view or the disaster does not happen. `show`: something for the eye only. `patch`: fields of the saved
 * state, given whole.
 * @typedef {{ kind: 'spell', name: Spell, seconds: number }
 *   | { kind: 'kill', who: 'land' | 'landAndReef', share: number }
 *   | { kind: 'burst', strikes: number }
 *   | { kind: 'spread', what: 'flood', size: number }
 *   | { kind: 'surge', delay: number, size: number, reefs: number, required: boolean, hurricane?: true, tide?: 1 | -1, sweep?: true, tsunami?: true }
 *   | { kind: 'show', what: 'shake' | 'aurora' | 'supernova' | 'blizzard', value: number | boolean }
 *   | { kind: 'gems' }
 *   | { kind: 'patch', fields: Readonly<Record<string, unknown>> }
 *   | { kind: 'erupt' }
 *   | { kind: 'asteroid' }} Effect
 */
/**
 * @typedef {object} DisasterRule
 * @property {string} [control] the dial of the computer that scales its odds
 * @property {(view: WorldView) => boolean} [when] what the world must be like; without it, always
 * @property {(view: WorldView, random: () => number) => Effect[]} strike
 */

/** How long each lasting disaster lasts, in seconds. */
export const SPELL_S = Object.freeze({
  drought: 60,
  solarStorm: 40,
  redTide: 45,
  iceAge: 90,
  supernova: 60,
  blizzard: 40,
});

/** @param {Spell} name @param {number} [seconds] @returns {Effect} */
const spell = (name, seconds = SPELL_S[name]) => ({ kind: 'spell', name, seconds });
/** @param {() => number} random @param {number} low @param {number} span */
const between = (random, low, span) => low + random() * span;

/** @type {Readonly<Record<string, DisasterRule>>} */
export const DISASTER_RULES = {
  supereruption: { control: 'volcanism', when: view => view.volcanoes > 0, strike: () => [{ kind: 'erupt' }] },
  // Rivers and lakes burst their banks under a stormy sky.
  flood: {
    control: 'weather',
    when: view => view.clouds >= 0.25 && view.stormCloud,
    strike: (_view, random) => [{ kind: 'spread', what: 'flood', size: between(random, 8, 6) }],
  },
  // Today's Earth averages 15 °C and has hurricanes. With every star sign found they hit half as hard.
  hurricane: {
    control: 'weather',
    when: view => view.tempC > 15 && view.openOcean > 0.3,
    strike: (view, random) => {
      const k = view.zodiacComplete ? 0.5 : 1;
      return [
        { kind: 'surge', hurricane: true, delay: 4, size: between(random, 10, 5) * k, reefs: 0.25 * k, required: true },
      ];
    },
  },
  // A burst of lightning: every bolt can start a wildfire, and the lightning itself kills.
  thunderstorm: {
    control: 'weather',
    when: view => view.burst <= 0 && view.stormCloud,
    strike: () => [
      { kind: 'burst', strikes: 12 },
      { kind: 'kill', who: 'land', share: 0.06 },
    ],
  },
  // For a while every storm cloud snows, and the land life dies back in the cold.
  blizzard: {
    control: 'weather',
    when: view => view.spells.blizzard <= 0 && view.ice > 0.05 && view.stormCloud,
    strike: () => [spell('blizzard'), { kind: 'show', what: 'blizzard', value: true }],
  },
  // A storm over the sea piles the water onto the coast on top of the tide, and sweeps the tidal pools off.
  stormsurge: {
    control: 'weather',
    when: view => !view.surgePending && view.openOcean > 0.2 && view.stormCloud,
    strike: (_view, random) => [
      {
        kind: 'surge',
        tide: random() < 0.5 ? 1 : -1,
        delay: 2,
        size: between(random, 8, 4),
        reefs: 0.15,
        sweep: true,
        required: true,
      },
    ],
  },
  // The ground shakes, gems glint in the crack for a while, and a tsunami follows where there is a coast.
  earthquake: {
    strike: (_view, random) => [
      { kind: 'show', what: 'shake', value: 2.5 },
      { kind: 'gems' },
      { kind: 'surge', delay: 1.8, size: between(random, 12, 6), reefs: 0.3, tsunami: true, required: false },
    ],
  },
  // Pollinators bring rain-ready seeds back fast: with every flower found a drought lasts half as long.
  drought: {
    when: view => view.tempC > 17 && view.spells.drought <= 0,
    strike: view => [spell('drought', SPELL_S.drought * (view.setsDone.has('flowers') ? 0.5 : 1))],
  },
  // Meteoritic iron makes a stronger core and field: with every meteorite found the storm burns less.
  solarstorm: {
    when: view => view.spells.solarStorm <= 0,
    strike: view => [
      spell('solarStorm'),
      { kind: 'show', what: 'aurora', value: SPELL_S.solarStorm },
      { kind: 'kill', who: 'land', share: view.setsDone.has('meteorites') ? 0.05 : 0.15 },
    ],
  },
  redtide: {
    when: view => view.tempC > 15 && view.openOcean > 0.2 && view.spells.redTide <= 0,
    strike: () => [spell('redTide')],
  },
  iceage: { when: view => view.spells.iceAge <= 0 && view.tempC < 30, strike: () => [spell('iceAge')] },
  // The asteroid strikes only once there is life for it to end an age of. The comet dial scales its odds; once,
  // unless the dial is on high (the only setting above medium), when it strikes again and again: an asteroid that
  // came before the dinosaurs can then still end their age.
  asteroid: {
    control: 'cometcontrol',
    when: view => view.lifeSeen && (!view.struck['asteroid'] || (view.controls['cometcontrol'] ?? 1) > 1),
    strike: () => [{ kind: 'asteroid' }],
  },
  // A giant star far away blows apart: its rays thin the ozone, and life on land and in the shallow sea suffers.
  supernova: {
    when: view => view.spells.supernova <= 0,
    strike: () => [
      spell('supernova'),
      { kind: 'show', what: 'supernova', value: SPELL_S.supernova },
      { kind: 'kill', who: 'landAndReef', share: 0.1 },
    ],
  },
};
