'use strict';

// Evolution runs by itself, taking each species its days: the first that can evolve and has a home that suits it
// (room in its zones, a temperature it lives in). One that loses its home stops; the next starts afresh. The main
// line of the tree of life and its side branches (species.yaml `side: true`) each evolve one species at a time,
// side by side, so a side branch never holds the main line up. Loads after game.js.

/** The slot of the saved state that holds a species evolving: the main line's, or the side branches'. */
/** @typedef {'evolving' | 'sideEvolving'} EvolveSlot */

/** Whether it has a home that suits it now. @param {any} s */
const homeFits = s => habitat(s) > 0.05 && fitness(s, tempC()) > 0;
/** The species, while it can still evolve (else null). @param {any} s */
const stillEvolving = s =>
  s && !evolved(s.id) && parentAlive(s) && parentOk(s) && conditionsMet(s) && opened(s) ? s : null;
/** The species evolving now with this id, in either slot (else null). @param {string} id */
const evolvingNow = id => [state.evolving, state.sideEvolving].find(ev => ev?.id === id) ?? null;
/** The first species that can evolve in a slot now. @param {EvolveSlot} slot */
const nextToEvolve = slot =>
  SPECIES.find(
    n => n['parent'] && !!n['side'] === (slot === 'sideEvolving') && speciesStatus(n) === 'available' && homeFits(n),
  );

/* oxlint-disable fp/no-mutation -- the saved state changes in place, here only its slot and the species born */
/**
 * One slot of evolution moves on by dt seconds.
 * @param {EvolveSlot} slot
 * @param {number} dt
 */
function evolveIn(slot, dt) {
  const ev = state[slot],
    s = stillEvolving(ev && SPECIES_BY_ID[ev.id]);
  if (!ev || !s || !seen(DOMAIN_OPENS[/** @type {keyof typeof DOMAIN_OPENS} */ (s.domain)]) || !homeFits(s)) {
    const next = nextToEvolve(slot);
    state[slot] = next ? { id: next.id, done: 0 } : null;
    return;
  }
  ev.done += (dt * evolveSpeed(s)) / ((s.days || 1) * EVOLVE_DAY_S);
  if (ev.done < 1) return;
  /** @type {Record<string, number>} */ (state.species)[s.id] = 0.05;
  state.extinct = state.extinct.filter(id => id !== s.id); // a species back from extinction
  state[slot] = null;
  buzz([20, 40, 20]);
}
/* oxlint-enable fp/no-mutation */

/** @param {number} dt */
function evolveTick(dt) {
  evolveIn('evolving', dt);
  evolveIn('sideEvolving', dt);
}
