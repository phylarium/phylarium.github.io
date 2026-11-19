'use strict';

// Life on the tiles: the close-up of the planet (tiles.js) shows who lives on each of its squares, and a tap on a
// plant or an animal there finds it for the Flora or the Fauna page of the book. Flowers in a superbloom and
// lights in the sea on a glowing night show on the tiles too. Which species has its home on
// which square is a rule of its own (src/core/life/habitat.js); this file gives it the living species, draws them
// on the squares, and takes the taps. Loads after tiles.js.

/** The living species that are big enough to see, as the habitat rule wants them. */
const tileDwellers = () =>
  SPECIES.filter(/** @param {any} s */ s => !s.microbe && pop(s.id) > 0).map(
    /** @param {any} s */ s => ({
      id: /** @type {string} */ (s.id),
      mask: /** @type {string[]} */ (s.home || ['sea']).reduce(
        (m, zone) => m | Terrain.homes.bit[/** @type {keyof typeof Terrain.homes.bit} */ (zone)],
        0,
      ),
      share: pop(s.id),
    }),
  );
/** @typedef {{ id: string, name: string, icon: string, flora?: boolean, swims?: boolean }} TileSpecies */
/**
 * The species living on a tile, if any.
 * @param {{ i: number }} tile
 * @param {ReturnType<typeof tileDwellers>} living
 * @returns {TileSpecies | undefined}
 */
const tileDweller = (tile, living) =>
  /** @type {TileSpecies | undefined} */ (
    SPECIES_BY_ID[CORE.life.dweller(tile.i, Terrain.homes.zones[tile.i] ?? 0, living, state.seed) ?? '']
  );

// Finds that come and go: in a superbloom flowers open on the land, and on a glowing night lights rise in the sea.
// One square in FIND_EVERY holds one, the same squares while it lasts, each showing a find of its collection.
const FIND_EVERY = 6;
const { COVER } = Terrain;
const FLOWER_GROUND = new Set([
    COVER.BARE,
    COVER.TUNDRA,
    COVER.WETLAND,
    COVER.FOREST,
    COVER.GRASS,
    COVER.SAVANNA,
    COVER.SAND,
  ]),
  OPEN_SEA = new Set([COVER.DEEP, COVER.SHALLOW, COVER.REEF]);
const TILE_FINDS = [
  { set: 'flowers', on: () => state.bloom > 0, ground: FLOWER_GROUND, water: false },
  { set: 'lights', on: () => glowTonight(), ground: OPEN_SEA, water: true },
];
/** @param {number} i */
const tileHash = i => (Math.imul(i + 1, 2654435761) ^ Math.imul(state.seed | 0, 40503)) >>> 0;

/** @typedef {{ tile: any, icon: string, tap: (x: number, y: number) => void, wet?: boolean, swims?: boolean }} TileThing */
/**
 * What stands on a tile: a find while its season lasts, or else who lives there.
 * @param {any} tile
 * @param {ReturnType<typeof tileDwellers>} living
 * @param {typeof TILE_FINDS} finds the ones on now
 * @returns {TileThing[]}
 */
const thingsOn = (tile, living, finds) => {
  const h = tileHash(tile.i),
    find = h % FIND_EVERY === 0 && finds.find(f => f.ground.has(tile.cover) && tile.water === f.water);
  if (find) {
    const items = COLLECTION_BY_ID[find.set].items,
      item = items[(h >>> 8) % items.length];
    return [
      {
        tile,
        icon: item.icon,
        tap: (x, y) => void (collect(find.set, x, y, item.id) || collect(find.set, x, y) || evolveReward(x, y)),
      },
    ];
  }
  const s = tileDweller(tile, living);
  if (!s) return [];
  return [
    {
      tile,
      icon: s.icon,
      wet: tile.water, // in the water, not on it
      swims: !!s.swims, // round the middle of the water, not on its floor
      tap: (x, y) => {
        if (!collect(s.flora ? 'flora' : 'fauna', x, y, s.id)) floatText(x, y - 10, s.name, 'critter good');
      },
    },
  ];
};
/** Everything standing on the open view, back to front. */
const tileThings = () => {
  const living = tileDwellers(),
    finds = TILE_FINDS.filter(f => f.on());
  return (Tiles.model()?.tiles ?? []).flatMap(tile => thingsOn(tile, living, finds));
};

