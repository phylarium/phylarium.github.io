// The wild raids the camp (src/core/humans/camp.js): at nightfall the fires are lit and raiders come in from the
// edge of the square; each walks to what it came for, round the fences if it can and through them if it must,
// flees a lit fire, and falls to the huts' spears. Pure, like camp.js.
import { EDGE, SPEAR_S, SQUARES, THROW, WOOD_MAX, apart, luck, nextTo, onLand } from './camp-grid.js';
import { RAIDERS, raidSize, squaresOf, woodPerDay } from './camp.js';

/** @typedef {import('./camp.js').Camp} Camp */
/** @typedef {import('./camp.js').CampWorld} CampWorld */
/** @typedef {import('./camp.js').CampEvent} CampEvent */
/** @typedef {import('./camp.js').Raider} Raider */

/** The camp without what stood on a square. @param {Camp} camp @param {number} k */
const without = (camp, k) => ({
  ...camp,
  built: Object.fromEntries(Object.entries(camp.built).filter(([s]) => Number(s) !== k)),
  fences: Object.fromEntries(Object.entries(camp.fences).filter(([s]) => Number(s) !== k)),
  lit: camp.lit.filter(s => s !== k),
});

/** @typedef {{ camp: Camp, events: readonly CampEvent[] }} Step */

/**
 * Steps from every square to the nearest of `goals`, over land; through fences only if `fences` is true.
 * @param {Camp} camp
 * @param {CampWorld} world
 * @param {readonly number[]} goals
 * @param {boolean} fences
 * @returns {readonly number[]}
 */
const stepsTo = (camp, world, goals, fences) => {
  const open = (/** @type {number} */ k) => onLand(world.ground[k]) && (fences || camp.built[k] !== 'fence');
  /** @type {(front: readonly number[], dist: readonly number[], d: number) => readonly number[]} */
  const spread = (front, dist, d) => {
    const next = [...new Set(front.flatMap(nextTo))].filter(k => open(k) && dist[k] === Infinity);
    return next.length
      ? spread(
          next,
          dist.map((x, k) => (next.includes(k) ? d + 1 : x)),
          d + 1,
        )
      : dist;
  };
  return spread(
    goals,
    SQUARES.map(k => (goals.includes(k) ? 0 : Infinity)),
    0,
  );
};

/** Where a raider goes: what it wants, else any hut or field; none if nothing is built. @param {Camp} camp @param {Raider} r */
const goalsOf = (camp, r) => {
  const wants = squaresOf(camp, RAIDERS[r.id]?.wants ?? 'hut');
  return wants.length ? wants : [...squaresOf(camp, 'hut'), ...squaresOf(camp, 'field')];
};

/**
 * A raider bites the fence in its way; the last bite breaks it, and the raider walks on.
 * @param {Step} s
 * @param {Raider} r
 * @param {number} to the fence's square
 * @returns {Step & { raider: Raider }}
 */
const bite = (s, r, to) => {
  const left = (s.camp.fences[to] ?? 1) - 1;
  return left > 0
    ? { ...s, camp: { ...s.camp, fences: { ...s.camp.fences, [to]: left } }, raider: { ...r, step: r.step - 1 } }
    : { camp: without(s.camp, to), events: [...s.events, { type: 'broke', k: to, id: r.id }], raider: r };
};

/**
 * One raider takes one step: flees from a lit fire, bites a fence in its way, or walks on; on what it came for, it
 * takes it and goes.
 * @param {Step} s
 * @param {Raider} r
 * @param {CampWorld} world
 * @returns {Step & { raider: Raider | null }}
 */
const stride = (s, r, world) => {
  const { camp } = s,
    goals = goalsOf(camp, r);
  if (!goals.length || camp.lit.some(f => apart(f, r.k) <= 1))
    return { ...s, raider: null, events: [...s.events, { type: 'fled', k: r.k, id: r.id }] };
  const around = stepsTo(camp, world, goals, false),
    dist = (around[r.k] ?? Infinity) < Infinity ? around : stepsTo(camp, world, goals, true),
    here = dist[r.k] ?? Infinity,
    to = nextTo(r.k).find(k => (dist[k] ?? Infinity) < here);
  if (to === undefined) return { ...s, raider: null, events: [...s.events, { type: 'fled', k: r.k, id: r.id }] };
  if (camp.built[to] === 'fence' && !goals.includes(to)) return bite(s, r, to);
  if (goals.includes(to)) {
    const what = camp.built[to];
    return {
      camp: without(camp, to),
      events: [...s.events, { type: 'lost', k: to, id: r.id, ...(what && { what }) }],
      raider: null,
    };
  }
  return { ...s, raider: { ...r, k: to, step: r.step - 1 } };
};

