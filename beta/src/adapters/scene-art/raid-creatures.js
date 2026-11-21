// The creatures of the raid ladder, drawn at the raid field's finer pixels and moving: legs that step, a snake that
// winds, a lion's mane, a bear's round ears, tusks and a trunk. Each stands at its foot (x, y) facing f (1 right,
// -1 left), at time t in seconds, in its color already shaded for the hour.
import { mix } from './palette.js';
import { box } from './pen.js';

/** @typedef {CanvasRenderingContext2D} G */
/** @typedef {{ x: number, y: number, f: number, t: number, col: string }} Pose */

/** Each creature's own color, by day. */
export const CREATURE_COLORS = Object.freeze({
  spider: '#3a3036',
  scorpion: '#8a5a2a',
  snake: '#5d7a32',
  wolf: '#7c7a86',
  boar: '#5a4030',
  bear: '#5e3c22',
  bigcat: '#c08a40',
  elephant: '#8a8690',
});
const BLACK = '#000000',
  WHITE = '#ffffff',
  IVORY = '#f0ead8',
  EYE = '#ff4030';

/**
 * A four-legged animal side on: legs that step, a body rounded at the ends with a lit back, a head and an eye.
 * @param {G} g
 * @param {Pose} s
 * @param {{ len: number, tall: number, head: number, belly: string }} body
 * @returns {{ ex: number, ey: number }} the middle of its head
 */
const quad = (g, s, body) => {
  const { x, y, f, col } = s,
    step = Math.sin(s.t * 12) * 2,
    legs = [
      [-body.len / 2 + 2, step],
      [-body.len / 2 + 4, -step],
      [body.len / 2 - 4, -step],
      [body.len / 2 - 2, step],
    ];
  legs.map(([lx = 0, st = 0]) => box(g, mix(col, BLACK, 0.35), [x + lx * f, y - 4, 2, 4 + Math.round(st / 2)]));
  Array.from({ length: body.tall }, (_, dy) => {
    const w = Math.round(body.len / 2 - Math.abs(dy - body.tall / 2) * 0.6),
      c = dy === 0 ? mix(col, WHITE, 0.25) : dy > body.tall - 2 ? body.belly : col;
    return box(g, c, [x - w, y - 4 - body.tall + dy, w * 2, 1]);
  });
  const hx = x + f * (body.len / 2 - 1) - (f < 0 ? body.head : 0),
    hy = y - 3 - body.tall - body.head / 2;
  box(g, col, [hx, hy, body.head, body.head]);
  box(g, '#f0e0c0', [x + f * (body.len / 2 + body.head - 2) - (f < 0 ? 1 : 0), hy + 1]);
  return { ex: x + f * (body.len / 2 + body.head / 2), ey: hy };
};

