'use strict';

// How warm each climate zone is, spot by spot. The map (terrain.js) gives every texel its own temperature: the
// equator warmer than the planet as a whole, the poles colder, high ground colder still. A species lives only
// where its zones are inside its range (game.js habitat), so the cold-loving ones keep to the poles and the
// mountains and the warm-loving ones to the tropics; a warming planet pushes them towards the poles before it
// kills them. Loads after terrain.js.

/** The temperatures counted, whole degrees (as the map holds them) from ZONE_LO °C. */
const ZONE_LO = -80,
  ZONE_BINS = 200;

/**
 * Per zone: its area by temperature, and the coolest and warmest spot in it.
 * @typedef {{ bins: Float64Array, total: number, min: number, max: number }} ZoneHeat
 */

/** The last count, and the zones it was made for: Terrain.zones() is a new object each time the map changes. */
const zoneTemps = { of: /** @type {unknown} */ (null), heat: /** @type {Record<string, ZoneHeat>} */ ({}) };

/** @returns {ZoneHeat} */
const emptyHeat = () => ({ bins: new Float64Array(ZONE_BINS), total: 0, min: Infinity, max: -Infinity });

/** How much of the planet's surface a texel in row v stands for (rows near the poles are small). @param {number} v */
const rowArea = v => Math.cos((Math.abs(90 - ((v + 0.5) / Terrain.TEX_H) * 180) * Math.PI) / 180);

/**
 * Each zone's area by temperature, counted over every texel.
 * @param {{ zones: ArrayLike<number>, temps: ArrayLike<number>, bit: Record<string, number> }} h
 */
const countHeat = h => {
  const keys = Object.entries(h.bit),
    heat = Object.fromEntries(keys.map(([k]) => [k, emptyHeat()]));
  /* oxlint-disable fp/no-loops, fp/no-let, fp/no-mutation -- every texel of the map, each time it changes */
  for (let i = 0; i < h.zones.length; i++) {
    const bits = h.zones[i] ?? 0,
      t = h.temps[i] ?? 0,
      area = rowArea(Math.floor(i / Terrain.TEX_W)),
      b = Math.min(ZONE_BINS - 1, Math.max(0, Math.round(t - ZONE_LO)));
    for (const [k, bit] of keys) {
      const z = heat[k];
      if (!z || !(bits & bit)) continue;
      z.bins[b] = (z.bins[b] ?? 0) + area;
      z.total += area;
      z.min = Math.min(z.min, t);
      z.max = Math.max(z.max, t);
    }
  }
  /* oxlint-enable fp/no-loops, fp/no-let, fp/no-mutation */
  return heat;
};

/** The count for the map as it is now. */
const zoneHeat = () => {
  const of = Terrain.zones();
  if (zoneTemps.of !== of) {
    // oxlint-disable-next-line fp/no-mutation, fp/no-mutating-methods -- the one cache of the count
    Object.assign(zoneTemps, { of, heat: countHeat(Terrain.homes) });
  }
  return zoneTemps.heat;
};

/**
 * The share of a zone that is from lo to hi °C (0 where the zone is nowhere).
 * @param {string} zone
 * @param {number} lo
 * @param {number} hi
 */
const zoneWithin = (zone, lo, hi) => {
  const z = zoneHeat()[zone];
  if (!z?.total) return 0;
  const from = Math.max(0, Math.ceil(lo - ZONE_LO)),
    to = Math.min(ZONE_BINS - 1, Math.floor(hi - ZONE_LO));
  return z.bins.slice(from, to + 1).reduce((n, a) => n + a, 0) / z.total;
};

/**
 * The coolest and warmest spot of the zones that are anywhere, or null where none of them is.
 * @param {readonly string[]} zones
 */
const zoneSpan = zones => {
  const heat = zoneHeat(),
    here = zones.map(k => heat[k]).filter(z => !!z?.total);
  return here.length
    ? { min: Math.min(...here.map(z => z?.min ?? Infinity)), max: Math.max(...here.map(z => z?.max ?? -Infinity)) }
    : null;
};

/**
 * A species as the zones see it: where it lives (sea life without a home lives in the open sea), its range in °C
 * and how much of its zones holds a full population.
 * @typedef {{ home?: readonly string[], temp: readonly number[], plenty?: number }} ZoneSpecies
 */
/** @param {ZoneSpecies} s */
const homesOf = s => s.home ?? ['sea'];

/**
 * The share of the open sea from lo to hi °C. Under a sea frozen all over, life lives on in the water below.
 * @param {number} lo
 * @param {number} hi
 */
const seaWithin = (lo, hi) => (zoneSpan(['sea']) ? zoneWithin('sea', lo, hi) : 1);

/**
 * How much of a full population its habitat holds (0..1): the part of its zones inside its range, of which by
 * default 60% is plenty. Its zones' shares of the land (or of the shallows, for reefs) come from Terrain.zones.
 * @param {ZoneSpecies} s
 * @param {Readonly<Record<string, number>>} shares
 */
const zoneRoom = (s, shares) => {
  const [lo = -Infinity, hi = Infinity] = s.temp,
    room = homesOf(s).reduce(
      (n, k) => n + (k === 'sea' ? seaWithin(lo, hi) : (shares[k] ?? 0) * zoneWithin(k, lo, hi)),
      0,
    );
  return Math.min(1, Math.max(0, room / (s.plenty || 0.6)));
};

/**
 * How far its range is from the nearest spot of its zones (0 when some spot is inside it), below zero when too
 * hot, above when too cold. Where its zones are nowhere, the planet as a whole, at c °C, counts.
 * @param {ZoneSpecies} s
 * @param {number} c
 */
const zoneMiss = (s, c) => {
  const [lo = -Infinity, hi = Infinity] = s.temp,
    span = zoneSpan(homesOf(s)) ?? { min: c, max: c };
  return span.min > hi ? hi - span.min : span.max < lo ? lo - span.max : 0;
};

/**
 * How well the temperature suits a species: 1 where some spot of its zones is inside its range, falling to -1
 * when the nearest is 6 °C or more outside it.
 * @param {ZoneSpecies} s
 * @param {number} c
 */
const zoneFit = (s, c) => {
  const miss = Math.abs(zoneMiss(s, c));
  return miss === 0 ? 1 : -Math.min(1, miss / 6);
};

const ZoneTemps = Object.freeze({
  within: zoneWithin,
  span: zoneSpan,
  room: zoneRoom,
  fit: zoneFit,
  tooHot: (/** @type {ZoneSpecies} */ s, /** @type {number} */ c) => zoneMiss(s, c) < 0,
});

// oxlint-disable-next-line fp/no-mutating-methods -- the one way a classic script hands itself to Node
if (typeof module !== 'undefined') Object.assign(module, { exports: ZoneTemps }); // for Node (tests)
