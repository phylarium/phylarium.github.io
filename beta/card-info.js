'use strict';

// What a tapped card in a set says (the card sets are drawn in play.js): its name and its words, and for a plant
// or an animal (the Flora and Fauna sets) how it is doing now and what it needs: where and at what temperature
// it lives, and what it evolved from.

/**
 * The facts about a species, as rows of a list.
 * @param {any} s the species
 * @returns {[string, string][]}
 */
const speciesFacts = s => {
  const living = pop(s.id) > 0;
  const status = isExtinct(s.id) ? 'Extinct' : living ? lifeState(s) : 'Not living now';
  return [
    ['Status', status],
    ...(living ? [/** @type {[string, string]} */ (['Population', pct(pop(s.id))])] : []),
    ['Lives at', `${s.temp[0]} to ${s.temp[1]}°C`],
    ['Home', /** @type {string[]} */ (s.home || ['sea']).join(', ')],
    ...(s.parent ? [/** @type {[string, string]} */ (['Evolved from', SPECIES_BY_ID[s.parent]?.name ?? ''])] : []),
    ...(s.o2 ? [/** @type {[string, string]} */ (['Makes', 'oxygen'])] : []),
  ];
};

/**
 * @param {{ id: string }} c the set
 * @param {{ id: string, name: string, how: string }} it the card
 */
const cardInfo = (c, it) => {
  const head = `<b>${it.name}</b><br>${it.how}`,
    s = c.id === 'flora' || c.id === 'fauna' ? SPECIES_BY_ID[it.id] : undefined;
  if (!s) return head;
  return `${head}<dl class="stats">${speciesFacts(s)
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
    .join('')}</dl>`;
};
