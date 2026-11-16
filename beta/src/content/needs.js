// A need is a condition on the world, written in the data files as text: "temp 15", "done magnet", "daytime".

/**
 * A need as the rules read it: its kind, and its value (a number, a word, several of them, or none).
 * @typedef {[kind: string, value: number | string | (number | string)[]]} Need
 */

/** @param {string} word @returns {number | string} */
const numberOrWord = word => (Number.isNaN(Number(word)) ? word : Number(word));

/**
 * "temp -210" is ['temp', -210]; "done magnet" is ['done', 'magnet']; "daytime" is ['daytime', []].
 * @param {string | number} text
 * @returns {Need}
 */
export const parseNeed = text => {
  const [kind = '', ...rest] = String(text).split(' ').filter(Boolean);
  const values = rest.map(numberOrWord);
  const [only] = values;
  return [kind, values.length === 1 && only !== undefined ? only : values];
};

/**
 * An entry of a data file (a card of the research tree, a species of the tree of life) as far as the content
 * model reads it. The files hold many more fields (effects, icons, habitats); they pass through untouched and
 * untyped until a module of their own models them.
 * @typedef {{ id: string, name: string, needs?: (string | number)[] | undefined, [field: string]: any }} RawEntry
 */
/** The same entry with its needs parsed. @typedef {Omit<RawEntry, 'needs'> & { id: string, name: string, needs?: Need[] | undefined }} Entry */

/** @param {RawEntry} entry @returns {Entry} */
export const withNeeds = entry => ({ ...entry, needs: entry.needs?.map(parseNeed) });
