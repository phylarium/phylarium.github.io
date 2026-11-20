'use strict';

// Seeded randomness and fractal value noise for the map (terrain.js), on an equirectangular map that wraps around
// the planet. Moved out of terrain.js (2026-11-20). Loads before it; in Node, terrain.js requires it.

/* oxlint-disable fp/no-loops, fp/no-let, fp/no-mutation -- noise over every texel of the map, once per world: one
   pass, as fast as it goes */
/**
 * A seeded random generator, from 0 up to 1.
 * @param {number} seed
 */
const noiseRng = seed => {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
};
/** @param {number} a @param {number} b @param {number} k */
const noiseLerp = (a, b, k) => a + (b - a) * k;
/** @param {number} k */
const noiseSmooth = k => k * k * (3 - 2 * k);

/**
 * Fractal value noise, width by height, wrapping east to west.
 * @param {() => number} rand
 * @param {number} octaves
 * @param {number} width
 * @param {number} height
 */
const noiseFbm = (rand, octaves, width, height) => {
  const out = new Float32Array(width * height);
  let amp = 1,
    total = 0;
  for (let o = 0; o < octaves; o++) {
    const gw = 4 << o,
      gh = 2 << o;
    const grid = Array.from({ length: gw * (gh + 1) }, rand);
    for (let y = 0; y < height; y++) {
      const fy = (y / height) * gh,
        y0 = Math.floor(fy),
        ty = noiseSmooth(fy - y0);
      for (let x = 0; x < width; x++) {
        const fx = (x / width) * gw,
          x0 = Math.floor(fx),
          tx = noiseSmooth(fx - x0),
          x1 = (x0 + 1) % gw;
        const top = noiseLerp(grid[y0 * gw + x0] ?? 0, grid[y0 * gw + x1] ?? 0, tx);
        const bottom = noiseLerp(grid[(y0 + 1) * gw + x0] ?? 0, grid[(y0 + 1) * gw + x1] ?? 0, tx);
        out[y * width + x] = (out[y * width + x] ?? 0) + amp * noiseLerp(top, bottom, ty);
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) / total;
  return out;
};
/* oxlint-enable fp/no-loops, fp/no-let, fp/no-mutation */

const TerrainNoise = Object.freeze({ rng: noiseRng, fbm: noiseFbm, lerp: noiseLerp, smooth: noiseSmooth });

// oxlint-disable-next-line fp/no-mutating-methods -- the one way a classic script hands itself to Node
if (typeof module !== 'undefined') Object.assign(module, { exports: TerrainNoise }); // for Node (tests and tools)
