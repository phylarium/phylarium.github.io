'use strict';

// Life on the tiles: the close-up of the planet (tiles.js) shows who lives on each of its squares, and a tap on a
// plant or an animal there finds it for the Flora or the Fauna page of the book. Flowers in a superbloom and
// lights in the sea on a glowing night show on the tiles too. Which species has its home on
// which square is a rule of its own (src/core/life/habitat.js); this file gives it the living species, draws them
// on the squares, and takes the taps. Animals are rarer than plants and keep together as their kind does (a herd,
// a pride, a flock: `group` in species.yaml), wandering from day to day. Loads after tiles.js.

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
      temp: /** @type {number[]} */ (s.temp),
      flora: !!s.flora,
      deep: !!s.deep,
      group: /** @type {import('./src/core/life/habitat.js').Group} */ (s.group ?? 'solitary'),
      weight: PEOPLE_SPECIES.has(s.id) ? 6 : 1, // people are many and go everywhere: a band is seen often
    }),
  );
/** Whether a tile is inside a species' range: no one lives where it is too hot or too cold for it. */
const warmEnough = (/** @type {{ i: number }} */ tile) => (/** @type {{ temp: number[] }} */ one) => {
  const t = Terrain.homes.temps[tile.i] ?? 0;
  return t >= (one.temp[0] ?? -Infinity) && t <= (one.temp[1] ?? Infinity);
};
/** @typedef {{ id: string, name: string, desc?: string, icon: string, flora?: boolean, swims?: boolean, blows?: boolean }} TileSpecies */
/**
 * Whether a square of the map is home to a species: its climate and its warmth.
 * @param {ReturnType<typeof tileDwellers>} living
 */
const homeTo = living => {
  const byId = new Map(living.map(one => [one.id, one]));
  return (/** @type {string} */ id, /** @type {number} */ u, /** @type {number} */ v) => {
    const one = byId.get(id),
      i = v * Terrain.TEX_W + u;
    return (
      !!one &&
      v >= 0 &&
      v < Terrain.TEX_H &&
      (one.mask & (Terrain.homes.zones[i] ?? 0)) !== 0 &&
      (!one.deep || Terrain.cover[i] === COVER.DEEP) &&
      warmEnough({ i })(one)
    );
  };
};
/** The world the animals' groups live in today (CORE.life.animalAt). @param {ReturnType<typeof tileDwellers>} living */
const herdWorld = living => ({
  seed: state.seed,
  day: Math.floor(state.clock / 24),
  width: Terrain.TEX_W,
  living: living.filter(one => !one.flora),
  fits: homeTo(living),
});
/**
 * The species living on a tile, if any: an animal of a group that stands there today, or else a plant.
 * @param {{ i: number, u: number, v: number }} tile
 * @param {ReturnType<typeof tileDwellers>} living
 * @param {ReturnType<typeof herdWorld>} world
 * @returns {TileSpecies | undefined}
 */
const tileDweller = (tile, living, world) => {
  const animal = CORE.life.animalAt(tile.u, tile.v, world),
    plants = living.filter(one => one.flora && warmEnough(tile)(one)),
    plant = CORE.life.dweller(tile.i, Terrain.homes.zones[tile.i] ?? 0, plants, state.seed);
  return /** @type {TileSpecies | undefined} */ (SPECIES_BY_ID[animal ?? plant ?? '']);
};

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
// The finds that come on some days, not on others, once their card is developed (each set is its card's add-on):
// fossils once anything has died out too, feathers once birds have lived too.
const ROCKY = new Set([COVER.ROCK, COVER.MOUNTAIN]),
  // Whether today is one of its days (the same all day, a share of them).
  someDays = (/** @type {number} */ salt, /** @type {number} */ share) =>
    nightRandom(Math.floor(state.clock / 24), salt) < share,
  lived = (/** @type {string} */ id) => evolved(id) || isExtinct(id);
const TILE_FINDS = [
  { set: 'flowers', on: () => state.bloom > 0, ground: FLOWER_GROUND, water: false },
  { set: 'lights', on: () => glowTonight(), ground: OPEN_SEA, water: true },
  {
    set: 'fossils',
    on: () => has('fossils') && state.extinct.length > 0 && someDays(41, 0.3),
    ground: new Set([...ROCKY, COVER.SAND, COVER.BARE]),
    water: false,
  },
  { set: 'shells', on: () => has('shells') && someDays(42, 0.3), ground: new Set([COVER.SHALLOW]), water: true },
  {
    set: 'feathers',
    on: () => has('feathers') && lived('bird') && someDays(43, 0.25),
    ground: new Set([COVER.FOREST, COVER.GRASS, COVER.SAVANNA, COVER.WETLAND, COVER.TUNDRA]),
    water: false,
  },
  {
    set: 'eggs',
    on: () => has('eggs') && someDays(44, 0.25),
    ground: new Set([COVER.WETLAND, COVER.SAND, COVER.GRASS, COVER.FOREST]),
    water: false,
  },
  { set: 'crystals', on: () => has('caves') && someDays(45, 0.3), ground: ROCKY, water: false },
];
/** @param {number} i */
const tileHash = i => (Math.imul(i + 1, 2654435761) ^ Math.imul(state.seed | 0, 40503)) >>> 0;

/** @typedef {{ tile: any, icon: string, tap: (x: number, y: number) => void, wet?: boolean, swims?: boolean, blows?: boolean }} TileThing */
/**
 * A plant or an animal found before: its splash again, with what it is. People who can settle where they stand
 * (village.js) are asked to.
 * @param {TileSpecies} s @param {{ u: number, v: number }} tile
 */
