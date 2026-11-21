'use strict';

// The village in the game: from Huts on, people settle on a spot of the planet (founded from the close-up) and
// build it up on a screen of its own (village-view.js); raids on it are played as tower defense (raid-view.js).
// The rules are in src/core/humans/village.js and raid.js (CORE.life.village); this file gives them the world as
// it is, keeps the village in the save, and shows it on the planet as a town with its fields. Loads after humans.js.

const VILLAGE = /** @type {typeof import('./src/app/core-village.js').VILLAGE} */ (CORE.life.village);
/** @typedef {import('./src/core/humans/village.js').Village} Village */
/** @typedef {import('./src/core/humans/village.js').Building} VillageBuilding */
/** @typedef {import('./src/core/humans/village.js').Land} VillageLand */
/** @typedef {import('./src/core/humans/raid.js').Raid} Raid */
/** @typedef {import('./src/core/humans/raid-map.js').Defender} RaidDefender */

const { COVER: VILLAGE_COVER } = Terrain;
const VILLAGE_WATER = new Set([
  VILLAGE_COVER.DEEP,
  VILLAGE_COVER.SHALLOW,
  VILLAGE_COVER.REEF,
  VILLAGE_COVER.BLEACHED,
  VILLAGE_COVER.RED_TIDE,
  VILLAGE_COVER.SEA_ICE,
  VILLAGE_COVER.RIVER,
  VILLAGE_COVER.LAKE,
  VILLAGE_COVER.FLOOD,
]);
/** The ground people can settle on. */
const VILLAGE_DRY = new Set([
  VILLAGE_COVER.BARE,
  VILLAGE_COVER.TUNDRA,
  VILLAGE_COVER.WETLAND,
  VILLAGE_COVER.FOREST,
  VILLAGE_COVER.GRASS,
  VILLAGE_COVER.SAVANNA,
  VILLAGE_COVER.SAND,
  VILLAGE_COVER.BURNT,
  VILLAGE_COVER.FIELD,
  VILLAGE_COVER.TOWN,
]);
/** Texels out from the middle that count as the village's ground: the square the close-up shows. */
const VILLAGE_HALF = 4;
/** The map texel (du, dv) from texel (u, v), or -1 past a pole. @param {number} u @param {number} v @param {number} du @param {number} dv */
const villageTexel = (u, v, du, dv) => {
  const tv = v + dv,
    tu = (((u + du) % Terrain.TEX_W) + Terrain.TEX_W) % Terrain.TEX_W;
  return tv < 0 || tv >= Terrain.TEX_H ? -1 : tv * Terrain.TEX_W + tu;
};
const VILLAGE_AROUND = Array.from({ length: (2 * VILLAGE_HALF + 1) ** 2 }, (_, k) => ({
  du: (k % (2 * VILLAGE_HALF + 1)) - VILLAGE_HALF,
  dv: Math.floor(k / (2 * VILLAGE_HALF + 1)) - VILLAGE_HALF,
}));
/** The ground round texel (u, v): the shares of forest, open land and water. @param {number} u @param {number} v @returns {VillageLand} */
const villageLand = (u, v) => {
  const covers = VILLAGE_AROUND.map(({ du, dv }) => Terrain.cover[villageTexel(u, v, du, dv)] ?? VILLAGE_COVER.DEEP),
    share = (/** @type {(c: number) => boolean} */ f) => covers.filter(f).length / covers.length;
  return {
    forest: share(c => c === VILLAGE_COVER.FOREST),
    water: share(c => VILLAGE_WATER.has(c)),
    open: share(c => c === VILLAGE_COVER.GRASS || c === VILLAGE_COVER.FIELD || c === VILLAGE_COVER.SAVANNA),
  };
};

/** The village, if people have founded one. @returns {Village | null} */
const theVillage = () => state.village ?? null;
/** The level of the village's huts, 0 without one (more food for the planet's people, humans.js). */
const villageHuts = () => {
  const village = theVillage();
  return village ? VILLAGE.levelOf(village, 'huts') : 0;
};
/** The creatures of the ladder that live on the planet now. */
const villageAlive = () => new Set(VILLAGE.LADDER.filter(id => pop(id) > 0));

/** Whether a village can be founded on texel (u, v): Huts known, none yet, and dry land there. @param {number} u @param {number} v */
const canFoundVillage = (u, v) =>
  has('huts') && !theVillage() && VILLAGE_DRY.has(Terrain.cover[villageTexel(u, v, 0, 0)] ?? VILLAGE_COVER.DEEP);
