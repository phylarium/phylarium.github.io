// The raid's field drawn (src/core/humans/raid-map.js has its shape): a picture 270 × 480 pixels, about twice as
// fine as the planet's, with the sky above the forest edge, the field's cells below it, and the village at the
// foot. Grass in three tones of smooth noise with an ordered dither, blades and a few flowers, hazier towards the
// forest; the road worn into it with ruts and pebbles; trees, bushes and rocks where nobody stands.
import { RAID_H, RAID_W, ROAD_LEN, SPOTS, onRoad, roadAt } from '../../core/humans/raid-map.js';
import { bayer, hash, luck, mix, vnoise } from './palette.js';
import { pine } from './backdrop.js';
import { box, paint } from './pen.js';

/** @typedef {import('./palette.js').Palette} Palette */
/** @typedef {CanvasRenderingContext2D} G */

export const PIC_W = 270,
  PIC_H = 480,
  HORIZON = 92,
  FIELD = 96, // where the field's first row begins
  CELL_W = 36,
  CELL_H = 28;
const OX = (PIC_W - RAID_W * CELL_W) / 2;
/** A field cell's middle in the picture. @param {number} x @param {number} y */
export const toPic = (x, y) => ({ x: OX + (x + 0.5) * CELL_W, y: FIELD + (y + 0.5) * CELL_H });
/** The field cell under a point of the picture. @param {number} px @param {number} py */
export const cellAt = (px, py) => ({ x: Math.floor((px - OX) / CELL_W), y: Math.floor((py - FIELD) / CELL_H) });
/** The spot (SPOTS index) under a point of the picture, or -1. @param {number} px @param {number} py */
export const spotAt = (px, py) => {
  const c = cellAt(px, py);
  return SPOTS.findIndex(s => s.x === c.x && s.y === c.y);
};

/** How far each pixel is from the road's middle (the road squashed to the field's slant), worked out when first asked. */
const roadDist = (() => {
  /** @type {{ d: Float32Array | null }} */
  const memo = { d: null };
  return () => {
    if (memo.d) return memo.d;
    const pts = Array.from({ length: ROAD_LEN * 16 + 1 }, (_, n) => {
        const r = roadAt(n / 16);
        return toPic(r.x, r.y);
      }),
      rows = Array.from({ length: PIC_H }, (_, y) => pts.filter(q => Math.abs(q.y - y) <= 12)),
      d = Float32Array.from({ length: PIC_W * PIC_H }, (_, i) => {
        const x = i % PIC_W;
        return (rows[Math.floor(i / PIC_W)] ?? []).reduce(
          (best, q) =>
            Math.abs(q.x - x) > 16 ? best : Math.min(best, Math.hypot(q.x - x, (q.y - Math.floor(i / PIC_W)) * 1.25)),
          99,
        );
      });
    // oxlint-disable-next-line fp/no-mutation -- the one memo of this function
    memo.d = d;
    return d;
  };
})();

/** The grass's color at a pixel: three tones in patches, blades two pixels tall, a rare flower. @param {Palette} p @param {number} x @param {number} y */
export const grassAt = (p, x, y) => {
  const tone = 0.65 * vnoise(x, y, 26) + 0.35 * vnoise(x + 99, y, 8) + (bayer(x, y) - 0.5) * 0.18,
    light = mix(p.ground, p.cloudL, 0.12),
    n = hash(x, y);
  if (n > 0.9985) return mix(p.win, p.ground, 0.45 + p.light * 0.4);
  if (n > 0.975 || hash(x, y + 1) > 0.975) return tone > 0.5 ? mix(light, p.cloudL, 0.2) : light;
  return tone < 0.36 ? mix(p.ground, p.fg, 0.28) : tone > 0.64 ? light : p.ground;
};
/** The road's color at a pixel d from its middle: worn edges, two ruts, pebbles. @param {Palette} p @param {number} x @param {number} y @param {number} d */
const roadColor = (p, x, y, d) => {
  const n = hash(x, y),
    dark = mix(p.dirt, p.fg, 0.45);
  if (d > 10) return n < 0.5 ? mix(p.ground, p.fg, 0.28) : dark;
  if (Math.abs(d - 5) < 0.8 && n < 0.7) return dark;
  return n > 0.93 ? mix(p.dirt, p.cloudL, 0.25) : n < 0.08 ? dark : p.dirt;
};

