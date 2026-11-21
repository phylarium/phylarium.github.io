// The palette of the human era's scenes (design docs: Art-Human-era): four keyframes of the day, mixed by the hour,
// so every scene at the same hour shares its colors. Also the small tools the scenes draw with: an ordered dither,
// a hash, smooth noise and seeded luck.

/** @typedef {{ name: string, skyTop: string, skyMid: string, skyHor: string, sun: string, cloudL: string, cloudM: string, cloudS: string, far: string, mid: string, near: string, fg: string, tree: string, ground: string, dirt: string, win: string, light: number, stars: number }} Palette */

/** Day, golden hour, dusk and night. @type {readonly Palette[]} */
const KEYS = [
  {
    name: 'day',
    skyTop: '#4d74b0',
    skyMid: '#86a9d6',
    skyHor: '#d9d6c6',
    sun: '#fff6d8',
    cloudL: '#ffffff',
    cloudM: '#dfe5f0',
    cloudS: '#a5b2cb',
    far: '#8d9dc0',
    mid: '#4f6190',
    near: '#2b3558',
    fg: '#161b30',
    tree: '#3d6a42',
    ground: '#6f9046',
    dirt: '#ab8659',
    win: '#f5d27a',
    light: 0,
    stars: 0,
  },
  {
    name: 'golden',
    skyTop: '#6788b6',
    skyMid: '#b5bdd0',
    skyHor: '#f2c98e',
    sun: '#fff0b2',
    cloudL: '#ffd38c',
    cloudM: '#f0a676',
    cloudS: '#a97482',
    far: '#7a7896',
    mid: '#3a4262',
    near: '#1f2542',
    fg: '#10142a',
    tree: '#33503f',
    ground: '#5f6a3e',
    dirt: '#9c7050',
    win: '#ffc860',
    light: 0.25,
    stars: 0,
  },
  {
    name: 'dusk',
    skyTop: '#1b2150',
    skyMid: '#6a3a6e',
    skyHor: '#ff6a3c',
    sun: '#ff3b2f',
    cloudL: '#ffae6e',
    cloudM: '#d9675a',
    cloudS: '#6e3458',
    far: '#56477a',
    mid: '#2d2d5c',
    near: '#1a1c41',
    fg: '#0d0f25',
    tree: '#272347',
    ground: '#363050',
    dirt: '#5e3f50',
    win: '#ffb347',
    light: 0.7,
    stars: 0.2,
  },
  {
    name: 'night',
    skyTop: '#04050e',
    skyMid: '#0d1330',
    skyHor: '#25315c',
    sun: '#e6e6f2',
    cloudL: '#3b4568',
    cloudM: '#232b4a',
    cloudS: '#141a31',
    far: '#1d2547',
    mid: '#121734',
    near: '#0b0e23',
    fg: '#05060f',
    tree: '#0e1428',
    ground: '#141a30',
    dirt: '#211f34',
    win: '#ffcf6a',
    light: 1,
    stars: 1,
  },
];

/** A color as red, green and blue. @param {string} h @returns {readonly number[]} */
export const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hex = (/** @type {readonly number[]} */ c) =>
  `#${c
    .map(v =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
/** Two colors mixed, f of the way from a to b. @param {string} a @param {string} b @param {number} f */
export const mix = (a, b, f) => {
  const A = rgb(a),
    B = rgb(b);
  return hex(A.map((v, i) => v + ((B[i] ?? v) - v) * f));
};

/** The palette at t: 0 day, 1 golden hour, 2 dusk, 3 night, and between. @param {number} t @returns {Palette} */
export const paletteAt = t => {
  const i = Math.max(0, Math.min(2, Math.floor(t))),
    f = Math.max(0, Math.min(1, t - i)),
    a = KEYS[i] ?? /** @type {Palette} */ (KEYS[0]),
    b = KEYS[i + 1] ?? a;
  return /** @type {Palette} */ (
    Object.fromEntries(
      Object.entries(a).map(([k, v]) => {
        const w = /** @type {Record<string, string | number>} */ (b)[k] ?? v,
          mixed = typeof v === 'number' ? v + (Number(w) - v) * f : mix(String(v), String(w), f);
        return /** @type {[string, string | number]} */ ([k, k === 'name' ? (f < 0.5 ? v : w) : mixed]);
      }),
    )
  );
};

/** The hour of the day as the palette's t: night until dawn, golden in the morning and evening, dusk at sunset. */
const HOURS = [
  [0, 3],
  [4.5, 3],
  [5.5, 2],
  [6.5, 1],
  [8, 0],
  [15, 0],
  [17.5, 1],
  [19, 2],
  [21, 3],
  [24, 3],
];
/** @param {number} hour 0 to 24 */
export const hourToT = hour => {
  const h = ((hour % 24) + 24) % 24,
    n = HOURS.findIndex(([at = 0]) => at > h),
    [h0 = 0, t0 = 0] = HOURS[n - 1] ?? [0, 3],
    [h1 = 24, t1 = 3] = HOURS[n] ?? [24, 3];
  return t0 + ((t1 - t0) * (h - h0)) / (h1 - h0 || 1);
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
/** The ordered dither's threshold at a pixel, 0 to 1. @param {number} x @param {number} y */
export const bayer = (x, y) => BAYER[(Math.round(y) & 3) * 4 + (Math.round(x) & 3)] ?? 0.5;
/** A number from 0 to 1 that is the same for the same pixel. @param {number} x @param {number} y */
export const hash = (x, y) => {
  const h = Math.imul(Math.round(x) * 374761393 + Math.round(y) * 668265263, 1274126177),
    m = h ^ (h >>> 13);
  return ((Math.imul(m, 1103515245) >>> 0) % 1000) / 1000;
};
/** Smooth noise from 0 to 1, in patches about k pixels across. @param {number} x @param {number} y @param {number} k */
export const vnoise = (x, y, k) => {
  const gx = x / k,
    gy = y / k,
    ix = Math.floor(gx),
    iy = Math.floor(gy),
    fx = gx - ix,
    fy = gy - iy,
    u = fx * fx * (3 - 2 * fx),
    v = fy * fy * (3 - 2 * fy),
    a = hash(ix + 500, iy + 500),
    b = hash(ix + 501, iy + 500),
    c = hash(ix + 500, iy + 501),
    d = hash(ix + 501, iy + 501);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
/** The n-th draw of luck for a seed, 0 to 1. @param {number} seed @param {number} n */
export const luck = (seed, n) => hash(seed * 7919 + n, n * 31 + 17);
