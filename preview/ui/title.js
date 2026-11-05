'use strict';

// The title screen's picture, built up in layers, back to front. Each layer draws into the same small canvas at
// a pixel size near the scene's, and the canvas is scaled up with hard pixel edges. It runs only while the start
// menu shows.
//
// Layers so far: the sky.
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
  }

  function draw() {
    g.drawImage(still, 0, 0);
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