/** The ground layer: grass and the road, from just above the field down. @param {HTMLCanvasElement} c @param {Palette} p */
export const drawGround = (c, p) => {
  const haze = mix(p.ground, p.far, 0.5),
    top = FIELD - 8,
    dist = roadDist();
  return paint(
    c,
    (x, y) => {
      const d = (dist[y * PIC_W + x] ?? 99) + (hash(x >> 1, y >> 1) - 0.5) * 4,
        col = d < 12 ? roadColor(p, x, y, d) : grassAt(p, x, y),
        far = Math.max(0, 1 - (y - top) / 110);
      return far > 0 && bayer(x, y) < far * 0.8 ? mix(col, haze, 0.5) : col;
    },
    [top, PIC_H],
  );
};

/** @typedef {{ kind: 'tree' | 'pine' | 'bush' | 'rock' | 'tuft', x: number, y: number, s: number }} Prop */
/** Trees, bushes and rocks on the cells nobody stands on, and tufts here and there; the same for the same seed. @param {number} seed @returns {readonly Prop[]} */
export const makeProps = seed => {
  const free = Array.from({ length: RAID_W * RAID_H }, (_, n) => ({
    x: n % RAID_W,
    y: Math.floor(n / RAID_W),
    n,
  })).filter(c => !onRoad(c.x, c.y) && !SPOTS.some(s => s.x === c.x && s.y === c.y));
  /** @type {readonly ('tree' | 'pine' | 'bush' | 'rock')[]} */
  const KINDS = ['pine', 'tree', 'pine', 'tree', 'bush', 'bush', 'rock'];
  return [
    ...free.map(c => {
      const at = toPic(c.x, c.y);
      return {
        kind: KINDS[Math.floor(luck(seed, c.n) * KINDS.length)] ?? 'bush',
        x: at.x + (luck(seed, c.n + 100) - 0.5) * 16,
        y: at.y + (luck(seed, c.n + 200) - 0.3) * 10,
        s: 0.8 + luck(seed, c.n + 300) * 0.5,
      };
    }),
    ...Array.from({ length: 14 }, (_, k) => ({
      kind: /** @type {const} */ ('tuft'),
      x: luck(seed, 400 + k) * PIC_W,
      y: FIELD + 10 + luck(seed, 500 + k) * (RAID_H * CELL_H - 20),
      s: 1,
    })),
  ];
};

/** A round leafy tree, lit on the sun's side and dark on the other. @param {G} g @param {Prop} o @param {Palette} p @param {number} sunX */
const leafy = (g, o, p, sunX) => {
  const R = Math.round(9 * o.s),
    lit = mix(p.tree, p.cloudL, 0.2),
    dark = mix(p.tree, p.fg, 0.4);
  box(g, mix(p.dirt, p.fg, 0.5), [o.x - 1, o.y - 8, 3, 8]);
  Array.from({ length: (2 * R + 1) ** 2 }, (_, i) => ({
    dx: (i % (2 * R + 1)) - R,
    dy: Math.floor(i / (2 * R + 1)) - R,
  }))
    .filter(({ dx, dy }) => Math.hypot(dx, dy * 1.1) <= R - hash(o.x + dx, o.y + dy) * 2)
    .map(({ dx, dy }) => {
      const side = (dx * Math.sign(sunX - o.x) - dy) / R,
        col = side > 0.45 ? lit : side < -0.5 && bayer(dx, dy) < 0.6 ? dark : p.tree;
      return box(g, col, [o.x + dx, o.y - 8 - R + dy]);
    });
};
/** One prop, standing on its foot (its y) with a little shadow. @param {G} g @param {Prop} o @param {Palette} p @param {number} sunX */
export const drawProp = (g, o, p, sunX) => {
  const lit = mix(p.tree, p.cloudL, 0.2),
    rock = mix(p.far, p.fg, 0.2);
  box(g, mix(p.ground, p.fg, 0.45), [o.x - 7 * o.s, o.y, 14 * o.s, 2]);
  if (o.kind === 'pine')
    return pine(g, { x: Math.round(o.x), base: Math.round(o.y), h: 26 * o.s, col: p.tree, lit }, sunX);
  if (o.kind === 'tree') return leafy(g, o, p, sunX);
  if (o.kind === 'bush')
    return [-4, -3, -2, -1, 0].map(dy =>
      box(g, dy < -2 ? lit : p.tree, [o.x - 6 + Math.abs(dy + 2), o.y + dy, 12 - 2 * Math.abs(dy + 2), 1]),
    );
  if (o.kind === 'rock')
    return [box(g, rock, [o.x - 4, o.y - 4, 8, 4]), box(g, mix(rock, p.cloudL, 0.35), [o.x - 3, o.y - 5, 5, 1])];
  return [-2, 0, 2].map(d => box(g, mix(p.ground, p.fg, 0.4), [o.x + d, o.y - 3 + Math.abs(d), 1, 3 - Math.abs(d)]));
};
