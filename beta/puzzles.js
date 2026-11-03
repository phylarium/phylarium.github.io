'use strict';

// The puzzle screens: each ultra-research and each molecule is gained by solving one (research.yaml `puzzle`).
// A puzzle draws itself into `root` and calls `solved()` when done; game.js opens and closes the screen
// (openPuzzle, solvePuzzle). This file loads before game.js and only reads the game's state when played.

// Ultra puzzles (research.yaml `puzzle`): solving one gains the ultra at once. Wrong moves just don't stick.
const PUZZLES = {
  spectrum: spectrumPuzzle,
  fieldlines: fieldPuzzle,
  reaction: reactionPuzzle,
  orbits: orbitPuzzle,
  lightbay: bayPuzzle,
  basepair: basePuzzle,
  soillayers: soilPuzzle,
  sediments: sedimentPuzzle,
  pollinate: pollinatePuzzle,
  coasts: coastsPuzzle,
  radiant: radiantPuzzle,
  galaxy: galaxyPuzzle,
};

// Aurora: turn the tiles so a field line runs from where the solar wind comes in (left) to the pole (top).
// Tap a tile to turn it a quarter. The line lights green as far as it reaches.
const FIELD_N = 5,
  FIELD_IN = [2, 0],
  FIELD_OUT = [0, 2];
const turnTile = m => ((m << 1) | (m >> 3)) & 15; // N=1 E=2 S=4 W=8, turned clockwise
/** @type {Record<string, number[]>} */
const STEP = { 1: [-1, 0, 4], 2: [0, 1, 8], 4: [1, 0, 1], 8: [0, -1, 2] }; // direction bit: row, column, bit back

function fieldPath() {
  // A random walk from the entry to the exit that never crosses itself.
  const seen = new Set(),
    path = [];
  const walk = (r, c) => {
    if (r < 0 || c < 0 || r >= FIELD_N || c >= FIELD_N || seen.has(r * FIELD_N + c)) return false;
    seen.add(r * FIELD_N + c);
    path.push([r, c]);
    if (r === FIELD_OUT[0] && c === FIELD_OUT[1]) return true;
    for (const d of [1, 2, 4, 8].sort(() => Math.random() - 0.5)) if (walk(r + STEP[d][0], c + STEP[d][1])) return true;
    path.pop();
    return false;
  };
  walk(...FIELD_IN);
  return path;
}

function fieldPuzzle(root, solved) {
  const tiles = [],
    path = fieldPath();
  for (let i = 0; i < FIELD_N * FIELD_N; i++) tiles.push(Math.random() < 0.5 ? 5 : 3); // straight or corner
  path.forEach(([r, c], k) => {
    const dirTo = ([r2, c2]) => Number(Object.keys(STEP).find(d => STEP[d][0] === r2 - r && STEP[d][1] === c2 - c));
    const back = k === 0 ? 8 : dirTo(path[k - 1]),
      out = k === path.length - 1 ? 1 : dirTo(path[k + 1]);
    tiles[r * FIELD_N + c] = back | out;
  });
  for (let i = 0; i < tiles.length; i++)
    for (let k = Math.floor(Math.random() * 4); k > 0; k--) tiles[i] = turnTile(tiles[i]);
  // Follow the line from the entry; returns the lit cells and whether it reaches the pole.
  const trace = () => {
    const lit = new Set();
    let [r, c] = FIELD_IN,
      from = 8;
    while (
      r >= 0 &&
      c >= 0 &&
      r < FIELD_N &&
      c < FIELD_N &&
      tiles[r * FIELD_N + c] & from &&
      !lit.has(r * FIELD_N + c)
    ) {
      lit.add(r * FIELD_N + c);
      const out = tiles[r * FIELD_N + c] & ~from;
      if (r === FIELD_OUT[0] && c === FIELD_OUT[1] && out & 1) return { lit, done: true };
      [r, c, from] = [r + STEP[out][0], c + STEP[out][1], STEP[out][2]];
    }
    return { lit, done: false };
  };
  const seg = { 1: 'M5 5V0', 2: 'M5 5H10', 4: 'M5 5V10', 8: 'M5 5H0' };
  const draw = () => {
    const { lit, done } = trace();
    root.querySelectorAll('.field-tile').forEach((t, i) => {
      t.innerHTML = `<svg viewBox="0 0 10 10"><path d="${[1, 2, 4, 8]
        .filter(d => tiles[i] & d)
        .map(d => seg[d])
        .join(' ')}"/></svg>`;
      t.classList.toggle('lit', lit.has(i));
    });
    if (done && !root.dataset.done) {
      root.dataset.done = '1';
      root.querySelector('.field').classList.add('solved');
      solved();
    }
  };
  root.innerHTML = `<div class="field-wrap"><div class="field-pole" style="--col:${FIELD_OUT[1]}"></div>
    <div class="field-wind" style="--row:${FIELD_IN[0]}"></div>
    <div class="field">${tiles.map(() => '<button class="field-tile"></button>').join('')}</div></div>`;
  root.querySelectorAll('.field-tile').forEach((t, i) =>
    t.addEventListener('click', () => {
      if (root.dataset.done) return;
      tiles[i] = turnTile(tiles[i]);
      draw();
    }),
  );
  draw();
}

