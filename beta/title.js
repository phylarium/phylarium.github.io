'use strict';

// The title screen's picture: a living planet as it could be one day. A blue sky with a sun and a rainbow,
// clouds drifting at three depths, snowy mountains, a sea with a whale, and a meadow full of plants and animals,
// drawn with the game's own sprites at the scene's pixel size. It runs only while the start menu shows.
const Title = (() => {
  /** @type {HTMLCanvasElement} */
  let canvas;
  /** @type {CanvasRenderingContext2D} */
  let g;
  /** @type {HTMLCanvasElement} */
  let land; // everything that stands still, drawn once per size
  let W = 0,
    H = 0,
    horizon = 0,
    running = false,
    last = 0,
    t = 0;
  /** @type {{ x: number, y: number, speed: number, pic: HTMLCanvasElement }[]} */
  let clouds = [];
  /** @type {number[]} */
  let near = []; // the meadow's top edge, per column
  let meadowTop = 0;
  let meadowEdge = (/** @type {number} */ y) => y;
  let flowerSpot = () => [0, 0];
  /** @type {{ id: string, x: number, y: number, speed: number, dir: number, min: number, max: number }[]} */
  let walkers = [];
  /** @type {{ id: string, x: number, y: number, speed: number, phase: number, wave: number }[]} */
  let fliers = [];
  /** @type {{ id: string, x: number, y: number, phase: number }[]} */
  let flutterers = [];

  // A seeded random, so the picture is the same each time at one size.
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const pick = (/** @type {string[]} */ list) => list[Math.floor(rnd() * list.length)];

  const SKY_TOP = '#2f7fe0',
    SKY_LOW = '#bfe9ff',
    RAINBOW = ['#e8483a', '#ff9a2a', '#ffd84a', '#5cc85a', '#3a8ae8', '#9a5ae0'];

  function cloudPic(/** @type {number} */ size) {
    const c = document.createElement('canvas'),
      w = Math.round(size * 2.6),
      h = Math.round(size * 1.3);
    c.width = w;
    c.height = h;
    const cg = context2d(c);
    const puffs = 3 + Math.floor(rnd() * 3);
    const blob = (/** @type {string} */ color, /** @type {number} */ dy) => {
      cg.fillStyle = color;
      for (let k = 0; k < puffs; k++) {
        const r = size * (0.35 + rnd() * 0.25),
          x = size * 0.5 + (k / (puffs - 1)) * (w - size),
          y = h - r - 1 + dy;
        cg.beginPath();
        cg.arc(Math.round(x), Math.round(y), Math.round(r), 0, Math.PI * 2);
        cg.fill();
      }
      cg.fillRect(
        Math.round(size * 0.4),
        Math.round(h - size * 0.4 + dy),
        Math.round(w - size * 0.8),
        Math.round(size * 0.4),
      );
    };
    const s = seed;
    blob('#cfe4f7', 0);
    seed = s; // the same puffs again, a pixel higher, in white: a shaded underside
    blob('#ffffff', -1);
    return c;
  }

  // A ridge line: smooth noise from a few sine waves.
  function ridge(/** @type {number} */ base, /** @type {number} */ height, /** @type {number} */ waves) {
    const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
    return Array.from({ length: W }, (_, x) => {
      const u = x / W;
      return Math.round(
        base -
          height *
            (0.5 +
              0.3 * Math.sin(u * waves * 6.28 + ph[0]) +
              0.15 * Math.sin(u * waves * 15 + ph[1]) +
              0.05 * Math.sin(u * waves * 37 + ph[2])),
      );
    });
  }

  function sprite(/** @type {CanvasRenderingContext2D} */ to, /** @type {string} */ id, x = 0, y = 0, flip = false) {
    const s = Sprites.canvas(id);
    x = Math.round(x - s.width / 2);
    y = Math.round(y - s.height);
    if (!flip) return to.drawImage(s, x, y);
    to.save();
    to.scale(-1, 1);
    to.drawImage(s, -x - s.width, y);
    to.restore();
  }

  function build() {
    const vw = innerWidth,
      vh = innerHeight,
      p = Math.max(2, Math.round(Math.min(vw, vh * 0.55) / 180));
    W = Math.ceil(vw / p);
    H = Math.ceil(vh / p);
    canvas.width = W;
    canvas.height = H;
    g.imageSmoothingEnabled = false;
    horizon = Math.round(H * 0.6);
    seed = 7;

    land = document.createElement('canvas');
    land.width = W;
    land.height = H;
    const l = context2d(land);
    // Sky.
    const sky = l.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, SKY_TOP);
    sky.addColorStop(1, SKY_LOW);
    l.fillStyle = sky;
    l.fillRect(0, 0, W, H);
    // Rainbow behind the hills.
    const rx = W * 0.28,
      rr = Math.min(W * 0.42, horizon * 0.75);
    l.globalAlpha = 0.5;
    RAINBOW.forEach((c, k) => {
      l.strokeStyle = c;
      l.lineWidth = 2;
      l.beginPath();
      l.arc(rx, horizon, rr - k * 2, Math.PI, 0);
      l.stroke();
    });
    l.globalAlpha = 1;
    // Mountains with snow on their tops.
    const peaks = ridge(horizon, H * 0.22, 1.6);
    peaks.forEach((y, x) => {
      l.fillStyle = '#7f9fd0';
      l.fillRect(x, y, 1, horizon - y + 2);
      const snow = horizon - H * 0.15;
      if (y < snow) {
        l.fillStyle = '#f4f8ff';
        l.fillRect(x, y, 1, Math.min(snow - y, 4 + ((x * 7) % 3)));
      }
    });
    // The sea on the right, with light on the water.
    const shore = Math.round(W * 0.62);
    l.fillStyle = '#2f8ad8';
    l.fillRect(shore, horizon - 2, W - shore, H);
    l.fillStyle = '#7cc8ff';
    for (let k = 0; k < W / 3; k++)
      l.fillRect(shore + rnd() * (W - shore), horizon + rnd() * (H - horizon) * 0.4, 3, 1);
    // Far hills, then the near meadow. The coast runs out toward the viewer: at row y it is at coast(y).
    const coast = (/** @type {number} */ y) => shore + (y - horizon) * 0.6;
    const far = ridge(horizon + 4, H * 0.06, 2.3);
    near = ridge(horizon + H * 0.14, H * 0.07, 1.2);
    far.forEach((y, x) => {
      if (x >= shore) return;
      l.fillStyle = '#6cc56b';
      l.fillRect(x, y, 1, H);
    });
    // Trees on the far hills.
    for (let k = 0; k < W / 9; k++) {
      const x = Math.floor(rnd() * (shore - 4));
      sprite(l, pick(['tree', 'spBroadleaf', 'tree', 'spCycad']), x, far[x] + 3);
    }
    near.forEach((y, x) => {
      const top = Math.max(y, Math.ceil(horizon + (x - shore) / 0.6));
      if (top >= H) return;
      l.fillStyle = '#52b04a';
      l.fillRect(x, top, 1, H);
      l.fillStyle = '#3f9a3e';
      if (top === y && (x * 13) % 5 === 0) l.fillRect(x, y - 1, 1, 1); // grass tips
    });
    // A sandy beach along the coast.
    for (let y = horizon; y < H; y++) {
      const x = Math.round(coast(y));
      if (x - 3 >= 0 && x - 3 < W && y >= near[Math.min(W - 1, Math.max(0, x - 3))]) {
        l.fillStyle = '#f0d890';
        l.fillRect(x - 3, y, 3, 1);
        l.fillStyle = '#e8f6ff'; // surf
        l.fillRect(x, y, 1, 1);
      }
    }
    // The open meadow, below the highest point of its edge and clear of the beach.
    meadowTop = Math.max(...near) + 3;
    meadowEdge = y => coast(y) - 6;
    const spot = () => {
      const y = meadowTop + rnd() * (H - meadowTop - 1);
      return [3 + rnd() * (meadowEdge(y) - 3), y];
    };
    // Flowers: bright dots all over the meadow, and flower and grass sprites.
    for (let k = 0; k < W * 2; k++) {
      const x = Math.floor(rnd() * W),
        y = near[x] + 2 + rnd() * (H - near[x] - 2);
      if (x > coast(y) - 4) continue;
      l.fillStyle = pick(['#ff5a6a', '#ffe14a', '#ffffff', '#f0a0d0', '#b07aff', '#ff9a2a']);
      l.fillRect(x, Math.round(y), 1, 1);
    }
    for (let k = 0; k < W / 5; k++) {
      const [x, y] = spot();
      sprite(
        l,
        pick([
          'spFlower',
          'spGrass',
          'spFlower',
          'spGrass',
          'spFlower',
          'spFlower',
          'spGrass',
          'spFlower',
          'spGrass',
          'spMushroom',
        ]),
        x,
        y,
      );
    }
    flowerSpot = spot;

    // Moving things.
    clouds = [];
    for (const [n, size, y0, y1, speed] of /** @type {[number, number, number, number, number][]} */ ([
      [4, 5, 0.08, 0.2, 1.5],
      [3, 8, 0.15, 0.32, 3],
      [3, 12, 0.25, 0.45, 6],
    ]))
      for (let k = 0; k < n; k++)
        clouds.push({
          x: rnd() * W * 1.3,
          y: H * (y0 + rnd() * (y1 - y0)),
          speed: speed * (0.8 + rnd() * 0.4),
          pic: cloudPic(size),
        });
    walkers = [
      'spGrazer',
      'spElephant',
      'spDinosaur',
      'spMammal',
      'spPrimate',
      'spTurtle',
      'spSnail',
      'spGrazer',
      'spMonkey',
      'spGrazer',
      'spMammal',
      'spElephant',
      'spCrab',
      'spBeetle',
    ].map(id => {
      const [x, y] = flowerSpot();
      const slow = ['spSnail', 'spTurtle', 'spBeetle', 'spCrab'].includes(id);
      return { id, x, y, speed: slow ? 1 : 3 + rnd() * 3, dir: rnd() < 0.5 ? -1 : 1, min: 4, max: meadowEdge(y) };
    });
    walkers.sort((a, b) => a.y - b.y);
    fliers = ['spBird', 'spBird', 'spBird', 'spBird', 'spBird'].map(id => ({
      id,
      x: rnd() * W,
      y: H * (0.12 + rnd() * 0.3),
      speed: 10 + rnd() * 10,
      phase: rnd() * 6,
      wave: 2 + rnd() * 3,
    }));
    flutterers = ['spButterfly', 'spBee', 'spButterfly', 'spBee', 'spButterfly', 'spDragonfly'].map(id => {
      const [x, y] = flowerSpot();
      return { id, x, y, phase: rnd() * 6 };
    });
    // The whale out at sea.
    fliers.push({
      id: 'spWhale',
      x: shore + (W - shore) * 0.6,
      y: horizon + (H - horizon) * 0.3,
      speed: 0,
      phase: 0,
      wave: 0,
    });
  }

  function draw() {
    g.drawImage(land, 0, 0);
    // The sun, with rays that turn slowly.
    const sx = W * 0.82,
      sy = H * 0.13,
      sr = Math.max(6, Math.round(W * 0.055));
    g.fillStyle = '#fff3a0';
    for (let k = 0; k < 12; k++) {
      const a = t * 0.2 + (k * Math.PI) / 6,
        d = sr + 3 + (k % 2) * 2 + Math.round(Math.sin(t * 2 + k));
      g.fillRect(Math.round(sx + Math.cos(a) * d), Math.round(sy + Math.sin(a) * d), 2, 2);
    }
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.arc(Math.round(sx), Math.round(sy), sr, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff6c0';
    g.fillRect(Math.round(sx - sr / 2), Math.round(sy - sr / 2), 2, 2);
    // Clouds, far ones first; each wraps round when it leaves the screen.
    for (const c of clouds) {
      const span = W + c.pic.width * 2,
        x = ((((c.x + t * c.speed) % span) + span) % span) - c.pic.width;
      g.drawImage(c.pic, Math.round(x), Math.round(c.y));
    }
    // Birds cross the sky in waves.
    for (const f of fliers) {
      if (f.id === 'spWhale') {
        // The whale rises now and then and blows.
        const up = Math.sin(t * 0.5) > 0.6;
        if (up) {
          sprite(g, 'spWhale', f.x, f.y);
          g.fillStyle = '#e8f6ff';
          const h = Math.round(3 + Math.sin(t * 6) * 1.5);
          g.fillRect(Math.round(f.x - 2), Math.round(f.y - 6 - h), 1, h);
          g.fillRect(Math.round(f.x - 3), Math.round(f.y - 6 - h), 3, 1);
        }
        continue;
      }
      const span = W + 20,
        x = ((f.x + t * f.speed) % span) - 10,
        y = f.y + Math.sin(t * 2 + f.phase) * f.wave;
      sprite(g, f.id, x, y);
    }
    // Animals walk to and fro across the meadow.
    for (const w of walkers) {
      w.x += w.dir * w.speed * 0.033;
      if (w.x < w.min || w.x > w.max) w.dir *= -1;
      const bob = Math.round(t * w.speed) % 2;
      sprite(g, w.id, w.x, w.y - bob, w.dir < 0);
    }
    // Butterflies and bees flit over the flowers.
    for (const f of flutterers) {
      const x = f.x + Math.sin(t * 0.7 + f.phase) * 12,
        y = f.y - 6 + Math.sin(t * 3 + f.phase) * 3;
      sprite(g, f.id, x, y, Math.cos(t * 0.7 + f.phase) < 0);
    }
  }

  function loop(/** @type {number} */ now) {
    if (!running) return;
    requestAnimationFrame(loop);
    if (now - last < 33) return;
    t += Math.min(0.1, (now - last) / 1000);
    last = now;
    draw();
  }

  function start(/** @type {HTMLCanvasElement} */ el) {
    if (running) return;
    canvas = el;
    g = context2d(canvas);
    build();
    addEventListener('resize', build);
    running = true;
    last = performance.now();
    draw();
    requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    removeEventListener('resize', build);
  }

  return { start, stop };
})();
