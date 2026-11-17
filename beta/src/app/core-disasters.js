// The disasters' part of CORE (core.js): their rules and odds, with the content's table already filled in.
import { strikeIn } from '../adapters/disaster-effects.js';
import { ODDS, canStrike, nextStrike, oddsFactor, strikeTable } from '../core/disasters/odds.js';
import { DISASTER_RULES, SPELL_S } from '../core/disasters/rules.js';

/** @typedef {import('../core/disasters/rules.js').WorldView} WorldView */

/** @param {import('../content/content.js').Content} content */
export const buildDisasters = content => {
  const table = strikeTable(content.disasters.list, content.research);
  return Object.freeze({
    RULES: DISASTER_RULES,
    SPELL_S,
    ODDS,
    canStrike,
    strikeIn,
    /** @param {string} id @param {WorldView} view */
    oddsFactor: (id, view) => oddsFactor(id, view, table),
    /** @param {WorldView} view @param {number} dt @param {() => number} random */
    nextStrike: (view, dt, random) => nextStrike(table, view, dt, random),
  });
};
