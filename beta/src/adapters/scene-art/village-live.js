// The village screen's moving layers, drawn each frame while it is open: the clouds drifting, the fire in its ring
// of stones with its smoke and (towards night) its warm light, and the villagers: one for each hut, walking by day
// between their hut and the work of the village, sitting round the fire at night.
import { mix } from './palette.js';
import { box, context } from './pen.js';
import { drawFire } from './raid-village.js';
import { glow, shade } from './raid-people.js';
import { FIREPIT, HUTS, PLOTS, RACK, WOODCUT, hutCount } from './village-built.js';

/** @typedef {import('./village-scene.js').VillageLook} VillageLook */
/** @typedef {import('./village-scene.js').VillageLayer} VillageLayer */
/** @typedef {import('./village-built.js').Levels} Levels */
/** @typedef {import('./palette.js').Palette} Palette */
/** @typedef {CanvasRenderingContext2D} G */

const TUNICS = ['#8a6a44', '#6a7a4a', '#9a5a3a', '#5a6a8a', '#8a5a6a'];

/** Where the villagers go to work, by what has been built. @param {(b: string) => number} lv */
const worksOf = lv => [
  ...(lv('fields') ? PLOTS.slice(0, lv('fields')).map(f => ({ x: f.x + f.w - 4, y: f.y + f.h })) : []),
  ...(lv('woodcutter') ? [{ x: WOODCUT.x - 6, y: WOODCUT.y + 2 }] : []),
  ...(lv('spearmaker') ? [{ x: RACK.x - 16, y: RACK.y + 2 }] : []),
  { x: 136, y: 225 },
];

/** A villager, small, legs stepping while they walk. @param {G} g @param {Palette} p @param {{ x: number, y: number, n: number, walk: boolean, now: number }} at */
const villager = (g, p, at) => {
  const x = Math.round(at.x),
    y = Math.round(at.y),
    tunic = shade(p, TUNICS[at.n % TUNICS.length] ?? '#8a6a44'),
    step = at.walk && Math.floor(at.now / 160 + at.n) % 2 ? 1 : 0;
  box(g, 'rgba(0, 0, 0, 0.25)', [x - 3, y, 7, 1]);
  box(g, mix(tunic, '#000000', 0.35), [x - 2 + step, y - 3, 1, 3]);
  box(g, mix(tunic, '#000000', 0.35), [x + 1 - step, y - 3, 1, 3]);
  box(g, tunic, [x - 2, y - 8, 5, 5]);
  box(g, shade(p, '#c08a64'), [x - 1, y - 11, 3, 3]);
  box(g, shade(p, '#2a1a14'), [x - 1, y - 12, 3, 1]);
};

/** Where villager n is at a time: by day walking to and fro, at night round the fire (or indoors with none). @param {{ n: number, now: number, night: boolean, fire: boolean, works: readonly { x: number, y: number }[] }} at */
const placeOf = at => {
  const home = HUTS[at.n] ?? { x: 136, y: 225, s: 20 };
  if (at.night) {
    const a = (at.n / 5) * Math.PI * 2 + 0.4;
    return at.fire ? { x: FIREPIT.x + Math.cos(a) * 15, y: FIREPIT.y + 3 + Math.sin(a) * 6, walk: false } : null;
  }
  const work = at.works[at.n % at.works.length] ?? { x: 136, y: 225 },
    phase = (at.now / 1000 / 9 + at.n * 0.37) % 1,
    f = phase < 0.4 ? phase / 0.4 : phase < 0.5 ? 1 : phase < 0.9 ? 1 - (phase - 0.5) / 0.4 : 0,
    from = { x: home.x, y: home.y + 2 };
  return {
    x: from.x + (work.x - from.x) * f,
    y: from.y + (work.y - from.y) * f,
    walk: (phase > 0 && phase < 0.4) || (phase > 0.5 && phase < 0.9),
  };
};

/**
 * One frame of the moving layers.
 * @param {Readonly<Record<VillageLayer, HTMLCanvasElement>>} layers
 * @param {HTMLCanvasElement} clouds the band drawn with the still layers
 * @param {VillageLook} look
 * @param {{ now: number, levels: Levels }} at
 */
export const drawLive = (layers, clouds, look, at) => {
  const { p } = look,
    { now } = at,
    sky = context(layers.clouds),
    g = context(layers.live),
    lv = (/** @type {string} */ b) => at.levels[b] ?? 0,
    fire = lv('firepit') > 0,
    off = Math.floor(((now / 1000) * 1.5) % clouds.width),
    works = worksOf(lv);
  sky.clearRect(0, 0, clouds.width, clouds.height);
  sky.drawImage(clouds, off, 0);
  sky.drawImage(clouds, off - clouds.width, 0);
  g.clearRect(0, 0, layers.live.width, layers.live.height);
  g.setTransform(1, 0, 0, 1, 0, look.top); // the village stands `top` rows down a tall screen
  if (fire && p.light > 0.05) glow(g, p, { x: FIREPIT.x, y: FIREPIT.y - 4, r: 22 });
  Array.from({ length: hutCount(lv('huts')) }, (_, n) => n)
    .map(n => ({ n, at: placeOf({ n, now, night: p.light > 0.6, fire, works }) }))
    .flatMap(v => (v.at ? [{ n: v.n, ...v.at }] : []))
    .toSorted((a, b) => a.y - b.y)
    .map(v => villager(g, p, { ...v, now }));
  if (fire) drawFire(g, p, { ...FIREPIT, now });
  g.setTransform(1, 0, 0, 1, 0, 0);
};
