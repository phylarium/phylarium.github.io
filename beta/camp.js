'use strict';

// The camp in the game: from Huts on, people build on one square of the planet seen close up, and the wild that
// lives there raids it at night. The rules are in src/core/humans/camp.js (CORE.life.camp); this file gives them
// the world as it is, keeps the camp in the save, and shows its huts and fields on the planet. camp-view.js draws
// it in the close-up. Loads after humans.js.

const CAMP = CORE.life.camp;
/** @typedef {import('./src/core/humans/camp.js').Camp} Camp */
/** @typedef {import('./src/core/humans/camp.js').Build} CampBuild */
/** @typedef {import('./src/core/humans/camp-grid.js').Ground} CampGround */
/** @typedef {import('./src/core/humans/camp.js').CampEvent} CampEvent */

const { COVER: CAMP_COVER } = Terrain;
const CAMP_WATER = new Set([
    CAMP_COVER.DEEP,
    CAMP_COVER.SHALLOW,
    CAMP_COVER.REEF,
    CAMP_COVER.BLEACHED,
    CAMP_COVER.RED_TIDE,
    CAMP_COVER.SEA_ICE,
    CAMP_COVER.RIVER,
    CAMP_COVER.LAKE,
    CAMP_COVER.FLOOD,
  ]),
  CAMP_ROCK = new Set([
    CAMP_COVER.LAND_ICE,
    CAMP_COVER.MOUNTAIN,
    CAMP_COVER.ROCK,
    CAMP_COVER.LAVA,
    CAMP_COVER.MAGMA,
    CAMP_COVER.EMBER,
  ]);
/** What a cover is to the camp. @param {number} c @returns {CampGround} */
const groundOfCover = c =>
  CAMP_WATER.has(c) ? 'water' : CAMP_ROCK.has(c) ? 'rock' : c === CAMP_COVER.FOREST ? 'forest' : 'open';
const CAMP_HALF = (CAMP.CAMP_N - 1) / 2;
/**
 * The map texel of a square of the close-up round texel (u, v), or -1 past a pole.
 * @param {number} u
 * @param {number} v
 * @param {number} k
 */
const campTexel = (u, v, k) => {
  const a = k % CAMP.CAMP_N,
    b = Math.floor(k / CAMP.CAMP_N),
    tv = v - CAMP_HALF + b,
    tu = (((u - CAMP_HALF + a) % Terrain.TEX_W) + Terrain.TEX_W) % Terrain.TEX_W;
  return tv < 0 || tv >= Terrain.TEX_H ? -1 : tv * Terrain.TEX_W + tu;
};
const CAMP_SQUARES = Array.from({ length: CAMP.CAMP_N * CAMP.CAMP_N }, (_, k) => k);
/** The wild alive at a texel that raids a camp: warm enough there, and living. @param {number} i */
const campWild = i => {
  const t = Terrain.homes.temps[i] ?? 0;
  return Object.keys(CAMP.RAIDERS).filter(id => {
    const range = /** @type {number[] | undefined} */ (SPECIES_BY_ID[id]?.['temp']);
    return pop(id) > 0 && t >= (range?.[0] ?? -Infinity) && t <= (range?.[1] ?? Infinity);
  });
};
/**
 * The world as a camp round texel (u, v) sees it now.
 * @param {number} u
 * @param {number} v
 */
const campWorld = (u, v) => ({
  ground: CAMP_SQUARES.map(k => {
    const i = campTexel(u, v, k);
    return i < 0 ? /** @type {CampGround} */ ('water') : groundOfCover(Terrain.cover[i] ?? 0);
  }),
  wild: campWild(campTexel(u, v, (CAMP.CAMP_N * CAMP.CAMP_N - 1) / 2)),
  known: /** @type {ReadonlySet<string>} */ (owned),
  night: skyNight(),
  day: DAY_S,
  seed: /** @type {number} */ (state.seed),
});
/** The camp, if people have built one. @returns {Camp | null} */
const theCamp = () => state.camp ?? null;
/** Huts standing in the camp. */
const campHuts = () => {
  const camp = theCamp();
  return camp ? CAMP.squaresOf(camp, 'hut').length : 0;
};

/** The covers the camp puts on the planet, by texel: the same object until the camp changes. */
const campCover = (() => {
  /** @type {{ key: unknown, cover: Record<number, number> }} */
  const last = { key: null, cover: {} };
  return () => {
    const camp = theCamp();
    if (last.key === camp?.built) return last.cover;
    const cover = camp
      ? Object.fromEntries(
          Object.entries(camp.built).flatMap(([k, what]) =>
            what === 'hut' || what === 'field'
              ? [[campTexel(camp.u, camp.v, Number(k)), what === 'hut' ? CAMP_COVER.TOWN : CAMP_COVER.FIELD]]
              : [],
          ),
        )
      : {};
    // oxlint-disable-next-line fp/no-mutating-methods -- the one memo of this function
    Object.assign(last, { key: camp?.built, cover });
    return cover;
  };
})();

/** Who hears what happens in the camp (camp-view.js). @type {((events: readonly CampEvent[]) => void)[]} */
const campListeners = [];
/** A lost hut costs the planet a few of its people. */
const HUT_PEOPLE = 0.02;

/** The camp moves on by dt seconds. @param {number} dt */
function campTick(dt) {
  const camp = theCamp();
  if (!camp) return;
  const step = CAMP.campStep(camp, campWorld(camp.u, camp.v), Math.min(dt, 1)),
    huts = step.events.filter((/** @type {CampEvent} */ e) => e.type === 'lost' && e.what === 'hut').length;
  // oxlint-disable-next-line fp/no-mutation -- the saved state, its one writer
  state.camp = step.camp;
  // oxlint-disable-next-line fp/no-mutation -- the saved state, its one writer
  if (huts) state.people *= (1 - HUT_PEOPLE) ** huts;
  if (step.events.length) campListeners.map(hear => hear(step.events));
}

/**
 * Builds one thing on a square of the close-up round (u, v), if it may be built; the first hut sets the camp there.
 * @param {number} u
 * @param {number} v
 * @param {number} k
 * @param {CampBuild} what
 */
function campBuild(u, v, k, what) {
  const camp = theCamp(),
    world = campWorld(u, v);
  if (camp && (camp.u !== u || camp.v !== v)) return false;
  if (!CAMP.canBuild(camp, world, k, what)) return false;
  // oxlint-disable-next-line fp/no-mutation -- the saved state, its one writer
  state.camp = CAMP.build(camp ?? CAMP.newCamp(u, v, world.night), k, what);
  return true;
}

/** Where a tap at texel (u, v) opens the close-up: on the camp if it is in that square. @param {number} u @param {number} v */
const campSnap = (u, v) => {
  const camp = theCamp(),
    du = Math.abs(((u - (camp?.u ?? 0) + Terrain.TEX_W * 1.5) % Terrain.TEX_W) - Terrain.TEX_W / 2);
  return camp && du <= CAMP_HALF && Math.abs(v - camp.v) <= CAMP_HALF ? [camp.u, camp.v] : [u, v];
};
/** Whether anything of the camp stands at a map texel. @param {number} i */
const campStandsAt = i => {
  const camp = theCamp();
  return !!camp && Object.keys(camp.built).some(k => campTexel(camp.u, camp.v, Number(k)) === i);
};
