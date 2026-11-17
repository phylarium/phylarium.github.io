// CORE: the rules of the world that have moved out of the old scripts, as the old scripts call them (see
// legacy.js, which puts it on their scope).
import { runIn } from '../adapters/disaster-effects.js';
import { CARD_BEHAVIOUR, cometsPerNight } from '../core/cards/behaviour.js';
import { dweller } from '../core/life/habitat.js';
import { STEPS } from '../core/saves/steps.js';
import { buildDisasters } from './core-disasters.js';

/**
 * The rules the old scripts call, with what they need from the content already filled in.
 * @param {import('../content/content.js').Content} content
 */
export const buildCore = content =>
  Object.freeze({
    cards: Object.freeze({ BEHAVIOUR: CARD_BEHAVIOUR, cometsPerNight }),
    saves: Object.freeze({ STEPS }),
    effects: Object.freeze({ runIn }),
    life: Object.freeze({ dweller }),
    disasters: buildDisasters(content),
  });
/** @typedef {ReturnType<typeof buildCore>} Core */
