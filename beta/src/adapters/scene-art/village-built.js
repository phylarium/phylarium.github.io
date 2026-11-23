// What the village has built, drawn on its own screen (village-scene.js has the ground): the campfire it starts
// with, thatched huts round the
// path, fields of grain in furrows, the woodcutter's stump, axe and log pile (and a shed for the logs), a ring of
// stones for the fire, a rack of spears, and the palisade along the front with its gate (and up the sides, with a
// lookout, once it is raised). Each level shows: more huts, more fields. Drawn again when something is built.
import { mix } from './palette.js';
import { box, context } from './pen.js';
import { hut } from './raid-village.js';
import { shade } from './raid-people.js';
import { VH, VW } from './village-scene.js';

/** @typedef {import('./village-scene.js').VillageLook} VillageLook */
/** @typedef {import('./palette.js').Palette} Palette */
/** @typedef {Readonly<Partial<Record<string, number>>>} Levels */
/** @typedef {CanvasRenderingContext2D} G */

/** Where the huts stand, nearest the fire first: the first level shows one, each level after it two more. */
export const HUTS = Object.freeze([
  { x: 106, y: 198, s: 22 },
  { x: 172, y: 180, s: 20 },
  { x: 80, y: 238, s: 24 },
  { x: 196, y: 232, s: 24 },
  { x: 100, y: 150, s: 18 },
]);
/** How many huts a level of Huts shows: none before the first. @param {number} level */
export const hutCount = level => Math.min(HUTS.length, Math.max(0, level * 2 - 1));
/** How many people live in the village: a band round the campfire before there are huts, one a hut after. @param {number} level */
export const villagers = level => Math.max(3, hutCount(level));
/** The fields, one per level. */
export const PLOTS = Object.freeze([
  { x: 10, y: 100, w: 66, h: 22 },
  { x: 10, y: 128, w: 62, h: 22 },
  { x: 10, y: 156, w: 58, h: 22 },
]);
export const FIREPIT = Object.freeze({ x: 108, y: 264 }),
  WOODCUT = Object.freeze({ x: 214, y: 114 }),
  RACK = Object.freeze({ x: 206, y: 270 }),
  GATE = 135;
const FENCE = VH - 8;

/** A field: furrows of earth with grain standing in rows, golden by day. @param {G} g @param {Palette} p @param {{ x: number, y: number, w: number, h: number }} f */
const field = (g, p, f) => {
  const soil = mix(p.dirt, p.fg, 0.25),
    grain = shade(p, '#c8a840'),
    stalk = shade(p, '#7a8a3a');
  box(g, mix(p.dirt, p.cloudL, 0.15), [f.x - 1, f.y - 1, f.w + 2, f.h + 2]);
  box(g, soil, [f.x, f.y, f.w, f.h]);
  Array.from({ length: Math.floor(f.h / 4) }, (_, r) => f.y + 3 + r * 4).map(y => [
    box(g, mix(soil, p.fg, 0.3), [f.x, y + 1, f.w, 1]),
    Array.from({ length: Math.floor(f.w / 3) }, (__, k) => f.x + 1 + k * 3 + (y % 2)).map(x => [
      box(g, stalk, [x, y - 2, 1, 3]),
      box(g, grain, [x, y - 3, 1, 1]),
    ]),
  ]);
};

/** A log lying across, its cut end lit. @param {G} g @param {Palette} p @param {number} x @param {number} y */
const log = (g, p, x, y) => {
  box(g, shade(p, '#6a4a2a'), [x, y, 10, 3]);
  box(g, shade(p, '#c89a60'), [x + 9, y, 2, 3]);
};
/** The woodcutter: a stump with an axe in it and logs piled by it; at the second level a roof over more logs. @param {G} g @param {Palette} p @param {number} level */
const woodcutter = (g, p, level) => {
  const { x, y } = WOODCUT,
    post = shade(p, '#5a4028');
  if (level > 1) {
    box(g, post, [x + 8, y - 22, 2, 20]);
    box(g, post, [x + 34, y - 22, 2, 20]);
    Array.from({ length: 5 }, (_, k) =>
      box(g, shade(p, k % 2 ? '#9a7a48' : '#b08a48'), [x + 5 - k, y - 26 + k, 36, 1]),
    );
    [0, 1, 2, 3].map(r => [0, 1].map(c => log(g, p, x + 11 + c * 11 + (r % 2) * 2, y - 5 - r * 3)));
  }
  box(g, shade(p, '#7a5a3a'), [x - 4, y - 4, 8, 4]);
  box(g, shade(p, '#c89a60'), [x - 4, y - 5, 8, 1]);
  box(g, shade(p, '#8a6a44'), [x + 1, y - 12, 1, 8]);
  box(g, shade(p, '#a0a0a8'), [x - 1, y - 13, 4, 2]);
  [0, 1, 2].map(r => log(g, p, x - 18 + r, y - 3 - r * 3));
};

