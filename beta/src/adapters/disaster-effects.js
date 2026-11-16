// Carries out what a disaster does. The rules (src/core/disasters/rules.js) answer with effects as plain data;
// here they meet the world: the saved state, the map and the screen, handed in as a `world` of small functions,
// so this module knows the old scripts only by what it is given.

/** @typedef {import('../core/disasters/rules.js').Effect} Effect */
/** @typedef {{ u: number, v: number }} Spot */
/**
 * @typedef {object} DisasterWorld
 * @property {() => Readonly<{ species: Readonly<Record<string, number>> }>} read the saved state as it is
 * @property {(patch: Readonly<Record<string, unknown>>) => void} write fields of the saved state, replaced whole
 * @property {(who: 'land' | 'landAndReef') => readonly string[]} living the evolved species of a kind, by id
 * @property {(kind: 'flood' | 'surge') => Spot | null | undefined} findSpot a place in view for water to start from
 * @property {(what: 'flood', spot: Spot, size: number) => void} spread
 * @property {{ shake: (v: any) => void, aurora: (v: any) => void, supernova: (v: any) => void, blizzard: (v: any) => void, hurricane: (spot: Spot) => void, tide: (way: number) => void }} show
 * @property {(strikes: number) => void} burst
 * @property {() => void} gems
 * @property {() => void} erupt it announces itself
 * @property {() => void} asteroid it announces itself
 * @property {(id: string) => void} announce counts the disaster and tells the player
 */

/** The effects whose own code tells the player. */
const SELF_ANNOUNCED = new Set(['erupt', 'asteroid']);

/** @param {Effect} effect @returns {'flood' | 'surge' | undefined} the kind of spot it starts from */
const spotKind = effect => (effect.kind === 'spread' ? effect.what : effect.kind === 'surge' ? 'surge' : undefined);
/** @param {Effect} effect */
const needsSpot = effect => effect.kind === 'spread' || (effect.kind === 'surge' && effect.required);

/**
 * @param {DisasterWorld} world
 * @param {Extract<Effect, { kind: 'surge' }>} surge
 * @param {Spot} spot
 */
const startSurge = (world, surge, spot) => {
  if (surge.hurricane) world.show.hurricane(spot);
  if (surge.tide) world.show.tide(surge.tide);
  const { delay, size, reefs, sweep, tsunami } = surge;
  world.write({
    surge: { u: spot.u, v: spot.v, in: delay, size, reefs, ...(sweep && { sweep }), ...(tsunami && { tsunami }) },
  });
};

/**
 * @param {DisasterWorld} world
 * @param {Extract<Effect, { kind: 'kill' }>} kill
 */
const killShare = (world, kill) => {
  const hit = new Set(world.living(kill.who));
  const species = Object.entries(world.read().species);
  world.write({
    species: Object.fromEntries(species.map(([id, share]) => [id, hit.has(id) ? share * (1 - kill.share) : share])),
  });
};

/**
 * @param {DisasterWorld} world
 * @param {Effect} effect
 * @param {Spot | null | undefined} spot
 */
const carryOut = (world, effect, spot) => {
  switch (effect.kind) {
    case 'spell':
      return world.write({ [effect.name]: effect.seconds });
    case 'kill':
      return killShare(world, effect);
    case 'burst':
      return world.burst(effect.strikes);
    case 'spread':
      return spot ? world.spread(effect.what, spot, effect.size) : undefined;
    case 'surge':
      return spot ? startSurge(world, effect, spot) : undefined;
    case 'show':
      return world.show[effect.what](effect.value);
    default:
      return world[effect.kind]();
  }
};

/**
 * A function that makes a disaster happen in `world`: `strike(id, effects)` answers whether it did. It does not
 * when an effect needs a spot (a coast, a river) and none is in view.
 * @param {DisasterWorld} world
 * @returns {(id: string, effects: readonly Effect[]) => boolean}
 */
export const strikeIn = world => (id, effects) => {
  const spots = effects.map(effect => {
    const kind = spotKind(effect);
    return kind ? world.findSpot(kind) : undefined;
  });
  if (effects.some((effect, i) => needsSpot(effect) && !spots[i])) return false;
  // oxlint-disable-next-line unicorn/no-array-for-each -- effects are carried out for what they do
  effects.forEach((effect, i) => carryOut(world, effect, spots[i]));
  if (!effects.some(effect => SELF_ANNOUNCED.has(effect.kind))) world.announce(id);
  return true;
};
