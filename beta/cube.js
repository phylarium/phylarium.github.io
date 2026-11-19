'use strict';

// A tap on a square of the close-up (tiles.js) lifts it out as a block of its own, drawn big (cube-art.js), with
// who lives there in it: fish swim round the middle of the water, crabs sit on its floor, a deer stands on its
// ground. A tap on someone finds them, as on the tiles; a tap beside them, Back or Escape puts the block back.
// Loads after tile-life.js.

const cubeLayer = /** @type {HTMLElement} */ (document.getElementById('cube'));
const cubeCanvas = /** @type {HTMLCanvasElement} */ (cubeLayer.querySelector('canvas'));
cubeCanvas.setAttribute('width', String(CubeArt.size.w));
cubeCanvas.setAttribute('height', String(CubeArt.size.h));
// oxlint-disable-next-line fp/no-nondeterminism -- the clock the fish swim and the water glints by
const cubeNow = () => performance.now();
/** How often the block is drawn again, so the fish swim and the water glints. */
const CUBE_FRAME_MS = 80;
/** The names of the covers, by number. */
const COVER_NAMES = Object.fromEntries(Object.entries(Terrain.COVER).map(([name, c]) => [c, name]));

/**
 * What a square of the close-up is, for its block.
 * @param {any} tile
 * @returns {CubeSquare}
 */
const cubeSquare = tile => {
  const colors = Scene.reliefColors(),
    own = Tiles.colors(tile),
    hex = (/** @type {string} */ h) => TilePaint.pack([1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16))),
    r = tile.relief,
    rock = hex(colors.rock.top[1] ?? '#808080');
  return {
    water: tile.water,
    name: COVER_NAMES[tile.cover] ?? '',
    seed: tile.i,
    light: colors.light,
    top: r ? rock : own.top,
    side: r ? hex(colors.rock.side[1] ?? '#606060') : own.side,
    under: own.under,
    lip: r ? 4 : Math.min(8, own.lip * 2),
    steps: r ? Math.min(3, 1 + Math.floor(r.h / 6)) : 0,
    peak: own.top,
  };
};

/**
 * A sprite as pixels, its foot at the origin, turned round when `flip`.
 * @param {string} icon
 * @param {boolean} flip
 */
const spritePixels = (icon, flip) => {
  const img = Sprites.canvas(icon),
    w = img.width,
    d = context2d(img).getImageData(0, 0, w, img.height).data;
  return Array.from({ length: w * img.height }, (_, i) => i)
    .filter(i => (d[i * 4 + 3] ?? 0) > 0)
    .map(i => ({
      x: (flip ? w - 1 - (i % w) : i % w) - (w >> 1),
      y: Math.floor(i / w) - img.height + 1,
      color: TilePaint.pack([d[i * 4] ?? 0, d[i * 4 + 1] ?? 0, d[i * 4 + 2] ?? 0]),
      icon,
    }));
};

/**
 * Who lives in the block and where each is drawn now: three of a kind that swims, one of any other.
 * @param {readonly TileThing[]} things
 * @param {number} now
 */
const cubeDwellers = (things, now) =>
  things.flatMap(t => {
    const way = !t.wet ? 'ground' : t.swims ? 'swim' : 'floor';
    return (way === 'swim' ? [0, 1, 2] : [1]).map(n => ({ thing: t, way, ...CubeArt.place(way, n, now) }));
  });

/** The square on show, and who lives in it. @type {{ tile: any, things: TileThing[], timer: number } | null} */
// oxlint-disable-next-line fp/no-let -- the one block on show, or none
let cubeShown = null;

