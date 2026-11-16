// The bridge to the old scripts, which share one global scope and cannot import: what they need from the new
// modules is put on that scope under a name of its own. It shrinks as the old scripts move into src/.
import { buildContent } from '../content/content.js';

/**
 * Builds the content model from the parsed data files and gives it to the old scripts as the global `CONTENT`,
 * a name that cannot be pointed at anything else afterwards.
 * @param {import('../content/content.js').RawContent} raw
 * @param {object} scope the global object
 */
export const installContent = (raw, scope) => {
  Object.defineProperty(scope, 'CONTENT', { value: buildContent(raw), enumerable: true });
};
