'use strict';

// The village's own screen (village.js has the game's side): a picture of the village on its ground, with what is
// built standing in it, and below it a button per building to build or raise it, with its cost. When the wild
// comes, a button opens the raid (raid-view.js). The village shows on the planet as a mark to tap; before there is
// one, the close-up of a dry spot holds a hut to found it there. Loads after tile-zoom.js.

const VILLAGE_ICONS = /** @type {const} */ ({
  huts: 'hut',
  fields: 'farming',
  woodcutter: 'flintAxe',
  firepit: 'campfire',
  spearmaker: 'spear',
  palisade: 'fence',
});
const VILLAGE_NAMES = /** @type {const} */ ({
  huts: 'Huts',
  fields: 'Fields',
  woodcutter: 'Woodcutter',
  firepit: 'Fire Pit',
  spearmaker: 'Spear Maker',
  palisade: 'Palisade',
});
/** Where each building stands in the picture (in its pixels), and how many copies a level shows. */
const VILLAGE_SPOTS = /** @type {const} */ ({
  huts: { x: 70, y: 62, dx: 18, dy: -4 },
  fields: { x: 14, y: 70, dx: 16, dy: 6 },
  woodcutter: { x: 132, y: 54, dx: 12, dy: 4 },
  firepit: { x: 82, y: 82, dx: 0, dy: 0 },
  spearmaker: { x: 116, y: 78, dx: 0, dy: 0 },
  palisade: { x: 4, y: 94, dx: 14, dy: 0 },
});
const VILLAGE_PIC = { w: 160, h: 100 };