// Eclipse: the moon's orbit is tilted, so it crosses the planet's path round the sun at only two points, the
// nodes (the white marks). A solar eclipse needs the moon on a node, right between planet and sun. Tap the planet
// to move it along its year (12 steps), and the moon to move it round the planet (8 steps).
function orbitPuzzle(root, solved) {
  const node = Math.random() < 0.5 ? 0 : 90; // direction of the node line, in degrees
  let planet = 30 * Math.floor(Math.random() * 12),
    moon = 45 * Math.floor(Math.random() * 8);
  const at = (cx, cy, r, deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  const lined = () => {
    const toSun = (planet + 180) % 360;
    return moon === toSun && toSun % 180 === node;
  };
  const draw = () => {
    const [px, py] = at(150, 150, 105, planet),
      [mx, my] = at(px, py, 30, moon),
      done = lined();
    const nodes = [node, node + 180].map(d => at(px, py, 30, d));
    root.querySelector('svg').innerHTML = `
      <circle cx="150" cy="150" r="105" class="orbit"/>
      ${done ? `<path d="M ${px} ${py} L ${150} ${150}" class="shadow"/>` : ''}
      <circle cx="150" cy="150" r="17" class="sun"/>
      <circle cx="${px}" cy="${py}" r="30" class="moon-orbit"/>
      ${nodes.map(([x, y]) => `<rect x="${x - 3}" y="${y - 3}" width="6" height="6" class="node"/>`).join('')}
      <circle cx="${px}" cy="${py}" r="10" class="planet"/>
      <circle cx="${mx}" cy="${my}" r="6" class="moon${done ? ' dark' : ''}"/>
      <circle cx="${px}" cy="${py}" r="20" class="hit" data-hit="planet"/>
      <circle cx="${mx}" cy="${my}" r="13" class="hit" data-hit="moon"/>`;
    if (done && !root.dataset.done) {
      root.dataset.done = '1';
      solved();
    }
  };
  root.innerHTML = '<svg class="orbits" viewBox="0 0 300 300"></svg>';
  root.querySelector('svg').addEventListener('click', e => {
    const hit = e.target.dataset?.hit;
    if (root.dataset.done || !hit) return;
    if (hit === 'planet') planet = (planet + 30) % 360;
    else moon = (moon + 45) % 360;
    draw();
  });
  draw();
}

// Bioluminescence: the bay flashes a pattern of glowing plankton; tap them back in the same order. A wrong tap
// just plays the pattern again.
function bayPuzzle(root, solved) {
  const spots = [
    [60, 70],
    [140, 50],
    [230, 75],
    [90, 140],
    [180, 130],
    [250, 160],
  ];
  const seq = Array.from({ length: 4 }, () => Math.floor(Math.random() * spots.length));
  let step = 0,
    busy = true;
  root.innerHTML = `<svg class="bay" viewBox="0 0 300 200"><path class="shore" d="M0 190 Q 80 175 150 185 T 300 180 V 200 H 0 Z"/>
    ${spots.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="16" class="glow" data-i="${i}"/>`).join('')}</svg>`;
  root.dataset.seq = seq.join();
  const dots = [...root.querySelectorAll('.glow')];
  const flash = (i, ms = 450) => {
    dots[i].classList.add('on');
    setTimeout(() => dots[i].classList.remove('on'), ms);
  };
  const play = () => {
    busy = true;
    step = 0;
    seq.forEach((i, k) => setTimeout(() => flash(i), 700 + k * 650));
    setTimeout(() => (busy = false), 700 + seq.length * 650);
  };
  dots.forEach((d, i) =>
    d.addEventListener('click', () => {
      if (busy || root.dataset.done) return;
      flash(i, 250);
      if (i !== seq[step]) {
        dots.forEach(o => o.classList.add('wrong'));
        setTimeout(() => dots.forEach(o => o.classList.remove('wrong')), 400);
        setTimeout(play, 600);
        return;
      }
      if (++step === seq.length) {
        root.dataset.done = '1';
        dots.forEach(o => o.classList.add('on'));
        solved();
      }
    }),
  );
  play();
}

// DNA: finish the second strand. A pairs with T, C with G; a wrong base doesn't stick.
const BASE_PAIR = { A: 'T', T: 'A', C: 'G', G: 'C' };
const BASE_COLOR = { A: '#ff5a4a', T: '#ffd23f', C: '#5a8aff', G: '#6ee07a' };
function basePuzzle(root, solved) {
  const strand = Array.from({ length: 8 }, () => 'ATCG'[Math.floor(Math.random() * 4)]),
    done = [];
  const cell = (b, cls = '') =>
    `<span class="base ${cls}" style="${b ? `background:${BASE_COLOR[b]}` : ''}">${b || ''}</span>`;
  const draw = () => {
    root.querySelector('.strands').innerHTML = `<div class="strand">${strand.map(b => cell(b)).join('')}</div>
      <div class="rungs">${strand.map((_, i) => `<i class="${i < done.length ? 'on' : ''}"></i>`).join('')}</div>
      <div class="strand">${strand.map((_, i) => cell(done[i], i === done.length ? 'next' : '')).join('')}</div>`;
  };
  root.innerHTML = `<div class="strands"></div><div class="tray">${'ATCG'
    .split('')
    .map(b => `<button class="tile" data-b="${b}" style="color:${BASE_COLOR[b]}">${b}</button>`)
    .join('')}</div>`;
  root.querySelectorAll('.tile').forEach(t =>
    t.addEventListener('click', () => {
      if (root.dataset.done) return;
      if (BASE_PAIR[strand[done.length]] !== t.dataset.b) {
        root.querySelector('.base.next')?.classList.add('wrong');
        setTimeout(() => root.querySelector('.base.next')?.classList.remove('wrong'), 500);
        return;
      }
      done.push(t.dataset.b);
      draw();
      if (done.length === strand.length) {
        root.dataset.done = '1';
        root.querySelector('.strands').classList.add('solved');
        solved();
      }
    }),
  );
  draw();
}

// Put things in their order, one slot at a time from the top; a tile that doesn't come next won't stick.
function orderPuzzle(root, solved, items, top, bottom) {
  const placed = [];
  const tray = items.map((_, i) => i).sort(() => Math.random() - 0.5);
  const draw = () => {
    root.querySelector('.stack').innerHTML = `<p class="end">${top}</p>${items
      .map(
        (it, i) =>
          `<div class="layer${i < placed.length ? ' on' : ''}" style="${i < placed.length ? `background:${Hues.css(it.color)}` : ''}">${i < placed.length ? it.name : ''}</div>`,
      )
      .join('')}<p class="end">${bottom}</p>`;
    root.querySelectorAll('.tray .tile').forEach(t => t.classList.toggle('used', placed.includes(+t.dataset.i)));
  };
  root.innerHTML = `<div class="stack"></div><div class="tray">${tray.map(i => `<button class="tile" data-i="${i}" style="border-color:${Hues.css(items[i].color)}">${items[i].name}</button>`).join('')}</div>`;
  root.querySelectorAll('.tray .tile').forEach(t =>
    t.addEventListener('click', () => {
      if (root.dataset.done || placed.includes(+t.dataset.i)) return;
      if (+t.dataset.i !== placed.length) {
        t.classList.add('wrong');
        setTimeout(() => t.classList.remove('wrong'), 500);
        return;
      }
      placed.push(+t.dataset.i);
      draw();
      if (placed.length === items.length) {
        root.dataset.done = '1';
        root.querySelector('.stack').classList.add('solved');
        solved();
      }
    }),
  );
  draw();
}

// Rich Soil: the layers of a soil, from the surface down.
function soilPuzzle(root, solved) {
  orderPuzzle(
    root,
    solved,
    [
      { name: 'Humus', color: '#3a2a1a' },
      { name: 'Topsoil', color: '#6a4a2a' },
      { name: 'Subsoil', color: '#9a7a4a' },
      { name: 'Bedrock', color: '#6a6a72' },
    ],
    'surface',
    'deep',
  );
}

// Fertile Delta: a river drops its load as it slows, the coarsest first.
function sedimentPuzzle(root, solved) {
  orderPuzzle(
    root,
    solved,
    [
      { name: 'Boulders', color: '#6a6a72' },
      { name: 'Gravel', color: '#8a8478' },
      { name: 'Sand', color: '#d8b870' },
      { name: 'Silt', color: '#a88a5a' },
      { name: 'Clay', color: '#c87a5a' },
    ],
    'mountain',
    'sea',
  );
}

// Superbloom: match each flower to the animal that pollinates it. Tap a flower, then its pollinator.
function pollinatePuzzle(root, solved) {
  pairsPuzzle(
    root,
    solved,
    COLLECTION_BY_ID.flowers.items.map(f => ({ a: f.name, b: f.sign, color: Hues.css(f.color) })),
  );
}

// Continental Drift: what lies on one side of an ocean has its match on the other, as Wegener saw. Tap a find,
// then the place across the sea where it fits.
function coastsPuzzle(root, solved) {
  pairsPuzzle(root, solved, [
    { a: "Brazil's bulge", b: 'Gulf of Guinea' },
    { a: 'Appalachian Mountains', b: 'Scottish Highlands' },
    { a: 'Mesosaurus fossils in Brazil', b: 'South Africa' },
    { a: "Madagascar's east coast", b: "India's west coast" },
    { a: "Arabia's Red Sea shore", b: "Africa's Red Sea shore" },
  ]);
}

// Match each left tile to its partner on the right (shuffled). Tap a left tile, then its partner; a wrong partner
// shakes. `pairs`: [{a, b, color?}].
function pairsPuzzle(root, solved, pairs) {
  const right = pairs.map(p => p.b).sort(() => Math.random() - 0.5);
  const matched = new Set();
  /** @type {number | null} */
  let pick = null;
  root.innerHTML = `<div class="pairs"><div class="col">${pairs.map((p, k) => `<button class="tile pair-a" data-k="${k}"${p.color ? ` style="border-color:${p.color}"` : ''}>${p.a}</button>`).join('')}</div>
    <div class="col">${right.map(b => `<button class="tile pair-b" data-b="${b}">${b}</button>`).join('')}</div></div>`;
  const paint = () => {
    root.querySelectorAll('.pair-a').forEach(t => {
      const b = /** @type {HTMLElement} */ (t);
      b.classList.toggle('picked', Number(b.dataset.k) === pick);
      b.classList.toggle('on', matched.has(Number(b.dataset.k)));
    });
    root.querySelectorAll('.pair-b').forEach(t => {
      const b = /** @type {HTMLElement} */ (t);
      b.classList.toggle(
        'on',
        pairs.some((p, k) => matched.has(k) && p.b === b.dataset.b),
      );
    });
  };
  root.querySelectorAll('.pair-a').forEach(t => {
    const b = /** @type {HTMLElement} */ (t);
    b.addEventListener('click', () => {
      if (!matched.has(Number(b.dataset.k))) pick = Number(b.dataset.k);
      paint();
    });
  });
  root.querySelectorAll('.pair-b').forEach(t => {
    const b = /** @type {HTMLElement} */ (t);
    b.addEventListener('click', () => {
      if (pick === null || root.dataset.done) return;
      if (pairs[pick].b !== b.dataset.b) {
        b.classList.add('wrong');
        setTimeout(() => b.classList.remove('wrong'), 500);
        return;
      }
      matched.add(pick);
      pick = null;
      paint();
      if (matched.size === pairs.length) {
        root.dataset.done = '1';
        solved();
      }
    });
  });
}

// Meteor Shower: the trails of a shower all point back to one spot in the sky, the radiant. Tap it.
function radiantPuzzle(root, solved) {
  const grid = [50, 100, 150, 200, 250],
    rx = grid[1 + Math.floor(Math.random() * 3)],
    ry = grid[1 + Math.floor(Math.random() * 3)];
  const trails = Array.from({ length: 6 }, (_, k) => {
    const a = (k / 6) * Math.PI * 2 + Math.random() * 0.6,
      d1 = 45 + Math.random() * 25,
      d2 = d1 + 25 + Math.random() * 20;
    return [rx + Math.cos(a) * d1, ry + Math.sin(a) * d1, rx + Math.cos(a) * d2, ry + Math.sin(a) * d2];
  });
  const svg =
    extra => `${trails.map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="trail"/><circle cx="${x2}" cy="${y2}" r="2" class="head"/>`).join('')}
    ${extra}${grid.flatMap(x => grid.map(y => `<circle cx="${x}" cy="${y}" r="5" class="dot"/><circle cx="${x}" cy="${y}" r="22" class="dot-hit" data-x="${x}" data-y="${y}"/>`)).join('')}`;
  root.innerHTML = `<svg class="sky-puzzle" viewBox="0 0 300 300">${svg('')}</svg>`;
  root.querySelector('svg').addEventListener('click', e => {
    const d = e.target.dataset;
    if (!d?.x || root.dataset.done) return;
    if (+d.x !== rx || +d.y !== ry) {
      const dot = e.target.previousElementSibling;
      dot.classList.add('wrong');
      setTimeout(() => dot.classList.remove('wrong'), 500);
      return;
    }
    root.dataset.done = '1';
    root.querySelector('svg').innerHTML = svg(
      trails.map(([, , x2, y2]) => `<line x1="${rx}" y1="${ry}" x2="${x2}" y2="${y2}" class="back"/>`).join(''),
    );
    solved();
  });
}

