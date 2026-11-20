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
  huts: campHuts(), // camp.js
});
/** How many people the planet feeds now. */
const peopleCarried = () => CORE.life.carrying(peopleView());
/** People move on by dt seconds. @param {number} dt */
const peopleTick = dt => {
  ({ people: state.people } = { people: CORE.life.peopleStep(state.people, peopleCarried(), dt) });
  campTick(dt); // and their camp (camp.js)
};
/** Fields and towns for the map (Terrain features), and the camp's huts and fields (camp.js). */
const settlement = () => ({
  ...CORE.life.settlement(state.people, /** @type {ReadonlySet<string>} */ (owned)),
  camp: campCover(),
});
/** The species of people themselves: they live on their own fields and towns. */
const PEOPLE_SPECIES = new Set(['erectus', 'sapiens']);
/**
 * The zones' shares of the land for a species: wild life loses what people farm.
 * @param {{ id: string }} s
 */
const zoneSharesFor = s =>
  PEOPLE_SPECIES.has(s.id) ? Terrain.zones() : CORE.life.wildShares(Terrain.zones(), Terrain.biomes().farm);
/** A number of people, in words (a need of the human cards). @param {number} v */
const peopleText = v => `${fmt(v)} people`;
