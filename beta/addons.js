'use strict';

// Add-ons: a collection that belongs to a card shows inside that card's frame in the book, as a second row under
// the card's icon and name, once the card is developed and the first item is found. Until then, and for a
// collection without a card, the collection is a part of the page with a heading of its own. Which card a
// collection belongs to is `card` in data/collections.yaml; the star signs and the planets, which are not in that
// file, are named here. A collection draws itself as ever; this file only moves its box, and that may be to
// another page or screen than the one the collection was on: it goes where its card is.
// Loads after book.js; renderCategory (book.js) calls parkAddons before it draws a page and placeAddons after.

/** @typedef {{ id: string, card: string, section: string, count: () => number, draw: () => void }} Addon */
/** @type {Addon[]} */
const ADDONS = [
  ...COLLECTIONS.filter(/** @param {any} c */ c => c.card && c.section).map(
    /** @param {any} c */ c => ({
      id: c.id,
      card: c.card,
      section: c.section,
      count: () => found(c.id).length,
      draw: () => renderCollection(c),
    }),
  ),
  { id: 'signs', card: 'starsigns', section: 'signs', count: () => state.signs.length, draw: () => renderSigns() },
  {
    id: 'planets',
    card: 'wanderers',
    section: 'planets',
    count: () => state.planets.length,
    draw: () => renderPlanets(),
  },
];
/** A collection's own part of the page: the box with its heading. @param {Addon} c */
const addonHome = c => document.querySelector(`.section[data-section="${c.section}"]`);
/** The box the collection draws itself in. @param {Addon} c */
const addonBox = c => document.getElementById(c.section);
/** The developed card's row in the book, when its page has been drawn. @param {Addon} c */
const addonCard = c => {
  const list = /** @type {any} */ (document.getElementById(RESEARCH_BY_ID[c.card]?.['tab']));
  return (list?._entries ?? []).find(/** @param {any} e */ e => e.kind === 'researched' && e.item.id === c.card)?.li;
};

// Every add-on back in its own part of the page: a list of cards that draws itself anew must not take one along.
function parkAddons() {
  // oxlint-disable-next-line unicorn/no-array-for-each -- moving boxes on the page is an effect
  ADDONS.forEach(c => {
    const home = addonHome(c),
      box = addonBox(c);
    if (home && box && box.parentElement !== home) home.appendChild(box);
  });
}
// Every add-on whose card is developed, and that has something found, into the card's frame; its own part of
// the page, with the heading, is put away from then on.
function placeAddons() {
  // oxlint-disable-next-line unicorn/no-array-for-each -- moving boxes on the page is an effect
  ADDONS.forEach(c => {
    const on = has(c.card) && c.count() > 0,
      card = on ? addonCard(c) : undefined,
      box = addonBox(c);
    addonHome(c)?.classList.toggle('in-card', on);
    if (!card || !box) return;
    card.appendChild(box);
    card.classList.toggle('with-addon', true);
    c.draw(); // its own page may not be the one on screen
  });
}
