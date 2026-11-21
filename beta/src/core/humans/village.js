// The village: people settle on one spot of the planet and build it up on a screen of its own (village-view.js),
// as a town is built in a strategy game. Each building opens with a card and costs wood and food, which the
// village gathers from the ground round it: forest gives wood, open land food. Growing wakes the wild: after a few
// buildings, or a long calm, a raid is due (raid.js plays it), and a raid held teaches the people to hold off the
// next creature on the ladder. Pure: the village comes in as plain data, a new village goes out.

/** @typedef {'huts' | 'fields' | 'woodcutter' | 'firepit' | 'spearmaker' | 'palisade'} Building */
/** @typedef {{ wood: number, food: number }} Cost */

/** What can be built: the card that opens it, and the cost of each level (the village starts with one hut). */
export const BUILDINGS = Object.freeze({
  huts: {
    card: 'huts',
    costs: [
      { wood: 0, food: 0 },
      { wood: 4, food: 3 },
      { wood: 9, food: 6 },
    ],
  },
  fields: {
    card: 'farming',
    costs: [
      { wood: 1, food: 0 },
      { wood: 3, food: 1 },
      { wood: 6, food: 2 },
    ],
  },
  woodcutter: {
    card: 'flint',
    costs: [
      { wood: 0, food: 2 },
      { wood: 2, food: 5 },
    ],
  },
  firepit: { card: 'fire', costs: [{ wood: 2, food: 0 }] },
  spearmaker: { card: 'spear', costs: [{ wood: 3, food: 2 }] },
  palisade: {
    card: 'flint',
    costs: [
      { wood: 6, food: 0 },
      { wood: 12, food: 2 },
    ],
  },
});
/** @type {readonly Building[]} */
export const BUILDING_ORDER = ['huts', 'fields', 'woodcutter', 'firepit', 'spearmaker', 'palisade'];

/** The wild that raids, easiest first: a raid held moves the village one rung up. */
export const LADDER = Object.freeze(['spider', 'scorpion', 'snake', 'wolf', 'boar', 'bear', 'bigcat', 'elephant']);

export const GROW_RAID = 2, // buildings that wake a raid
  CALM_DAYS = 8, // days of calm before a raid comes anyway
  WAIT_DAYS = 3, // days a due raid waits before it plays out by itself
  STORE = 12, // wood and food a level of huts can keep
  HELD_FOOD = 3; // food a held raid brings home

/** The ground round the village: the shares of forest, open land and water. @typedef {{ forest: number, open: number, water: number }} Land */
/**
 * @typedef {{
 *   u: number, v: number, // the map texel it stands on
 *   land: Land,
 *   levels: Readonly<Partial<Record<Building, number>>>,
 *   wood: number, food: number,
 *   rung: number, // the LADDER step the next raid brings
 *   grown: number, // buildings since the last raid
 *   calm: number, // days since the last raid
 *   due: number, // days a due raid has waited, or -1
 *   last: null | { held: boolean, id: string, auto: boolean }, // how the last raid went
 * }} Village
 */

/** A new village on texel (u, v), with one hut. @param {number} u @param {number} v @param {Land} land */
export const newVillage = (u, v, land) =>
  /** @type {Village} */ ({
    u,
    v,
    land,
    levels: { huts: 1 },
    wood: 3,
    food: 3,
    rung: 0,
    grown: 0,
    calm: 0,
    due: -1,
    last: null,
  });

/** A building's level, 0 if not built. @param {Village} village @param {Building} b */
export const levelOf = (village, b) => village.levels[b] ?? 0;
/** What the next level of a building costs, or null at the top. @param {Village} village @param {Building} b */
export const nextCost = (village, b) => BUILDINGS[b].costs[levelOf(village, b)] ?? null;

/**
 * Whether a building can be built or raised a level now: its card known, below the top, and paid for.
 * @param {Village} village
 * @param {Building} b
 * @param {ReadonlySet<string>} known
 */