/** Draws the block as it is at `now`. @param {number} now */
const drawCube = now => {
  if (!cubeShown) return;
  const sq = cubeSquare(cubeShown.tile),
    g = context2d(cubeCanvas),
    image = g.createImageData(CubeArt.size.w, CubeArt.size.h),
    px = new Uint32Array(image.data.buffer),
    who = cubeDwellers(cubeShown.things, now),
    drawn = (/** @type {string} */ way) =>
      who
        .filter(d => d.way === way)
        .flatMap(d => spritePixels(d.thing.icon, d.flip).map(p => ({ ...p, x: p.x + d.x, y: p.y + d.y }))),
    tank = sq.water ? CubeArt.water(sq, now) : null,
    layers = tank
      ? [tank.back, drawn('floor'), drawn('swim'), tank.front, tank.top]
      : [CubeArt.land(sq), drawn('ground')];
  // oxlint-disable-next-line fp/no-loops -- every pixel of the block, a dozen times a second
  for (const p of /** @type {CubePixel[]} */ (layers.flat())) {
    const i = p.y * CubeArt.size.w + p.x;
    if (p.x < 0 || p.x >= CubeArt.size.w || p.y < 0 || p.y >= CubeArt.size.h) continue;
    // oxlint-disable-next-line fp/no-mutation -- the pixels of the canvas
    px[i] = p.a === undefined ? p.color : CubeArt.mix(px[i] || 0xff_1c_20_25, p.color, p.a);
  }
  Hues.apply(image.data); // in the colors found so far, like the tiles
  g.putImageData(image, 0, 0);
};

// As large as fits, in whole pixels.
const fitCube = () => {
  const k = Math.max(
    1,
    Math.floor(Math.min((innerWidth * 0.9) / CubeArt.size.w, (innerHeight * 0.75) / CubeArt.size.h)),
  );
  cubeCanvas.style.setProperty('width', `${CubeArt.size.w * k}px`);
  cubeCanvas.style.setProperty('height', `${CubeArt.size.h * k}px`);
};

/** Lifts a square of the close-up out. @param {any} tile */
const openCube = tile => {
  if (!cubeShown) history.pushState({ tiles: true, cube: true }, '');
  if (cubeShown) clearInterval(cubeShown.timer);
  cubeShown = {
    tile,
    things: tileThings().filter(t => t.tile.i === tile.i),
    timer: window.setInterval(() => drawCube(cubeNow()), CUBE_FRAME_MS),
  };
  fitCube();
  drawCube(cubeNow());
  cubeLayer.classList.remove('hidden');
};

const hideCube = () => {
  if (cubeShown) clearInterval(cubeShown.timer);
  cubeShown = null;
  cubeLayer.classList.toggle('hidden', true);
};
const closeCube = () => {
  if (!cubeShown) return;
  if (history.state?.cube) history.back();
  else hideCube();
};

/** Who is drawn at a point of the canvas, with a margin for a finger. @param {number} x @param {number} y */
const cubeThingAt = (x, y) => {
  const pad = 3;
  return cubeDwellers(cubeShown?.things ?? [], cubeNow()).findLast(d => {
    const img = Sprites.canvas(d.thing.icon),
      left = d.x - (img.width >> 1),
      top = d.y - img.height + 1;
    return x >= left - pad && x < left + img.width + pad && y >= top - pad && y < top + img.height + pad;
  })?.thing;
};

tileLayer.addEventListener('square', e => {
  const { x, y } = /** @type {CustomEvent<{ x: number, y: number }>} */ (e).detail,
    tile = Tiles.tileAt(x, y);
  if (tile) openCube(tile);
});
// A tap on someone finds them; a tap anywhere else, if it began on the block, puts the block back.
cubeLayer.addEventListener('pointerdown', () => cubeLayer.setAttribute('data-tap', '1'));
cubeLayer.addEventListener('click', e => {
  const began = cubeLayer.hasAttribute('data-tap'),
    r = cubeCanvas.getBoundingClientRect(),
    k = r.width / CubeArt.size.w,
    t = cubeThingAt((e.clientX - r.left) / k, (e.clientY - r.top) / k);
  cubeLayer.removeAttribute('data-tap');
  if (!began) return;
  if (!t) return closeCube();
  t.tap(e.clientX, e.clientY);
  buzz(6);
});
window.addEventListener('popstate', () => {
  if (cubeShown && !history.state?.cube) hideCube();
});
// Escape puts the block back before it closes the close-up (the listener on the window comes first).
window.addEventListener(
  'keydown',
  e => {
    if (e.key !== 'Escape' || !cubeShown) return;
    e.stopPropagation();
    closeCube();
  },
  true,
);
window.addEventListener('resize', () => cubeShown && fitCube());