const VillageView = (() => {
  const box = document.createElement('div'),
    mark = document.createElement('button'),
    found = document.createElement('div');
  // oxlint-disable-next-line fp/no-mutating-methods -- the DOM, built once at load
  Object.assign(box, { className: 'village hidden', role: 'dialog' });
  // oxlint-disable-next-line fp/no-mutating-methods -- the DOM, built once at load
  Object.assign(mark, { className: 'village-mark hidden', type: 'button', ariaLabel: 'The village' });
  // oxlint-disable-next-line fp/no-mutating-methods -- the DOM, built once at load
  Object.assign(found, { className: 'camp-bar hidden' });
  // oxlint-disable-next-line fp/no-mutation -- the DOM, built once at load
  box.innerHTML =
    '<div class="village-head"><span class="village-stock"></span>' +
    '<button class="book-close village-close" aria-label="Close the village">✕</button></div>' +
    '<canvas class="village-pic"></canvas><div class="village-wild"></div><div class="village-builds"></div>';
  // oxlint-disable-next-line fp/no-mutation -- the DOM, built once at load
  mark.innerHTML = `<img class="sprite" src="${Sprites.icon('village')}" alt="">`;
  // oxlint-disable-next-line fp/no-mutation -- the DOM, built once at load
  found.innerHTML = `<button class="camp-pick" data-found="1"><img class="sprite" src="${Sprites.icon('hut')}" alt=""></button>`;
  document.body.append(box, mark);
  /** @type {HTMLElement} */ (document.getElementById('tiles')).appendChild(found);
  const pic = /** @type {HTMLCanvasElement} */ (box.querySelector('.village-pic')),
    q = (/** @type {string} */ s) => /** @type {HTMLElement} */ (box.querySelector(s));
  // oxlint-disable-next-line fp/no-mutating-methods -- the canvas's size, once
  Object.assign(pic, { width: VILLAGE_PIC.w, height: VILLAGE_PIC.h });

  const isOpen = () => !box.classList.contains('hidden');
  /** Sets a part's HTML only when it changes, so a button is not swapped under a finger. @param {string} sel @param {string} html */
  const put = (sel, html) => {
    // oxlint-disable-next-line fp/no-mutation -- the DOM, redrawn only when it changes
    if (q(sel).innerHTML !== html) q(sel).innerHTML = html;
  };
  /** What the picture was last drawn from. */
  const drawn = { key: '' };
  const img = (/** @type {string} */ id) => `<img class="sprite" src="${Sprites.icon(id)}" alt="">`;
  const iconOf = (/** @type {string} */ id) => String(SPECIES_BY_ID[id]?.['icon'] ?? 'spSpider');

  /** The picture: sky, the ground (greener with forest, a strip of water by the shore), trees, and what is built. */
  const paint = (/** @type {Village} */ village) => {
    const g = context2d(pic),
      { forest, water } = village.land,
      ground = forest > 0.4 ? '#3f6b2a' : '#6f9a3c';
    // oxlint-disable-next-line fp/no-mutation -- the canvas, drawn when the screen opens or changes
    g.fillStyle = '#86b6e0';
    g.fillRect(0, 0, VILLAGE_PIC.w, 40);
    // oxlint-disable-next-line fp/no-mutation -- the canvas
    g.fillStyle = ground;
    g.fillRect(0, 40, VILLAGE_PIC.w, VILLAGE_PIC.h - 40);
    // oxlint-disable-next-line fp/no-mutation -- the canvas
    g.fillStyle = '#3d76b0';
    if (water > 0.15) g.fillRect(0, 40, VILLAGE_PIC.w, 6 + Math.round(10 * water));
    const tree = Sprites.canvas('tree');
    Array.from({ length: 2 + Math.round(14 * forest) }, (_, n) =>
      g.drawImage(tree, 150 - ((n * 23) % 160), 30 + ((n * 7) % 12) - tree.height / 2),
    );
    VILLAGE.BUILDING_ORDER.flatMap(b =>
      Array.from(
        { length: b === 'palisade' ? 11 * VILLAGE.levelOf(village, b) : VILLAGE.levelOf(village, b) },
        (_, n) => ({
          b,
          n,
        }),
      ),
    ).map(({ b, n }) => {
      const s = VILLAGE_SPOTS[b],
        sprite = Sprites.canvas(VILLAGE_ICONS[b]),
        row = b === 'palisade' ? Math.floor(n / 11) : 0;
      return g.drawImage(sprite, s.x + s.dx * (n % 11), s.y + s.dy * n - 4 * row - sprite.height);
    });
    const data = g.getImageData(0, 0, VILLAGE_PIC.w, VILLAGE_PIC.h);
    Hues.apply(data.data); // in the colors found so far, like the planet
    g.putImageData(data, 0, 0);
  };

  /** The cost of a building's next level, as icons and numbers. @param {VillageBuilding} b @param {Village} village */
  const costHtml = (b, village) => {
    const cost = VILLAGE.nextCost(village, b);
    if (!cost) return '<span class="village-cost">★</span>';
    const part = (/** @type {number} */ n, /** @type {string} */ icon) => (n ? `${img(icon)}${n}` : '');
    return `<span class="village-cost">${part(cost.wood, 'wood') + part(cost.food, 'gathering')}</span>`;
  };

  /** The screen as the village is now. */
  const fill = () => {
    const village = theVillage();
    if (!village) return;
    put('.village-stock', `${img('wood')}${Math.floor(village.wood)} ${img('gathering')}${Math.floor(village.food)}`);
    const held = VILLAGE.LADDER.slice(0, village.rung).filter(id => villageAlive().has(id)),
      coming = VILLAGE.raiders(village.rung, villageAlive()).at(-1),
      last = village.last;
    put(
      '.village-wild',
      `<span class="village-held">${held.map(id => img(iconOf(id))).join('')}</span>` +
        (last ? `<span class="village-last ${last.held ? 'held' : 'fell'}">${img(iconOf(last.id))}</span>` : '') +
        (VILLAGE.raidDue(village) && coming
          ? `<button class="village-defend" data-raid="1">${img(iconOf(coming))} Defend</button>`
          : ''),
    );
    put(
      '.village-builds',
      VILLAGE.BUILDING_ORDER.filter(b => has(VILLAGE.BUILDINGS[b].card))
        .map(b => {
          const level = VILLAGE.levelOf(village, b),
            top = VILLAGE.BUILDINGS[b].costs.length;
          return (
            `<button class="village-build" data-build="${b}"${VILLAGE.canBuild(village, b, owned) ? '' : ' disabled'}>` +
            `${img(VILLAGE_ICONS[b])}<span class="village-name">${VILLAGE_NAMES[b]}</span>` +
            `<span class="village-pips">${'●'.repeat(level)}${'○'.repeat(top - level)}</span>${costHtml(b, village)}</button>`
          );
        })
        .join(''),
    );
    const key = `${JSON.stringify(village.levels)}|${Hues.key()}`;
    if (drawn.key !== key) paint(village);
    // oxlint-disable-next-line fp/no-mutation -- the one memo of the picture
    drawn.key = key;
  };

  const open = () => {
    if (!theVillage()) return;
    box.classList.toggle('hidden', false);
    // oxlint-disable-next-line fp/no-mutation -- the memo: a new village, or new colors, are drawn afresh
    drawn.key = '';
    fill();
  };
  const close = () => box.classList.toggle('hidden', true);

  box.addEventListener('click', e => {
    const t = /** @type {HTMLElement} */ (e.target),
      b = /** @type {VillageBuilding | undefined} */ (
        t.closest('[data-build]')?.getAttribute('data-build') ?? undefined
      );
    if (t.closest('.village-close')) return close();
    if (t.closest('[data-raid]')) return RaidView.open(fill);
    if (b && villageBuild(b)) {
      buzz([10, 20, 10]);
      fill();
    }
    return undefined;
  });
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen() && !RaidView.isOpen()) close();
  });

  // Founding: the close-up of a dry spot, with Huts known and no village yet, holds a hut to settle there.
  /** @type {HTMLElement} */ (document.getElementById('tiles')).addEventListener('drawn', () => {
    const model = Tiles.model();
    found.classList.toggle('hidden', !model || !canFoundVillage(model.u, model.v));
  });
  found.addEventListener('click', e => {
    e.stopPropagation(); // a tap on the bar is no tap beside the square (tiles.js)
    const model = Tiles.model();
    if (!model || !foundVillage(model.u, model.v)) return;
    buzz([10, 20, 10]);
    found.classList.toggle('hidden', true);
    Tiles.close();
    open();
  });

  // The mark on the planet: over the village while its side faces the viewer; it pulses when a raid is due.
  mark.addEventListener('click', open);
  const follow = () => {
    const village = theVillage(),
      at = village && !isOpen() && !Tiles.isOpen() && !inCinema() ? Scene.spotPoint(village) : null;
    mark.classList.toggle('hidden', !at);
    mark.classList.toggle('due', !!village && VILLAGE.raidDue(village));
    // oxlint-disable-next-line fp/no-mutation -- the DOM: the mark follows the planet, once a frame
    if (at) mark.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
    if (isOpen() && !RaidView.isOpen()) fill();
    requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);

  return { open, close, isOpen };
})();

/** A tap on the planet's ground opens the village if it is there, else a close-up of the spot. @param {number} u @param {number} v */
const openSpot = (u, v) => (villageAt(u, v) ? VillageView.open() : Tiles.open(u, v));
