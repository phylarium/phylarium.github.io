'use strict';

// The ocean as a store of heat. The air follows the planet's energy balance within seconds; the open sea follows
// the air over minutes, and pulls the air towards its own temperature as it does, so a cold or warm spell (a comet,
// an eruption, a sky full of cloud) moves the sea little. The sea ice grows and melts by the sea's temperature, not
// the air's, so a warm ocean keeps the equator open through a cold spell once the ice has been cracked. Thick CO2
// warms more than thin (its lines broaden, as on early Earth and Venus), so a planet that freezes over again warms
// its way out as the volcanoes' CO2 builds up. Clouds are born of open water. Loads before game.js.

/** How strongly open sea holds the air at its own temperature (0..1, for a planet all sea and no ice). */
const OCEAN_PULL = 1;
/** Seconds the sea takes to follow the air, and the air's extra lag over a planet all open sea: with the pull, a
 * warming open planet settles over about five minutes, and a cold minute moves the sea by a tenth of its cold. */
const OCEAN_HEAT_S = 80,
  OCEAN_AIR_S = 60;
/** CO2 (ppm) from which on its lines broaden; each as much again over it warms as one more bar of air would. */
const THICK_CO2 = 150000;
/** Ice cover up to which the sea breeds clouds at full pace; fewer as it closes, none under ice all over. */
const CLOUD_ICE = 0.5;

/**
 * The air and the sea after dt seconds. The air goes towards its target, pulled towards the sea by as much open
 * water as there is; the sea goes towards the air.
 * @param {{ tempK: number, seaK?: number | undefined, target: number, open: number, lag: number }} now the air's and the sea's
 *   temperatures and the air's target (K), the share of the planet that is open sea (0 before the first thaw: the
 *   sea does not count yet), the air's lag (s)
 * @param {number} dt
 */
const oceanStep = (now, dt) => {
  const was = now.seaK ?? now.tempK,
    goal = now.target + OCEAN_PULL * now.open * (was - now.target),
    air = now.tempK + (goal - now.tempK) * Math.min(1, dt / (now.lag + OCEAN_AIR_S * now.open)),
    sea = now.open > 0 ? was + (air - was) * Math.min(1, dt / OCEAN_HEAT_S) : air;
  return { tempK: air, seaK: sea };
};

/**
 * Air pressure (bar) that thick CO2 adds to the greenhouse.
 * @param {number} co2 ppm
 */
const thickAir = co2 => Math.max(0, co2 - THICK_CO2) / THICK_CO2;

/**
 * How fast the sea breeds clouds for its ice cover (0..1).
 * @param {number} ice
 */
const cloudWater = ice => Math.min(1, Math.max(0, (1 - ice) / (1 - CLOUD_ICE)));

const Ocean = Object.freeze({ step: oceanStep, thickAir, cloudWater });

// oxlint-disable-next-line fp/no-mutating-methods -- the one way a classic script hands itself to Node
if (typeof module !== 'undefined') Object.assign(module, { exports: Ocean }); // for Node (tests)
