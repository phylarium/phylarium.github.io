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
const VILLAGE_ART = VILLAGE.villageArt;

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
    '<div class="village-pic"></div><div class="village-wild"></div><div class="village-builds"></div>';
  // oxlint-disable-next-line fp/no-mutation -- the DOM, built once at load
  mark.innerHTML = `<img class="sprite" src="${Sprites.icon('village')}" alt="">`;
  // oxlint-disable-next-line fp/no-mutation -- the DOM, built once at load
  found.innerHTML = `<button class="camp-pick" data-found="1"><img class="sprite" src="${Sprites.icon('hut')}" alt=""></button>`;
  document.body.append(box, mark);
  /** @type {HTMLElement} */ (document.getElementById('tiles')).appendChild(found);
  const pic = /** @type {HTMLElement} */ (box.querySelector('.village-pic')),
    q = (/** @type {string} */ s) => /** @type {HTMLElement} */ (box.querySelector(s)),
    sized = (/** @type {number} */ h) => {
      const c = document.createElement('canvas');
      // oxlint-disable-next-line fp/no-mutating-methods -- a new canvas's size, once
      Object.assign(c, { width: VILLAGE_ART.PIC.w, height: h });
      return c;
    };
  /** The picture's layers, back to front (src/adapters/scene-art), and the band of clouds that drifts across. */
  const layers =
      /** @type {Record<import('./src/adapters/scene-art/village-scene.js').VillageLayer, HTMLCanvasElement>} */ (
        Object.fromEntries(VILLAGE_ART.LAYERS.map(id => [id, sized(VILLAGE_ART.PIC.h)]))
      ),
    clouds = sized(VILLAGE_ART.CLOUD_BAND);
  pic.append(...Object.values(layers));

  const isOpen = () => !box.classList.contains('hidden');
  /** Sets a part's HTML only when it changes, so a button is not swapped under a finger. @param {string} sel @param {string} html */
  const put = (sel, html) => {
    // oxlint-disable-next-line fp/no-mutation -- the DOM, redrawn only when it changes
    if (q(sel).innerHTML !== html) q(sel).innerHTML = html;
  };
  /** What the picture was last drawn from, and how it looks (the hour is the planet's when the screen opens). */
  const drawn = {
    key: '',
    look: /** @type {import('./src/adapters/scene-art/village-scene.js').VillageLook | null} */ (null),
  };
  const img = (/** @type {string} */ id) => `<img class="sprite" src="${Sprites.icon(id)}" alt="">`;
  const iconOf = (/** @type {string} */ id) => String(SPECIES_BY_ID[id]?.['icon'] ?? 'spSpider');

  /** Puts a still layer in the colors found so far, like the planet. @param {HTMLCanvasElement} c */
  const hue = c => {
    const g = context2d(c),
      data = g.getImageData(0, 0, c.width, c.height);
    Hues.apply(data.data);
    g.putImageData(data, 0, 0);
  };
  /** The picture: the still layers when the screen opens or the colors change, what is built when it changes. */
  const paint = (/** @type {Village} */ village, /** @type {boolean} */ afresh) => {
    const look =
      afresh || !drawn.look
        ? VILLAGE_ART.drawBack(layers, clouds, {
            hour: state.spinLocked ? state.clock % 24 : 12,
            seed: village.u * 31 + village.v,
            land: village.land,
          })
        : drawn.look;
    if (afresh || !drawn.look) [layers.sky, layers.far, layers.edge, layers.ground, clouds].map(hue);
    VILLAGE_ART.drawBuilt(layers.built, look, village.levels);
    hue(layers.built);
    return look;
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
    const key = `${JSON.stringify(village.levels)}|${Hues.key()}`,
      afresh = !drawn.key.endsWith(`|${Hues.key()}`);
    if (drawn.key === key) return;
    // oxlint-disable-next-line fp/no-mutating-methods -- the one memo of the picture
    Object.assign(drawn, { key, look: paint(village, afresh) });
  };

  const open = () => {
    if (!theVillage()) return;
    box.classList.toggle('hidden', false);
    // oxlint-disable-next-line fp/no-mutating-methods -- the memo: the screen opens at the planet's hour, drawn afresh
    Object.assign(drawn, { key: '', look: null });
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
  /** The screen, once a frame while it is open: its parts, and the picture's moving layers. @param {number} now */
  const live = now => {
    const village = theVillage();
    if (!isOpen() || RaidView.isOpen() || !village) return;
    fill();
    if (drawn.look) VILLAGE_ART.drawLive(layers, clouds, drawn.look, { now, levels: village.levels });
  };
  const follow = (/** @type {number} */ now) => {
    const village = theVillage(),
      at = village && !isOpen() && !Tiles.isOpen() && !inCinema() ? Scene.spotPoint(village) : null;
    mark.classList.toggle('hidden', !at);
    mark.classList.toggle('due', !!village && VILLAGE.raidDue(village));
    // oxlint-disable-next-line fp/no-mutation -- the DOM: the mark follows the planet, once a frame
    if (at) mark.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
    live(now);
    requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);

  return { open, close, isOpen };
})();

/** A tap on the planet's ground opens the village if it is there, else a close-up of the spot. @param {number} u @param {number} v */
const openSpot = (u, v) => (villageAt(u, v) ? VillageView.open() : Tiles.open(u, v));
