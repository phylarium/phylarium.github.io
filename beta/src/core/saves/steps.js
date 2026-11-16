// Steps that bring an old save up to date, each a function from the old save to the parts that change. The steps
// before these still live in game.js (MIGRATIONS), which runs these after its own: STEPS[0] takes version 29 to 30.

/**
 * The parts of a save these steps read.
 * @typedef {object} OldSave
 * @property {readonly string[]} [upgrades] the cards developed
 * @property {Readonly<Record<string, readonly string[] | undefined>>} [found] the items found, by collection
 * @property {number} [soup] how much of the soup of life has formed
 * @property {readonly string[]} [happened] the events that have happened
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

/**
 * Version 30 to 31: Primordial Soup is a card, developed before lightning in a tidal pool makes any soup. A world
 * that has soup, has seen life begin or knows RNA or the First Cell knows the card.
 * @param {OldSave} saved
 * @returns {{ upgrades: string[] }}
 */
export const primordialSoup = saved => {
  const known = saved.upgrades ?? [];
  const begun = (saved.soup ?? 0) > 0 || (saved.happened ?? []).includes('life');
  const past = known.includes('rna') || known.includes('firstcell');
  return { upgrades: [...new Set([...known, ...(begun || past ? ['primordial'] : [])])] };
};

/** The steps in order, from version 29 on. */
export const STEPS = Object.freeze([rocksAndGemstones, primordialSoup]);