/** @type {Readonly<Record<string, (g: G, s: Pose) => unknown>>} */
const DRAW = {
  spider: (g, { x, y, f, t, col }) => {
    box(g, col, [x - 3, y - 5, 6, 4]);
    box(g, col, [x - 2 + f * 3, y - 4, 3, 3]);
    Array.from({ length: 8 }, (_, i) => {
      const k = i >> 1,
        side = i % 2 ? 1 : -1,
        l = Math.sin(t * 16 + k * 1.7) * 1.5;
      return [
        box(g, col, [x - 3 + k * 2, y - 3 + side * (2 + l), 1, 2]),
        box(g, col, [x - 4 + k * 2 + side, y - 2 + side * (3 + l)]),
      ];
    });
    box(g, EYE, [x + f * 3, y - 4]);
  },
  scorpion: (g, { x, y, f, t, col }) => {
    box(g, col, [x - 4, y - 4, 8, 3]);
    [0, 1, 2, 3].map(k => box(g, col, [x - f * (4 + k), y - 5 - k * 2, 2, 2]));
    box(g, col, [x - f * 6, y - 13, 2, 2]);
    box(g, col, [x + f * 5, y - 5, 3, 2]);
    box(g, col, [x + f * 7, y - 4, 2, 1]);
    [0, 1, 2].map(k => box(g, mix(col, BLACK, 0.4), [x - 3 + k * 3, y - 1 + (Math.sin(t * 14 + k) > 0 ? 0 : 1)]));
  },
  snake: (g, { x, y, f, t, col }) => {
    Array.from({ length: 16 }, (_, k) =>
      box(g, k % 4 === 0 ? mix(col, '#e0d070', 0.4) : col, [
        x - f * (k - 6),
        y - 3 + Math.sin(t * 9 - k * 0.6) * 2,
        2,
        2,
      ]),
    );
    box(g, col, [x + f * 7, y - 5, 3, 3]);
    box(g, EYE, [x + f * 10, y - 4]);
  },
  wolf: (g, s) => {
    const e = quad(g, s, { len: 14, tall: 5, head: 4, belly: mix(s.col, WHITE, 0.25) });
    box(g, s.col, [e.ex - 1, e.ey - 2, 1, 2]);
    box(g, s.col, [s.x - s.f * 8, s.y - 9 + Math.sin(s.t * 6), 3, 2]);
  },
  boar: (g, s) => {
    const e = quad(g, s, { len: 14, tall: 6, head: 5, belly: mix(s.col, BLACK, 0.2) });
    box(g, IVORY, [e.ex + s.f * 2, e.ey + 3, 1, 2]);
    [-4, -2, 0, 2].map(k => box(g, mix(s.col, BLACK, 0.4), [s.x + k, s.y - 11]));
  },
  bear: (g, s) => {
    const e = quad(g, { ...s, t: s.t * 0.7 }, { len: 18, tall: 9, head: 6, belly: mix(s.col, BLACK, 0.2) });
    box(g, s.col, [e.ex - 2, e.ey - 2, 2, 2]);
    box(g, s.col, [e.ex + 1, e.ey - 2, 2, 2]);
  },
  bigcat: (g, s) => {
    const e = quad(g, s, { len: 17, tall: 5, head: 5, belly: mix(s.col, WHITE, 0.3) });
    box(g, mix(s.col, '#5a2a10', 0.45), [e.ex - 4, e.ey - 1, 7, 7]);
    box(g, s.col, [e.ex - 1, e.ey + 1, 4, 4]);
    Array.from({ length: 6 }, (_, k) =>
      box(g, s.col, [s.x - s.f * (9 + k), s.y - 8 - Math.sin(k * 0.6 + s.t * 4) * 2]),
    );
  },
  elephant: (g, s) => {
    const e = quad(g, { ...s, t: s.t * 0.5 }, { len: 26, tall: 14, head: 9, belly: mix(s.col, BLACK, 0.2) });
    box(g, mix(s.col, BLACK, 0.15), [e.ex - 4 - s.f * 3, e.ey, 6, 10]);
    Array.from({ length: 9 }, (_, k) =>
      box(g, s.col, [e.ex + s.f * (4 + Math.sin(k * 0.3 + s.t) * 1.5), e.ey + 5 + k, 2, 1]),
    );
    box(g, IVORY, [e.ex + s.f * 3, e.ey + 8, 3, 1]);
  },
};

/**
 * A creature on the road: its shadow, itself, and a bar of what it has left once it is hurt.
 * @param {G} g
 * @param {string} id
 * @param {Pose} s
 * @param {number} hurt how much it has left, 0 to 1
 */
export const drawCreature = (g, id, s, hurt) => {
  box(g, 'rgba(0, 0, 0, 0.25)', [s.x - 6, s.y, 12, 2]);
  (DRAW[id] ?? DRAW['wolf'])?.(g, s);
  if (hurt >= 1) return;
  box(g, 'rgba(0, 0, 0, 0.5)', [s.x - 7, s.y - 22, 14, 2]);
  box(g, '#e04838', [s.x - 7, s.y - 22, Math.max(1, 14 * hurt), 2]);
};
