// What stands on the raid field, drawn back to front each frame so nearer things cover farther ones: trees, bushes
// and rocks, people beside the road, and the creatures walking it. Also the dust left where creatures fall.
import { roadAt } from '../../core/humans/raid-map.js';
import { drawProp, toPic } from './raid-field.js';
import { CREATURE_COLORS, drawCreature } from './raid-creatures.js';
import { drawPerson, footOf, shade } from './raid-people.js';

/** @typedef {import('./palette.js').Palette} Palette */
/** @typedef {import('./raid-field.js').Prop} Prop */
/** @typedef {import('./raid-people.js').Puff} Puff */
/** @typedef {import('../../core/humans/raid.js').Raid} Raid */
/** @typedef {import('../../core/humans/raid.js').Foe} Foe */
/** @typedef {CanvasRenderingContext2D} G */

/** Where a creature is on the road, in the picture, and which way it faces. @param {Foe} o */
const placeOf = o => {
  const here = roadAt(o.d),
    ahead = roadAt(o.d + 0.1),
    at = toPic(here.x, here.y);
  return { x: at.x, y: at.y + 4, f: ahead.x < here.x ? -1 : 1 };
};

/**
 * Everything on the field, nearest last.
 * @param {G} g
 * @param {Raid} raid
 * @param {{ p: Palette, sunX: number, props: readonly Prop[], now: number }} look
 */
export const drawActors = (g, raid, look) => {
  const { p, now } = look;
  /** @type {{ y: number, draw: () => unknown }[]} */
  const items = [
    ...look.props.map(o => ({ y: o.y, draw: () => drawProp(g, o, p, look.sunX) })),
    ...raid.men.map(m => ({ y: footOf(m.spot).y, draw: () => drawPerson(g, m, p, now) })),
    ...raid.foes.map(o => {
      const at = placeOf(o),
        col = shade(p, /** @type {Record<string, string>} */ (CREATURE_COLORS)[o.id] ?? '#7c7a86');
      return { y: at.y, draw: () => drawCreature(g, o.id, { ...at, t: now / 1000 + o.n, col }, o.hp / o.max) };
    }),
  ];
  return items.toSorted((a, b) => a.y - b.y).map(i => i.draw());
};

/**
 * The dust after a step of the raid: new puffs where creatures fell (gone, and short of the village), the old ones
 * older, and the spent ones gone.
 * @param {readonly Puff[]} puffs
 * @param {Raid} before
 * @param {Raid} after
 * @param {number} dt
 * @returns {readonly Puff[]}
 */
export const puffsAfter = (puffs, before, after, dt) => {
  const left = new Set(after.foes.map(o => o.n)),
    fell = before.foes.filter(o => !left.has(o.n) && after.lives === before.lives).map(o => placeOf(o));
  return [
    ...puffs.map(f => ({ ...f, age: f.age + dt })).filter(f => f.age < 0.6),
    ...fell.map(at => ({ x: at.x, y: at.y - 4, age: 0 })),
  ];
};
