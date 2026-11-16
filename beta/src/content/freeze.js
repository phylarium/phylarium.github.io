// Small tools for data that is never changed.

/**
 * `value` and everything inside it made read-only, for good. Arrays and plain objects are frozen; a Set or
 * Map is frozen as an object but keeps its own methods (the type still forbids them).
 * @template T
 * @param {T} value
 * @returns {Immutable<T>}
 */
export const deepFreeze = value => {
  const frozen = /** @type {Immutable<T>} */ (value);
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return frozen;
  Object.freeze(value);
  // oxlint-disable-next-line unicorn/no-array-for-each -- freezing is an effect, and the only one here
  Object.values(value).forEach(deepFreeze);
  return frozen;
};

/**
 * The items of a list by one of their fields: `indexBy(cards, card => card.id)`.
 * @template T
 * @param {readonly T[]} list
 * @param {(item: T) => string | undefined} key
 * @returns {Record<string, T>}
 */
export const indexBy = (list, key) =>
  Object.fromEntries(
    list.flatMap(item => (key(item) === undefined ? [] : [[/** @type {string} */ (key(item)), item]])),
  );