const knownSplash = (s, tile) => {
  const set = COLLECTION_BY_ID[s.flora ? 'flora' : 'fauna'],
    item = set.items.find(/** @param {{ id: string }} it */ it => it.id === s.id),
    picture = item ? itemPicture(item) : '';
  queueSplash({ kicker: set.name, title: s.name, sub: s.desc ?? '', picture, ...settleChoice(s.id, tile) });
};
/**
 * What stands on a tile: a find while its season lasts, or else who lives there.
 * @param {any} tile
 * @param {ReturnType<typeof tileDwellers>} living
 * @param {typeof TILE_FINDS} finds the ones on now
 * @param {ReturnType<typeof herdWorld>} world
 * @returns {TileThing[]}
 */
const thingsOn = (tile, living, finds, world) => {
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
  const s = tileDweller(tile, living, world);
  if (!s) return [];
  return [
    {
      tile,
      icon: s.icon,
      wet: tile.water && !s.blows, // in the water, not on it (a whale comes up to breathe)
      swims: !!s.swims, // round the middle of the water, not on its floor
      blows: !!s.blows,
      tap: (x, y) => {
        if (!collect(s.flora ? 'flora' : 'fauna', x, y, s.id)) knownSplash(s, tile);
      },
    },
  ];
};
/** Everything standing on the open view, back to front. */
const tileThings = () => {
  const living = tileDwellers(),
    finds = TILE_FINDS.filter(f => f.on()),
    world = herdWorld(living);
  return (Tiles.model()?.tiles ?? []).flatMap(tile => thingsOn(tile, living, finds, world));
};

const tileLayer = /** @type {HTMLElement} */ (document.getElementById('tiles'));
const tileCanvas = /** @type {HTMLCanvasElement} */ (tileLayer.querySelector('canvas'));
/**
 * Where a thing's sprite is drawn on the tile canvas: standing on its square; or in the water there, swimming in
 * the middle of it or on its floor; or (a whale) at the surface, its back out of the water.
 * @param {TileThing} t
 */
const thingBox = t => {
  const img = Sprites.canvas(t.icon),
    [x, y] = /** @type {[number, number]} */ (Tiles.top(t.tile)),
    depth = t.wet ? t.tile.depth : 0,
    foot = t.blows
      ? y + Math.round(img.height / 3)
      : !t.wet
        ? y + 2
        : t.swims
          ? y + Math.round((depth + img.height) / 2)
          : y + depth;
  return { img, left: Math.round(x - img.width / 2), top: foot - img.height, surface: y };
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

/** How a whale's spout rises and falls, a frame per redraw of the tiles: its height in pixels. */
const SPOUT = [2, 4, 6, 7, 7, 5, 3],
  SPOUT_EVERY = 24; // redraws (of 400 ms) from one breath to the next
/**
 * A whale's spout, now and then: a plume of spray over its blowhole that widens as it rises, its own time for each
 * whale. The sprite's own still spout (its top third) is left out on the close-up, so this one is all there is.
 * @param {CanvasRenderingContext2D} g
 * @param {TileThing} t
 * @param {number} frame the tiles' redraw count
 */
const spout = (g, t, frame) => {
  const { img, left, top } = thingBox(t),
    h = SPOUT[(frame + (tileHash(t.tile.i) % SPOUT_EVERY)) % SPOUT_EVERY] ?? 0,
    x = left + Math.round(img.width * 0.4),
    y = top + Math.round(img.height / 3);
  Array.from({ length: h }, (_, r) => {
    const half = Math.floor((r * 3) / Math.max(1, h)); // 0 at the blowhole, up to 2 at the top
    // oxlint-disable-next-line fp/no-mutation, no-param-reassign -- the canvas's pen, the one thing a drawing changes
    g.fillStyle = `rgba(236, 244, 255, ${0.9 - (r / h) * 0.45})`;
    return g.fillRect(x - half, y - 1 - r, half * 2 + 1, 1);
  });
};
/**
 * A whale at the surface: its back out of the water, the rest seen through it, and its spout when it breathes.
 * @param {CanvasRenderingContext2D} g
 * @param {TileThing} t
 * @param {number} frame the tiles' redraw count
 */
const surfacing = (g, t, frame) => {
  const { img, left, top, surface } = thingBox(t),
    cut = Math.round(img.height / 3),
    dry = surface - top - cut,
    wet = img.height - cut - dry;
  g.drawImage(underWater(img, t.tile), 0, cut + dry, img.width, wet, left, top + cut + dry, img.width, wet);
  g.drawImage(img, 0, cut, img.width, dry, left, top + cut, img.width, dry);
  spout(g, t, frame);
};

// After the tiles are drawn, everything on them is set on the top of its square, back to front.
tileLayer.addEventListener('drawn', e => {
  const g = context2d(tileCanvas),
    frame = Math.floor(/** @type {CustomEvent<number>} */ (e).detail / 400); // the time the tiles were drawn
  // oxlint-disable-next-line unicorn/no-array-for-each -- drawing is the one thing done per square
  tileThings().forEach(t => {
    if (t.blows) return surfacing(g, t, frame);
    const { img, left, top } = thingBox(t);
    return g.drawImage(t.wet ? underWater(img, t.tile) : img, left, top);
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
  if (!t) return;
  t.tap(e.clientX, e.clientY);
  buzz(6);
});
