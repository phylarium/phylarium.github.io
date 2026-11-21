// A raid on the village, played as tower defense (raid-view.js shows it): waves of creatures walk the road from the
// top to the village at the bottom, and people stand beside it with stones, torches and spears, paid for with hands
// (more huts, more hands; each kill brings more). A creature that reaches the village bites it; when the bites run
// out the raid is lost. A raid left alone plays itself out (autoRaid). Pure: a raid in, the raid a moment later out.
import { COVERAGE, CREATURES, DEFENDERS, DEFENDER_ORDER, ROAD_LEN, SPOTS, roadAt } from './raid-map.js';

/** @typedef {import('./raid-map.js').Defender} Defender */
/** @typedef {{ at: number, id: string, hp: number, wave: number }} Spawn */
/** @typedef {{ n: number, id: string, d: number, hp: number, max: number }} Foe */
/** @typedef {{ spot: number, kind: Defender, cool: number }} Man */
/** @typedef {{ spot: number, x: number, y: number, kind: Defender, age: number }} Shot */
/**
 * @typedef {{
 *   t: number, // seconds since it began
 *   hands: number, lives: number,
 *   spawns: readonly Spawn[], next: number, // what comes, and how many have come
 *   foes: readonly Foe[], men: readonly Man[], shots: readonly Shot[],
 *   waves: number, top: string, // how many waves, and the hardest creature
 *   kinds: readonly Defender[], // what the village can fight with
 *   done: null | 'held' | 'fell',
 * }} Raid
 */

export const SPAWN_GAP = 0.9, // seconds between creatures of a wave
  WAVE_REST = 7, // seconds between waves
  FIRST_WAVE = 4,
  WAVE_HP = 0.12; // each wave's creatures are this much tougher than the last's

/**
 * The creatures of one wave: the easier ones, harder as the waves go on, with more of the hardest towards the end.
 * @param {readonly string[]} ids
 * @param {number} w
 * @param {number} waves
 */
const waveOf = (ids, w, waves) => {
  const top = ids.at(-1) ?? 'spider',
    easier = ids.slice(0, -1),
    reach = Math.ceil((easier.length * (w + 1)) / waves);
  return Array.from({ length: 4 + 2 * w }, (_, i) =>
    !easier.length || w === waves - 1 || (w > 0 && i % 3 === 2)
      ? top
      : (easier[Math.max(0, reach - 1 - ((i + w) % 2))] ?? top),
  );
};

/**
 * A new raid by the creatures `ids` (easiest first), on a village with these buildings.
 * @param {readonly string[]} ids
 * @param {{ huts: number, palisade: number, built: ReadonlySet<string> }} village
 * @returns {Raid}
 */
export const newRaid = (ids, village) => {
  const waves = Math.min(6, 2 + ids.length),
    groups = Array.from({ length: waves }, (_, w) => waveOf(ids, w, waves)),
    starts = groups.reduce(
      (acc, g, w) => [...acc, (acc[w] ?? FIRST_WAVE) + g.length * SPAWN_GAP + WAVE_REST],
      [FIRST_WAVE],
    ),
    spawns = groups.flatMap((g, w) =>
      g.map((id, i) => ({
        at: (starts[w] ?? FIRST_WAVE) + i * SPAWN_GAP,
        id,
        hp: Math.round((CREATURES[id]?.hp ?? 1) * (1 + WAVE_HP * w)),
        wave: w,
      })),
    );
  return {
    t: 0,
    hands: 4 + 2 * village.huts,
    lives: 5 + 3 * village.palisade,
    spawns,
    next: 0,
    foes: [],
    men: [],
    shots: [],
    waves,
    top: ids.at(-1) ?? 'spider',
    kinds: DEFENDER_ORDER.filter(k => {
      const needs = DEFENDERS[k].needs;
      return !needs || village.built.has(needs);
    }),
    done: null,
  };
};

/** The wave the raid is on, counting from 1. @param {Raid} raid */
export const waveNow = raid => (raid.spawns[Math.max(0, raid.next - 1)]?.wave ?? 0) + 1;

/** Whether a defender can stand on a spot now. @param {Raid} raid @param {number} spot @param {Defender} kind */
export const canPlace = (raid, spot, kind) =>
  !raid.done &&
  !!SPOTS[spot] &&
  raid.kinds.includes(kind) &&
  raid.hands >= DEFENDERS[kind].cost &&
  !raid.men.some(m => m.spot === spot);

