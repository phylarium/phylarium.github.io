'use strict';

// A twinkle over each plant or animal in the close-up that has not been found yet (tile-life.js marks them), so a
// new species stands out from those already in the book. It moves round the top of the sprite and pulses, a step
// each time the tiles are drawn. Loads after tile-life.js, so it draws over the sprites.

/** The twinkle's size, a step per redraw: 0 is a single bright pixel, 2 a cross with long arms. */
const SPARKLE_SIZE = [0, 1, 2, 1, 0, -1];
/** Where it shines on the sprite, as shares of its width and height from the top left. */
const SPARKLE_AT = [
  [0.85, 0.1],
  [0.15, 0.25],
  [0.75, 0.45],
  [0.25, 0.05],
];

/**
 * One twinkle: a white heart and yellow arms, or nothing at the end of its pulse.
 * @param {CanvasRenderingContext2D} g
 * @param {{ x: number, y: number, size: number }} at
 */
const sparkle = (g, at) => {
  const arms = Array.from({ length: at.size }, (_, k) => k + 1).flatMap(d => [
    [at.x - d, at.y],
    [at.x + d, at.y],
    [at.x, at.y - d],
    [at.x, at.y + d],
  ]);
  // oxlint-disable-next-line fp/no-mutation, no-param-reassign -- the canvas's pen, the one thing a drawing changes
  g.fillStyle = '#ffd23f';
  arms.map(([x = 0, y = 0]) => g.fillRect(x, y, 1, 1));
  // oxlint-disable-next-line fp/no-mutation, no-param-reassign -- the canvas's pen, the one thing a drawing changes
  g.fillStyle = '#ffffff';
  return at.size >= 0 && g.fillRect(at.x, at.y, 1, 1);
};

/** @type {HTMLElement} */ (document.getElementById('tiles')).addEventListener('drawn', e => {
  const g = context2d(/** @type {HTMLCanvasElement} */ (document.querySelector('#tiles canvas'))),
    frame = Math.floor(/** @type {CustomEvent<number>} */ (e).detail / 400);
  tileThings()
    .filter(t => t.fresh)
    .map(t => {
      const { img, left, top } = thingBox(t),
        step = frame + (tileHash(t.tile.i) % 24),
        [fx = 0, fy = 0] = SPARKLE_AT[Math.floor(step / SPARKLE_SIZE.length) % SPARKLE_AT.length] ?? [],
        size = SPARKLE_SIZE[step % SPARKLE_SIZE.length] ?? -1;
      return sparkle(g, { x: left + Math.round(fx * img.width), y: top + Math.round(fy * img.height), size });
    });
});
