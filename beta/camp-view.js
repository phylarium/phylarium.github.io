'use strict';

// The camp in the close-up (camp.js has the game's side): once Huts is developed, a bar under the square holds what
// people can build, each opened by its card, and the wood they have. Pick one, tap a square, and it stands there;
// the first hut makes that square the camp. Huts, fields, fires and fences are drawn on their squares, and the wild
// that raids them walks over the tiles. Loads after tile-zoom.js.

const CAMP_ICONS = /** @type {const} */ ({ hut: 'hut', field: 'farming', fire: 'campfire', fence: 'fence' });
/** @type {readonly CampBuild[]} */
const CAMP_KINDS = ['hut', 'field', 'fire', 'fence'];

const campView = (() => {
  const layer = /** @type {HTMLElement} */ (document.getElementById('tiles')),
    canvas = /** @type {HTMLCanvasElement} */ (layer.querySelector('canvas')),
    bar = document.createElement('div');
  // oxlint-disable-next-line fp/no-mutation -- the DOM: the bar's class, once
  bar.className = 'camp-bar hidden';
  layer.appendChild(bar);
  /** The thing picked to build, if any. @type {{ what: CampBuild | null }} */
  const pick = { what: null };

  /** Whether the open close-up may build: Huts known, and it shows the camp or there is none yet. */
  const canBuildHere = () => {
    const model = Tiles.model(),
      camp = theCamp();
    return !!model && has('huts') && (!camp || (camp.u === model.u && camp.v === model.v));
  };

  /** The bar as it is now: a button per thing whose card is known, and the wood. */
  const fill = () => {
    const show = canBuildHere();
    bar.classList.toggle('hidden', !show);
    if (!show) return;
    const kinds = CAMP_KINDS.filter(what => has(CAMP.BUILDS[what].card)),
      wood = Math.floor(theCamp()?.wood ?? 4);
    const html =
      kinds
        .map(
          what =>
            `<button class="camp-pick${pick.what === what ? ' on' : ''}" data-what="${what}">` +
            `<img class="sprite" src="${Sprites.icon(CAMP_ICONS[what])}" alt=""></button>`,
        )
        .join('') + `<span class="camp-wood"><img class="sprite" src="${Sprites.icon('wood')}" alt="">${wood}</span>`;
    // oxlint-disable-next-line fp/no-mutation -- the DOM, redrawn only when it changes
    if (bar.innerHTML !== html) bar.innerHTML = html;
  };

  bar.addEventListener('click', e => {
    e.stopPropagation(); // a tap on the bar is no tap beside the square: the view stays open (tiles.js)
    const button = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-what]')),
      what = /** @type {CampBuild | undefined} */ (button?.dataset['what']);
    if (!what) return;
    // oxlint-disable-next-line fp/no-mutation -- the one choice the bar holds
    pick.what = pick.what === what ? null : what;
    fill();
    buzz(6);
  });

  // A tap on a square, with something picked, builds it there.
  layer.addEventListener('click', e => {
    const model = Tiles.model(),
      tile = pick.what && canBuildHere() ? Tiles.tileAt(e.clientX, e.clientY) : null;
    if (!model || !tile || !pick.what) return;
    if (campBuild(model.u, model.v, tile.a + tile.b * CAMP.CAMP_N, pick.what)) buzz([10, 20, 10]);
    fill();
  });

  /** The tile of the open close-up at square k. @param {number} k */
  const tileOf = k => Tiles.model()?.tiles.find(t => t.a + t.b * CAMP.CAMP_N === k);
  /** Draws a sprite standing on square k. @param {CanvasRenderingContext2D} g @param {string} icon @param {number} k */
  const stand = (g, icon, k) => {
    const tile = tileOf(k);
    if (!tile) return;
    const img = Sprites.canvas(icon),
      [x = 0, y = 0] = Tiles.top(tile);
    g.drawImage(img, Math.round(x - img.width / 2), y + 2 - img.height);
  };

  // After the tiles are drawn: what is built, then the raiders, back to front.
  layer.addEventListener('drawn', () => {
    fill();
    const camp = theCamp(),
      model = Tiles.model();
    if (!camp || !model || camp.u !== model.u || camp.v !== model.v) return;
    const g = context2d(canvas),
      built = Object.entries(camp.built).flatMap(([k, what]) =>
        what === 'field'
          ? []
          : [{ k: Number(k), icon: what === 'fire' && !camp.lit.includes(Number(k)) ? 'ash' : CAMP_ICONS[what] }],
      ),
      raiders = camp.raiders.map(r => ({ k: r.k, icon: SPECIES_BY_ID[r.id]?.['icon'] ?? 'spWolf' })),
      depth = (/** @type {number} */ k) => (k % CAMP.CAMP_N) + Math.floor(k / CAMP.CAMP_N);
    [...built, ...raiders].toSorted((p, q) => depth(p.k) - depth(q.k)).map(s => stand(g, s.icon, s.k));
  });

  // What happens in the camp, felt in the hand.
  // oxlint-disable-next-line fp/no-mutating-methods -- the view signs up once, at load
  campListeners.push(events => {
    if (!Tiles.isOpen()) return;
    if (events.some(e => e.type === 'lost')) buzz([40, 30, 40]);
    else if (events.some(e => e.type === 'raid')) buzz([20, 60, 20]);
  });

  return { building: () => !!pick.what && canBuildHere() };
})();

/** Whether a tap in the close-up builds in the camp (tile-life.js then finds no one). */
const campBuilding = () => campView.building();