/** A raider moves on by dt seconds, a step at a time. @param {Step} s @param {Raider} r @param {CampWorld} world @param {number} dt */
const walk = (s, r, world, dt) => {
  /** @type {(s: Step, r: Raider) => Step} */
  const go = (st, rd) => {
    if (rd.step < 1) return { ...st, camp: { ...st.camp, raiders: [...st.camp.raiders, rd] } };
    const next = stride(st, rd, world);
    return next.raider ? go(next, next.raider) : next;
  };
  return go(s, { ...r, step: r.step + dt * (RAIDERS[r.id]?.speed ?? 1) });
};

/** Nightfall: the fires are lit while the wood lasts, and the wild comes in from the edge. @param {Step} s @param {CampWorld} world */
const nightfall = (s, world) => {
  const fires = squaresOf(s.camp, 'fire'),
    lit = fires.slice(0, Math.floor(s.camp.wood)),
    size = raidSize(s.camp, world),
    count = Math.floor(size) + (luck(world.seed, s.camp.seq) < size % 1 ? 1 : 0),
    kinds = world.wild.filter(id => RAIDERS[id]);
  /** @type {Raider[]} */
  const come = kinds.length
    ? Array.from({ length: count }, (_, n) => {
        const id = kinds[Math.floor(luck(world.seed, s.camp.seq + 1 + 2 * n) * kinds.length)] ?? 'wolf',
          from = EDGE.filter(k => (RAIDERS[id]?.from ?? []).includes(world.ground[k] ?? 'water') && !s.camp.built[k]),
          k = from[Math.floor(luck(world.seed, s.camp.seq + 2 + 2 * n) * from.length)];
        return { id, k: k ?? -1, hp: RAIDERS[id]?.hp ?? 1, step: 0 };
      }).filter(r => r.k >= 0)
    : [];
  return {
    camp: {
      ...s.camp,
      night: world.night,
      lit,
      wood: s.camp.wood - lit.length,
      raiders: [...s.camp.raiders, ...come],
      seq: s.camp.seq + 1 + 2 * count,
    },
    events: come.length ? [...s.events, { type: /** @type {const} */ ('raid'), k: come[0]?.k ?? 0 }] : s.events,
  };
};

/** The huts throw their spears, each at the nearest raider in reach; null if none is. @param {Step} s */
const throwSpears = s => {
  const hits = squaresOf(s.camp, 'hut').flatMap(h => {
    const near = s.camp.raiders
      .map((r, n) => ({ n, d: apart(h, r.k) }))
      .filter(x => x.d <= THROW)
      .toSorted((p, q) => p.d - q.d)[0];
    return near ? [near.n] : [];
  });
  if (!hits.length) return null;
  const hurt = s.camp.raiders.map((r, n) => ({ ...r, hp: r.hp - hits.filter(x => x === n).length }));
  return {
    camp: { ...s.camp, raiders: hurt.filter(r => r.hp > 0) },
    events: [
      ...s.events,
      ...hurt.filter(r => r.hp <= 0).map(r => ({ type: /** @type {const} */ ('killed'), k: r.k, id: r.id })),
    ],
  };
};

/**
 * Every raider moves on by dt seconds, one after another.
 * @param {Step} s
 * @param {readonly Raider[]} raiders
 * @param {CampWorld} world
 * @param {number} dt
 * @returns {Step}
 */
const walkAll = (s, [r, ...rest], world, dt) => (r ? walkAll(walk(s, r, world, dt), rest, world, dt) : s);

/**
 * The camp after dt seconds: wood grows, night brings raiders, raiders walk, the huts throw.
 * @param {Camp} camp
 * @param {CampWorld} world
 * @param {number} dt
 * @returns {Step}
 */
export const campStep = (camp, world, dt) => {
  const grown = { ...camp, wood: Math.min(WOOD_MAX, camp.wood + (woodPerDay(camp, world) * dt) / world.day) },
    dusk = world.night > camp.night ? nightfall({ camp: grown, events: [] }, world) : { camp: grown, events: [] },
    walked = walkAll({ ...dusk, camp: { ...dusk.camp, raiders: [] } }, dusk.camp.raiders, world, dt),
    timer = walked.camp.spear + dt;
  const thrown = world.known.has('spear') && timer >= SPEAR_S ? throwSpears(walked) : null;
  return thrown
    ? { ...thrown, camp: { ...thrown.camp, spear: timer - SPEAR_S } }
    : { ...walked, camp: { ...walked.camp, spear: Math.min(timer, SPEAR_S) } };
};
