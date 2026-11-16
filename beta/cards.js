'use strict';

// The old scripts' side of what cards do. The behaviour is in src/core/cards/behaviour.js (what a card changes as
// time passes, what happens the moment it is developed, the numbers of it that depend on the world now) and
// reaches here as CORE.cards; this file shows it the world as it is (cardView) and turns each behaviour into
// the functions game.js calls on a card: tick(dt), climax() and the value functions. Loads before game.js,
// which builds the cards with it; everything here runs later, once the game has started.

/** The world as a card's behaviour reads it. @returns {import('./src/core/cards/behaviour.js').CardView} */
const cardView = () => ({
  pressure: state.pressure,
  ch4: state.ch4,
  ch4Ice: state.ch4Ice,
  co2: state.co2,
  co2Ice: state.co2Ice,
  he: state.he,
  ar: state.ar,
  rn: state.rn,
  mountains: state.mountains,
  volcanoes: volcanoes(),
  clouds: state.clouds,
  cloudFormation: cloudFormation(),
  glacierIce: glacierIce(),
  riverFlow: riverFlow(),
  wetlandMethane: wetlandMethane(),
  species: state.species,
  daySeconds: DAY_S,
});

/**
 * A card's behaviour as the functions the game calls on the card. What it changes goes through WORLD
 * (disasters.js): the one place the saved state is written.
 * @param {import('./src/core/cards/behaviour.js').CardBehaviour} does
 */
const cardCode = does => {
  const { tick, climax, values = {} } = does;
  return {
    ...(tick && { tick: /** @param {number} dt */ dt => WORLD.write(tick(cardView(), dt)) }),
    ...(climax && { climax: () => runEffects(climax(cardView())) }),
    ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, () => value(cardView())])),
  };
};
// By card id; a card that is not listed does nothing beyond the numbers in data/research.yaml.
/** @type {Record<string, Record<string, any>>} */
const CARD_CODE = Object.fromEntries(Object.entries(CORE.cards.BEHAVIOUR).map(([id, does]) => [id, cardCode(does)]));
