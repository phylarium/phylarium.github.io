'use strict';

// Life on the tiles: the close-up of the planet (tiles.js) shows who lives on each of its squares, and a tap on a
// plant or an animal there finds it for the Flora or the Fauna page of the book. Which species has its home on
// which square is a rule of its own (src/core/life/habitat.js); this file gives it the living species, draws them
// on the squares, and takes the taps. Loads after tiles.js.

/** The living species that are big enough to see, as the habitat rule wants them. */
const tileDwellers = () =>
  SPECIES.filter(/** @param {any} s */ s => !s.microbe && pop(s.id) > 0).map(
    /** @param {any} s */ s => ({
      id: /** @type {string} */ (s.id),
      mask: /** @type {string[]} */ (s.home || ['sea']).reduce((m, zone) => m | Terrain.homes.bit[zone], 0),
      share: pop(s.id),
    }),
  );
/** The species living on a tile, if any. @param {{ i: number }} tile @param {ReturnType<typeof tileDwellers>} living */
const tileDweller = (tile, living) =>
  SPECIES_BY_ID[CORE.life.dweller(tile.i, Terrain.homes.zones[tile.i] ?? 0, living, state.seed) ?? ''];

const tileLayer = /** @type {HTMLElement} */ (document.getElementById('tiles'));
const tileCanvas = /** @type {HTMLCanvasElement} */ (tileLayer.querySelector('canvas'));

// After the tiles are drawn, everyone at home is set on the top of their square, back to front.
tileLayer.addEventListener('drawn', () => {
  const living = tileDwellers(),
    g = context2d(tileCanvas);
  // oxlint-disable-next-line unicorn/no-array-for-each -- drawing is the one thing done per square
  (Tiles.model()?.tiles ?? []).forEach(tile => {
    const s = tileDweller(tile, living);
    if (!s) return;
    const img = Sprites.canvas(s.icon),
      [x, y] = Tiles.top(tile);
    g.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height + 2));
  });
});

// A tap on a square with someone on it finds that species: a new one goes to its page with a splash, a known one
// says its name. Only a tap that began on the open view counts, not the one that opened it (see tiles.js).
tileLayer.addEventListener('pointerdown', () => tileLayer.setAttribute('data-tap', '1'));
tileLayer.addEventListener('click', e => {
  const began = tileLayer.hasAttribute('data-tap'),
    tile = began && Tiles.tileAt(e.clientX, e.clientY),
    s = tile ? tileDweller(tile, tileDwellers()) : undefined;
  tileLayer.removeAttribute('data-tap');
  if (!s) return;
  if (!collect(s.flora ? 'flora' : 'fauna', e.clientX, e.clientY, s.id))
    floatText(e.clientX, e.clientY - 10, s.name, 'critter good');
  buzz(6);
});