export const canBuild = (village, b, known) => {
  const cost = nextCost(village, b);
  return known.has(BUILDINGS[b].card) && !!cost && village.wood >= cost.wood && village.food >= cost.food;
};

/** The village with a building built or raised (canBuild says whether it may be). @param {Village} village @param {Building} b */
export const build = (village, b) => {
  const cost = nextCost(village, b) ?? { wood: 0, food: 0 };
  return {
    ...village,
    levels: { ...village.levels, [b]: levelOf(village, b) + 1 },
    wood: village.wood - cost.wood,
    food: village.food - cost.food,
    grown: village.grown + 1,
  };
};

/** Wood and food a day. @param {Village} village */
export const perDay = village => ({
  wood: (0.3 + 1.2 * village.land.forest) * (1 + levelOf(village, 'woodcutter')),
  food: (0.3 + 0.8 * village.land.open) * (1 + levelOf(village, 'fields')),
});
/** How much of each the village can keep. @param {Village} village */
export const storeOf = village => STORE * Math.max(1, levelOf(village, 'huts'));

/** Whether a raid is due now. @param {Village} village */
export const raidDue = village => village.due >= 0;
/** Whether a due raid has waited long enough to play out by itself. @param {Village} village */
export const raidOverdue = village => village.due >= WAIT_DAYS;

/**
 * The village after `days`: it gathers, and growth or a long calm makes a raid due, if the wild has any raiders.
 * @param {Village} village
 * @param {number} days
 * @param {boolean} wild whether anything on the ladder is alive
 */
export const gather = (village, days, wild) => {
  const rate = perDay(village),
    store = storeOf(village),
    calm = village.calm + days,
    wakes = wild && (village.grown >= GROW_RAID || calm >= CALM_DAYS);
  return {
    ...village,
    wood: Math.min(store, village.wood + rate.wood * days),
    food: Math.min(store, village.food + rate.food * days),
    calm,
    due: village.due >= 0 ? village.due + days : wakes ? 0 : -1,
  };
};

/**
 * The creatures a raid at a rung brings, of those alive: the rung's own (the nearest alive above it, or the last
 * alive below), and the easier ones before it. Empty if nothing on the ladder lives.
 * @param {number} rung
 * @param {ReadonlySet<string>} alive
 */
export const raiders = (rung, alive) => {
  const living = LADDER.map((id, n) => ({ id, n })).filter(x => alive.has(x.id)),
    top = living.find(x => x.n >= rung) ?? living.at(-1);
  return top ? living.filter(x => x.n <= top.n).map(x => x.id) : [];
};

/** The building a fallen raid costs a level: the highest of all but the first hut. @param {Village} village */
const hardestHit = village =>
  BUILDING_ORDER.map(b => ({ b, n: levelOf(village, b) - (b === 'huts' ? 1 : 0) }))
    .filter(x => x.n > 0)
    .toSorted((p, q) => q.n - p.n)[0]?.b;

/**
 * The village after a raid: held, it climbs a rung and brings food home; fallen, it loses a level of a building.
 * Either way the wild rests until the village grows again.
 * @param {Village} village
 * @param {boolean} held
 * @param {string} id the raid's hardest creature
 * @param {boolean} auto whether it played out by itself
 */
export const afterRaid = (village, held, id, auto) => {
  const rested = { ...village, grown: 0, calm: 0, due: -1, last: { held, id, auto } },
    hit = held ? undefined : hardestHit(village);
  if (held)
    return {
      ...rested,
      rung: Math.min(LADDER.length - 1, Math.max(village.rung, LADDER.indexOf(id)) + 1),
      food: Math.min(storeOf(village), village.food + HELD_FOOD),
    };
  return hit ? { ...rested, levels: { ...village.levels, [hit]: levelOf(village, hit) - 1 } } : rested;
};
