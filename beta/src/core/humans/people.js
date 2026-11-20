// People: how many humans live on the planet, as one number beside their species' share. Food decides it: the
// planet carries as many as the hunt, the gathering and later the fields can feed, and the people grow towards that
// (logistic growth) or shrink back to it. Pure: the world comes in as plain numbers, a new count goes out.

/** How many the first band of Homo erectus can grow to, and Homo sapiens, before any card. */
const BASE = Object.freeze({ erectus: 1e5, sapiens: 1e6 });
/** How much each card multiplies the food: a number, or more with the grazers to hunt and the green to gather. */
const FOOD = Object.freeze({
  fire: 2,
  cooking: 1.3,
  flint: 1.5,
  spear: 1.2,
  language: 1.5,
  farming: 10,
  herding: 2,
  huts: 1.5,
  pottery: 1.2,
  villages: 2,
  houses: 1.5,
});
/** Growth per second while there is room: ten times as many in about four minutes. */
export const PEOPLE_RATE = 0.01;
/** The band that starts it, once there is food for it. */
export const PEOPLE_SEED = 1000;

/**
 * The world as people see it.
 * @typedef {object} PeopleView
 * @property {number} erectus share of a full population of Homo erectus (0..1)
 * @property {number} sapiens the same for Homo sapiens
 * @property {ReadonlySet<string>} known the cards developed
 * @property {number} grazers share of a full population of grazing mammals, the hunt's prey (0..1)
 * @property {number} green share of the land that is green, what gathering lives on (0..1)
 */

/**
 * How many people the planet can feed now.
 * @param {PeopleView} view
 */
export const carrying = view => {
  const base = Math.max(BASE.erectus * view.erectus, BASE.sapiens * view.sapiens);
  const cards = Object.entries(FOOD).reduce((n, [id, k]) => (view.known.has(id) ? n * k : n), 1);
  const hunt = view.known.has('hunting') ? 1 + view.grazers : 1;
  const gather = view.known.has('gathering') ? 1 + 2 * view.green : 1;
  return base * cards * hunt * gather;
};

/**
 * People after dt seconds: towards what the planet carries, never past it; none where it carries none.
 * @param {number} people
 * @param {number} carry
 * @param {number} dt
 */
export const peopleStep = (people, carry, dt) => {
  if (carry < 1) return 0;
  const now = people > 0 ? people : Math.min(carry, PEOPLE_SEED),
    next = now + PEOPLE_RATE * now * (1 - now / carry) * dt;
  return Math.min(Math.max(next, Math.min(now, carry)), Math.max(now, carry));
};

/** The share of the green land farmed at most, the people that farm it all, and of the farmland the share in towns. */
const FARM = Object.freeze({ most: 0.4, people: 3e9, towns: 0.15 });

/**
 * Fields and towns on the map: from Farming on, a share of the green land grows into fields as people grow; from
 * Villages on, the share of the fields nearest the water is towns. Rounded, so the map changes in steps.
 * @param {number} people
 * @param {ReadonlySet<string>} known
 */
export const settlement = (people, known) => ({
  settled: known.has('farming') ? Math.round(100 * Math.min(FARM.most, (FARM.most * people) / FARM.people)) / 100 : 0,
  towns: known.has('villages') ? FARM.towns : 0,
});

/** The climate zones of the land, which fields and towns take from wild life. */
const LAND_ZONES = new Set(['cold', 'wet', 'moist', 'dry', 'fresh']);
/**
 * The zones' shares of the land as wild species have them: less by the share people farm.
 * @param {Readonly<Record<string, number>>} shares
 * @param {number} farmed share of the land that is fields and towns
 */
export const wildShares = (shares, farmed) =>
  Object.fromEntries(Object.entries(shares).map(([k, v]) => [k, LAND_ZONES.has(k) ? v * (1 - farmed) : v]));
