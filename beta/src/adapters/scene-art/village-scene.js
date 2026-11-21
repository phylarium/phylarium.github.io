// The village's own screen drawn in the human era's art (design docs: Art-Human-era): a picture 270 × 300 pixels in
// layers, like the raid field. The still ones are drawn here when the screen opens: the sky at the planet's hour,
// the clouds (into a band that drifts), the mountains, the forest behind the village (thicker on wooded land), and
// the ground with its path from the forest down to the gate, and a pond when the village stands by water.
import { bayer, hash, hourToT, mix, paletteAt } from './palette.js';
import { context, paint } from './pen.js';
import { drawClouds, drawEdge, drawFar, drawSky, sunAt } from './backdrop.js';
import { grassAt } from './raid-field.js';

/** @typedef {import('./palette.js').Palette} Palette */
/** @typedef {{ forest: number, open: number, water: number }} Land */
/** @typedef {'sky' | 'clouds' | 'far' | 'edge' | 'ground' | 'built' | 'live'} VillageLayer */
/** @typedef {{ p: Palette, sunX: number, land: Land, seed: number, top: number }} VillageLook */

export const VW = 270,
  VH = 300,
  V_HORIZON = 70,
  V_GROUND = 84; // where the grass begins, below the forest
/** The layers, back to front. @type {readonly VillageLayer[]} */
export const VILLAGE_LAYERS = ['sky', 'clouds', 'far', 'edge', 'ground', 'built', 'live'];
/** How tall the band of clouds is. */
export const V_CLOUDS = V_HORIZON + 10;
/** The path, from the gap in the forest down through the village to the gate. */
export const PATH = Object.freeze([
  { x: 160, y: V_GROUND - 4 },
  { x: 150, y: 120 },
  { x: 126, y: 160 },
  { x: 140, y: 205 },
  { x: 135, y: 250 },
  { x: 135, y: 2000 }, // on under the cards, however tall the screen
]);

/**
 * The picture's height for a screen, so it fills it: as tall as the screen's shape asks, the village moved down
 * (`top` more rows of sky) so its palisade stands just above the cards, with grass running on under them.
 * @param {{ w: number, h: number }} screen the picture's box, in CSS pixels
 * @param {number} under how much of it the cards cover at the bottom, in CSS pixels
 */
export const frameOf = (screen, under) => {
  const h = Math.round(Math.max(VH, Math.min(640, (VW * screen.h) / Math.max(1, screen.w)))),
    below = Math.round((under * h) / Math.max(1, screen.h)),
    top = Math.max(0, Math.min(h - VH, h - VH - below + 6));
  return { h, top, clouds: V_CLOUDS + top };
};

/** How far a point is from the path's middle. @param {number} x @param {number} y */
export const pathDist = (x, y) =>
  PATH.slice(1).reduce((best, b, i) => {
    const a = PATH[i] ?? b,
      dx = b.x - a.x,
      dy = b.y - a.y,
      f = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.min(best, Math.hypot(x - a.x - f * dx, y - a.y - f * dy));
  }, 99);

/** The pond by a village near water, or null: its middle and size. @param {Land} land */
export const pondOf = land =>
  land.water > 0.15 ? { x: 250, y: 168, rx: 24 + 34 * land.water, ry: 12 + 12 * land.water } : null;

/** The pond's color at a pixel, or null off it: deep in the middle, light at the rim, streaks of sky. @param {Palette} p @param {{ x: number, y: number, rx: number, ry: number }} pond @param {number} x @param {number} y */
const waterAt = (p, pond, x, y) => {
  const d = Math.hypot((x - pond.x) / pond.rx, (y - pond.y) / pond.ry) + (hash(x >> 1, y) - 0.5) * 0.08;
  if (d > 1) return null;
  if (d > 0.9) return mix(p.dirt, p.fg, 0.2);
  const deep = mix(p.skyTop, p.near, 0.45),
    sky = mix(p.skyHor, p.skyMid, 0.5);
  if (hash(x >> 3, y) > 0.86 && y % 3 === 0) return sky;
  return d < 0.55 + (bayer(x, y) - 0.5) * 0.2 ? deep : mix(deep, sky, 0.35);
};

/** The ground's color at a pixel: grass, hazier towards the forest, the worn path, the pond. @param {Palette} p @param {Land} land @param {number} x @param {number} y */
const groundAt = (p, land, x, y) => {
  const pond = pondOf(land),
    water = pond ? waterAt(p, pond, x, y) : null;
  if (water) return water;
  const d = pathDist(x, y) + (hash(x >> 1, y >> 1) - 0.5) * 3,
    n = hash(x, y),
    col =
      d < 7
        ? n > 0.93
          ? mix(p.dirt, p.cloudL, 0.25)
          : n < 0.1
            ? mix(p.dirt, p.fg, 0.4)
            : p.dirt
        : d < 8.5 && n < 0.6
          ? mix(p.ground, p.fg, 0.3)
          : grassAt(p, x, y),
    far = Math.max(0, 1 - (y - V_GROUND) / 70);
  return far > 0 && bayer(x, y) < far * 0.8 ? mix(col, mix(p.ground, p.far, 0.5), 0.5) : col;
};

/**
 * Draws the still layers for the hour, and gives what the others need.
 * @param {Readonly<Record<VillageLayer, HTMLCanvasElement>>} layers
 * @param {HTMLCanvasElement} clouds the band of clouds, slid across each frame
 * @param {{ hour: number, seed: number, land: Land, top: number }} at the hour, the place, and the rows of sky above
 *   the village (frameOf)
 * @returns {VillageLook}
 */
export const drawVillageBack = (layers, clouds, at) => {
  const t = hourToT(at.hour),
    p = paletteAt(t),
    { top } = at,
    sunX = sunAt(t, VW, V_HORIZON + top).x,
    edge = context(layers.edge);
  [...Object.values(layers), clouds].map(c => context(c).clearRect(0, 0, c.width, c.height));
  drawSky(layers.sky, p, { t, horizon: V_HORIZON + top, seed: at.seed });
  drawClouds(clouds, p, { sunX, height: V_CLOUDS + top, seed: at.seed + 1 });
  drawFar(layers.far, p, { sunX, horizon: V_HORIZON + top, seed: at.seed + 2 });
  drawEdge(layers.edge, p, {
    sunX,
    back: V_HORIZON + 4 + top,
    front: V_GROUND + 2 + top,
    gap: 160,
    seed: at.seed + 3,
  });
  // Open land shows sky between the trees: the forest is thinned by cutting pixel columns out of its layer.
  Array.from({ length: VW }, (_, x) => x)
    .filter(x => Math.abs(x - 160) > 16 && hash(x >> 4, at.seed) > 0.5 + at.land.forest)
    .map(x => edge.clearRect(x, 0, 1, layers.edge.height));
  context(layers.ground).putImageData(
    paint(layers.ground, (x, y) => groundAt(p, at.land, x, y - top), [V_GROUND - 6 + top, layers.ground.height]),
    0,
    0,
  );
  return { p, sunX, land: at.land, seed: at.seed, top };
};