/** People settle on texel (u, v), if they can. @param {number} u @param {number} v */
function foundVillage(u, v) {
  if (!canFoundVillage(u, v)) return false;
  // oxlint-disable-next-line fp/no-mutation -- the saved state, its one writer
  state.village = VILLAGE.newVillage(u, v, villageLand(u, v));
  return true;
}
/** Builds or raises a building, if it can be. @param {VillageBuilding} b */
function villageBuild(b) {
  const village = theVillage();
  if (!village || !VILLAGE.canBuild(village, b, owned)) return false;
  // oxlint-disable-next-line fp/no-mutation -- the saved state, its one writer
  state.village = VILLAGE.build(village, b);
  return true;
}

/** A new raid on the village, by the creatures its rung brings. */
const villageRaid = () => {
  const village = theVillage();
  if (!village) return null;
  const ids = VILLAGE.raiders(village.rung, villageAlive());
  return ids.length
    ? VILLAGE.newRaid(ids, {
        huts: VILLAGE.levelOf(village, 'huts'),
        palisade: VILLAGE.levelOf(village, 'palisade'),
        built: new Set(VILLAGE.BUILDING_ORDER.filter(b => VILLAGE.levelOf(village, b) > 0)),
      })
    : null;
};
/** A fallen raid costs the planet a few of its people. */
const RAID_PEOPLE = 0.03;
/** A raid is over: the village climbs or loses, and the wild rests. @param {Raid} raid @param {boolean} auto */
function villageRaidDone(raid, auto) {
  const village = theVillage();
  if (!village || !raid.done) return;
  // oxlint-disable-next-line fp/no-mutation -- the saved state, its one writer
  state.village = VILLAGE.afterRaid(village, raid.done === 'held', raid.top, auto);
  // oxlint-disable-next-line fp/no-mutation -- the saved state, its one writer
  if (raid.done === 'fell') state.people *= 1 - RAID_PEOPLE;
}

/** Whether the raid screen is open (raid-view.js sets it): a raid being played does not play itself. */
const raidPlaying = { on: false };
/** The village moves on by dt seconds: it gathers, and a raid left waiting too long plays itself out. @param {number} dt */
function villageTick(dt) {
  const village = theVillage();
  if (!village) return;
  // oxlint-disable-next-line fp/no-mutation -- the saved state, its one writer
  state.village = VILLAGE.gather(village, dt / DAY_S, villageAlive().size > 0);
  const raid = VILLAGE.raidOverdue(state.village) && !raidPlaying.on ? villageRaid() : null;
  if (raid) villageRaidDone(VILLAGE.autoRaid(raid), true);
}

/** The covers the village puts on the planet, by texel: a town, more of it with more huts, and its fields. */
const villageCover = (() => {
  /** @type {{ key: unknown, cover: Record<number, number> }} */
  const last = { key: null, cover: {} };
  const RING = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
  ];
  return () => {
    const village = theVillage();
    if (last.key === village?.levels) return last.cover;
    const huts = village ? VILLAGE.levelOf(village, 'huts') : 0,
      fields = village ? VILLAGE.levelOf(village, 'fields') : 0,
      towns = RING.slice(0, huts - 1).map(() => VILLAGE_COVER.TOWN),
      around = [...towns, ...RING.slice(towns.length, towns.length + 2 * fields).map(() => VILLAGE_COVER.FIELD)],
      cover = village
        ? Object.fromEntries([
            [villageTexel(village.u, village.v, 0, 0), VILLAGE_COVER.TOWN],
            ...around.map((c, n) => [villageTexel(village.u, village.v, RING[n]?.[0] ?? 0, RING[n]?.[1] ?? 0), c]),
          ])
        : {};
    // oxlint-disable-next-line fp/no-mutating-methods -- the one memo of this function
    Object.assign(last, { key: village?.levels, cover });
    return cover;
  };
})();

/** Whether texel (u, v) is the village or right beside it (a tap there opens it). @param {number} u @param {number} v */
const villageAt = (u, v) => {
  const village = theVillage(),
    du = Math.abs(((u - (village?.u ?? 0) + Terrain.TEX_W * 1.5) % Terrain.TEX_W) - Terrain.TEX_W / 2);
  return !!village && du <= 2 && Math.abs(v - village.v) <= 2;
};