/** The raid with one more person beside the road (canPlace says whether one may stand there). @param {Raid} raid @param {number} spot @param {Defender} kind */
export const place = (raid, spot, kind) =>
  canPlace(raid, spot, kind)
    ? { ...raid, hands: raid.hands - DEFENDERS[kind].cost, men: [...raid.men, { spot, kind, cool: 0 }] }
    : raid;

/** @typedef {{ foes: readonly Foe[], men: readonly Man[], shots: readonly Shot[] }} Fight */

/** One person waits, or strikes what is in reach: everything (fire) or the one furthest on. @param {Fight} f @param {Man} m @param {number} dt @returns {Fight} */
const strike = (f, m, dt) => {
  const rule = DEFENDERS[m.kind],
    cool = m.cool - dt,
    at = SPOTS[m.spot] ?? { x: 0, y: 0 },
    near =
      cool > 0
        ? []
        : f.foes.filter(o => o.hp > 0 && Math.hypot(roadAt(o.d).x - at.x, roadAt(o.d).y - at.y) <= rule.reach),
    hit = rule.all ? near : near.toSorted((p, q) => q.d - p.d).slice(0, 1);
  if (!hit.length) return { ...f, men: [...f.men, { ...m, cool: Math.max(0, cool) }] };
  const struck = new Set(hit.map(o => o.n)),
    to = roadAt(hit[0]?.d ?? 0);
  return {
    foes: f.foes.map(o => (struck.has(o.n) ? { ...o, hp: o.hp - rule.hit } : o)),
    men: [...f.men, { ...m, cool: rule.every }],
    shots: [...f.shots, { spot: m.spot, x: to.x, y: to.y, kind: m.kind, age: 0 }],
  };
};
/** Everyone beside the road in turn. @param {Fight} f @param {readonly Man[]} men @param {number} dt @returns {Fight} */
const fightAll = (f, [m, ...rest], dt) => (m ? fightAll(strike(f, m, dt), rest, dt) : f);

/**
 * The raid dt seconds on: creatures come in and walk on, those at the village bite it, people strike, the dead
 * bring hands; it is held when every wave is gone, and lost when the bites run out.
 * @param {Raid} raid
 * @param {number} dt
 * @returns {Raid}
 */
export const raidStep = (raid, dt) => {
  if (raid.done) return raid;
  const t = raid.t + dt,
    come = raid.spawns.slice(raid.next).filter(s => s.at <= t),
    next = raid.next + come.length,
    walked = [...raid.foes, ...come.map((s, i) => ({ n: raid.next + i, id: s.id, d: 0, hp: s.hp, max: s.hp }))].map(
      o => ({ ...o, d: o.d + (CREATURES[o.id]?.speed ?? 1) * dt }),
    ),
    home = walked.filter(o => o.d >= ROAD_LEN),
    lives = raid.lives - home.reduce((s, o) => s + (CREATURES[o.id]?.bite ?? 1), 0),
    fought = fightAll({ foes: walked.filter(o => o.d < ROAD_LEN), men: [], shots: [] }, raid.men, dt),
    dead = fought.foes.filter(o => o.hp <= 0),
    foes = fought.foes.filter(o => o.hp > 0);
  return {
    ...raid,
    t,
    next,
    lives: Math.max(0, lives),
    hands: raid.hands + dead.reduce((s, o) => s + (CREATURES[o.id]?.bounty ?? 1), 0),
    foes,
    men: fought.men,
    shots: [...raid.shots.map(s => ({ ...s, age: s.age + dt })).filter(s => s.age < 0.25), ...fought.shots],
    done: lives <= 0 ? 'fell' : next >= raid.spawns.length && !foes.length ? 'held' : null,
  };
};

/** People stand where they reach most of the road, the strongest that can be paid for first. @param {Raid} raid @returns {Raid} */
export const autoPlace = raid => {
  const kind = raid.kinds.toReversed().find(k => raid.hands >= DEFENDERS[k].cost),
    spot = kind
      ? SPOTS.map((_, n) => n)
          .filter(n => canPlace(raid, n, kind))
          .toSorted((p, q) => (COVERAGE[q]?.[kind] ?? 0) - (COVERAGE[p]?.[kind] ?? 0))[0]
      : undefined;
  return kind && spot !== undefined ? autoPlace(place(raid, spot, kind)) : raid;
};

/** A raid nobody plays: people stand where they reach most, until it is held or lost. @param {Raid} raid */
export const autoRaid = raid =>
  Array.from({ length: 3000 }).reduce(
    (/** @type {Raid} */ r) => (r.done ? r : raidStep(autoPlace(r), 0.2)),
    autoPlace(raid),
  );
