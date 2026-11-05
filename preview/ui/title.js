'use strict';

// The title screen's picture, built up in layers, back to front. Each layer draws into the same small canvas at
// a pixel size near the scene's, and the canvas is scaled up with hard pixel edges. It runs only while the start
// menu shows.
//
// Layers so far: the sky; clouds at three depths drifting at different speeds (parallax).
const Title = (() => {
  /** @type {HTMLCanvasElement} */
  let canvas;
  /** @type {CanvasRenderingContext2D} */
  let g;
  /** @type {HTMLCanvasElement} */
  let still; // the layers that do not move, drawn once per size
  let W = 0,
    H = 0,
    running = false,
    last = 0,
    t = 0;

  // 4x4 ordered (Bayer) dither: which pixels of a cell switch to the next color first.
  const BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];

  // The sky: solid bands of blue, deep at the top and pale at the horizon, with a dithered seam between bands.
  const SKY = [
    '#1c56c8',
    '#2468d8',
    '#2f7ae4',
    '#3d8cec',
    '#4f9ef2',
    '#64b0f6',
    '#7cc1f9',
    '#97d1fb',
    '#b4e0fd',
    '#d0edfe',
  ];
  const SEAM = 0.4; // the share of each band, at its bottom, that dithers into the next

  const rgb = (/** @type {string} */ hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

  function drawSky(/** @type {CanvasRenderingContext2D} */ to) {
    const img = to.createImageData(W, H),
      d = img.data,
      colors = SKY.map(rgb),
      bands = colors.length - 1;
    for (let y = 0; y < H; y++) {
      const f = (y / Math.max(1, H - 1)) * bands,
        band = Math.min(bands - 1, Math.floor(f)),
        into = Math.max(0, (f - band - (1 - SEAM)) / SEAM); // 0 above the seam, rising to 1 at the band's end
      for (let x = 0; x < W; x++) {
        const next = into * 16 > BAYER[y % 4][x % 4],
          [r, gr, b] = colors[next ? band + 1 : band],
          i = (y * W + x) * 4;
        d[i] = r;
        d[i + 1] = gr;
        d[i + 2] = b;
        d[i + 3] = 255;
      }
    }
    to.putImageData(img, 0, 0);
  }

  // A seeded random, so the picture is the same each time at one size.
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  // Clouds: puffy cumulus with a flat base. Lit from the upper left: a white rim on top, a soft body and a
  // blue-grey shadow along the base, dithered into the body. Far clouds are small, slow and faded into the sky.
  const CLOUD = { rim: '#ffffff', body: '#eef6ff', shade: '#c9ddf3', base: '#a9c4e6' };
  const CLOUD_LAYERS = [
    // width range, how many per 100 pixels of screen width, speed (pixels a second), top and bottom of the band
    // they float in (share of the height), how much they fade into the sky
    { w: [16, 26], per: 1.8, speed: 5, y: [0.04, 0.3], fade: 0.5 },
    { w: [30, 46], per: 1.1, speed: 12, y: [0.08, 0.38], fade: 0.25 },
    { w: [56, 90], per: 0.6, speed: 28, y: [0.14, 0.44], fade: 0 },
  ];
  /** @type {{ pic: HTMLCanvasElement, x: number, y: number, speed: number }[][]} */
  let clouds = [];

  const mix = (/** @type {number[]} */ a, /** @type {number[]} */ b, /** @type {number} */ k) =>
    a.map((v, i) => Math.round(v + (b[i] - v) * k));
  // The sky's color at row y (the band's own color, without the dither).
  const skyAt = (/** @type {number} */ y) =>
    rgb(SKY[Math.min(SKY.length - 1, Math.round((y / Math.max(1, H - 1)) * (SKY.length - 1)))]);

  function cloudPic(/** @type {number} */ w, /** @type {number[]} */ sky, /** @type {number} */ fade) {
    const h = Math.round(w * 0.55);
    // The shape: a big puff in the middle, smaller ones either side and low ones at the ends, cut flat at the base.
    const puff = (/** @type {number} */ u, /** @type {number} */ r) => {
      const rr = w * r * (0.85 + rnd() * 0.3);
      return { x: w * u + (rnd() - 0.5) * w * 0.06, y: h - 1 - rr * (0.55 + rnd() * 0.35), r: rr };
    };
    const circles = [
      puff(0.5 + (rnd() - 0.5) * 0.12, 0.27),
      puff(0.3, 0.2),
      puff(0.7, 0.19),
      puff(0.14, 0.12),
      puff(0.86, 0.12),
    ];
    if (rnd() < 0.5) circles.push(puff(0.4 + rnd() * 0.25, 0.17));
    const inside = (/** @type {number} */ x, /** @type {number} */ y) =>
      y >= 0 && y < h - 1 && x >= 0 && x < w && circles.some(c => (x - c.x) ** 2 + (y - c.y) ** 2 <= c.r * c.r);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const cg = context2d(c),
      img = cg.createImageData(w, h),
      d = img.data,
      tones = Object.fromEntries(Object.entries(CLOUD).map(([k, v]) => [k, mix(rgb(v), sky, fade)])),
      shadeFrom = h * 0.62; // the shadow band starts here and is solid below shadeTo
    const shadeTo = h * 0.82;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!inside(x, y)) continue;
        let tone = tones.body;
        const into = (y - shadeFrom) / (shadeTo - shadeFrom);
        if (!inside(x - 1, y - 2) || !inside(x, y - 1)) tone = tones.rim;
        else if (y >= h - 2 || !inside(x, y + 1) || !inside(x + 1, y)) tone = tones.base;
        else if (into * 16 > BAYER[y % 4][x % 4]) tone = tones.shade;
        const i = (y * w + x) * 4;
        [d[i], d[i + 1], d[i + 2]] = tone;
        d[i + 3] = 255;
      }
    cg.putImageData(img, 0, 0);
    return c;
  }

  function makeClouds() {
    seed = 11;
    clouds = CLOUD_LAYERS.map(layer => {
      const n = Math.max(2, Math.round((W / 100) * layer.per));
      return Array.from({ length: n }, (_, k) => {
        const w = Math.round(layer.w[0] + rnd() * (layer.w[1] - layer.w[0])),
          y = Math.round(H * (layer.y[0] + rnd() * (layer.y[1] - layer.y[0])));
        const pic = cloudPic(w, skyAt(y + w * 0.25), layer.fade);
        // Spread evenly across the screen with some jitter, so they never bunch up.
        // The whole cloud stays in the upper half of the sky.
        return {
          pic,
          x: ((k + rnd() * 0.6) / n) * (W + w) - w,
          y: Math.min(y, Math.floor(H / 2) - pic.height),
          speed: layer.speed * (0.85 + rnd() * 0.3),
        };
      });
    });
  }

  function drawClouds() {
    for (const layer of clouds)
      for (const c of layer) {
        const w = c.pic.width,
          span = W + w,
          x = ((((c.x + t * c.speed) % span) + span) % span) - w;
        g.drawImage(c.pic, Math.round(x), c.y);
      }
  }

  function build() {
    const vw = innerWidth,
      vh = innerHeight,
      p = Math.max(3, Math.round(Math.min(vw, vh * 0.55) / 160));
    W = Math.ceil(vw / p);
    H = Math.ceil(vh / p);
    canvas.width = W;
    canvas.height = H;
    g.imageSmoothingEnabled = false;
    still = document.createElement('canvas');
    still.width = W;
    still.height = H;
    drawSky(context2d(still));
    makeClouds();
  }

  function draw() {
    g.drawImage(still, 0, 0);
    drawClouds();
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

  return { start, stop, time: () => t };
})();