// Milky Way: the galaxy seen from above, a bulge and two great spiral arms with a small spur between them.
// Tap where the sun is: on the small spur (the Orion Spur), about halfway out from the centre.
function galaxyPuzzle(root, solved) {
  const C = 150,
    turn = Math.random() * Math.PI * 2;
  const at = (r, a) => [C + r * Math.cos(a + turn), C + r * Math.sin(a + turn)];
  // A logarithmic spiral arm: stars along it, with a little scatter.
  const arm = (base, r0, r1, n) =>
    Array.from({ length: n }, (_, k) => {
      const r = r0 + ((r1 - r0) * k) / (n - 1),
        a = base + Math.log(r / 12) * 1.6;
      return at(r + (Math.random() - 0.5) * 8, a + (Math.random() - 0.5) * 0.12);
    });
  const armA = arm(0, 14, 135, 110),
    armB = arm(Math.PI, 14, 135, 110),
    spur = arm(Math.PI / 2, 50, 100, 34);
  const spurAngle = r => Math.PI / 2 + Math.log(r / 12) * 1.6,
    mainAngle = (base, r) => base + Math.log(r / 12) * 1.6;
  const sun = at(75, spurAngle(75));
  const choices = [
    sun,
    at(0, 0),
    at(40, mainAngle(0, 40)),
    at(125, mainAngle(Math.PI, 125)),
    at(75, mainAngle(0, 75) + Math.PI / 2 + 0.6),
    at(148, 1.3),
  ];
  const stars =
    [...armA, ...armB]
      .map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.6" class="gstar"/>`)
      .join('') +
    spur.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.3" class="gstar"/>`).join('');
  const dots = extra =>
    choices
      .map(
        ([x, y], k) =>
          `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" class="dot"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="16" class="dot-hit" data-k="${k}"/>`,
      )
      .join('') + extra;
  const svg = extra => `<circle cx="${C}" cy="${C}" r="16" class="bulge"/>${stars}${dots(extra)}`;
  root.innerHTML = `<svg class="sky-puzzle" viewBox="0 0 300 300">${svg('')}</svg>`;
  root.querySelector('svg').addEventListener('click', e => {
    const k = e.target.dataset?.k;
    if (k === undefined || root.dataset.done) return;
    if (+k !== 0) {
      const dot = e.target.previousElementSibling;
      dot.classList.add('wrong');
      setTimeout(() => dot.classList.remove('wrong'), 500);
      return;
    }
    root.dataset.done = '1';
    root.querySelector('svg').innerHTML = svg(
      `<circle cx="${sun[0].toFixed(1)}" cy="${sun[1].toFixed(1)}" r="3" class="sun"/>`,
    );
    solved();
  });
}