/** The ring of stones round the fire (the fire itself moves, in village-live.js). @param {G} g @param {Palette} p */
const firepit = (g, p) =>
  Array.from({ length: 10 }, (_, k) => (k / 10) * Math.PI * 2).map(a =>
    box(g, shade(p, k2col(a)), [FIREPIT.x + Math.cos(a) * 8 - 1, FIREPIT.y + 2 + Math.sin(a) * 3, 3, 2]),
  );
const k2col = (/** @type {number} */ a) => (Math.sin(a) < 0 ? '#7a7a80' : '#9a9aa0');

/** The spear maker's rack: two posts, a bar, spears leaning on it, and a log to sit on. @param {G} g @param {Palette} p */
const rack = (g, p) => {
  const { x, y } = RACK,
    wood = shade(p, '#6a4a2a');
  box(g, wood, [x - 12, y - 14, 2, 14]);
  box(g, wood, [x + 12, y - 14, 2, 14]);
  box(g, wood, [x - 12, y - 14, 26, 2]);
  [-8, -3, 2, 7].map(dx => [
    box(g, shade(p, '#a08060'), [x + dx, y - 22, 1, 22]),
    box(g, shade(p, '#d0d0d8'), [x + dx, y - 25, 1, 3]),
  ]);
  log(g, p, x + 18, y - 3);
};

/** A stake of the palisade, pointed and lit on the sun's side. @param {G} g @param {Palette} p @param {{ x: number, y: number, h: number, sunX: number }} s */
const stake = (g, p, s) => {
  const wood = shade(p, '#7a5a3a');
  box(g, wood, [s.x, s.y - s.h, 3, s.h]);
  box(g, mix(wood, p.cloudL, 0.25), [s.x + (s.sunX > s.x ? 2 : 0), s.y - s.h + 1, 1, s.h - 2]);
  box(g, shade(p, '#9a7a50'), [s.x + 1, s.y - s.h - 2, 1, 2]);
};
/** The palisade: stakes along the front with a gap for the gate; raised, taller, up the sides, and a lookout. @param {G} g @param {Palette} p @param {{ level: number, sunX: number }} at */
const palisadeFront = (g, p, at) => {
  const h = at.level > 1 ? 18 : 13;
  Array.from({ length: Math.ceil(VW / 4) }, (_, n) => 1 + n * 4)
    .filter(x => Math.abs(x - GATE) >= 13)
    .map(x => stake(g, p, { x, y: FENCE, h, sunX: at.sunX }));
  box(g, shade(p, '#5a3e28'), [0, FENCE - h + 4, GATE - 13, 2]);
  box(g, shade(p, '#5a3e28'), [GATE + 13, FENCE - h + 4, VW, 2]);
  if (at.level < 2) return;
  const post = shade(p, '#5a4028');
  [GATE + 16, GATE + 30].map(x => box(g, post, [x, FENCE - 46, 2, 46]));
  box(g, shade(p, '#8a6a44'), [GATE + 14, FENCE - 48, 20, 3]);
  box(g, shade(p, '#b08a48'), [GATE + 13, FENCE - 54, 22, 2]);
  box(g, shade(p, '#9a7a48'), [GATE + 15, FENCE - 56, 18, 2]);
};
/** The palisade up the sides, behind everything else in the village. @param {G} g @param {Palette} p @param {number} sunX */
const palisadeSides = (g, p, sunX) =>
  Array.from({ length: 30 }, (_, n) => 104 + n * 6).map(y =>
    [3, VW - 6].map(x => stake(g, p, { x, y, h: 10 + (y - 104) / 30, sunX })),
  );

/**
 * The built layer, back to front: whatever stands farther up is drawn first.
 * @param {HTMLCanvasElement} c
 * @param {VillageLook} look
 * @param {Levels} levels
 */
export const drawBuilt = (c, look, levels) => {
  const g = context(c),
    { p, sunX } = look,
    lv = (/** @type {string} */ b) => levels[b] ?? 0;
  g.clearRect(0, 0, c.width, c.height);
  g.setTransform(1, 0, 0, 1, 0, look.top); // the village stands `top` rows down a tall screen
  if (lv('palisade') > 1) palisadeSides(g, p, sunX);
  PLOTS.slice(0, lv('fields')).map(f => field(g, p, f));
  /** @type {readonly { y: number, draw: () => unknown }[]} */
  const things = [
    ...HUTS.slice(0, hutCount(lv('huts'))).map(h => ({ y: h.y, draw: () => hut(g, p, h) })),
    ...(lv('woodcutter') ? [{ y: WOODCUT.y, draw: () => woodcutter(g, p, lv('woodcutter')) }] : []),
    ...(lv('firepit') ? [{ y: FIREPIT.y, draw: () => firepit(g, p) }] : []),
    ...(lv('spearmaker') ? [{ y: RACK.y, draw: () => rack(g, p) }] : []),
    ...(lv('palisade') ? [{ y: FENCE, draw: () => palisadeFront(g, p, { level: lv('palisade'), sunX }) }] : []),
  ];
  things.toSorted((a, b) => a.y - b.y).map(t => t.draw());
  g.setTransform(1, 0, 0, 1, 0, 0);
};
