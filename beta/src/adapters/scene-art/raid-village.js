// The village at the foot of the raid's road: a palisade of stakes with a gap for the road, thatched huts whose
// doors glow at night, and a fire with its smoke curling up. Drawn each frame for the fire and the smoke.
import { bayer, mix } from './palette.js';
import { box } from './pen.js';
import { PIC_H, PIC_W, toPic } from './raid-field.js';
import { shade } from './raid-people.js';

/** @typedef {import('./palette.js').Palette} Palette */
/** @typedef {CanvasRenderingContext2D} G */

/** A thatched hut, `s` rows tall, its door lit at dusk and night. @param {G} g @param {Palette} p @param {{ x: number, y: number, s: number }} at */
const hut = (g, p, at) => {
  const thatch = shade(p, '#b08a48'),
    dark = mix(thatch, p.fg, 0.45),
    lit = mix(thatch, p.cloudL, 0.3);
  Array.from({ length: at.s }, (_, k) =>
    Array.from({ length: k * 2 + 1 }, (__, i) =>
      box(g, k < 2 ? lit : (i + k) % 3 === 0 ? dark : thatch, [at.x - k + i, at.y - at.s + k]),
    ),
  );
  box(g, p.light > 0.3 ? p.win : mix(p.fg, thatch, 0.2), [at.x - 2, at.y - 6, 4, 6]);
};

/** Where the village's fire burns. */
export const FIRE = { x: Math.round(toPic(3, 0).x) + 26, y: PIC_H - 14 };

/** The fire: logs and flickering flames, and smoke rising and thinning. @param {G} g @param {Palette} p @param {number} now milliseconds */
const fire = (g, p, now) => {
  const k = Math.floor(now / 100);
  box(g, shade(p, '#5a4030'), [FIRE.x - 5, FIRE.y + 2, 10, 2]);
  Array.from({ length: 7 }, (_, i) => {
    const h = 3 + ((k * 7 + i * 5) % 5);
    return box(g, i % 2 ? '#ffd23f' : '#ff6a3c', [FIRE.x - 3 + i, FIRE.y + 2 - h, 1, h]);
  });
  Array.from({ length: 18 }, (_, s) => {
    const age = ((now / 80 + s * 7) % 126) / 126,
      y = FIRE.y - 8 - age * 90,
      x = FIRE.x + Math.sin(age * 6 + s) * (2 + age * 9);
    return bayer(x, y) < 0.75 - age * 0.7 ? box(g, mix(p.cloudM, p.skyMid, 0.3 + age * 0.5), [x, y]) : null;
  });
};

/** The village layer: ground, palisade, huts and the fire. @param {G} g @param {Palette} p @param {{ now: number, sunX: number }} at */
export const drawVillage = (g, p, at) => {
  const top = PIC_H - 50,
    road = Math.round(toPic(3, 0).x),
    wood = shade(p, '#7a5a3a');
  g.clearRect(0, 0, PIC_W, PIC_H);
  box(g, mix(p.ground, p.fg, 0.25), [0, top + 12, PIC_W, PIC_H - top]);
  box(g, p.dirt, [road - 10, top + 6, 20, PIC_H - top]);
  Array.from({ length: Math.ceil(PIC_W / 5) }, (_, n) => 2 + n * 5)
    .filter(x => Math.abs(x - road) >= 14)
    .map(x => [
      box(g, wood, [x, top, 3, 18]),
      box(g, mix(wood, p.cloudL, 0.25), [x + (at.sunX > x ? 2 : 0), top, 1, 16]),
      box(g, shade(p, '#9a7a50'), [x + 1, top - 2, 1, 2]),
    ]);
  box(g, shade(p, '#5a3e28'), [0, top + 6, road - 14, 2]);
  box(g, shade(p, '#5a3e28'), [road + 14, top + 6, PIC_W, 2]);
  [
    [road - 92, 16],
    [road - 60, 22],
    [road - 30, 18],
    [road + 48, 24],
    [road + 80, 18],
  ].map(([x = 0, s = 0]) => hut(g, p, { x, y: PIC_H - 4, s }));
  fire(g, p, at.now);
};
