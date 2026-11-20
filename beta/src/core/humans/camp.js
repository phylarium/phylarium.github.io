// The camp: one square of the planet seen close up (tiles.js), where people build huts, fields, fire pits and
// fences, and the wild raids at night. The more of the square is taken from the wild, the more raiders come
// (about taken² / land); the defences grow only with the huts, so a camp finds a size it can hold. Wood comes from
// the forest near the huts, and keeps the fires lit. Pure: the camp and the world come in as plain data, a new camp
// and what happened go out. camp.js runs it in the game, camp-view.js shows it.
import { FENCE_HP, RAIDS, REACH, START_WOOD, SQUARES, WOOD_PER_DAY, apart, onLand } from './camp-grid.js';

/** @typedef {import('./camp-grid.js').Ground} Ground */
/** @typedef {'hut' | 'field' | 'fire' | 'fence'} Build */

/** What can be built: the card that opens it and its cost in wood. */
export const BUILDS = Object.freeze({
  hut: { card: 'huts', wood: 2 },
  field: { card: 'farming', wood: 0 },
  fire: { card: 'fire', wood: 1 },
  fence: { card: 'flint', wood: 1 },
});

/**
 * The wild that raids: how many spears it takes, squares a second, what it comes for, and the ground it comes from.
 * @type {Readonly<Record<string, { hp: number, speed: number, wants: Build, from: readonly Ground[] }>>}
 */
export const RAIDERS = Object.freeze({
  wolf: { hp: 2, speed: 1.2, wants: 'hut', from: ['forest', 'open'] },
  bear: { hp: 5, speed: 0.7, wants: 'hut', from: ['forest'] },
  boar: { hp: 3, speed: 1, wants: 'field', from: ['forest', 'open'] },
  grazer: { hp: 1, speed: 1.5, wants: 'field', from: ['open'] },
  bigcat: { hp: 3, speed: 1.2, wants: 'hut', from: ['open'] },
  sabretooth: { hp: 4, speed: 1.1, wants: 'hut', from: ['open', 'forest'] },
  mammoth: { hp: 8, speed: 0.6, wants: 'field', from: ['open'] },
});

/** @typedef {{ id: string, k: number, hp: number, step: number }} Raider */
/**
 * @typedef {{
 *   u: number, v: number, // the map texel in the middle of the square
 *   built: Readonly<Record<string, Build>>, // by square: a + b * CAMP_N
 *   fences: Readonly<Record<string, number>>, // bites each fence can still take
 *   wood: number,
 *   night: number, // the last night it was raided
 *   lit: readonly number[], // the fires burning tonight
 *   raiders: readonly Raider[],
 *   spear: number, // seconds since the huts last threw
 *   seq: number, // draws of luck so far
 * }} Camp
 */
/**
 * The world as the camp sees it.
 * @typedef {{
 *   ground: readonly Ground[], // by square
 *   wild: readonly string[], // the raiders alive here (RAIDERS ids)
 *   known: ReadonlySet<string>, // the cards developed
 *   night: number, // a count that goes up once a night
 *   day: number, // real seconds in a day
 *   seed: number, // this world's luck
 * }} CampWorld
 */
/** @typedef {{ type: 'raid' | 'lost' | 'broke' | 'fled' | 'killed', k: number, id?: string, what?: Build }} CampEvent */

/** A new camp round texel (u, v), raided first the night after `night`. */
export const newCamp = (/** @type {number} */ u, /** @type {number} */ v, /** @type {number} */ night) =>
  /** @type {Camp} */ ({
    u,
    v,
    built: {},
    fences: {},
    wood: START_WOOD,
    night,
    lit: [],
    raiders: [],
    spear: 0,
    seq: 0,
  });

/** The squares built with one thing. @param {Camp} camp @param {Build} what */
export const squaresOf = (camp, what) =>
  Object.entries(camp.built)
    .filter(([, b]) => b === what)
    .map(([k]) => Number(k));

/** How many squares are taken from the wild, and how many land squares there are. */
const takenAndLand = (/** @type {Camp} */ camp, /** @type {CampWorld} */ world) => ({
  taken: Object.keys(camp.built).length,
  land: Math.max(1, world.ground.filter(onLand).length),
});
/** Raiders a night, as a number with a fraction (the fraction is a chance of one more). */
export const raidSize = (/** @type {Camp} */ camp, /** @type {CampWorld} */ world) => {
  const { taken, land } = takenAndLand(camp, world);
  return (RAIDS * taken * taken) / land;
};
/** Wood a day: from every forest square near a hut. */
export const woodPerDay = (/** @type {Camp} */ camp, /** @type {CampWorld} */ world) => {
  const huts = squaresOf(camp, 'hut');
  return (
    WOOD_PER_DAY *
    SQUARES.filter(k => world.ground[k] === 'forest' && !camp.built[k] && huts.some(h => apart(h, k) <= REACH)).length
  );
};

/**
 * Whether one thing can be built on a square now: on free land, with its card and its wood; the first thing is a
 * hut, and the rest go near one.
 * @param {Camp | null} camp
 * @param {CampWorld} world
 * @param {number} k
 * @param {Build} what
 */
export const canBuild = (camp, world, k, what) => {
  const rule = BUILDS[what],
    huts = camp ? squaresOf(camp, 'hut') : [];
  return (
    onLand(world.ground[k]) &&
    world.known.has(rule.card) &&
    !camp?.built[k] &&
    !camp?.raiders.some(r => r.k === k) &&
    (camp?.wood ?? START_WOOD) >= rule.wood &&
    (huts.length ? huts.some(h => apart(h, k) <= REACH) : what === 'hut')
  );
};

/** The camp with one more thing built (canBuild says whether it may be). @param {Camp} camp @param {number} k @param {Build} what */
export const build = (camp, k, what) => ({
  ...camp,
  built: { ...camp.built, [k]: what },
  fences: what === 'fence' ? { ...camp.fences, [k]: FENCE_HP } : camp.fences,
  wood: camp.wood - BUILDS[what].wood,
});
