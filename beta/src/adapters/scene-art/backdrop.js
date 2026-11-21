// The back of a human-era scene (design docs: Art-Human-era): a sky in dithered bands with the sun cut by thin
// bands of sky (or the moon and stars), big clouds lit on the sun's side with long streaks below them, mountains
// faded into the sky, and pines.
import { bayer, luck, mix } from './palette.js';
import { box, context, paint } from './pen.js';

/** @typedef {import('./palette.js').Palette} Palette */
/** @typedef {CanvasRenderingContext2D} G */

/** Where the sun or moon stands at palette time t, in a picture `w` wide with its horizon at `horizon`. @param {number} t @param {number} w @param {number} horizon */
export const sunAt = (t, w, horizon) =>
  t > 2.6
    ? { x: w * 0.78, y: horizon * 0.24, r: 7, moon: true }
    : { x: w * 0.62, y: horizon * (0.33 + Math.min(1, t / 2) * 0.5), r: 18, moon: false };

/** The sky's color at a pixel: seven bands from the top down to the horizon, dithered into each other. @param {Palette} p @param {number} x @param {number} y @param {number} horizon */
const skyAt = (p, x, y, horizon) => {
  const t = y / horizon,
    [a, c, f] = t < 0.5 ? [p.skyTop, p.skyMid, t / 0.5] : [p.skyMid, p.skyHor, Math.min(1, (t - 0.5) / 0.5)],
    band = Math.floor(f * 7) / 7,
    step = f * 7 - Math.floor(f * 7) > bayer(x, y) ? 1 / 7 : 0;
  return mix(a, c, Math.min(1, band + step));
};
/** The sun's (or moon's) color at a pixel, or null off it; the sun's lower half is cut by bands of sky. @param {Palette} p @param {{ x: number, y: number, r: number, moon: boolean }} sun @param {number} x @param {number} y */
const sunPixel = (p, sun, x, y) => {
  const dx = x - sun.x,
    dy = y - sun.y;
  if (Math.hypot(dx, dy) > sun.r) return null;
  if (sun.moon) return Math.hypot(dx - 3, dy - 1) < sun.r - 1 ? mix(p.skyTop, p.sun, 0.15) : p.sun;
  return dy > 0 && Math.round(dy) % (dy > sun.r * 0.5 ? 3 : 4) === 0 ? null : p.sun;
};

/**
 * The sky down to below the horizon: bands, stars, and the sun or moon.
 * @param {HTMLCanvasElement} c
 * @param {Palette} p
 * @param {{ t: number, horizon: number, seed: number }} at
 */
export const drawSky = (c, p, at) => {
  const sun = sunAt(at.t, c.width, at.horizon),
    stars = new Set(
      Array.from(
        { length: Math.round(90 * p.stars) },
        (_, n) =>
          Math.round(luck(at.seed, 2 * n) * c.width) +
          c.width * Math.round(luck(at.seed, 2 * n + 1) * at.horizon * 0.7),
      ),
    ),
    star = mix(p.skyMid, '#ffffff', 0.5);
  context(c).putImageData(
    paint(c, (x, y) => sunPixel(p, sun, x, y) ?? (stars.has(x + c.width * y) ? star : skyAt(p, x, y, at.horizon)), [
      0,
      at.horizon + 8,
    ]),
    0,
    0,
  );
};

/** Which pixels of a band `h` tall the clouds cover. @param {number} w @param {number} h @param {number} seed */
const cloudMask = (w, h, seed) => {
  const blobs = Array.from({ length: 3 }, (_, k) => {
    const bx = luck(seed, 10 * k) * w,
      by = h * (0.25 + luck(seed, 10 * k + 1) * 0.4),
      width = 40 + luck(seed, 10 * k + 2) * 60;
    return Array.from({ length: 8 }, (_, n) => {
      const r = 5 + luck(seed, 10 * k + 3 + n) * 10 * (1 - Math.abs(n / 7 - 0.5));
      return { x: bx + (n / 7 - 0.5) * width, y: by - r * 0.5, r, base: by };
    });
  }).flat();
  return (/** @type {number} */ x, /** @type {number} */ y) => {
    const xx = ((x % w) + w) % w;
    return blobs.some(
      b => y < b.base && Math.hypot(Math.min(Math.abs(xx - b.x), w - Math.abs(xx - b.x)), (y - b.y) * 1.25) < b.r,
    );
  };
};

