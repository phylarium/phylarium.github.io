// People beside the raid's road, and what they do: a tunic in the color of what they hold, an arm up as they
// strike; stones thrown in an arc, spears in a line, fire bursting round a torch; dust where a creature falls, and
// the warm light of torches and the village fire at dusk and night.
import { DEFENDERS, SPOTS } from '../../core/humans/raid-map.js';
import { bayer, hash, mix } from './palette.js';
import { box } from './pen.js';
import { toPic } from './raid-field.js';

/** @typedef {import('./palette.js').Palette} Palette */
/** @typedef {import('../../core/humans/raid.js').Man} Man */
/** @typedef {import('../../core/humans/raid.js').Shot} Shot */
/** @typedef {CanvasRenderingContext2D} G */
/** @typedef {{ x: number, y: number, age: number }} Puff */

const TUNIC = Object.freeze({ stones: '#8a6a44', torch: '#9a3a2a', spear: '#4a5a80' });
/** A color in the hour's light: darker towards night. @param {Palette} p @param {string} c */
export const shade = (p, c) => mix(c, p.near, p.light * 0.55);

/** Where a person stands, in the picture. @param {number} spot */
export const footOf = spot => {
  const s = SPOTS[spot] ?? { x: 0, y: 0 },
    at = toPic(s.x, s.y);
  return { x: Math.round(at.x), y: Math.round(at.y) + 6 };
};

/** What a person holds: a spear, a torch with its flame, or a pile of stones. @param {G} g @param {Man} m @param {Palette} p @param {{ x: number, y: number, up: boolean, now: number }} at */
const held = (g, m, p, at) => {
  const { x, y, up } = at;
  if (m.kind === 'spear')
    return [
      box(g, shade(p, '#a08060'), [x + 4, up ? y - 22 : y - 18, 1, 14]),
      box(g, shade(p, '#d0d0d8'), [x + 4, up ? y - 24 : y - 20, 1, 2]),
    ];
  if (m.kind === 'torch') {
    const k = Math.floor(at.now / 90) % 3;
    return [
      box(g, shade(p, '#6a4a30'), [x + 4, y - 16, 1, 7]),
      box(g, '#ffd23f', [x + 3, y - 19 - (k % 2), 3, 3]),
      box(g, '#ff6a3c', [x + 4, y - 21 - k, 1, 2]),
    ];
  }
  return [box(g, shade(p, '#8a8a90'), [x - 6, y - 2, 2, 2]), box(g, shade(p, '#8a8a90'), [x - 5, y - 3, 2, 1])];
};

/** A person on their spot. @param {G} g @param {Man} m @param {Palette} p @param {number} now milliseconds */
export const drawPerson = (g, m, p, now) => {
  const { x, y } = footOf(m.spot),
    up = m.cool > DEFENDERS[m.kind].every - 0.25,
    tunic = shade(p, TUNIC[m.kind]),
    skin = shade(p, '#c08a64');
  box(g, 'rgba(0, 0, 0, 0.25)', [x - 5, y, 10, 2]);
  box(g, mix(tunic, '#000000', 0.3), [x - 3, y - 4, 2, 4]);
  box(g, mix(tunic, '#000000', 0.3), [x + 1, y - 4, 2, 4]);
  box(g, tunic, [x - 3, y - 11, 6, 7]);
  box(g, skin, [x - 2, y - 15, 4, 4]);
  box(g, shade(p, '#2a1a14'), [x - 2, y - 16, 4, 2]);
  box(g, skin, up ? [x + 3, y - 16, 1, 5] : [x + 3, y - 10, 1, 4]);
  held(g, m, p, { x, y, up, now });
};

/** A round warm light, dithered so it fades out. @param {G} g @param {Palette} p @param {{ x: number, y: number, r: number }} at */
export const glow = (g, p, at) =>
  Array.from({ length: (2 * at.r + 1) ** 2 }, (_, i) => ({
    dx: (i % (2 * at.r + 1)) - at.r,
    dy: Math.floor(i / (2 * at.r + 1)) - at.r,
  }))
    .map(o => ({ ...o, d: Math.hypot(o.dx, o.dy * 1.3) / at.r }))
    .filter(o => o.d < 1 && bayer(o.dx, o.dy) < (1 - o.d) * 0.5 * p.light)
    .map(o => box(g, mix(p.win, '#ff6a3c', o.d), [at.x + o.dx, at.y + o.dy]));

/** A blow on its way: f is how far it has come, 0 to 1. @param {G} g @param {Shot} s @param {Palette} p @param {number} now */
export const drawShot = (g, s, p, now) => {
  const from = footOf(s.spot),
    to = toPic(s.x, s.y),
    f = Math.min(1, s.age / 0.25),
    [x0, y0, x1, y1] = [from.x + 4, from.y - 16, to.x, to.y + 2];
  if (s.kind === 'stones')
    return box(g, mix('#9a9aa0', p.near, p.light * 0.3), [
      x0 + (x1 - x0) * f,
      y0 + (y1 - y0) * f - Math.sin(f * Math.PI) * 14,
      2,
      2,
    ]);
  if (s.kind === 'spear') {
    const l = Math.hypot(x1 - x0, y1 - y0) || 1;
    return Array.from({ length: 8 }, (_, k) =>
      box(g, '#e0c890', [x0 + (x1 - x0) * f - ((x1 - x0) / l) * k, y0 + (y1 - y0) * f - ((y1 - y0) / l) * k]),
    );
  }
  return Array.from({ length: 18 }, (_, k) => {
    const an = k * 2.4 + now / 200,
      r = f * 18 * hash(k, s.spot);
    return box(g, k % 3 ? '#ff6a3c' : '#ffd23f', [x0 - 4 + Math.cos(an) * r, y0 + 10 + Math.sin(an) * r * 0.6, 2, 1]);
  });
};

/** Dust where a creature fell, spreading and thinning. @param {G} g @param {Puff} pf @param {Palette} p */
export const drawPuff = (g, pf, p) =>
  Array.from({ length: 10 }, (_, k) => k)
    .filter(k => bayer(k, 1) > pf.age * 1.5)
    .map(k =>
      box(g, mix(p.dirt, p.cloudL, 0.3), [
        pf.x + Math.cos(k * 0.63) * pf.age * 30,
        pf.y + Math.sin(k * 0.63) * pf.age * 15 - pf.age * 8,
      ]),
    );

/** The free spots, faintly, while there is someone to stand there. @param {G} g @param {readonly Man[]} men */
export const drawSpots = (g, men) =>
  SPOTS.map((_, i) => i)
    .filter(i => !men.some(m => m.spot === i))
    .map(i => {
      const { x, y } = footOf(i);
      return [
        [-7, -3],
        [6, -3],
        [-7, 3],
        [6, 3],
      ].map(([dx = 0, dy = 0]) => box(g, 'rgba(255, 220, 150, 0.22)', [x + dx, y + dy, 2, 1]));
    });