// Molecules, played like Wordle: fill the slots from the tray of atoms found and molecules known, then try.
// Order does not matter in a reaction, so each tile is marked by amount: green, in the reaction in the right
// amount; yellow, in it but in the wrong amount; grey, not in it (it greys out in the tray too). Three tries
// per molecule per game day; the rows of today's tries stay when the puzzle is closed and opened again.
const REACTION_TRIES = 3;
// Atoms that take part in some reaction (worked out once, when first needed: this file loads before game.js).
/** @type {Set<string> | null} */
let reactionAtoms = null;
const REACTION_ATOMS = () =>
  (reactionAtoms ||= new Set(RESEARCH.flatMap(u => u.reaction || []).filter(t => !RESEARCH_BY_ID[t])));
const gameDay = () => Math.floor((state.time || 0) / DAY_S);
const tokenName = t => (RESEARCH_BY_ID[t] ? RESEARCH_BY_ID[t].name : t);
function judge(guess, need) {
  const count = (list, t) => list.filter(x => x === t).length;
  return guess.map(t => (!need.includes(t) ? 'grey' : count(guess, t) === count(need, t) ? 'green' : 'yellow'));
}
function reactionPuzzle(root, solved, item) {
  const need = item.reaction,
    slots = need.map(() => null);
  const log = (state.tries[item.id] ||= { day: gameDay(), rows: [] });
  if (log.day !== gameDay()) Object.assign(log, { day: gameDay(), rows: [] });
  // The tray: found atoms that take part in reactions, and every molecule known.
  const tray = [
    ...state.atoms.filter(a => REACTION_ATOMS().has(a)),
    ...RESEARCH.filter(u => u.tab === 'molecules' && has(u.id)).map(u => u.id),
  ];
  const slotRow = (tokens, marks = []) =>
    tokens
      .map(
        (t, k) =>
          `<span class="slot ${marks[k] || ''}${t ? ' filled' : ''}" data-k="${k}">${t ? tokenName(t) : ''}</span>${k < tokens.length - 1 ? '<b>+</b>' : ''}`,
      )
      .join('');
  const draw = () => {
    const out = log.rows.length >= REACTION_TRIES && !root.dataset.done;
    const grey = new Set(log.rows.flatMap(r => r.filter(t => !need.includes(t))));
    const best = t =>
      log.rows.some(r => r.includes(t) && judge(r, need)[r.indexOf(t)] === 'green')
        ? 'green'
        : log.rows.some(r => r.includes(t) && need.includes(t))
          ? 'yellow'
          : '';
    root.innerHTML = `${log.rows.map(r => `<div class="reaction past">${slotRow(r, judge(r, need))}<b>→</b><span class="product">${item.name}</span></div>`).join('')}
      ${out ? '<p class="note tries-out">Try again tomorrow.</p>' : `<div class="reaction now">${slotRow(slots)}<b>→</b><span class="product">${item.makes > 1 ? item.makes + ' ' : ''}${item.name}</span></div>`}
      <p class="tries">${Array.from({ length: REACTION_TRIES }, (_, k) => `<i class="${k < log.rows.length ? 'used' : ''}"></i>`).join('')}</p>
      <div class="tray">${tray.map(t => `<button class="tile ${grey.has(t) ? 'grey' : best(t)}" data-t="${t}"${out || grey.has(t) ? ' disabled' : ''}>${tokenName(t)}</button>`).join('')}</div>`;
    root.querySelectorAll('.now .slot').forEach(b =>
      b.addEventListener('click', () => {
        slots[+b.dataset.k] = null;
        draw();
      }),
    );
    root.querySelectorAll('.tray .tile').forEach(b =>
      b.addEventListener('click', () => {
        const k = slots.indexOf(null);
        if (k < 0 || root.dataset.done || out) return;
        slots[k] = b.dataset.t;
        if (!slots.includes(null)) return attempt();
        draw();
      }),
    );
  };
  const attempt = () => {
    if ([...slots].sort().join() === [...need].sort().join()) {
      root.dataset.done = '1';
      log.rows = [];
      draw();
      root.querySelector('.now').classList.add('solved');
      root.querySelectorAll('.now .slot').forEach(s => s.classList.add('green'));
      solved();
      return;
    }
    log.rows.push([...slots]);
    slots.fill(null);
    draw();
  };
  draw();
}