/**
 * Clouds over the sky, in a band at the top: a light rim towards the sun, a mid tone, a dithered shadow below.
 * @param {HTMLCanvasElement} c
 * @param {Palette} p
 * @param {{ sunX: number, height: number, seed: number }} at
 */
export const drawClouds = (c, p, at) => {
  const on = cloudMask(c.width, at.height, at.seed),
    color = (/** @type {number} */ x, /** @type {number} */ y) => {
      if (!on(x, y)) return null;
      const s = Math.sign(at.sunX - x) || 1;
      if (!on(x + s * 2, y - 2)) return p.cloudL;
      if (!on(x, y + 3)) return bayer(x, y) > 0.35 ? p.cloudS : p.cloudM;
      return bayer(x, y) > 0.85 ? p.cloudL : p.cloudM;
    };
  const g = context(c);
  g.putImageData(paint(c, color, [0, at.height]), 0, 0);
  Array.from({ length: 10 }, (_, k) =>
    box(g, mix(p.cloudS, p.skyTop, 0.3), [
      luck(at.seed, 50 + k) * c.width,
      at.height * 0.45 + luck(at.seed, 70 + k) * at.height * 0.45,
      12 + luck(at.seed, 90 + k) * 50,
      1,
    ]),
  );
};

/**
 * Mountains along the horizon, faded into the sky, their slopes towards the sun catching the light.
 * @param {HTMLCanvasElement} c
 * @param {Palette} p
 * @param {{ sunX: number, horizon: number, seed: number }} at
 */
export const drawFar = (c, p, at) => {
  const g = context(c),
    col = mix(p.far, p.skyHor, 0.25),
    rim = mix(col, p.cloudL, 0.3),
    wave = (/** @type {number} */ x, /** @type {number} */ n) =>
      Array.from(
        { length: 3 },
        (_, k) => Math.sin(x * (0.013 + 0.02 * k * n) + luck(at.seed, k + 7 * n) * 6) / (k + 1),
      ).reduce((s, v) => s + v, 0),
    top = (/** @type {number} */ x) => Math.round(at.horizon - 26 - wave(x, 1) * 14 - wave(x, 3) * 3);
  Array.from({ length: c.width }, (_, x) => {
    const h = top(x);
    box(g, col, [x, h, 1, at.horizon + 10 - h]);
    return top(x + 1) > h === at.sunX > x ? box(g, rim, [x, h, 1, 2]) : null;
  });
};

/**
 * A pine: rows widening downwards with a notch every few rows, lit on the sun's side when `lit` is given.
 * @param {G} g
 * @param {{ x: number, base: number, h: number, col: string, lit?: string }} tree
 * @param {number} sunX
 */
export const pine = (g, tree, sunX) => {
  Array.from({ length: Math.round(tree.h) }, (_, y) => {
    const w = Math.round((y / tree.h) * tree.h * 0.3 + (y % 5 === 4 ? 1.5 : 0)),
      row = tree.base - tree.h + y;
    box(g, tree.col, [tree.x - w, row, w * 2 + 1, 1]);
    return tree.lit && w > 1 ? box(g, tree.lit, [tree.x + (sunX > tree.x ? w - 1 : -w), row]) : null;
  });
  box(g, mix(tree.col, '#000000', 0.3), [tree.x, tree.base, 1, 3]);
};

/**
 * A wall of pines along a line, in two rows (the back one faded), with a gap where a road comes through.
 * @param {HTMLCanvasElement} c
 * @param {Palette} p
 * @param {{ sunX: number, back: number, front: number, gap: number, seed: number }} at
 */
export const drawEdge = (c, p, at) => {
  const g = context(c),
    row = (/** @type {number} */ k, /** @type {number} */ step) =>
      Array.from(
        { length: Math.ceil(c.width / step) + 2 },
        (_, n) => (n - 1) * step + luck(at.seed, k + n) * step * 0.8,
      );
  row(0, 6)
    .filter(x => Math.abs(x - at.gap) > 14)
    .map((x, n) =>
      pine(g, { x, base: at.back, h: 16 + luck(at.seed, 300 + n) * 14, col: mix(p.tree, p.far, 0.4) }, at.sunX),
    );
  row(500, 8)
    .filter(x => Math.abs(x - at.gap) > 16)
    .map((x, n) =>
      pine(
        g,
        { x, base: at.front, h: 22 + luck(at.seed, 700 + n) * 18, col: p.tree, lit: mix(p.tree, p.cloudL, 0.18) },
        at.sunX,
      ),
    );
};
