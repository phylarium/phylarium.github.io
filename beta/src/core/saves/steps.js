// Steps that bring an old save up to date, as functions from the old save to the new one. The steps before these
// still live in game.js (MIGRATIONS), which calls these by version.

/**
 * The parts of a save these steps read.
 * @typedef {object} OldSave
 * @property {readonly string[]} [upgrades] the cards developed
 * @property {Readonly<Record<string, readonly string[] | undefined>>} [found] the items found, by collection
 */

/** The Volcanic rocks, in the order a world that had found Deep treasures is given them. */
const ROCKS = ['basalt', 'obsidian', 'pumice', 'tuff', 'granite', 'geode'];

/** @param {readonly string[] | undefined} list */
const count = list => (list ?? []).length;

/**
 * Version 29 to 30: Deep treasures are gone, and Rocks and Gemstones are cards, each with its set. A world that
 * had found treasures has as many Volcanic rocks; one that had found any of a set, or developed what the set
 * opens, knows the set's card.
 * @param {OldSave} saved
 * @returns {{ upgrades: string[], found: Record<string, readonly string[] | undefined> }}
 */
export const rocksAndGemstones = saved => {
  const known = saved.upgrades ?? [];
  const treasures = count(saved.found?.['treasures']);
  const rock = treasures > 0 || known.includes('richsoil');
  const gemstone = count(saved.found?.['gems']) > 0 || known.includes('drift');
  return {
    upgrades: [...new Set([...known, ...(rock ? ['rock'] : []), ...(gemstone ? ['gemstone'] : [])])],
    found: { ...saved.found, treasures: undefined, rocks: ROCKS.slice(0, treasures) },
  };
};
