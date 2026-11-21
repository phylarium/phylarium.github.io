// The raid field's still layers, drawn when a raid opens (raid-view.js): the sky with the sun or moon, the clouds
// (into a band that drifts, see raid-front.js), the mountains, the forest edge the road comes out of, and the
// ground with the road. The hour is the planet's when the raid began, and stays so until it ends.
import { hourToT, paletteAt } from './palette.js';
import { context } from './pen.js';
import { drawClouds, drawEdge, drawFar, drawSky, sunAt } from './backdrop.js';
import { FIELD, HORIZON, PIC_H, PIC_W, drawGround, makeProps, spotAt, toPic } from './raid-field.js';

/** @typedef {'sky' | 'clouds' | 'far' | 'edge' | 'ground' | 'actors' | 'fx' | 'front'} RaidLayer */
/** The layers, back to front. @type {readonly RaidLayer[]} */
export const RAID_LAYERS = ['sky', 'clouds', 'far', 'edge', 'ground', 'actors', 'fx', 'front'];
/** The picture's size, and the spot under a point of it (for a tap). */
export const RAID_PIC = Object.freeze({ w: PIC_W, h: PIC_H, spotAt });
/** How tall the band of clouds is. */
export const CLOUD_BAND = HORIZON + 10;

/**
 * Draws the still layers for the hour, and gives what the moving ones need: the palette, where the sun is, and the
 * trees and rocks of the field.
 * @param {Readonly<Record<RaidLayer, HTMLCanvasElement>>} layers
 * @param {HTMLCanvasElement} clouds the band of clouds, drawn once and slid across each frame
 * @param {{ hour: number, seed: number }} at
 */
export const drawBack = (layers, clouds, at) => {
  const t = hourToT(at.hour),
    p = paletteAt(t),
    sunX = sunAt(t, PIC_W, HORIZON).x;
  [...Object.values(layers), clouds].map(c => context(c).clearRect(0, 0, c.width, c.height));
  drawSky(layers.sky, p, { t, horizon: HORIZON, seed: at.seed });
  drawClouds(clouds, p, { sunX, height: CLOUD_BAND, seed: at.seed + 1 });
  drawFar(layers.far, p, { sunX, horizon: HORIZON, seed: at.seed + 2 });
  drawEdge(layers.edge, p, { sunX, back: HORIZON + 2, front: FIELD + 8, gap: toPic(3, 0).x, seed: at.seed + 3 });
  context(layers.ground).putImageData(drawGround(layers.ground, p), 0, 0);
  return { p, sunX, props: makeProps(at.seed + 4) };
};
