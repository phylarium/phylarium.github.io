// The bridge to the old scripts, which share one global scope and cannot import: what they need from the new
// modules is put on that scope under two names that cannot be pointed at anything else afterwards. CONTENT is
// the content model; CORE holds the rules of the world that have moved out of the old scripts. It shrinks as
// the old scripts move into src/.
import { strikeIn } from '../adapters/disaster-effects.js';
import { buildContent } from '../content/content.js';
import { ODDS, canStrike, nextStrike, oddsFactor, strikeTable } from '../core/disasters/odds.js';
import { DISASTER_RULES, SPELL_S } from '../core/disasters/rules.js';

/** @typedef {import('../core/disasters/rules.js').WorldView} WorldView */

/**
 * The rules the old scripts call, with what they need from the content already filled in.
 * @param {import('../content/content.js').Content} content
 */
const buildCore = content => {
  const table = strikeTable(content.disasters.list, content.research);
  return Object.freeze({
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

/**
 * Builds the content model from the parsed data files and gives it, and the rules, to the old scripts.
 * @param {import('../content/content.js').RawContent} raw
 * @param {object} scope the global object
 */
export const installModules = (raw, scope) => {
  const content = buildContent(raw);
  Object.defineProperty(scope, 'CONTENT', { value: content, enumerable: true });
  Object.defineProperty(scope, 'CORE', { value: buildCore(content), enumerable: true });
};
