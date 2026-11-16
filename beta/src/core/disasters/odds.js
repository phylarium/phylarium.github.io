// How likely a disaster is to strike, and which one strikes next. A disaster strikes about once per `every`
// seconds (data/disasters.yaml) while its card is known and its rule's `when` holds; the odds are scaled by the
// computer's dials, the Calm boosts, the Rainbow, the ultra that answers it, and by knowing every disaster.
import { DISASTER_RULES } from './rules.js';

/** @typedef {import('./rules.js').WorldView} WorldView */
/** @typedef {{ id: string, name: string, how?: string | undefined, every?: number | undefined }} Disaster */
/** @typedef {{ id: string, [field: string]: any }} Card */
/**
 * What the odds need from the content, worked out once.
 * @typedef {object} StrikeTable
 * @property {readonly { id: string, every: number }[]} striking the disasters that strike on their own, in order
 * @property {readonly string[]} ids every disaster
 * @property {Readonly<Record<string, string>>} ultraOf the ultra that answers a disaster, by the disaster's id
 */

/** What is left of the odds once the Rainbow is known, the answering ultra is gained, every disaster has struck. */
export const ODDS = Object.freeze({ rainbow: 0.75, ultra: 0.5, allStruck: 0.5 });

/**
 * Each ultra answers the disaster it requires (its story's, or one inside the story: Fertile Delta answers the
 * Flood).
 * @param {readonly Card[]} cards
 * @returns {Record<string, string>}
 */
const ultrasOf = cards => {
  const disasters = new Set(cards.filter(card => card['disaster']).map(card => card.id));
  return Object.fromEntries(
    cards
      .filter(card => card['ultra'])
      .flatMap(ultra =>
        /** @type {string[]} */ (ultra['requires'] ?? []).filter(id => disasters.has(id)).map(id => [id, ultra.id]),
      ),
  );
};

/**
 * @param {readonly Disaster[]} disasters
 * @param {readonly Card[]} cards
 * @returns {StrikeTable}
 */
export const strikeTable = (disasters, cards) => ({
  striking: disasters.flatMap(d => (d.every ? [{ id: d.id, every: d.every }] : [])),
  ids: disasters.map(d => d.id),
  ultraOf: ultrasOf(cards),
});

/** @param {string} id @param {WorldView} view */
const dial = (id, view) => {
  const control = DISASTER_RULES[id]?.control;
  return control === undefined ? 1 : (view.controls[control] ?? 1);
};

/**
 * What scales a disaster's odds: 1 is its plain rate, 0 never.
 * @param {string} id
 * @param {WorldView} view
 * @param {StrikeTable} table
 */
export const oddsFactor = (id, view, table) => {
  const ultra = table.ultraOf[id];
  return (
    dial(id, view) *
    view.calm *
    (view.known.has('rainbow') ? ODDS.rainbow : 1) *
    (ultra !== undefined && view.known.has(ultra) ? ODDS.ultra : 1) *
    (table.ids.every(one => view.struck[one]) ? ODDS.allStruck : 1)
  );
};

/** Its card is known and the world is right for it. @param {string} id @param {WorldView} view */
export const canStrike = (id, view) => view.known.has(id) && (DISASTER_RULES[id]?.when?.(view) ?? true);

/**
 * The disaster that strikes in the next `dt` seconds, if any: the first, in the table's order, that can strike
 * and whose number comes up.
 * @param {StrikeTable} table
 * @param {WorldView} view
 * @param {number} dt
 * @param {() => number} random
 * @returns {string | undefined}
 */
export const nextStrike = (table, view, dt, random) =>
  table.striking.find(d => canStrike(d.id, view) && random() < (dt / d.every) * oddsFactor(d.id, view, table))?.id;
