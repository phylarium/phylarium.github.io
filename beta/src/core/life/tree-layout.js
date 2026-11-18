// Where each species sits in the drawn tree of life: the first cell at the bottom, branching upwards. Every
// species without children gets a column of its own, in the order of the species file, and a parent stands
// midway over the first and the last of its children. Rows count up from the root, so the root is in the
// bottom row.

/**
 * A species as the layout sees it.
 * @typedef {object} TreeSpecies
 * @property {string} id
 * @property {string} [parent]
 */

/**
 * A species' place: its column (a half when it stands between children) and its row, 0 at the top.
 * @typedef {object} TreePlace
 * @property {string} id
 * @property {string | undefined} parent
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {object} Placed
 * @property {readonly { id: string, parent: string | undefined, x: number, depth: number }[]} list
 * @property {number} next the next free column
 */

/**
 * @param {readonly TreeSpecies[]} species
 * @param {TreeSpecies} node
 * @param {number} depth
 * @param {number} column
 * @returns {Placed}
 */
const place = (species, node, depth, column) => {
  const kids = species.filter(s => s.parent === node.id);
  const self = (/** @type {number} */ x) => ({ id: node.id, parent: node.parent, x, depth });
  if (!kids.length) return { list: [self(column)], next: column + 1 };
  const below = kids.reduce(
    (/** @type {Placed} */ acc, kid) => {
      const p = place(species, kid, depth + 1, acc.next);
      return { list: [...acc.list, ...p.list], next: p.next };
    },
    { list: [], next: column },
  );
  const xs = below.list.filter(p => p.parent === node.id).map(p => p.x);
  return { list: [self((Math.min(...xs) + Math.max(...xs)) / 2), ...below.list], next: below.next };
};

/**
 * The places of the species that descend from the root (the first species without a parent).
 * @param {readonly TreeSpecies[]} species
 * @returns {{ places: TreePlace[], columns: number, rows: number }}
 */
export const treeLayout = species => {
  const root = species.find(s => !s.parent);
  if (!root) return { places: [], columns: 0, rows: 0 };
  const { list, next } = place(species, root, 0, 0);
  const rows = Math.max(...list.map(p => p.depth)) + 1;
  return {
    places: list.map(p => ({ id: p.id, parent: p.parent, x: p.x, y: rows - 1 - p.depth })),
    columns: next,
    rows,
  };
};
