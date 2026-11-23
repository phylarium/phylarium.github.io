'use strict';

// The village in the game: from Huts on, a band of people found in the close-up can settle where they stand, round a
// campfire, and the village grows on a screen of its own (village-view.js), one raid at a time: each step is a raid
// played as tower defense (raid-view.js), won for a building of the player's choice, or lost with the village.
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
const theVillage = () => (state.village ? VILLAGE.fromSave(state.village) : null);
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
  const tu = ((u % Terrain.TEX_W) + Terrain.TEX_W) % Terrain.TEX_W;
  // oxlint-disable-next-line fp/no-mutation -- the saved state, its one writer
  state.village = VILLAGE.newVillage(tu, v, villageLand(tu, v));
  return true;
}
/** Builds or raises the building picked for a raid held, if it can be. @param {VillageBuilding} b */
function villagePick(b) {
  const village = theVillage();
  if (!village || !VILLAGE.canPick(village, b, owned)) return false;
  // oxlint-disable-next-line fp/no-mutation -- the saved state, its one writer
  state.village = VILLAGE.pick(village, b);
  return true;
}

/** A new raid on the village, by the creatures its step brings. */
const villageRaid = () => {
  const village = theVillage();
  if (!village) return null;
  const ids = VILLAGE.raiders(village.steps, villageAlive());
  return ids.length ? VILLAGE.newRaid(ids, VILLAGE.strengthOf(village)) : null;
};
/** A raid lost costs the planet a few of its people, and the village. */
const RAID_PEOPLE = 0.05;
/** A raid is over: held, the village climbs a step and is owed a building; lost, it is gone. @param {Raid} raid */
function villageRaidDone(raid) {
  const village = theVillage();
  if (!village || !raid.done) return;
  // oxlint-disable-next-line fp/no-mutation -- the saved state, its one writer
  state.village = VILLAGE.afterRaid(village, raid.done === 'held', raid.top, owned);
  // oxlint-disable-next-line fp/no-mutation -- the saved state, its one writer
  if (raid.done === 'fell') state.people *= 1 - RAID_PEOPLE;
}
/** With nothing of the ladder alive, a step comes without a raid. */
function villageCalm() {
  const village = theVillage();
  if (!village || villageRaid()) return;
  const next = VILLAGE.afterRaid(village, true, '', owned);
  // oxlint-disable-next-line fp/no-mutation -- the saved state, its one writer
  state.village = next && { ...next, last: null };
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
      towns = RING.slice(0, Math.max(0, huts - 1)).map(() => VILLAGE_COVER.TOWN),
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
