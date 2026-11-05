'use strict';

// The title screen's picture, built up in layers, back to front, in the style of 16-bit pixel art: a summer
// valley below icy mountains. Each layer draws into the
// same small canvas at a pixel size near the scene's, and the canvas is scaled up with hard pixel edges. It runs
// only while the start menu shows.
//
// Layers so far: the blue sky; puffy clouds at three depths drifting at different speeds (parallax); two ranges
// of sharp icy peaks.
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

  // Mountains in the style of 16-bit pixel art: sharp icy peaks in two ranges, lit from the upper left. Each
  // peak's surface is a height field: a pyramid along its main ridge plus ridged noise, which branches into
  // side ridges and gullies. The slope of that field toward the light picks one of four tones, and snow lies on
  // the high ground and along the ridges. The back range is paler, faded into the sky. Both thin into haze at
  // their foot, where the forest will stand.
  const ROCK = ['#4a64a8', '#6888c8', '#93b3e4', '#b8d0f2']; // deep shade, shade, lit, bright
  const SNOW = ['#9fb8e6', '#c3d6f4', '#e6f0fb', '#ffffff'];
  const PEAK_RANGES = [
    // summits between these heights (share of the height), gaps between summits (pixels), fade into the sky,
    // where the foot of the range lies (share of the height)
    { top: [0.24, 0.4], gap: [28, 60], fade: 0.45, foot: 0.62 },
    { top: [0.3, 0.5], gap: [50, 100], fade: 0, foot: 0.72 },
  ];

  // Smooth value noise on a seeded grid, and ridged noise from it: sharp crests where the noise crosses its middle.
  /** @type {Float32Array} */
  let lattice = new Float32Array(0);
  function noise(/** @type {number} */ x, /** @type {number} */ y) {
    const xi = Math.floor(x),
      yi = Math.floor(y),
      fx = x - xi,
      fy = y - yi,
      v = (/** @type {number} */ i, /** @type {number} */ j) => lattice[((j & 127) << 7) | (i & 127)],
      sx = fx * fx * (3 - 2 * fx),
      sy = fy * fy * (3 - 2 * fy),
      a = v(xi, yi) + (v(xi + 1, yi) - v(xi, yi)) * sx,
      b = v(xi, yi + 1) + (v(xi + 1, yi + 1) - v(xi, yi + 1)) * sx;
    return a + (b - a) * sy;
  }
  const ridged = (/** @type {number} */ x, /** @type {number} */ y) =>
    (1 - Math.abs(2 * noise(x, y) - 1)) ** 2 + 0.5 * (1 - Math.abs(2 * noise(x * 2.1 + 40, y * 2.1) - 1)) ** 2;

  function drawMountains(/** @type {CanvasRenderingContext2D} */ to) {
    lattice = Float32Array.from({ length: 128 * 128 }, rnd);
    const img = to.createImageData(W, H);
    PEAK_RANGES.forEach((range, r) => {
      const foot = H * range.foot,
        rock = ROCK.map(c => mix(rgb(c), skyAt(H * 0.4), range.fade)),
        snow = SNOW.map(c => mix(rgb(c), skyAt(H * 0.4), range.fade));
      const peaks = [];
      for (
        let x = -rnd() * range.gap[1];
        x < W + range.gap[1];
        x += range.gap[0] + rnd() * (range.gap[1] - range.gap[0])
      )
        peaks.push({
          x,
          y: H * (range.top[0] + rnd() * (range.top[1] - range.top[0])),
          left: 0.7 + rnd() * 0.5, // slope of each face: pixels down per pixel across
          right: 0.7 + rnd() * 0.5,
          lean: (rnd() - 0.5) * 0.5, // how the main ridge leans as it runs down from the summit
        });
      const height = (/** @type {typeof peaks[0]} */ p, /** @type {number} */ x) =>
        p.y + Math.abs(x - p.x) * (x < p.x ? p.left : p.right);
      // The surface: highest along the owning peak's main ridge, falling away to either side, with side ridges.
      const field = (/** @type {typeof peaks[0]} */ p, /** @type {number} */ x, /** @type {number} */ y) =>
        -Math.abs(x - (p.x + (y - p.y) * p.lean)) +
        4 * ridged(x / 13 + r * 50, y / 20) +
        1.2 * ridged(x / 5 + r * 50, y / 9);
      for (let x = 0; x < W; x++) {
        const pk = peaks.reduce((a, b) => (height(b, x) < height(a, x) ? b : a)),
          top = Math.round(height(pk, x));
        for (let y = Math.max(0, top); y < H; y++) {
          // Slope toward the light (left): how much brighter the ground is a pixel to the left than to the right.
          const slope = (field(pk, x - 1, y) - field(pk, x + 1, y)) / 2 + (y === top ? 0.4 : 0),
            tone = slope > 1.1 ? 3 : slope > 0.15 ? 2 : slope > -0.7 ? 1 : 0,
            high = (foot - y) / Math.max(1, foot - pk.y),
            snowy = high + 0.22 * ridged(x / 6 + r * 50, y / 10) > 0.78;
          let c = snowy ? snow[tone] : rock[tone];
          // Haze at the foot, dithered into the sky's color there.
          const fog = (y - (foot - H * 0.12)) / (H * 0.12);
          if (fog * 16 > BAYER[y % 4][x % 4]) c = mix(c, skyAt(Math.min(y, H * HORIZON)), 0.55);
          put(img.data, (y * W + x) * 4, c);
        }
      }
    });
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
