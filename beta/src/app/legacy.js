// The bridge to the old scripts, which share one global scope and cannot import: what they need from the new
// modules is put on that scope under two names that cannot be pointed at anything else afterwards. CONTENT is
// the content model; CORE holds the rules of the world that have moved out of the old scripts. It shrinks as
// the old scripts move into src/.
import { buildContent } from '../content/content.js';
import { buildCore } from './core.js';

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