const tileLayer = /** @type {HTMLElement} */ (document.getElementById('tiles'));
const tileCanvas = /** @type {HTMLCanvasElement} */ (tileLayer.querySelector('canvas'));
/** Where a thing's sprite is drawn on the tile canvas: standing on its square, or in the water there. @param {TileThing} t */
const thingBox = t => {
  const img = Sprites.canvas(t.icon),
    [x, y] = /** @type {[number, number]} */ (Tiles.top(t.tile));
  return { img, left: Math.round(x - img.width / 2), top: Math.round(y - (t.wet ? img.height / 2 : img.height - 2)) };
};

/** How much of the water's color lies over what swims in it. */
const UNDER_WATER = 0.45;
/**
 * A picture seen through the water of its tile: each pixel mixed with the water's color, as the tiles show it.
 * @param {HTMLCanvasElement} img
 * @param {any} tile
 */
const underWater = (img, tile) => {
  const w = Tiles.colors(tile).top,
    water = Hues.shade(w & 255, (w >>> 8) & 255, (w >>> 16) & 255),
    src = context2d(img).getImageData(0, 0, img.width, img.height).data,
    mixed = Uint8ClampedArray.from(src, (v, i) =>
      i % 4 === 3 ? v : v * (1 - UNDER_WATER) + (water[i % 4] ?? v) * UNDER_WATER,
    ),
    out = new OffscreenCanvas(img.width, img.height);
  out.getContext('2d')?.putImageData(new ImageData(mixed, img.width, img.height), 0, 0);
  return out;
};

// After the tiles are drawn, everything on them is set on the top of its square, back to front.
tileLayer.addEventListener('drawn', () => {
  const g = context2d(tileCanvas);
  // oxlint-disable-next-line unicorn/no-array-for-each -- drawing is the one thing done per square
  tileThings().forEach(t => {
    const { img, left, top } = thingBox(t);
    g.drawImage(t.wet ? underWater(img, t.tile) : img, left, top);
  });
});

// What is drawn at a point of the tile canvas: the front-most sprite there, with a margin for a finger. Sprites stand
// up from their square into the ones behind, so the picture, not the square under the finger, is what counts.
/** @param {number} px @param {number} py */
const thingAt = (px, py) => {
  const pad = 3;
  return tileThings().findLast(t => {
    const { img, left, top } = thingBox(t);
    return px >= left - pad && px < left + img.width + pad && py >= top - pad && py < top + img.height + pad;
  });
};

// A tap on a plant or an animal finds that species: a new one goes to its page with a splash, a known one says
// its name. A tap on a flower or a light finds one for its collection. Only a tap that began on the open view
// counts, not the one that opened it (see tiles.js).
tileLayer.addEventListener('pointerdown', () => tileLayer.setAttribute('data-tap', '1'));
tileLayer.addEventListener('click', e => {
  const began = tileLayer.hasAttribute('data-tap'),
    r = tileCanvas.getBoundingClientRect(),
    k = r.width / tileCanvas.width,
    t = began ? thingAt((e.clientX - r.left) / k, (e.clientY - r.top) / k) : undefined;
  tileLayer.removeAttribute('data-tap');
  // A tap on a square with no one under the finger lifts the square out as a block of its own (cube.js).
  if (!t && began) tileLayer.dispatchEvent(new CustomEvent('square', { detail: { x: e.clientX, y: e.clientY } }));
  if (!t) return;
  t.tap(e.clientX, e.clientY);
  buzz(6);
});
