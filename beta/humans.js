'use strict';

// People on the planet: how many humans live, beside their species' share. The rule is in
// src/core/humans/people.js (CORE.life): the planet carries as many as the hunt, the gathering and the fields feed,
// and people grow towards that. Loads after evolve.js.

/** A species' share of a full population, 0 when it does not live. @param {string} id */
const shareOf = id => Math.max(0, /** @type {Record<string, number>} */ (state.species)[id] ?? 0);
/** The world as people see it now. */
const peopleView = () => ({
  erectus: shareOf('erectus'),
  sapiens: shareOf('sapiens'),
  known: /** @type {ReadonlySet<string>} */ (owned),
  grazers: shareOf('grazer'),
  green: Terrain.biomes().green,
});
/** How many people the planet feeds now. */
const peopleCarried = () => CORE.life.carrying(peopleView());
/** People move on by dt seconds. @param {number} dt */
const peopleTick = dt => {
  ({ people: state.people } = { people: CORE.life.peopleStep(state.people, peopleCarried(), dt) });
};
