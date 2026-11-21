// Drawing on a canvas for the human era's scenes: a rectangle in a color, and a buffer of pixels written whole for
// the layers drawn once (sky, ground). The only place these scenes change a canvas pixel by pixel.
import { rgb } from './palette.js';

/** @typedef {CanvasRenderingContext2D} G */

/** A canvas's 2D context. @param {HTMLCanvasElement} c */
export const context = c => /** @type {G} */ (c.getContext('2d'));

/** A rectangle in a color, at whole pixels (a dot when w and h are left out). @param {G} g @param {string} color @param {readonly number[]} at x, y, w, h */
export const box = (g, color, [x = 0, y = 0, w = 1, h = 1]) => {
  // oxlint-disable-next-line fp/no-mutation, no-param-reassign -- the canvas: its brush, set for each rectangle
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

/**
 * A layer's pixels, filled by a function of each pixel (a color, or null for none) and put on the canvas at once.
 * @param {HTMLCanvasElement} c
 * @param {(x: number, y: number) => string | null} colorAt
 * @param {readonly number[]} rows the first row and the row after the last
 */
export const paint = (c, colorAt, [from = 0, to = c.height]) => {
  const g = context(c),
    img = g.createImageData(c.width, c.height),
    d = img.data;
  Array.from({ length: Math.max(0, to - from) }, (_, n) => from + n).map(y =>
    Array.from({ length: c.width }, (_, x) => {
      const color = colorAt(x, y);
      if (!color) return null;
      const [r = 0, gr = 0, b = 0] = rgb(color),
        i = (y * c.width + x) * 4;
      // oxlint-disable-next-line fp/no-mutating-methods -- the pixels of a new image, written once before it is shown
      d.set([r, gr, b, 255], i);
      return null;
    }),
  );
  return img;
};
