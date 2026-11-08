'use strict';

// The title screen's picture, in the style of 16-bit pixel art: a summer valley below icy mountains. Back to
// front: the blue sky with drifting clouds, a bank of big clouds behind the peaks, two ranges of icy peaks, a band
// of mist at their foot, a far forest hazed blue, a near forest of pines, tall trees framing the sides, grass and
// flowers, and a strip of earth along the bottom. Everything is drawn into one small canvas at a large pixel size
// and scaled up with hard edges. Clouds and mist drift at different speeds (parallax). It runs only while the
// start menu shows.
const Title = (() => {
  /** @type {HTMLCanvasElement} */
  let canvas;
  /** @type {CanvasRenderingContext2D} */
  let g;
  // Still layers, drawn once per size: the sky; the mountains; everything from the forest forward.
  /** @type {HTMLCanvasElement} */
  let skyLayer;
  /** @type {HTMLCanvasElement} */
  let peakLayer;
  /** @type {HTMLCanvasElement} */
  let landLayer;
  // Moving bands that wrap round: the cloud bank behind the peaks and the mist at their foot.
  /** @type {{ pic: HTMLCanvasElement, y: number, speed: number }[]} */
  let bands = [];
  /** @type {{ pic: HTMLCanvasElement, x: number, y: number, speed: number }[]} */
  let clouds = [];
  let W = 0,
    H = 0,
    running = false,
    last = 0,
    t = 0;

  /* ---------- Helpers ---------- */

  // 4x4 ordered (Bayer) dither: which pixels of a cell switch to the next color first.
  const BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  const dither = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ k) =>
    k * 16 > BAYER[((y % 4) + 4) % 4][((x % 4) + 4) % 4];

  // A seeded random, so the picture is the same each time at one size.
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const between = (/** @type {number} */ a, /** @type {number} */ b) => a + rnd() * (b - a);

  const rgb = (/** @type {string} */ hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const mix = (/** @type {number[]} */ a, /** @type {number[]} */ b, /** @type {number} */ k) =>
    a.map((v, i) => Math.round(v + (b[i] - v) * k));

  // A layer being painted pixel by pixel: an ImageData with a bounds-checked plot.
  function paper(/** @type {number} */ w, /** @type {number} */ h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const cg = context2d(c),
      img = cg.createImageData(w, h),
      d = img.data;
    return {
      plot(/** @type {number} */ x, /** @type {number} */ y, /** @type {number[]} */ col) {
        x = Math.round(x);
        y = Math.round(y);
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const i = (y * w + x) * 4;
        d[i] = col[0];
        d[i + 1] = col[1];
        d[i + 2] = col[2];
        d[i + 3] = 255;
      },
      done() {
        cg.putImageData(img, 0, 0);
        return c;
      },
    };
  }

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

  /* ---------- Sky ---------- */

  // Deep blue at the top, pale toward the horizon: solid bands with a dithered seam between each pair.
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
  const SKY_END = 0.62; // the palest band is reached here (share of the height)
  function skyBand(/** @type {number} */ y) {
    const f = Math.min(1, y / Math.max(1, H * SKY_END)) * (SKY.length - 1),
      band = Math.min(SKY.length - 2, Math.floor(f));
    return { band, into: Math.max(0, (f - band - 0.6) / 0.4) };
  }
  const skyAt = (/** @type {number} */ y) => rgb(SKY[skyBand(y).band]);

  function paintSky() {
    const p = paper(W, H),
      colors = SKY.map(rgb);
    for (let y = 0; y < H; y++) {
      const { band, into } = skyBand(y);
      for (let x = 0; x < W; x++) p.plot(x, y, colors[dither(x, y, into) ? band + 1 : band]);
    }
    return p.done();
  }

  /* ---------- Clouds ---------- */

  // Puffy cumulus, lit from the upper left: a white rim, a soft body, a blue-grey shadow dithered in along the
  // flat base. `circles` give the shape; with `wrap` set, a circle crossing one side also shows on the other.
  const CLOUD = ['#ffffff', '#eef6ff', '#cfe1f5', '#a9c4e6']; // rim, body, shade, base
  /** @typedef {{ x: number, y: number, r: number }} Circle */
  function paintCloud(
    /** @type {number} */ w,
    /** @type {number} */ h,
    /** @type {Circle[]} */ circles,
    /** @type {number[]} */ sky,
    /** @type {number} */ fade,
    wrap = false,
  ) {
    const p = paper(w, h),
      tones = CLOUD.map(c => mix(rgb(c), sky, fade));
    const inside = (/** @type {number} */ x, /** @type {number} */ y) => {
      if (y < 0 || y >= h - 1) return false;
      if (wrap) x = ((x % w) + w) % w;
      else if (x < 0 || x >= w) return false;
      return circles.some(c => {
        const dx = wrap ? Math.min(Math.abs(x - c.x), w - Math.abs(x - c.x)) : x - c.x;
        return dx * dx + (y - c.y) ** 2 <= c.r * c.r;
      });
    };
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!inside(x, y)) continue;
        // How far above the base: the shadow is dithered in over the last few pixels.
        let below = 0;
        while (below < 6 && inside(x, y + below + 1)) below++;
        let tone = 1;
        if (!inside(x - 1, y - 2) || !inside(x, y - 1)) tone = 0;
        else if (below === 0 || !inside(x + 1, y)) tone = 3;
        else if (dither(x, y, (1 - below / 6) * 0.9)) tone = 2;
        p.plot(x, y, tones[tone]);
      }
    return p.done();
  }

  function cumulus(/** @type {number} */ w, /** @type {number[]} */ sky, /** @type {number} */ fade) {
    const h = Math.round(w * 0.55),
      puff = (/** @type {number} */ u, /** @type {number} */ r) => {
        const rr = w * r * between(0.85, 1.15);
        return { x: w * u + between(-0.03, 0.03) * w, y: h - 1 - rr * between(0.55, 0.9), r: rr };
      };
    const circles = [puff(0.5, 0.27), puff(0.3, 0.2), puff(0.7, 0.19), puff(0.14, 0.12), puff(0.86, 0.12)];
    if (rnd() < 0.5) circles.push(puff(between(0.4, 0.65), 0.17));
    return paintCloud(w, h, circles, sky, fade);
  }

  // Small clouds high in the sky, at two depths.
  const SKY_CLOUDS = [
    { w: [14, 24], per: 1.6, speed: 5, y: [0.03, 0.2], fade: 0.5 },
    { w: [26, 42], per: 0.9, speed: 12, y: [0.06, 0.26], fade: 0.2 },
  ];
  function makeClouds() {
    clouds = SKY_CLOUDS.flatMap(layer => {
      const n = Math.max(2, Math.round((W / 100) * layer.per));
      return Array.from({ length: n }, (_, k) => {
        const w = Math.round(between(layer.w[0], layer.w[1])),
          y = Math.round(H * between(layer.y[0], layer.y[1])),
          pic = cumulus(w, skyAt(y + w * 0.25), layer.fade);
        return { pic, x: ((k + rnd() * 0.6) / n) * (W + w) - w, y, speed: layer.speed * between(0.85, 1.15) };
      });
    });
  }

  // A long band of heaped clouds that wraps round, for the bank behind the peaks and the mist at their foot.
  function cloudBand(
    /** @type {number} */ h,
    /** @type {number} */ size,
    /** @type {number} */ fade,
    /** @type {number} */ y,
  ) {
    const w = W + 96,
      circles = [];
    for (let x = 0; x < w; x += size * between(0.5, 0.9)) {
      const r = size * between(0.5, 1);
      circles.push({ x, y: h - 1 - r * between(0.3, 0.8), r });
      if (rnd() < 0.6) {
        const r2 = r * between(0.5, 0.8);
        circles.push({ x: x + between(-0.4, 0.4) * size, y: h - 1 - r - r2 * between(0.2, 0.7), r: r2 });
      }
    }
    return paintCloud(w, h, circles, skyAt(y + h * 0.5), fade, true);
  }

  /* ---------- Mountains ---------- */

  // Sharp icy peaks in two ranges, lit from the upper left. Each peak's surface is a height field: a pyramid along
  // its main ridge plus ridged noise for side ridges and gullies. Its slope toward the light picks one of four
  // tones; snow lies on the high ground and along the ridges. The back range is paler, faded into the sky.
  const ROCK = ['#4a64a8', '#6888c8', '#93b3e4', '#b8d0f2']; // deep shade, shade, lit, bright
  const SNOW = ['#9fb8e6', '#c3d6f4', '#e6f0fb', '#ffffff'];
  const PEAK_RANGES = [
    // summits between these heights (share of the height), gaps between summits (pixels), fade into the sky,
    // the foot of the range (share of the height)
    { top: [0.27, 0.4], gap: [28, 60], fade: 0.45, foot: 0.6 },
    { top: [0.31, 0.47], gap: [50, 100], fade: 0, foot: 0.66 },
  ];

  function paintPeaks() {
    const p = paper(W, H);
    PEAK_RANGES.forEach((range, r) => {
      const foot = H * range.foot,
        rock = ROCK.map(c => mix(rgb(c), skyAt(H * 0.4), range.fade)),
        snow = SNOW.map(c => mix(rgb(c), skyAt(H * 0.4), range.fade));
      const peaks = [];
      for (let x = -rnd() * range.gap[1]; x < W + range.gap[1]; x += between(range.gap[0], range.gap[1]))
        peaks.push({
          x,
          y: H * between(range.top[0], range.top[1]),
          left: between(0.7, 1.2),
          right: between(0.7, 1.2),
          lean: between(-0.25, 0.25),
        });
      const height = (/** @type {typeof peaks[0]} */ pk, /** @type {number} */ x) =>
        pk.y + Math.abs(x - pk.x) * (x < pk.x ? pk.left : pk.right);
      const field = (/** @type {typeof peaks[0]} */ pk, /** @type {number} */ x, /** @type {number} */ y) =>
        -Math.abs(x - (pk.x + (y - pk.y) * pk.lean)) +
        4 * ridged(x / 13 + r * 50, y / 20) +
        1.2 * ridged(x / 5 + r * 50, y / 9);
      for (let x = 0; x < W; x++) {
        const pk = peaks.reduce((a, b) => (height(b, x) < height(a, x) ? b : a)),
          top = Math.round(height(pk, x));
        for (let y = Math.max(0, top); y < foot + H * 0.1; y++) {
          const slope = (field(pk, x - 1, y) - field(pk, x + 1, y)) / 2 + (y === top ? 0.4 : 0),
            tone = slope > 1.1 ? 3 : slope > 0.15 ? 2 : slope > -0.7 ? 1 : 0,
            high = (foot - y) / Math.max(1, foot - pk.y),
            snowy = high + 0.25 * ridged(x / 6 + r * 50, y / 10) > 0.8;
          let c = snowy ? snow[tone] : rock[tone];
          // Haze at the foot, dithered into the sky's color there.
          if (dither(x, y, (y - (foot - H * 0.1)) / (H * 0.1))) c = mix(c, skyAt(y), 0.55);
          p.plot(x, y, c);
        }
      }
    });
    return p.done();
  }

  /* ---------- Forest, trees, grass and earth ---------- */

  const PINE = ['#163d2e', '#245638', '#33733f', '#4e9a4c']; // shade, body, lit, highlight
  const LEAF = ['#265e27', '#3f8a32', '#69b23f', '#9bd654'];
  const BARK = ['#4a2e1a', '#6e4628', '#93633a'];
  /** @typedef {ReturnType<typeof paper>} Paper */

  // A pine: tiers of boughs that widen downward, each tier a jagged triangle. Lit on the left.
  function pine(
    /** @type {Paper} */ p,
    /** @type {number} */ cx,
    /** @type {number} */ base,
    /** @type {number} */ height,
    /** @type {number[][]} */ tones,
  ) {
    const top = base - height,
      trunk = Math.max(2, Math.round(height * 0.12)),
      crown = height - trunk,
      tiers = Math.max(2, Math.round(crown / 7)),
      width = height * 0.26,
      bark = BARK.map(rgb);
    for (let y = Math.round(top); y < base - trunk; y++) {
      const u = (y - top) / crown,
        inTier = (u * tiers) % 1,
        half = Math.max(0.5, width * (0.25 + 0.75 * u) * (0.55 + 0.45 * inTier));
      for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
        const side = (x - cx) / half; // -1 at the left edge, 1 at the right
        let k = side < -0.35 ? 2 : side > 0.3 ? 0 : 1;
        if (side < -0.75 && inTier > 0.5) k = 3; // light catching the bough tips
        if (inTier > 0.85 && side > -0.2) k = 0; // the shadow under each tier
        p.plot(x, y, tones[k]);
      }
    }
    for (let y = Math.round(base - trunk); y < base; y++)
      for (let x = Math.round(cx - 1); x <= Math.round(cx + 1); x++) p.plot(x, y, bark[x < cx ? 2 : x > cx ? 0 : 1]);
  }

  // A leafy tree: a crown of round clumps on a trunk, lit from the upper left, with a leafy texture.
  function leafy(
    /** @type {Paper} */ p,
    /** @type {number} */ cx,
    /** @type {number} */ base,
    /** @type {number} */ size,
  ) {
    const tones = LEAF.map(rgb),
      bark = BARK.map(rgb),
      trunkTop = base - size * 0.45;
    for (let y = Math.round(trunkTop); y < base; y++) {
      const half = 1 + Math.round(((y - trunkTop) / (base - trunkTop)) * size * 0.06) + (y > base - 3 ? 1 : 0);
      for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++)
        p.plot(x, y, bark[x < cx - half / 2 ? 2 : x > cx + half / 3 ? 0 : 1]);
    }
    const crownY = base - size * 0.62,
      clumps = Array.from({ length: 7 }, () => ({
        x: cx + between(-0.38, 0.38) * size,
        y: crownY + between(-0.28, 0.2) * size,
        r: size * between(0.16, 0.26),
      }));
    clumps.push({ x: cx, y: crownY - size * 0.05, r: size * 0.3 });
    const inside = (/** @type {number} */ x, /** @type {number} */ y) =>
      clumps.some(c => (x - c.x) ** 2 + (y - c.y) ** 2 <= c.r * c.r);
    for (let y = Math.round(crownY - size * 0.6); y < crownY + size * 0.5; y++)
      for (let x = Math.round(cx - size * 0.7); x < cx + size * 0.7; x++) {
        if (!inside(x, y)) continue;
        // Light from the upper left: lit where the crown's edge is near on that side.
        const lit = !inside(x - 2, y - 2),
          dark = !inside(x + 2, y + 2),
          leaf = noise(x / 2.2 + 90, y / 2.2) > 0.62;
        let k = lit ? 3 : dark ? 0 : leaf ? 2 : 1;
        if (!lit && !dark && noise(x / 2.2 + 130, y / 2.2) < 0.25) k = 0;
        p.plot(x, y, tones[k]);
      }
  }

  // A row of trees along a wavy line: the hazy far forest or the near pines.
  function forest(
    /** @type {Paper} */ p,
    /** @type {number} */ line,
    /** @type {number} */ size,
    /** @type {number[][]} */ tones,
    /** @type {number} */ step,
  ) {
    // The ground under the row, filled to the bottom with the forest's dark.
    for (let x = 0; x < W; x++)
      for (let y = Math.round(line + Math.sin(x / 23) * 2); y < H; y++)
        p.plot(x, y, tones[y > line + 2 && dither(x, y, 0.5) ? 0 : 1]);
    for (let x = -step; x < W + step; x += step * between(0.6, 1.1))
      pine(p, x, line + between(0, 4) + Math.sin(x / 23) * 2, size * between(0.7, 1.25), tones);
  }

  const GRASS = ['#2f7a2a', '#46a032', '#6cc23e', '#9ee05a'];
  const FLOWERS = ['#ff7ab8', '#ffd84a', '#a77aff', '#ffffff', '#ff5a5a', '#ffa64a'];
  const EARTH = ['#3c2414', '#5e3a20', '#7e5030', '#a06c40'];

  function paintLand() {
    const p = paper(W, H),
      unit = Math.min(W, H); // trees scale with the screen's short side
    // Far forest, hazed blue by the air between.
    const haze = skyAt(H * 0.55);
    forest(
      p,
      H * 0.66,
      unit * 0.13,
      PINE.map(c => mix(rgb(c), haze, 0.55)),
      unit * 0.05,
    );
    // Near forest, with a few leafy trees among the pines.
    forest(p, H * 0.74, unit * 0.2, PINE.map(rgb), unit * 0.07);
    for (let k = 0; k < Math.max(2, W / 70); k++) leafy(p, between(0, W), H * 0.8, unit * between(0.18, 0.26));
    // Tall trees framing the sides: a big pine on the left, a big leafy tree on the right.
    pine(p, W * 0.06, H * 0.86, unit * 0.62, PINE.map(rgb));
    if (W > unit * 1.2) pine(p, W * 0.18, H * 0.86, unit * 0.5, PINE.map(rgb));
    leafy(p, W * 0.93, H * 0.86, unit * 0.48);
    // Bushes along the meadow's back edge.
    for (let x = 0; x < W; x += unit * between(0.06, 0.12)) leafy(p, x, H * 0.86, unit * between(0.07, 0.11));

    // Grass: a band of blades, lit at the tips, with flowers.
    const grassTop = H * 0.84,
      earthTop = H * 0.89,
      grass = GRASS.map(rgb),
      flowers = FLOWERS.map(rgb);
    for (let x = 0; x < W; x++) {
      const top = Math.round(grassTop - between(0, 4));
      for (let y = top; y < earthTop; y++) {
        const u = (y - top) / (earthTop - top);
        p.plot(x, y, grass[y === top ? 3 : u < 0.3 ? 2 : u < 0.7 ? 1 : 0]);
      }
    }
    for (let k = 0; k < W * 0.5; k++) {
      const x = Math.round(between(0, W)),
        y = Math.round(between(grassTop - 2, earthTop - 2)),
        c = flowers[Math.floor(rnd() * flowers.length)];
      p.plot(x, y, c);
      if (rnd() < 0.5) {
        p.plot(x + 1, y, c);
        p.plot(x, y + 1, grass[0]);
      }
    }
    // Earth: a lip of grass hanging over a cut of soil with stones, darker toward the bottom.
    const earth = EARTH.map(rgb),
      stone = [rgb('#8a8478'), rgb('#b2aa9a')];
    for (let x = 0; x < W; x++) {
      const lip = Math.round(earthTop + 1 + (noise(x / 3, 7) > 0.5 ? 1 : 0) + (noise(x / 9, 3) > 0.7 ? 2 : 0));
      for (let y = Math.round(earthTop); y < H; y++) {
        if (y <= lip) {
          p.plot(x, y, grass[y === lip ? 0 : 1]);
          continue;
        }
        const u = (y - lip) / (H - lip);
        let k = u < 0.12 ? 3 : u < 0.45 ? 2 : u < 0.8 ? 1 : 0;
        if (k > 0 && dither(x, y, (u * 3) % 1) && noise(x / 4, y / 4) > 0.5) k--;
        p.plot(x, y, earth[k]);
      }
    }
    for (let k = 0; k < W / 6; k++) {
      const x = Math.round(between(0, W)),
        y = Math.round(between(earthTop + 4, H - 2)),
        w = Math.round(between(1, 3));
      for (let i = 0; i <= w; i++) {
        p.plot(x + i, y, stone[i === 0 ? 1 : 0]);
        if (w > 1) p.plot(x + i, y + 1, stone[0]);
      }
    }
    return p.done();
  }

  /* ---------- Running ---------- */

  function build() {
    const vw = innerWidth,
      vh = innerHeight,
      px = Math.max(3, Math.round(Math.min(vw, vh * 0.55) / 160));
    W = Math.ceil(vw / px);
    H = Math.ceil(vh / px);
    canvas.width = W;
    canvas.height = H;
    g.imageSmoothingEnabled = false;
    seed = 5;
    lattice = Float32Array.from({ length: 128 * 128 }, rnd);
    skyLayer = paintSky();
    peakLayer = paintPeaks();
    landLayer = paintLand();
    makeClouds();
    const bankH = Math.round(H * 0.16),
      mistH = Math.round(H * 0.07);
    bands = [
      { pic: cloudBand(bankH, H * 0.07, 0.15, H * 0.3), y: Math.round(H * 0.46 - bankH), speed: 3 },
      { pic: cloudBand(mistH, H * 0.035, 0.1, H * 0.62), y: Math.round(H * 0.66 - mistH), speed: 7 },
    ];
  }

  function drawBand(/** @type {{ pic: HTMLCanvasElement, y: number, speed: number }} */ b) {
    const w = b.pic.width,
      x = -((t * b.speed) % w);
    g.drawImage(b.pic, Math.round(x), b.y);
    g.drawImage(b.pic, Math.round(x + w), b.y);
  }

  function draw() {
    g.drawImage(skyLayer, 0, 0);
    for (const c of clouds) {
      const w = c.pic.width,
        span = W + w,
        x = ((((c.x + t * c.speed) % span) + span) % span) - w;
      g.drawImage(c.pic, Math.round(x), c.y);
    }
    drawBand(bands[0]);
    g.drawImage(peakLayer, 0, 0);
    drawBand(bands[1]);
    g.drawImage(landLayer, 0, 0);
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
