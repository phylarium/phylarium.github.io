'use strict';

// The old scripts' side of the natural disasters. The rules are in src/core/disasters (when one can strike, what
// it does, how the odds are scaled) and reach here as CORE.disasters; this file shows them the world as it is
// now (disasterView), gives them the hands to change it (DISASTER_WORLD), and keeps the names the rest of the
// game and the tests call. Loads after book.js; disasterTick (play.js) runs it.

// The collections whose full set softens a disaster.
const DISASTER_SETS = ['flowers', 'meteorites'];
/** The world as the disaster rules read it. @returns {import('./src/core/disasters/rules.js').WorldView} */
const disasterView = () => ({
  tempC: tempC(),
  openOcean: openOcean(),
  ice: state.ice,
  clouds: state.clouds,
  volcanoes: volcanoes(),
  stormCloud: state.cloudList.some(c => c.storm),
  surgePending: !!state.surge,
  lifeSeen: seen('life'),
  burst: stormBurst,
  spells: {
    drought: state.drought,
    solarStorm: state.solarStorm,
    redTide: state.redTide,
    iceAge: state.iceAge,
    supernova: state.supernova,
    blizzard: state.blizzard || 0,
  },
  struck: state.disasters,
  known: owned,
  setsDone: new Set(DISASTER_SETS.filter(setDone)),
  zodiacComplete: zodiacComplete(),
  controls: Object.fromEntries(CONTROLS.map(card => [card.id, controlMult(card.id)])),
  calm: perkMult('calm', 0.8),
});

// What carries out a disaster's effects (src/adapters/disaster-effects.js) may do to the game.
/** @type {import('./src/adapters/disaster-effects.js').DisasterWorld} */
const DISASTER_WORLD = {
  read: () => state,
  // The one place a disaster writes the saved state: whole fields, never parts of them.
  write: patch => {
    // oxlint-disable-next-line fp/no-mutating-methods -- the saved state is the game's one mutable thing
    Object.assign(state, patch);
  },
  living: who =>
    SPECIES.filter(
      s => evolved(s.id) && (s['domain'] !== 'ocean' || (who === 'landAndReef' && (s['home'] || []).includes('reef'))),
    ).map(s => s.id),
  findSpot: kind => /** @type {{ u: number, v: number } | null} */ (Terrain.findSpot(kind, Scene.centre())),
  spread: (what, spot, size) => Terrain.spread(what, spot.u, spot.v, size),
  show: {
    shake: seconds => Scene.shake(seconds),
    aurora: seconds => Scene.aurora(seconds),
    supernova: seconds => Scene.supernova(seconds),
    blizzard: on => Scene.blizzard(on),
    hurricane: spot => Scene.hurricane(spot, 6),
    tide: way => Scene.rollTide(way),
  },
  burst: strikes => {
    stormBurst = strikes;
  },
  // The fault opens: gems glint in the crack for a while (gemTick in play.js).
  gems: () => {
    gemRush = GEM_RUSH_S;
  },
  erupt: () => {
    erupt(-1, true);
  },
  asteroid: () => asteroidImpact(),
  announce: id => disaster(id),
};
const strikeEffects = CORE.disasters.strikeIn(DISASTER_WORLD);
/** Makes a disaster happen now; answers whether it did. @param {string} id */
const strikeDisaster = id => {
  const rule = CORE.disasters.RULES[id];
  return !!rule && strikeEffects(id, rule.strike(disasterView(), Math.random));
};

// The names the game and the tests know the disasters by.
/** How the odds of a disaster are scaled now. @param {string} id */
const disasterOdds = id => CORE.disasters.oddsFactor(id, disasterView());
const DISASTER_ODDS = Object.fromEntries(
  CONTENT.disasters.list.flatMap(d =>
    d.every ? [[d.id, { rate: 1 / d.every, when: () => CORE.disasters.canStrike(d.id, disasterView()) }]] : [],
  ),
);
const CONTROL_OF_DISASTER = Object.fromEntries(
  Object.entries(CORE.disasters.RULES).flatMap(([id, rule]) => (rule.control ? [[id, rule.control]] : [])),
);
const ULTRA_ODDS = CORE.disasters.ODDS.ultra;
const SOLAR_STORM_S = CORE.disasters.SPELL_S.solarStorm;
const quake = () => strikeDisaster('earthquake');
const stormSurge = () => strikeDisaster('stormsurge');
const iceAge = () => strikeDisaster('iceage');
const redTide = () => strikeDisaster('redtide');
const supernova = () => strikeDisaster('supernova');
const solarStorm = () => strikeDisaster('solarstorm');
