// The village: people settle round a campfire on one spot of the planet and build it up on a screen of its own
// (village-view.js), as a town grows in a strategy game. Every step is earned in a raid (raid.js, played as tower
// defense): held off, the village picks one building to build or raise; lost, the wild burns it down, and people
// must settle again. Each raid held teaches them to stand against the next creature on the ladder. Pure: the
// village comes in as plain data, a new village goes out.

/** @typedef {'firepit' | 'huts' | 'fields' | 'woodcutter' | 'spearmaker' | 'palisade'} Building */

/**
 * What can be built: the card that opens it, how many levels it has, and what each level brings to a raid (people
 * to stand beside the road, and bites the village can take). The fire pit opens torches, the spear maker spears
 * (and sharper ones at its second level).
 */
export const BUILDINGS = Object.freeze({
  firepit: { card: 'fire', top: 1, hands: 0, lives: 0 },
  huts: { card: 'huts', top: 3, hands: 2, lives: 1 },
  fields: { card: 'farming', top: 3, hands: 1, lives: 0 },
  woodcutter: { card: 'flint', top: 2, hands: 1, lives: 0 },
  spearmaker: { card: 'spear', top: 2, hands: 0, lives: 0 },
  palisade: { card: 'flint', top: 2, hands: 0, lives: 3 },
});
/** @type {readonly Building[]} */
export const BUILDING_ORDER = ['firepit', 'huts', 'fields', 'woodcutter', 'spearmaker', 'palisade'];

/** The wild that raids, easiest first: a raid held moves the village one rung up. */
export const LADDER = Object.freeze(['spider', 'scorpion', 'snake', 'wolf', 'boar', 'bear', 'bigcat', 'elephant']);

export const BASE_HANDS = 6,
  BASE_LIVES = 5,
  HARDER = 0.15; // how much tougher the creatures are for each step past the top of the ladder

/** The ground round the village: the shares of forest, open land and water. @typedef {{ forest: number, open: number, water: number }} Land */
/**
 * @typedef {{
 *   u: number, v: number, // the map texel it stands on
 *   land: Land,
 *   levels: Readonly<Partial<Record<Building, number>>>,
 *   steps: number, // raids held: the LADDER step the next raid brings
 *   owed: number, // buildings won and not yet picked
 *   last: null | { held: boolean, id: string }, // how the last raid went
 * }} Village
 */

/** A new village on texel (u, v): a campfire. @param {number} u @param {number} v @param {Land} land @returns {Village} */
export const newVillage = (u, v, land) => ({ u, v, land, levels: { firepit: 1 }, steps: 0, owed: 0, last: null });

/**
 * A village as the save keeps it, from before every step was a raid too (wood, food, a rung): its buildings stay,
 * round a campfire. A village saved as it is now comes back as it was.
 * @param {Pick<Village, 'u' | 'v' | 'land' | 'levels'> & Partial<Village> & { rung?: number }} saved
 * @returns {Village}
 */
export const fromSave = saved =>
  saved.steps !== undefined
    ? /** @type {Village} */ (saved)
    : {
        u: saved.u,
        v: saved.v,
        land: saved.land,
        levels: { ...saved.levels, firepit: 1 },
        steps: saved.rung ?? 0,
        owed: 0,
        last: null,
      };

/** A building's level, 0 if not built. @param {Village} village @param {Building} b */
export const levelOf = (village, b) => village.levels[b] ?? 0;

/** Whether a building can go up a level: its card known and below the top. @param {Village} village @param {Building} b @param {ReadonlySet<string>} known */
const canRaise = (village, b, known) => known.has(BUILDINGS[b].card) && levelOf(village, b) < BUILDINGS[b].top;
/** The buildings a held raid lets the village pick from. @param {Village} village @param {ReadonlySet<string>} known */
export const choicesOf = (village, known) => BUILDING_ORDER.filter(b => canRaise(village, b, known));
/** Whether the village may pick a building now: one is owed, and it can go up. @param {Village} village @param {Building} b @param {ReadonlySet<string>} known */
export const canPick = (village, b, known) => village.owed > 0 && canRaise(village, b, known);
/** The village with a building built or raised, paid for with a raid held (canPick says whether it may be). @param {Village} village @param {Building} b */
export const pick = (village, b) => ({
  ...village,
  levels: { ...village.levels, [b]: levelOf(village, b) + 1 },
  owed: Math.max(0, village.owed - 1),
});

/** What the village brings to a raid: people, bites it can take, what it fights with, how hard. @param {Village} village */
export const strengthOf = village => {
  const sum = (/** @type {'hands' | 'lives'} */ k) =>
    BUILDING_ORDER.reduce((s, b) => s + levelOf(village, b) * BUILDINGS[b][k], 0);
  return {
    hands: BASE_HANDS + sum('hands'),
    lives: BASE_LIVES + sum('lives'),
    built: new Set(BUILDING_ORDER.filter(b => levelOf(village, b) > 0)),
    sharp: Math.max(0, levelOf(village, 'spearmaker') - 1),
    hard: 1 + HARDER * Math.max(0, village.steps - (LADDER.length - 1)),
  };
};

/**
 * The creatures a raid at a step brings, of those alive: the step's own (the nearest alive above it, or the last
 * alive below), and the easier ones before it. Empty if nothing on the ladder lives.
 * @param {number} step
 * @param {ReadonlySet<string>} alive
 */
export const raiders = (step, alive) => {
  const living = LADDER.map((id, n) => ({ id, n })).filter(x => alive.has(x.id)),
    top = living.find(x => x.n >= step) ?? living.at(-1);
  return top ? living.filter(x => x.n <= top.n).map(x => x.id) : [];
};

/**
 * The village after a raid: held, it climbs a step and is owed a building (if there is one it can pick); lost,
 * nothing is left of it.
 * @param {Village} village
 * @param {boolean} held
 * @param {string} id the raid's hardest creature
 * @param {ReadonlySet<string>} known the cards known
 * @returns {Village | null}
 */
export const afterRaid = (village, held, id, known) =>
  held
    ? {
        ...village,
        steps: village.steps + 1,
        owed: village.owed + (choicesOf(village, known).length > village.owed ? 1 : 0),
        last: { held, id },
      }
    : null;
