// CORE: the rules of the world that have moved out of the old scripts, as the old scripts call them (see
// legacy.js, which puts it on their scope).
import { runIn, strikeIn } from '../adapters/disaster-effects.js';
import { CARD_BEHAVIOUR } from '../core/cards/behaviour.js';
import { ODDS, canStrike, nextStrike, oddsFactor, strikeTable } from '../core/disasters/odds.js';
import { DISASTER_RULES, SPELL_S } from '../core/disasters/rules.js';
import { STEPS } from '../core/saves/steps.js';

/** @typedef {import('../core/disasters/rules.js').WorldView} WorldView */

/**
 * The rules the old scripts call, with what they need from the content already filled in.
 * @param {import('../content/content.js').Content} content
 */
export const buildCore = content => {
  const table = strikeTable(content.disasters.list, content.research);
  return Object.freeze({
    cards: Object.freeze({ BEHAVIOUR: CARD_BEHAVIOUR }),
    saves: Object.freeze({ STEPS }),
    effects: Object.freeze({ runIn }),
    disasters: Object.freeze({
      RULES: DISASTER_RULES,
      SPELL_S,
      ODDS,
      canStrike,
      strikeIn,
      /** @param {string} id @param {WorldView} view */
      oddsFactor: (id, view) => oddsFactor(id, view, table),
      /** @param {WorldView} view @param {number} dt @param {() => number} random */
      nextStrike: (view, dt, random) => nextStrike(table, view, dt, random),
    }),
  });
};
/** @typedef {ReturnType<typeof buildCore>} Core */
