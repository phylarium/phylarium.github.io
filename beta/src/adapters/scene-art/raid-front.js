// The raid field's moving layers, drawn each frame (raid-view.js): the clouds sliding across, everything on the
// field (raid-actors.js), the blows, the dust and the warm light of torches and the fire, the free spots while
// someone can be stood there, and the village at the foot of the road.
import { DEFENDERS } from '../../core/humans/raid-map.js';
import { context } from './pen.js';
import { drawActors, puffsAfter } from './raid-actors.js';
import { drawPuff, drawShot, drawSpots, footOf, glow } from './raid-people.js';
import { FIRE, drawVillage } from './raid-village.js';

/** @typedef {import('./raid-back.js').RaidLayer} RaidLayer */
/** @typedef {import('./palette.js').Palette} Palette */
/** @typedef {import('./raid-field.js').Prop} Prop */
/** @typedef {import('./raid-people.js').Puff} Puff */
/** @typedef {import('../../core/humans/raid.js').Raid} Raid */
/** @typedef {import('../../core/humans/raid-map.js').Defender} Defender */

/**
 * Draws one frame of the raid.
 * @param {Readonly<Record<RaidLayer, HTMLCanvasElement>>} layers
 * @param {HTMLCanvasElement} clouds the band drawn by drawBack
 * @param {Raid} raid
 * @param {{ p: Palette, sunX: number, props: readonly Prop[], puffs: readonly Puff[], pick: Defender, now: number }} look
 */
export const drawFrame = (layers, clouds, raid, look) => {
  const { p, now } = look,
    sky = context(layers.clouds),
    fx = context(layers.fx),
    off = Math.floor(((now / 1000) * 1.5) % clouds.width);
  sky.clearRect(0, 0, clouds.width, clouds.height);
  sky.drawImage(clouds, off, 0);
  sky.drawImage(clouds, off - clouds.width, 0);
  context(layers.actors).clearRect(0, 0, layers.actors.width, layers.actors.height);
  drawActors(context(layers.actors), raid, look);
  fx.clearRect(0, 0, layers.fx.width, layers.fx.height);
  if (p.light > 0.05)
    [
      ...raid.men
        .filter(m => m.kind === 'torch')
        .map(m => ({ x: footOf(m.spot).x + 4, y: footOf(m.spot).y - 16, r: 16 })),
      { x: FIRE.x, y: FIRE.y - 6, r: 22 },
    ].map(at => glow(fx, p, at));
  raid.shots.map(s => drawShot(fx, s, p, now));
  look.puffs.map(pf => drawPuff(fx, pf, p));
  if (!raid.done && raid.hands >= DEFENDERS[look.pick].cost) drawSpots(fx, raid.men);
  drawVillage(context(layers.front), p, { now, sunX: look.sunX });
};

/** The dust after a step of the raid (raid-actors.js), for the view to keep between frames. */
export const dustAfter = puffsAfter;
