'use strict';

// A hurricane seen from the side, as the scene draws it (drawHurricanes in scene.js): a wall of cloud over the
// sea, tallest at the eyewall and lower towards its edges, with the clear eye in the middle. Its bands stream up
// one side of the eye and down the other, so it turns, and rain slants down under it onto the spray on the water.
// The pixels are relative to the eye at sea level, y growing downwards; `now` (ms) moves them.

const HURRICANE = { base: 7, height: 22, half: 24, eye: 2, rain: 16, spray: 10 };

/**
 * One rectangle of the picture.
 * @typedef {{ x: number, y: number, w: number, h: number, color: string }} HurricanePixel
 */

/**
 * A number from 0 to 1 that is always the same for the same place.
 * @param {number} x
 * @param {number} r
 */
const hurricaneHash = (x, r) => ((Math.imul(x + 97, 73856093) ^ Math.imul(r + 31, 19349663)) >>> 0) / 4294967296;

/**
 * How many pixels the cloud stands above its base this far from the eye: tallest at the eyewall, its top in
 * billows.
 * @param {number} d
 */
const hurricaneTop = d =>
  Math.round(HURRICANE.height * (1 - 0.7 * (d / HURRICANE.half) ** 1.5) + 2 * Math.abs(Math.sin(d * 0.45)));

/** The cloud's grays, from its dark base to its sunlit top. */
const HURRICANE_GRAYS = ['#4a4a56', '#6a7a8a', '#8a8a96', '#c8c8d0', '#f0f0f0'];

/**
 * The cloud's color at a place: dark at the base, white at the top, with soft bands that move up one side of the
 * eye and down the other.
 * @param {number} x
 * @param {number} r rows above the base
 * @param {number} top the column's height
 * @param {number} now
 */
const hurricaneShade = (x, r, top, now) => {
  const band = 0.5 + 0.5 * Math.sin(r * 0.9 + Math.abs(x) * 0.35 - Math.sign(x) * (now / 250));
  const light = (r / top) * 0.6 + band * 0.35 + hurricaneHash(x, r) * 0.15;
  return HURRICANE_GRAYS[Math.min(HURRICANE_GRAYS.length - 1, Math.floor(light * HURRICANE_GRAYS.length))] ?? '#f0f0f0';
};

/**
 * The cloud wall, column by column, without the eye; its top edge is ragged.
 * @param {number} now
 * @returns {HurricanePixel[]}
 */
const hurricaneCloud = now =>
  Array.from({ length: HURRICANE.half * 2 + 1 }, (_, i) => i - HURRICANE.half)
    .filter(x => Math.abs(x) >= HURRICANE.eye)
    .flatMap(x => {
      const top = hurricaneTop(Math.abs(x)) - (hurricaneHash(x, 0) < 0.3 ? 1 : 0);
      return Array.from({ length: Math.max(0, top) }, (_, r) => ({
        x,
        y: -HURRICANE.base - r,
        w: 1,
        h: 1,
        color: hurricaneShade(x, r, top, now),
      }));
    });

/**
 * Rain driven sideways under the cloud: short slanting streaks falling to the sea.
 * @param {number} now
 * @returns {HurricanePixel[]}
 */
const hurricaneRain = now =>
  Array.from({ length: HURRICANE.rain }, (_, n) => ({
    x: Math.round(-HURRICANE.half + 2 + n * 3 + ((now / 30 + n * 7) % 4)),
    y: Math.round(-HURRICANE.base + ((now / 18 + n * 13) % HURRICANE.base)),
  }))
    .filter(p => Math.abs(p.x) > HURRICANE.eye)
    .flatMap(p => [
      { x: p.x, y: p.y, w: 1, h: 1, color: '#8ad8ff' },
      { x: p.x + 1, y: p.y + 1, w: 1, h: 1, color: '#8ad8ff' },
    ]);

/**
 * White spray where the wind whips the sea.
 * @param {number} now
 * @returns {HurricanePixel[]}
 */
const hurricaneSpray = now =>
  Array.from({ length: HURRICANE.spray }, (_, n) => ({
    x: Math.round(-HURRICANE.half + n * 5 + Math.sin(now / 200 + n) * 2),
    y: -1 - (Math.floor(now / 90 + n) % 2),
    w: 2,
    h: 1,
    color: '#f0f0f0',
  }));

/**
 * Everything of a hurricane at this moment, back to front.
 * @param {number} now
 * @returns {HurricanePixel[]}
 */
const hurricanePixels = now => [...hurricaneRain(now), ...hurricaneSpray(now), ...hurricaneCloud(now)];
