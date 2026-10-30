'use strict';

// The planet's map, without any drawing: height and moisture, the features research puts on it (peaks, rivers,
// lakes), what covers each texel (sea, ice, biomes), the climate zones, and where critters stand. The scene
// paints it; the game reads the zones and biomes from it. No DOM, so it also runs outside the browser.
const Terrain = (() => {
  const TEX_W = 256;
  const TEX_H = 128;
  const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const FEATURE_BAND = [Math.round(TEX_H * 55 / 180), Math.round(TEX_H * 145 / 180)];   // 35°N to 55°S, the side in view

  // What covers a texel. The scene picks the colors.
  const COVER = {
    DEEP: 0, SHALLOW: 1, REEF: 2, BLEACHED: 3, SEA_ICE: 4, LAND_ICE: 5, RIVER: 6, LAKE: 7, MOUNTAIN: 8,
    ROCK: 9, BARE: 10, TUNDRA: 11, WETLAND: 12, FOREST: 13, GRASS: 14, SAVANNA: 15, SAND: 16,
  };
  const BIOME_OF = { [COVER.SAND]: 'desert', [COVER.GRASS]: 'grass', [COVER.SAVANNA]: 'grass', [COVER.FOREST]: 'forest', [COVER.WETLAND]: 'wetland' };
  // Each texel's climate zones as bits, so critters can find home ground.
  const ZONE_BIT = { cold: 1, wet: 2, moist: 4, dry: 8, fresh: 16, sea: 32, reef: 64 };
  const CRITTER_GAP = 5;

  const elev = fbm(rng(7), 6);
  const moist = fbm(rng(99), 4);
  const elevSorted = Float32Array.from(elev).sort();
  // Moisture as a rank from 0 to 1: the raw noise bunches up near the middle.
  const moistRank = new Float32Array(moist.length);
  Array.from(moist.keys()).sort((a, b) => moist[a] - moist[b]).forEach((i, k) => (moistRank[i] = k / moist.length));
  let seaThreshold = elevSorted[Math.floor(elevSorted.length * 0.7)], currentSea = seaThreshold, mountains = 0;

  const cover = new Uint8Array(TEX_W * TEX_H);
  const zoneMap = new Uint8Array(TEX_W * TEX_H);
  // Features that research puts on the map: mountain peaks (snowy once glaciers form), rivers running
  // from them to the sea, and lakes in the hollows on the way.
  let peakSpots = [], volcanoSpots = [], rivers = [], peaks = [], water = new Uint8Array(TEX_W * TEX_H);
  let feat = { peaks: 0, snow: false, rivers: false, lakes: false, frozen: false, temp: 0, rain: 0, grass: false, forests: false, wetlands: false, reefs: false, roots: false };
  // How far each texel is from water (sea, rivers, lakes) and from fresh water.
  let shoreDist = new Uint8Array(TEX_W * TEX_H), freshDist = new Uint8Array(TEX_W * TEX_H), distKey = '';
  // Share of the land (outside ice and mountains) in each biome.
  let biomes = { desert: 0, green: 0, grass: 0, forest: 0, wetland: 0 };
  // Climate zones of the land, whether or not anything grows there yet (shares of land outside ice and
  // mountains): cold, wet, moist, dry, and fresh (next to rivers and lakes). Reef and bleached are shares of the shallows.
  let zones = { cold: 0, wet: 0, moist: 0, dry: 0, fresh: 0, reef: 0, bleached: 0 };
  // Per species: its sprite, zone mask, how many it shows and the texture spots they stand on.
  let critters = new Map(), critterKey = '';

  /* ---------- noise ---------- */

  function rng(seed) {
    return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  function lerp(a, b, k) {
    return a + (b - a) * k;
  }

  function smooth(k) {
    return k * k * (3 - 2 * k);
  }

  // Fractal value noise on an equirectangular map that wraps around the planet.
  function fbm(rand, octaves) {
    const out = new Float32Array(TEX_W * TEX_H);
    let amp = 1, total = 0;
    for (let o = 0; o < octaves; o++) {
      const gw = 4 << o, gh = 2 << o;
      const grid = Array.from({ length: gw * (gh + 1) }, rand);
      for (let y = 0; y < TEX_H; y++) {
        const fy = y / TEX_H * gh, y0 = Math.floor(fy), ty = smooth(fy - y0);
        for (let x = 0; x < TEX_W; x++) {
          const fx = x / TEX_W * gw, x0 = Math.floor(fx), tx = smooth(fx - x0), x1 = (x0 + 1) % gw;
          const top = lerp(grid[y0 * gw + x0], grid[y0 * gw + x1], tx);
          const bottom = lerp(grid[(y0 + 1) * gw + x0], grid[(y0 + 1) * gw + x1], tx);
          out[y * TEX_W + x] += amp * lerp(top, bottom, ty);
        }
      }
      total += amp;
      amp *= 0.5;
    }
    for (let i = 0; i < out.length; i++) out[i] /= total;
    return out;
  }

  /* ---------- climate ---------- */

  // Latitude reached by the ice caps for a share of the planet under ice (0..1).
  const iceLimit = ice => ice >= 0.995 ? -20 : ice <= 0 ? 120 : Math.asin(1 - ice) * 180 / Math.PI;

  // Distance in texels (up to max) from the nearest texel where isSource holds, over the whole map.
  function distanceMap(out, max, isSource) {
    out.fill(255);
    const queue = [];
    for (let i = 0; i < out.length; i++) if (isSource(i)) { out[i] = 0; queue.push(i); }
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k], d = out[i] + 1;
      if (d > max) continue;
      const u = i % TEX_W, v = (i - u) / TEX_W;
      for (const [du, dv] of NEIGHBOURS) {
        if (v + dv < 0 || v + dv >= TEX_H) continue;
        const j = (v + dv) * TEX_W + (u + du + TEX_W) % TEX_W;
        if (out[j] > d) { out[j] = d; queue.push(j); }
      }
    }
  }

  // Local climate. The equator is about 13 °C warmer than the global mean and the poles about 40 °C colder;
  // high ground is colder still.
  const localTemp = (sin2, height) => feat.temp + 14 - 44 * sin2 - Math.max(0, height) * 60;
  // Land dries out in the heat; deep roots hold the water a little longer.
  const dryLimit = temp => (feat.roots ? 0.27 : 0.35) + 0.02 * Math.max(0, temp - 24);

  // What grows on a land texel, from its local temperature, its wetness and what has been researched.
  function landCover(temp, wet, nearFresh, veg) {
    if (temp < -2) return wet > 0 ? COVER.TUNDRA : COVER.ROCK;
    if (feat.wetlands && nearFresh && temp > 0) return COVER.WETLAND;
    if ((feat.forests && wet > 0.15 && temp < 35) || (veg > 0.6 && wet > 0.3)) return COVER.FOREST;
    if (wet > 0.25 * (1 - veg)) return COVER.GRASS;
    if (feat.grass && wet > -0.08) return COVER.SAVANNA;
    return COVER.SAND;
  }

  // Work out what covers every texel and the climate zones, for the scene's climate value t (sets how far the
  // sea has risen and whether bare ground is rock or hot desert), the ice cover (0..1) and how green life
  // makes the land (0..1).
  function update(t, ice, veg, centre) {
    const limit = iceLimit(ice);
    const sea = seaThreshold + (t > 0 ? Math.min(0.06, t * 0.004) : 0);
    currentSea = sea;
    const key = `${sea.toFixed(3)}|${feat.rivers}|${feat.lakes}|${feat.peaks}`;
    if (key !== distKey) {
      distKey = key;
      distanceMap(shoreDist, 12, i => elev[i] < sea || water[i] > 0);
      distanceMap(freshDist, 3, i => water[i] > 0 && elev[i] >= sea);
    }
    // Plants change the bare ground: where they can't grow it is sand desert.
    const plants = veg > 0.01 || feat.grass || feat.forests;
    const count = { desert: 0, green: 0, grass: 0, forest: 0, wetland: 0 };
    const zone = { cold: 0, wet: 0, moist: 0, dry: 0, fresh: 0, reef: 0, bleached: 0 };
    let landArea = 0, shallowArea = 0;
    for (let v = 0; v < TEX_H; v++) {
      const lat = Math.abs(90 - (v + 0.5) / TEX_H * 180), sin2 = Math.sin(lat * Math.PI / 180) ** 2;
      const area = Math.cos(lat * Math.PI / 180);
      // Air rises and rains out at the equator, and sinks dry over the subtropics (deserts near 25-30°).
      const band = 0.25 * Math.exp(-((lat / 10) ** 2)) - 0.4 * Math.exp(-(((lat - 27) / 9) ** 2));
      for (let u = 0; u < TEX_W; u++) {
        const i = v * TEX_W + u, e = elev[i];
        let c, bits = 0;
        if (lat + (e - seaThreshold) * 60 > limit) c = e < sea ? COVER.SEA_ICE : COVER.LAND_ICE;
        else if (water[i] && e >= sea) c = feat.frozen ? COVER.SEA_ICE : water[i] === 2 ? COVER.LAKE : COVER.RIVER;
        else if (e < sea - 0.06) {
          c = COVER.DEEP;
          bits = ZONE_BIT.sea;
        } else if (e < sea) {
          // Corals grow in patches along warm coasts; past about 30 °C they bleach. Drawn speckled.
          const temp = localTemp(sin2, 0), coral = feat.reefs && e > sea - 0.025 && moistRank[i] > 0.5 && temp >= 18;
          c = coral && (u + v) % 2 ? (temp > 30 ? COVER.BLEACHED : COVER.REEF) : COVER.SHALLOW;
          shallowArea += area;
          if (coral) zone[temp > 30 ? 'bleached' : 'reef'] += area;
          bits = ZONE_BIT.sea | (coral && temp <= 30 ? ZONE_BIT.reef : 0);
        } else if (e > sea + 0.14 - 0.08 * mountains) c = COVER.MOUNTAIN;
        else {
          // How much wetter than needed the ground is: moist noise, nearby water and rain against the heat.
          const temp = localTemp(sin2, e - sea);
          const wet = 0.45 * moistRank[i] + 0.4 * (1 - Math.min(12, shoreDist[i]) / 12) + 0.3 * feat.rain + band - dryLimit(temp);
          landArea += area;
          const z = temp < -2 ? 'cold' : wet > 0.15 ? 'wet' : wet > 0 ? 'moist' : 'dry';
          zone[z] += area;
          bits = ZONE_BIT[z];
          if (freshDist[i] <= 2 && temp > 0) {
            zone.fresh += area;
            bits |= ZONE_BIT.fresh;
          }
          if (!plants) c = t < 2 ? COVER.ROCK : COVER.BARE;
          else {
            c = landCover(temp, wet, freshDist[i] <= 2, veg);
            const biome = BIOME_OF[c];
            if (biome) count[biome] += area;
            if (c !== COVER.SAND && c !== COVER.ROCK) count.green += area;
          }
        }
        cover[i] = c;
        zoneMap[i] = bits;
      }
    }
    const share = (n, total) => (total ? n / total : 0);
    for (const k in count) count[k] = share(count[k], landArea);
    for (const k in zone) zone[k] = share(zone[k], k === 'reef' || k === 'bleached' ? shallowArea : landArea);
    biomes = count;
    zones = zone;
    placeCritters(centre);
  }

  /* ---------- features ---------- */

  const texDist = (a, b) => Math.hypot(Math.min(Math.abs(a.u - b.u), TEX_W - Math.abs(a.u - b.u)), a.v - b.v);

  // Up to n texture spots in the band in view, best score first, at least minDist apart (and from `avoid`).
  function pickSpots(n, minDist, score, avoid = []) {
    const cand = [];
    for (let v = FEATURE_BAND[0]; v < FEATURE_BAND[1]; v++) {
      for (let u = 0; u < TEX_W; u++) cand.push({ u, v, s: score(elev[v * TEX_W + u]) });
    }
    cand.sort((a, b) => b.s - a.s);
    const out = [];
    for (const c of cand) {
      if (out.length >= n) break;
      if (out.every(o => texDist(o, c) >= minDist) && avoid.every(o => texDist(o, c) >= minDist / 2)) out.push(c);
    }
    return out;
  }

  // A river runs downhill from a peak to the sea, always to the lowest neighbour it has not crossed yet.
  // In a hollow it spreads out until it can spill over the rim: those texels are a lake. Until lakes are
  // researched the river ends at the first one.
  function traceRiver(p, sea) {
    const path = [], seen = new Set();
    let u = p.u, v = p.v;
    for (let step = 0; step < 400; step++) {
      const i = v * TEX_W + u;
      seen.add(i);
      path.push(i);
      if (elev[i] < sea) break;
      let next = null;
      for (const [du, dv] of NEIGHBOURS) {
        const nu = (u + du + TEX_W) % TEX_W, nv = v + dv;
        if (nv < 0 || nv >= TEX_H) continue;
        const j = nv * TEX_W + nu;
        if (!seen.has(j) && (next === null || elev[j] < elev[next.j])) next = { u: nu, v: nv, j };
      }
      if (!next) break;
      u = next.u;
      v = next.v;
    }
    // A texel is in a hollow when the river has to climb higher later on.
    const lakes = [];
    let rim = -Infinity, run = [];
    for (let k = path.length - 1; k >= 0; k--) {
      const e = elev[path[k]];
      if (e < rim) run.push(path[k]);
      else {
        if (run.length >= 3) lakes.unshift(run);
        run = [];
      }
      rim = Math.max(rim, e);
    }
    if (run.length >= 3) lakes.unshift(run);
    // The river only crossed part of each hollow; fill the rest of it up to the highest water on the path.
    for (const l of lakes) {
      const top = Math.max(...l.map(i => elev[i])), inLake = new Set(l);
      for (let k = 0; k < l.length && l.length < 300; k++) {
        const u = l[k] % TEX_W, v = Math.floor(l[k] / TEX_W);
        for (const [du, dv] of NEIGHBOURS) {
          if (v + dv < 0 || v + dv >= TEX_H) continue;
          const j = (v + dv) * TEX_W + (u + du + TEX_W) % TEX_W;
          if (elev[j] <= top && !inLake.has(j)) {
            inLake.add(j);
            l.push(j);
          }
        }
      }
    }
    // Keep only the deepest part of each hollow, so lakes stay lakes and not inland seas.
    for (const l of lakes) {
      l.sort((a, b) => elev[a] - elev[b]);
      l.length = Math.min(l.length, 40);
    }
    // Every river gets at least one lake, halfway down.
    if (!lakes.length && path.length > 8) {
      const mid = path[Math.floor(path.length / 2)], mu = mid % TEX_W, mv = Math.floor(mid / TEX_W), disc = [];
      for (let dv = -2; dv <= 2; dv++) {
        for (let du = -3; du <= 3; du++) {
          if (mv + dv >= 0 && mv + dv < TEX_H && (du / 3) ** 2 + (dv / 2) ** 2 <= 1.1) disc.push((mv + dv) * TEX_W + (mu + du + TEX_W) % TEX_W);
        }
      }
      lakes.push(disc);
    }
    const first = new Set(lakes[0] || []);
    const end = path.findIndex(i => first.has(i));
    return { path, lakes, dry: end < 0 ? path.length : end };
  }

  // Where the features can go, from the shape of the terrain. Peaks are the highest ground; volcanoes stand on
  // land that stays dry even when the sea rises.
  function placeFeatures() {
    const sea = seaThreshold;
    peakSpots = pickSpots(16, 18, e => e);
    volcanoSpots = pickSpots(12, 18, e => -Math.abs(e - (sea + 0.08)), peakSpots);
    rivers = peakSpots.map(p => traceRiver(p, elevSorted[Math.floor(elevSorted.length * 0.5)]));
  }

  // Indices of `spots` already in use, grown to n with the unused spots nearest the centre of the view.
  function grow(used, spots, n, centre) {
    const out = used.slice(0, n);
    const free = spots.map((s, k) => k).filter(k => !out.includes(k)).sort((a, b) => texDist(spots[a], centre) - texDist(spots[b], centre));
    while (out.length < Math.min(n, spots.length)) out.push(free.shift());
    return out;
  }

  // Paint the rivers and lakes of the peaks in use into the water map.
  function updateWater() {
    water.fill(0);
    if (!feat.rivers) return;
    for (const k of peaks) {
      const r = rivers[k];
      r.path.slice(0, feat.lakes ? r.path.length : r.dry).forEach(i => (water[i] = 1));
      if (feat.lakes) r.lakes.forEach(l => l.forEach(i => (water[i] = 2)));
    }
  }

  /* ---------- critters ---------- */

  // Drop the critters whose ground is no longer home (frozen, dried out, flooded), then add the missing
  // ones on home ground near the centre of the view, spaced apart, with a little randomness.
  function placeCritters(centre) {
    const all = [];
    for (const c of critters.values()) {
      c.spots = c.spots.filter(s => zoneMap[s.v * TEX_W + s.u] & c.mask);
      all.push(...c.spots);
    }
    for (const c of critters.values()) {
      if (c.spots.length >= c.n) continue;
      const cand = [];
      for (let v = FEATURE_BAND[0]; v < FEATURE_BAND[1]; v += 2) {
        for (let u = (v >> 1) % 2; u < TEX_W; u += 2) {
          const i = v * TEX_W + u;
          if (zoneMap[i] & c.mask) cand.push({ u, v, s: texDist({ u, v }, centre) + 60 * (((i * 2654435761) >>> 0) / 2 ** 32) });
        }
      }
      cand.sort((a, b) => a.s - b.s);
      for (const s of cand) {
        if (c.spots.length >= c.n) break;
        if (all.every(o => texDist(o, s) >= CRITTER_GAP)) {
          const spot = { u: s.u, v: s.v, phase: Math.random() * 6.3 };
          c.spots.push(spot);
          all.push(spot);
        }
      }
    }
  }

  /* ---------- public API ---------- */

  placeFeatures();

  return {
    TEX_W, TEX_H, COVER, elev, cover,
    update,
    // Sea level now, after any rise.
    sea: () => currentSea,
    // Land share of the planet (moves the sea line) and mountain share of the land (0..1 each).
    setLand(share, peakShare) {
      seaThreshold = elevSorted[Math.min(elevSorted.length - 1, Math.floor(elevSorted.length * (1 - share)))];
      mountains = peakShare;
    },
    // Features from research (see feat). Returns false when nothing changed. New peaks rise near `centre`.
    setFeatures(f, centre) {
      if (Object.keys(f).every(k => f[k] === feat[k])) return false;
      const wet = f.rivers !== feat.rivers || f.lakes !== feat.lakes || f.peaks !== feat.peaks;
      feat = { ...feat, ...f };
      if (f.peaks !== peaks.length) peaks = grow(peaks, peakSpots, f.peaks, centre);
      if (wet) updateWater();
      return true;
    },
    features: () => feat,
    // The peaks in use, as texture spots.
    peaks: () => peaks.map(k => peakSpots[k]),
    // Volcano spot indices in use, grown to n near `centre`, and the spot of an index.
    growVolcanoes: (used, n, centre) => grow(used, volcanoSpots, n, centre),
    volcanoSpot: k => volcanoSpots[k],
    // The living species to show: [{id, sprite, home: zone names, n: how many}]. Returns false when unchanged.
    setCritters(list, centre) {
      const key = list.map(s => `${s.id}:${s.n}`).join();
      if (key === critterKey) return false;
      critterKey = key;
      critters = new Map(list.map(s => {
        const old = critters.get(s.id);
        return [s.id, { id: s.id, sprite: s.sprite, mask: s.home.reduce((m, k) => m | ZONE_BIT[k], 0), n: s.n, spots: old ? old.spots.slice(0, s.n) : [] }];
      }));
      placeCritters(centre);
      return true;
    },
    critters: () => critters.values(),
    // Share of the land (outside ice and mountains) in each biome: desert, green, grass, forest, wetland.
    biomes: () => biomes,
    // Share of the land in each climate zone, and of the shallows in reefs.
    zones: () => zones,
    // How many lakes are on the planet now.
    lakeCount: () => (feat.rivers && feat.lakes ? peaks.reduce((n, k) => n + rivers[k].lakes.length, 0) : 0),
  };
})();

if (typeof module !== 'undefined') module.exports = Terrain;
