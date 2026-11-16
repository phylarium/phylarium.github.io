// The contest between two animals that share a region: rock-paper-scissors decides who gains.
//   claw beats venom, venom beats speed, speed beats claw; the same hand goes to the higher attack.
// The winner takes from the loser by how far its attack is above the loser's defense.

/** @typedef {import('./species.js').Species} Species */

/** What each hand beats. */
const BEATS = Object.freeze({ claw: 'venom', venom: 'speed', speed: 'claw' });

/**
 * Who wins: 1 when `a` does, -1 when `b` does, 0 when neither.
 * @param {Species} a
 * @param {Species} b
 * @returns {1 | 0 | -1}
 */
export const winner = (a, b) => {
  if (BEATS[a.style] === b.style) return 1;
  if (BEATS[b.style] === a.style) return -1;
  return a.attack === b.attack ? 0 : a.attack > b.attack ? 1 : -1;
};

/**
 * What the winner takes of the loser's numbers, as a share per unit of both populations and of time: its
 * attack above the loser's defense, and half of that from a poisonous loser.
 * @param {Species} victor
 * @param {Species} loser
 */
export const bite = (victor, loser) =>
  Math.max(0, victor.attack - loser.defense) * ((loser.traits ?? []).includes('poison') ? 0.5 : 1);
