// The tree of life drawn as small squares, as HTML: the first cell at the bottom, its branches growing up (the
// places come from treeLayout). Each square shows its species' picture, or a "?" for one not yet known, and a bar
// along its foot for how full a living species is or how far one evolving has come.

/** Pixels from one column, and one row, to the next; and the size of a square. */
const STEP_X = 36,
  STEP_Y = 44,
  CELL = 30;

/**
 * One species as the tree shows it.
 * @typedef {object} TreeSquare
 * @property {string} status alive, evolving, available, waiting, blocked or extinct (also its CSS class)
 * @property {string} picture the HTML inside the square
 * @property {number} fill 0 to 1: the bar along its foot
 */

/** @typedef {import('../core/life/tree-layout.js').TreePlace} TreePlace */

/** @param {number} n */
const percent = n => `${Math.round(n * 100)}%`;

/**
 * @param {TreePlace} p
 * @param {TreeSquare} square
 * @param {boolean} picked
 */
const squareHtml = (p, square, picked) =>
  `<button class="tol-node ${square.status}${picked ? ' picked' : ''}" data-id="${p.id}" style="left:${p.x * STEP_X}px;top:${p.y * STEP_Y}px">${square.picture}${
    square.fill > 0 ? `<i style="width:${percent(square.fill)}"></i>` : ''
  }</button>`;

/**
 * A branch, from the foot of a species down to its parent's head, as an elbow.
 * @param {TreePlace} p
 * @param {TreePlace} q the parent
 * @param {string} status
 */
const lineHtml = (p, q, status) => {
  const h = CELL / 2,
    mid = q.y * STEP_Y - (STEP_Y - CELL) / 2;
  return `<path class="${status}" d="M${p.x * STEP_X + h} ${p.y * STEP_Y + CELL}V${mid}H${q.x * STEP_X + h}V${q.y * STEP_Y}"/>`;
};

/**
 * The whole tree, sized to its columns and rows.
 * @param {{ places: readonly TreePlace[], columns: number, rows: number }} tree
 * @param {(id: string) => TreeSquare} squareOf
 * @param {string} picked the species tapped last, outlined
 */
export const treeHtml = (tree, squareOf, picked) => {
  const byId = new Map(tree.places.map(p => [p.id, p]));
  const lines = tree.places.flatMap(p => {
    const q = p.parent === undefined ? undefined : byId.get(p.parent);
    return q ? [lineHtml(p, q, squareOf(p.id).status)] : [];
  });
  return `<div class="tol" style="width:${tree.columns * STEP_X}px;height:${tree.rows * STEP_Y}px"><svg>${lines.join('')}</svg>${tree.places
    .map(p => squareHtml(p, squareOf(p.id), p.id === picked))
    .join('')}</div>`;
};

/**
 * How far to scroll sideways to put the first cell in the middle of a box this wide.
 * @param {{ places: readonly TreePlace[] }} tree
 * @param {number} width
 */
export const treeCentre = (tree, width) => (tree.places[0]?.x ?? 0) * STEP_X + CELL / 2 - width / 2;