// Rainbow: put the six colors on the arcs in the order of the spectrum, red outside to violet inside.
const SPECTRUM = ['#d83a2a', '#ff8a1a', '#ffd23f', '#4aa84a', '#3a6ad8', '#b07aff'];
function spectrumPuzzle(root, solved) {
  const placed = Array(6).fill(null);
  /** @type {number | null} */
  let pick = null;
  const order = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
  root.innerHTML = `<svg class="bow" viewBox="0 0 120 66">${SPECTRUM.map((_, k) => {
    const r = 50 - k * 7;
    return `<path data-band="${k}" d="M ${60 - r} 63 A ${r} ${r} 0 0 1 ${60 + r} 63"/>`;
  }).join('')}</svg>
    <div class="swatches">${order.map(i => `<button class="swatch" data-c="${i}" style="background:${SPECTRUM[i]}" aria-label="${['red', 'orange', 'yellow', 'green', 'blue', 'violet'][i]}"></button>`).join('')}</div>`;
  const bands = [...root.querySelectorAll('path')],
    swatches = [...root.querySelectorAll('.swatch')];
  const paint = () => {
    bands.forEach((b, k) => (b.style.stroke = placed[k] === null ? '' : SPECTRUM[placed[k]]));
    swatches.forEach(w => {
      w.classList.toggle('used', placed.includes(+w.dataset.c));
      w.classList.toggle('picked', pick === +w.dataset.c);
    });
  };
  swatches.forEach(w =>
    w.addEventListener('click', () => {
      pick = pick === +w.dataset.c ? null : +w.dataset.c;
      paint();
    }),
  );
  bands.forEach((b, k) =>
    b.addEventListener('click', () => {
      if (root.dataset.done) return;
      if (pick === null) placed[k] = null;
      else {
        placed[k] = pick;
        pick = null;
      }
      paint();
      if (placed.includes(null)) return;
      if (placed.every((c, i) => c === i)) {
        root.querySelector('.bow').classList.add('solved');
        root.dataset.done = '1';
        solved();
        return;
      }
      const wrong = bands.filter((_, i) => placed[i] !== i);
      wrong.forEach(w => w.classList.add('wrong'));
      setTimeout(() => {
        wrong.forEach(w => {
          w.classList.remove('wrong');
          placed[bands.indexOf(w)] = null;
        });
        paint();
      }, 700);
    }),
  );
}
