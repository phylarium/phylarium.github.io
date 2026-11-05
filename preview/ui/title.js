'use strict';

// The title screen's picture, built up in layers, back to front: a summer valley in the mountains. Each layer draws into the
// same small canvas at a pixel size near the scene's, and the canvas is scaled up with hard pixel edges. It runs
// only while the start menu shows.
//
// Layers so far: the blue sky; puffy clouds at three depths drifting at different speeds (parallax); ridges of
// mountains one behind the other, hazy blue far off and forest green close by, with mist in the valleys.
const Title = (() => {
  /** @type {HTMLCanvasElement} */
  let canvas;
  /** @type {CanvasRenderingContext2D} */
  let g;
  /** @type {HTMLCanvasElement} */
  let back; // the sky, drawn once per size
  /** @type {HTMLCanvasElement} */
  let front; // the mountains, drawn once per size, over the clouds
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

  // A seeded random, so the picture is the same each time at one size.
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  const rgb = (/** @type {string} */ hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const mix = (/** @type {number[]} */ a, /** @type {number[]} */ b, /** @type {number} */ k) =>
    a.map((v, i) => Math.round(v + (b[i] - v) * k));
  /** Writes one pixel of an ImageData's bytes. */
  const put = (/** @type {Uint8ClampedArray} */ d, /** @type {number} */ i, /** @type {number[]} */ c) => {
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
    d[i + 3] = 255;
  };

  // The sky: deep blue at the top, pale near the horizon. Solid bands with a dithered seam between each pair.
  // The bands reach down to the horizon; below it the palest holds.
  const SKY = [
    '#1a52c4',
    '#2262d4',
    '#2b74e0',
    '#3786ea',
    '#4799f0',
    '#5cacf4',
    '#76bef7',
    '#93cefa',
    '#b2defc',
    '#d2eefe',
  ];
  const SEAM = 0.4; // the share of each band, at its bottom, that dithers into the next
  const HORIZON = 0.56; // share of the height where the sky meets the farthest ridge

  function skyBand(/** @type {number} */ y) {
    const f = Math.min(1, y / Math.max(1, H * HORIZON)) * (SKY.length - 1),
      band = Math.min(SKY.length - 2, Math.floor(f));
    return { band, into: Math.max(0, (f - band - (1 - SEAM)) / SEAM) };
  }
  // The sky's color at row y (the band's own color, without the dither).
  const skyAt = (/** @type {number} */ y) => rgb(SKY[skyBand(y).band]);

  function drawSky(/** @type {CanvasRenderingContext2D} */ to) {
    const img = to.createImageData(W, H),
      colors = SKY.map(rgb);
    for (let y = 0; y < H; y++) {
      const { band, into } = skyBand(y);
      for (let x = 0; x < W; x++)
        put(img.data, (y * W + x) * 4, colors[into * 16 > BAYER[y % 4][x % 4] ? band + 1 : band]);
    }
    to.putImageData(img, 0, 0);
  }

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
      tones = Object.fromEntries(Object.entries(CLOUD).map(([k, v]) => [k, mix(rgb(v), sky, fade)])),
      shadeFrom = h * 0.62, // the shadow along the base starts here and is solid below shadeTo
      shadeTo = h * 0.82;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!inside(x, y)) continue;
        let tone = tones.body;
        const into = (y - shadeFrom) / (shadeTo - shadeFrom);
        if (!inside(x - 1, y - 2) || !inside(x, y - 1)) tone = tones.rim;
        else if (y >= h - 2 || !inside(x, y + 1) || !inside(x + 1, y)) tone = tones.base;
        else if (into * 16 > BAYER[y % 4][x % 4]) tone = tones.shade;
        put(img.data, (y * w + x) * 4, tone);
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
          y = Math.round(H * (layer.y[0] + rnd() * (layer.y[1] - layer.y[0]))),
          pic = cloudPic(w, skyAt(y + w * 0.25), layer.fade);
        // Spread evenly across the screen with some jitter, so they never bunch up. All stay in the upper half.
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

  // Mountains: ridges one behind the other. The farthest is a hazy blue barely darker than the sky; each nearer
  // one is greener and deeper (less air between), down to dark forest. Slopes that rise toward the right face
  // the sun (upper left) and are lighter. Each ridge pales into the mist that lies in the valley below it, so
  // the ridges stand apart.
  const RIDGE_FAR = '#8fb0dc',
    RIDGE_NEAR = '#2a6a34',
    MIST = '#e4f2ff',
    RIDGES = 6;

  // A rolling line across the screen: a few long waves plus a little jagged noise (the trees on the ridge).
  function ridgeLine(/** @type {number} */ base, /** @type {number} */ height, /** @type {number} */ waves) {
    const ph = Array.from({ length: 3 }, () => rnd() * 6.28),
      noise = [];
    let v = 0;
    for (let x = 0; x < W; x++) noise.push((v = v * 0.6 + (rnd() - 0.5) * 1.6));
    // The smooth line (for the light on the slopes) and the line with its trees (the edge drawn).
    const smooth = Array.from({ length: W }, (_, x) => {
      const u = x / W;
      return (
        base -
        height *
          (0.55 +
            0.3 * Math.sin(u * waves * 6.28 + ph[0]) +
            0.12 * Math.sin(u * waves * 2.7 * 6.28 + ph[1]) +
            0.05 * Math.sin(u * waves * 7.3 * 6.28 + ph[2]))
      );
    });
    return { smooth, top: smooth.map((y, x) => Math.round(y + noise[x])) };
  }

  function drawMountains(/** @type {CanvasRenderingContext2D} */ to) {
    const img = to.createImageData(W, H),
      far = rgb(RIDGE_FAR),
      near = rgb(RIDGE_NEAR),
      mist = rgb(MIST);
    for (let k = 0; k < RIDGES; k++) {
      const depth = k / (RIDGES - 1), // 0 for the farthest ridge, 1 for the nearest
        base = H * (HORIZON + 0.04 + depth * 0.3),
        { top, smooth } = ridgeLine(
          base,
          H * (0.06 + 0.06 * (1 - depth) + rnd() * 0.03),
          W / (110 + rnd() * 90 - depth * 30),
        ),
        color = mix(far, near, depth ** 0.9),
        sunny = mix(color, [255, 250, 200], 0.18 + 0.1 * depth),
        mistLen = H * (0.07 + 0.03 * depth); // how far down the ridge the valley mist reaches up
      for (let x = 0; x < W; x++)
        for (let y = Math.max(0, top[x]); y < H; y++) {
          // A slope rising toward the right faces the sun. Lower down, the face is followed down and to the right,
          // so the line between light and shade runs down from each summit at a slant.
          const at = Math.min(W - 6, Math.max(5, Math.round(x + (y - top[x]) * 0.5))),
            lit = smooth[at + 5] < smooth[at - 5] - 1.5 && y - top[x] < mistLen * 0.45,
            c = lit ? sunny : color,
            misty = mix(c, mist, 0.3 + 0.15 * (1 - depth));
          // Into the mist in steps: solid near the top, then a dithered band, then solid mist.
          const down = (y - top[x]) / mistLen,
            hazy = down > 0.75 || (down > 0.45 && BAYER[y % 4][x % 4] < 8);
          put(img.data, (y * W + x) * 4, hazy ? misty : c);
        }
    }
    to.putImageData(img, 0, 0);
    // The sky shows through where no ridge stands: clear those pixels.
    const out = to.getImageData(0, 0, W, H);
    for (let i = 3; i < out.data.length; i += 4) if (!img.data[i]) out.data[i] = 0;
    to.putImageData(out, 0, 0);
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
    back = document.createElement('canvas');
    front = document.createElement('canvas');
    back.width = front.width = W;
    back.height = front.height = H;
    seed = 5;
    drawSky(context2d(back));
    drawMountains(context2d(front));
    makeClouds();
  }

  function draw() {
    g.drawImage(back, 0, 0);
    drawClouds();
    g.drawImage(front, 0, 0);
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
