'use strict';

// Stories, minigames, collections and the phenomena ultras bring (rainbows, auroras, eclipses, glowing seas,
// superblooms, meteor showers). Loads after game.js, which holds the state and the climate model; the puzzle
// screens themselves are in puzzles.js.

/* ================= Stories ================= */

// A story opens with its minigame's first win. A big splash names it the first time, and the Stories page
// lists every story: open ones with what has been done of them, the rest as blanks.
const storyOpen = st => (!!st.minigame && gameWon(st.minigame)) || st.chapters.some(has);
// A story's steps: its chapters, its disaster (if it has one) and its ultra.
const storyItems = st =>
  [...st.chapters, st.disaster, st.ultra]
    .filter(Boolean)
    .map(id => ({ id, name: RESEARCH_BY_ID[id].name, done: () => has(id) }));
const storyDone = st => storyItems(st).filter(it => it.done());
const storyComplete = st => storyItems(st).every(it => it.done());
// A story opening or completed shows a splash, one at a time, covering the screen until closed.
// oxlint-disable-next-line prefer-const -- the smoke test empties it by assignment
let splashQueue = [];
const SPLASH_S = 15;
// A story splash shows at once.
function queueSplash(s) {
  s.at ??= performance.now();
  const last = s.merge && splashQueue.findLast(q => q.merge === s.merge);
  if (last) {
    last.title += `, ${s.title}`;
    last.sub = [last.sub, s.sub].filter(Boolean).join('  ');
  } else splashQueue.push(s);
}
// A discovery gets no splash: its card in the book carries a "new" badge until it is tapped there.
const markNew = key => state.unseen.includes(key) || state.unseen.push(key);
const isNew = key => state.unseen.includes(key);
function seenNow(key) {
  state.unseen = state.unseen.filter(k => k !== key);
  updateDots();
}
const newClass = key => (isNew(key) ? ' new' : '');

function storyTick() {
  if (state.quietStories) {
    state.storiesSeen = STORIES.filter(storyOpen).map(st => st.id);
    delete state.quietStories;
  }
  if (state.quietDone) {
    state.storiesDone = STORIES.filter(storyComplete).map(st => st.id);
    delete state.quietDone;
  }
  if (!state.banged) return;
  for (const st of STORIES) {
    if (state.storiesSeen.includes(st.id) || !storyOpen(st)) continue;
    state.storiesSeen.push(st.id);
    queueSplash({
      kicker: 'A new story',
      title: st.name,
      sub: `${storyDone(st).length} of ${storyItems(st).length}`,
    });
  }
  // A story is completed once its chapters, disaster and ultra are all done.
  for (const st of STORIES) {
    if (state.storiesDone.includes(st.id) || !storyComplete(st)) continue;
    state.storiesDone.push(st.id);
    queueSplash({
      kicker: 'Story completed',
      title: st.name,
      sub: `${storyItems(st).length} of ${storyItems(st).length}`,
      done: true,
    });
  }
  nextSplash();
}

// Story splashes show one after another.
function nextSplash() {
  if (splashQueue.length && $('#splash').classList.contains('hidden') && performance.now() >= splashQueue[0].at)
    showSplash(splashQueue.shift());
}

let splashTimer = 0;
function showSplash(s) {
  $('#splash-kicker').textContent = s.kicker;
  $('#splash-title').textContent = s.title;
  $('#splash-count').textContent = s.sub;
  $('#splash').classList.toggle('completed', !!s.done);
  $('#splash').classList.remove('hidden');
  buzz(s.discovery ? [20, 30, 20] : [30, 30, 60]);
  // Every splash fills the screen until its Close button is tapped (or 15 s pass), so a player busy tapping
  // (catching stars, cracking ice) does not miss it or close it by accident.
  clearTimeout(splashTimer);
  splashTimer = setTimeout(hideSplash, SPLASH_S * 1000);
}
function hideSplash() {
  $('#splash').classList.add('hidden');
  setTimeout(nextSplash, 250);
  // The end of the opening: after the lone star's story splash the book appears for the first time (its button
  // shows), with Starlight to research.
  if (state.banged && !state.opened && gameWon('twinkle')) {
    state.opened = true;
    save();
  }
}

function renderStories(force) {
  const root = $('#stories'),
    key = STORIES.map(st =>
      storyOpen(st)
        ? storyDone(st)
            .map(it => it.id)
            .join('.')
        : '?',
    ).join('|');
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  root.innerHTML = STORIES.map(st => {
    if (!storyOpen(st)) return '<div class="story-entry unknown"><h4>?</h4></div>';
    const items = storyItems(st),
      done = storyDone(st);
    // A story on posters is done there: here it shows its progress and a way to each of its posters.
    if (st.posters)
      return `<div class="story-entry"><h4>${st.name}<span>${done.length} of ${items.length}</span></h4>${st.posters
        .map(
          pst => `<button class="poster-link" data-section="${pst.section}">${SECTIONS[pst.section].name} ›</button>`,
        )
        .join('')}</div>`;
    return `<div class="story-entry"><h4>${st.name}<span>${done.length} of ${items.length}</span></h4>${storyTreeHtml(st)}</div>`;
  }).join('');
  root
    .querySelectorAll('.poster-link')
    .forEach(b => b.addEventListener('click', () => openTab(/** @type {HTMLElement} */ (b).dataset.section || '')));
  root
    .querySelectorAll('.tree-node[data-tab]')
    .forEach(n => n.addEventListener('click', () => openTab(/** @type {HTMLElement} */ (n).dataset.tab)));
}

// A story's research as a tree: each node under the research it grows from, top to bottom. Done research
// shows its icon and name, research that can be done now its name, the rest a padlock and ???.
const TREE_ROW = 70,
  TREE_COL = 76;
function storyParents(st) {
  const ids = storyItems(st).map(it => it.id),
    own = new Set(ids);
  // The nearest research of this story that each one grows from, looking back through what it requires.
  const parentsOf = id => {
    const found = new Set(),
      seen = new Set(),
      queue = [...(RESEARCH_BY_ID[id].requires || [])];
    while (queue.length) {
      const p = queue.shift();
      if (seen.has(p)) continue;
      seen.add(p);
      if (own.has(p)) found.add(p);
      else queue.push(...(RESEARCH_BY_ID[p]?.requires || []));
    }
    return [...found];
  };
  return Object.fromEntries(ids.map(id => [id, parentsOf(id)]));
}
function storyTreeHtml(st) {
  const ids = storyItems(st).map(it => it.id),
    parents = storyParents(st),
    depth = {};
  for (const id of ids) depth[id] = Math.max(-1, ...parents[id].map(p => depth[p] ?? 0)) + 1;
  const rows = [];
  for (const id of ids) (rows[depth[id]] ||= []).push(id);
  const width = Math.max(...rows.map(r => r.length)) * TREE_COL,
    at = {};
  rows.forEach((row, y) =>
    row.forEach((id, k) => (at[id] = { x: (width * (k + 0.5)) / row.length, y: y * TREE_ROW + 24 })),
  );
  const lines = ids
    .flatMap(id =>
      parents[id].map(p => `<line x1="${at[p].x}" y1="${at[p].y + 18}" x2="${at[id].x}" y2="${at[id].y - 18}"/>`),
    )
    .join('');
  const nodes = ids
    .map(id => {
      const u = RESEARCH_BY_ID[id],
        state = has(id) ? 'done' : researchVisible(u) ? 'open' : 'locked',
        kind = u.ultra ? ' ultra' : u.disaster ? ' disaster' : '';
      return `<button class="tree-node ${state}${kind}" style="left:${at[id].x - TREE_COL / 2}px;top:${at[id].y - 18}px"${state === 'locked' ? ' disabled' : ` data-tab="${u.tab}"`}>
        ${spriteImg(state === 'locked' ? 'lock' : u.icon)}<span>${state === 'locked' ? '???' : u.name}</span></button>`;
    })
    .join('');
  return `<div class="story-tree" style="width:${width}px;height:${rows.length * TREE_ROW}px"><svg width="${width}" height="${rows.length * TREE_ROW}">${lines}</svg>${nodes}</div>`;
}

// The research in progress shows at the bottom of the screen, also with the book closed: a bar per slot in use.
// A finished one flashes, then goes. Tap a bar to open its page.
function renderResearchBar() {
  const box = $('#research-bars');
  for (const r of state.researching) {
    let bar = /** @type {HTMLElement | null} */ (box.querySelector(`[data-id="${r.id}"]`));
    if (!bar) {
      bar = document.createElement('button');
      bar.className = 'research-bar';
      bar.dataset.id = r.id;
      bar.innerHTML = '<span></span><i><b></b></i>';
      box.appendChild(bar);
      /** @type {HTMLElement} */ (bar.querySelector('span')).textContent = RESEARCH_BY_ID[r.id].name;
    }
    bar.classList.remove('finished');
    /** @type {HTMLElement} */ (bar.querySelector('b')).style.width = pct(Math.min(1, r.done));
  }
  for (const bar of /** @type {NodeListOf<HTMLElement>} */ (box.querySelectorAll('.research-bar:not(.finished)'))) {
    if (researchingNow(bar.dataset.id || '')) continue;
    bar.classList.add('finished');
    /** @type {HTMLElement} */ (bar.querySelector('b')).style.width = '100%';
    setTimeout(() => bar.classList.contains('finished') && bar.remove(), 2500);
  }
}

/* ================= Minigames and puzzles ================= */

function playTick(dt) {
  const moonReady = MINIGAMES.moon.ready();
  Scene.setMoonPlay(moonReady);
  Scene.setMountainSnow(MINIGAMES.river.ready());
  if (moonReady && !gameWon('moon') && Math.random() < dt / 3) Scene.sparkleMoon();
  if (MINIGAMES.moonlit.ready() && !gameWon('moonlit') && Math.random() < dt / 2) Scene.sparkleMoon();
  for (const [id, g] of Object.entries(MINIGAMES)) {
    if (!g.spot || !g.ready()) continue;
    const won = gameWon(id) || !STORY_OF_GAME[id]; // a game that opens no story only brings rewards
    if (
      Scene.spotCount(g.spot) >= (g.max || (won ? 1 : 2)) ||
      Math.random() >= dt / (g.every * (won ? PLAY_REPEAT : 1))
    )
      continue;
    if (g.spot === 'sunspot') Scene.sunspot();
    else Scene.spawnSpot(g.spot);
  }
}

const PLAY_OF = {
  twinkle: 'twinkle',
  crack: 'cracks',
  seed: 'seeds',
  ice: 'ice',
  sunspot: 'sunspots',
  moon: 'moon',
  plates: 'plates',
  river: 'river', // snow on a mountain (scene.js, snowOnMountain)
};
function playHit(id, x = innerWidth / 2, y = innerHeight / 2) {
  const was = gameWon(id),
    story = STORY_OF_GAME[id];
  state.games[id] = (state.games[id] || 0) + 1;
  buzz(10);
  if (GAME_COLLECTS[id]) collect(GAME_COLLECTS[id], x, y);
  if (was || !story) return MINIGAMES[id].reward(x, y);
  if (!gameWon(id)) return;
  buzz([30, 30, 60]);
  recalc();
}
// Tapping the lit moon: the first tap opens its story; from then on each tap finds the phase it shows now.
Scene.onMoonTap((x, y) => {
  if (!MINIGAMES.moonlit.ready()) return;
  if (!gameWon('moonlit')) playHit('moonlit', x, y);
  // Phases (research, after Reflect the Sun) brings the phases: from then on each tap finds the phase the moon shows.
  if (!has('moonphases')) return;
  if (collect('phases', x, y, moonPhaseId())) return;
  floatText(x, y - 14, COLLECTION_BY_ID.phases.items.find(it => it.id === moonPhaseId()).name, 'critter good');
});
Scene.onPlay((kind, x, y, band) => {
  if (kind === 'band') return collect('bands', x, y, band);
  if (kind === 'flower') return collect('flowers', x, y) || evolveReward(x, y);
  if (kind === 'plankton') return collect('lights', x, y) || evolveReward(x, y);
  if (kind === 'meteorite') return collect('meteorites', x, y) || mineralReward(x, y);
  if (kind === 'gem') return collect('gems', x, y) || mineralReward(x, y);
  if (kind === 'treasure') return collect('treasures', x, y) || mineralReward(x, y);
  playHit(PLAY_OF[kind], x, y);
});

// Light beyond the rainbow (collection `bands`): once Rainbow is gained, a shimmer shows where nature gives off
// each band; tapping it finds the band. Radio shimmers at lightning strikes and infrared over eruptions (see
// lightningHit and erupt); the rest show now and then, about once per `every` seconds while `when` holds.
const bandHunt = id => has('rainbow') && !found('bands').includes(id);
const BAND_GLIMMER = {
  radio: {},
  infrared: {},
  microwave: { when: () => state.spinLocked && !sunUp(), every: 40, where: () => Scene.skyPoint() },
  ultraviolet: { when: () => sunUp(), every: 40, where: () => Scene.sunPoint() },
  xray: { when: () => state.solarStorm > 0, every: 8, where: () => Scene.sunPoint() },
  gamma: { when: () => state.spinLocked && !sunUp(), every: 300, where: () => Scene.skyPoint(), seconds: 5 },
};

function bandTick(dt) {
  if (!has('rainbow') || Scene.spotCount('band') > 0) return;
  for (const [id, g] of Object.entries(BAND_GLIMMER)) {
    if (!g.when || !bandHunt(id) || !g.when() || Math.random() >= dt / g.every) continue;
    Scene.glimmer(id, g.where(), g.seconds);
    return;
  }
}

// Gems of the plates: after an earthquake, gems glint where the ground split open for a while. Deep treasures: now
// and then an eruption over lava fields leaves one glinting in the fresh rock (see erupt).
// About two gems glint per earthquake, so the set takes a few quakes.
const GEM_RUSH_S = 15;
let gemRush = 0;
function gemTick(dt) {
  gemRush = Math.max(0, gemRush - dt);
  if (gemRush > 0 && !setDone('gems') && Scene.spotCount('gem') === 0 && Math.random() < dt / 5) Scene.spawnSpot('gem');
}

// The snowflake that grows at an air temperature (°C), from the Snowflakes collection's `temp` ranges.
const snowflakeAt = t => COLLECTION_BY_ID.snowflakes.items.find(it => t >= it.temp[0] && t < it.temp[1]);

// Continental Drift: once gained, the one continent splits along a rift and its halves drift apart.
const DRIFT_S = 12;
function driftTick(dt) {
  if (!has('drift') || state.drift >= 1) return;
  if (state.drift === 0) {
    Scene.shake(2);
    announce('The continent splits', innerWidth / 2, innerHeight * 0.35, 'disaster big');
  }
  state.drift = Math.min(1, state.drift + dt / DRIFT_S);
}

// Collections (data/collections.yaml), opened by ultra-research. Wild grasses come with planted seeds (where
// their climate is on the planet), flowers in a superbloom (after a drought ends)
// and meteorites where a meteor shower comes down (rare, at night).
const COLLECTIONS = DATA.collections;
const COLLECTION_BY_ID = Object.fromEntries(COLLECTIONS.map(c => [c.id, c]));
const COLLECTION_BY_SECTION = Object.fromEntries(COLLECTIONS.map(c => [c.section, c]));
const GAME_COLLECTS = { seeds: 'grasses' };
const BLOOM_S = 30,
  SHOWER_S = 25,
  SHOWER_EVERY_S = 400;
// Bioluminescence: on about half the nights the waves glow blue, and glowing water can be tapped.
const glowTonight = () =>
  has('biolum') && state.spinLocked && !sunUp() && nightRandom(Math.floor((state.clock + 6) / 24), 7) < 0.5;
const setDone = id => (state.found[id] || []).length === COLLECTION_BY_ID[id].items.length;
const setGauge = id => {
  const n = (state.found[id] || []).length,
    all = COLLECTION_BY_ID[id].items.length;
  return [n / all, `${n} of ${all} ${COLLECTION_BY_ID[id].name.toLowerCase()}`];
};
// Grasses only where their climate is; the rest in any order.
const found = id => state.found[id] || [];
const collectable = (c, it) =>
  c.id === 'grasses' ? Terrain.zones()[it.zone] > 0.01 : c.id === 'glows' ? GLOW_IN_AIR[it.id]() : true;

// Finds an item of a collection (the given one, or the next that can be found now); returns whether one was found.
function collect(id, x, y, itemId) {
  const c = COLLECTION_BY_ID[id];
  const list = (state.found[id] ||= []);
  const item = c.items.find(it => !list.includes(it.id) && (itemId ? it.id === itemId : collectable(c, it)));
  if (!item) return false;
  list.push(item.id);
  // The first find opens the collection. The find's card is marked new.
  markNew(`${c.id}:${item.id}`);
  updateDots();
  return true;
}

// Superbloom: when a drought ends, the land bursts into flower for a while. Meteor showers come rarely at night.
let wasDry = false;
// SI units (collection `units`): each base unit is found the first time the planet shows what it measures.
// Time begins with the Big Bang, so the second comes first.
const UNIT_FOUND = {
  second: () => state.banged,
  kelvin: () => has('starlight'), // the temperature shows from then on
  candela: () => state.ignition >= 1, // the sun shines
  metre: () => state.laws.includes('light'),
  kilogram: () => state.laws.includes('gravity'),
  ampere: () => state.laws.includes('electricity'),
  mole: () => RESEARCH.some(u => u.tab === 'molecules' && has(u.id)),
};
// A unit counts as read once it is found and its card has been tapped (its new badge is gone).
const unitRead = id => found('units').includes(id) && !isNew(`units:${id}`);

function unitTick() {
  for (const [id, when] of Object.entries(UNIT_FOUND))
    if (!found('units').includes(id) && when()) collect('units', innerWidth / 2, innerHeight / 2, id);
}

function collectTick(dt) {
  unitTick();
  if (has('superbloom') && wasDry && state.drought <= 0) {
    state.bloom = BLOOM_S;
    announce('Superbloom!', innerWidth / 2, innerHeight * 0.45, 'disaster big');
  }
  wasDry = state.drought > 0;
  state.bloom = Math.max(0, state.bloom - dt);
  if (state.bloom > 0 && Scene.spotCount('flower') < 3 && Math.random() < dt / 2) Scene.spawnSpot('flower');
  state.meteorShower = Math.max(0, state.meteorShower - dt);
  if (
    has('meteors') &&
    state.meteorShower <= 0 &&
    state.spinLocked &&
    !sunUp() &&
    Math.random() < dt / SHOWER_EVERY_S
  ) {
    state.meteorShower = SHOWER_S;
    Scene.meteorShower(SHOWER_S);
  }
  if (state.meteorShower > 0 && Scene.spotCount('meteorite') < 2 && Math.random() < dt / 4)
    Scene.spawnSpot('meteorite');
  if (glowTonight() && Scene.spotCount('plankton') < 2 && Math.random() < dt / 5) Scene.spawnSpot('plankton');
  // The whole tree of life, known once: the key to what comes after.
  if (has('dna') && !state.treeDone && SPECIES.every(known)) {
    state.treeDone = true;
  }
}

// A strip of the visible spectrum, red to violet, from the colors given in that order; null leaves a dark gap.
// Neighbours found blend into each other as in a real spectrum.
function spectrumStrip(colors, cls = 'spectrum-strip') {
  const n = colors.length,
    stops = colors.map((col, k) => {
      const at = ((k + 0.5) * 100) / n;
      return `${col ? Hues.css(col) : '#111'} ${at.toFixed(1)}%`;
    });
  return `<div class="${cls}" style="background:linear-gradient(90deg,${stops.join(',')})"></div>`;
}

function renderCollection(c, force) {
  const root = $(`#${c.section}`),
    list = state.found[c.id] || [],
    picked = root.dataset.picked || '';
  const key = list.join() + picked + (c.id === 'bands' ? state.heatView : '') + state.unseen.join() + Hues.key();
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  const pickedItem = c.items.find(it => it.id === picked);
  // The Spectrum collection is a band of light from red to violet: each color found lights its stretch.
  const wheel = c.id === 'colors' ? spectrumStrip(c.items.map(it => (list.includes(it.id) ? it.color : null))) : '';
  root.innerHTML = `<p class="note">${list.length} of ${c.items.length} found</p>${wheel}
    <div class="law-grid">${c.items
      .map(it =>
        list.includes(it.id)
          ? `<button class="law-card${it.id === picked ? ' picked' : ''}${newClass(`${c.id}:${it.id}`)}" data-id="${it.id}"><b${it.color ? ` style="color:${Hues.css(it.color)}"` : ''}>${it.icon ? spriteImg(it.icon) : it.sign}</b><span>${it.name}</span></button>`
          : '<button class="law-card unknown" disabled><b>?</b><span></span></button>',
      )
      .join('')}</div>
    <p class="atom-info">${pickedItem ? `<b>${pickedItem.name}</b><br>${pickedItem.how}` : 'Tap one.'}</p>
    ${c.id === 'bands' && setDone('bands') ? `<button id="heat-view" class="view-toggle${state.heatView ? ' on' : ''}">Infrared</button>` : ''}`;
  root.querySelectorAll('.law-card[data-id]').forEach(b =>
    b.addEventListener('click', () => {
      root.dataset.picked = b.dataset.id;
      seenNow(`${c.id}:${b.dataset.id}`);
      renderCollection(c);
    }),
  );
  // The full set of bands lets the planet be seen in infrared.
  root.querySelector('#heat-view')?.addEventListener('click', () => {
    state.heatView = !state.heatView;
    Scene.setHeatView(state.heatView);
    renderCollection(c, true);
  });
}

// Glowing gases (collection `glows`): once Aurora is gained, auroras also come on quiet nights, about once per
// AURORA_EVERY_S. Tapping one finds a gas that glows in it and is in the air; during a solar storm it also
// shields the ozone layer until the storm ends. The whole set thickens the ozone layer (see ozone).
const AURORA_EVERY_S = 60;
const GLOW_IN_AIR = {
  oxygenGreen: () => state.o2 > 0.1,
  oxygenRed: () => state.o2 > 0.3 && state.solarStorm > 0, // only in a strong storm
  nitrogen: () => state.pressure > 0.3,
  neon: () => state.atoms.includes('Ne'),
  argon: () => state.atoms.includes('Ar'),
  krypton: () => state.atoms.includes('Kr'),
};

function auroraTick(dt) {
  if (has('aurora') && !Scene.auroraUp() && state.spinLocked && !sunUp() && Math.random() < dt / AURORA_EVERY_S)
    Scene.aurora(20);
}

// A solar storm lights the sky before Aurora is known: tapping the glow finds a gas glowing in the air, and
// all six open Aurora. With Aurora, a tap also shields the ozone layer for the rest of the storm.
Scene.onAuroraTap((x, y) => {
  if (!has('aurora')) {
    if (state.solarStorm > 0 && collect('glows', x, y)) buzz([20, 30, 20]);
    return;
  }
  if (state.solarStorm > 0 && !state.auroraShield) {
    state.auroraShield = true;
    floatText(x, y + 20, 'Shielded', 'rain');
  }
  collect('glows', x, y);
  Scene.aurora(Math.min(3, SOLAR_STORM_S));
  buzz([20, 30, 20]);
});

// A puzzle gets its own history entry, so the back button closes the puzzle and not the book under it.
let puzzleOpen = null;
function openPuzzle(item) {
  if (!puzzleOpen) history.pushState({ puzzle: true, book: !!history.state?.book }, '');
  puzzleOpen = item.id;
  $('#puzzle-title').textContent = item.name;
  $('#puzzle').classList.remove('hidden');
  const body = $('#puzzle-body');
  delete body.dataset.done; // a fresh puzzle, whatever was solved before
  PUZZLES[item.puzzle](body, () => solvePuzzle(item), item);
}

function hidePuzzle() {
  puzzleOpen = null;
  $('#puzzle').classList.add('hidden');
  $('#puzzle-body').innerHTML = '';
}

function closePuzzle() {
  if (history.state?.puzzle) history.back();
  else hidePuzzle();
}

function solvePuzzle(item) {
  owned.add(item.id);
  buzz([20, 40, 20, 40, 80]);
  recalc();
  save();
  setTimeout(() => {
    if (puzzleOpen === item.id) closePuzzle(); // unless the player already closed it, or opened another
    if (item.ultra) markNew(`ultra:${item.id}`);
    renderCategory(true);
  }, 1400);
}

// Once Eclipse is gained, the moon now and then slides across the sun by day: the sky darkens and the stars,
// and tonight's star sign, show for a while. Tapping the dark sun at totality ends an ice age.
const ECLIPSE_EVERY_S = 150;
function eclipseTick(dt) {
  if (has('eclipse') && sunUp() && !Scene.eclipseUp() && Math.random() < dt / ECLIPSE_EVERY_S) Scene.eclipse(14);
}
Scene.onEclipseTap((x, y) => {
  if (state.iceAge > 0) {
    state.iceAge = 0;
    floatText(x, y + 20, 'The sun returns', 'rain');
  }
  buzz([20, 40, 20]);
});

// Once Rainbow is researched, rainbows show by day while it rains, more often while a disaster is going on
// (after the storm). Tapping one ends the disasters under way and keeps new ones away for a while.
const RAINBOW_EVERY_S = 90;
const RAINBOW_SHIELD_S = 120;
const calamity = () =>
  state.drought > 0 || state.solarStorm > 0 || state.redTide > 0 || state.iceAge > 0 || stormBurst > 0;
function rainbowTick(dt) {
  const hour = state.clock % 24,
    day = !state.spinLocked || (hour > 7 && hour < 17);
  if (!has('rainbow') || Scene.rainbowUp() || !day || state.clouds < 0.1) return;
  if (Math.random() < (dt / RAINBOW_EVERY_S) * (calamity() ? 4 : 1)) Scene.showRainbow();
}

Scene.onRainbowTap((x, y) => {
  Terrain.calm();
  state.drought = 0;
  state.solarStorm = 0;
  state.redTide = 0;
  state.iceAge = 0;
  stormBurst = 0;
  Scene.aurora(0);
  state.rainbowShield = RAINBOW_SHIELD_S;
  floatText(x, y, 'Calm', 'rain');
  buzz([20, 40, 20]);
});

// Unlocked disasters strike again now and then on their own, never two close together, and not while
// a rainbow's calm lasts.
let lastDisaster = -1e9;
// What each disaster does when it strikes; returns whether it happened. checkData (main.js) makes sure every
// disaster that can strike has an entry.
const DISASTER_EFFECT = {
  supereruption: () => (erupt(-1, true), true),
  flood: () => flood(),
  hurricane: () => hurricane(),
  earthquake: () => quake(),
  drought: () => drought(),
  solarstorm: () => solarStorm(),
  redtide: () => redTide(),
  iceage: () => iceAge(),
  asteroid: () => asteroidImpact(),
  supernova: () => supernova(),
};

// Disasters that last a while wear off with time, also while the player is away (applyOffline in main.js).
function disasterTimers(dt) {
  state.drought = Math.max(0, state.drought - dt);
  state.solarStorm = Math.max(0, state.solarStorm - dt);
  state.supernova = Math.max(0, state.supernova - dt);
  if (state.solarStorm <= 0) state.auroraShield = false;
  state.iceAge = Math.max(0, state.iceAge - dt);
  if (state.redTide > 0) {
    state.redTide = Math.max(0, state.redTide - dt);
    for (const sp of SPECIES)
      if (sp.domain === 'ocean' && !BLOOMERS.has(sp.id) && evolved(sp.id))
        state.species[sp.id] *= 1 - RED_TIDE_KILL * (has('biolum') ? 0.5 : 1) * dt;
  }
  state.rainbowShield = Math.max(0, state.rainbowShield - dt);
}

function disasterTick(dt, now) {
  disasterTimers(dt);
  rainbowTick(dt);
  if (state.rainbowShield > 0 || now - lastDisaster < DISASTER_GAP_S * 1000) return;
  for (const [id, d] of Object.entries(DISASTER_ODDS)) {
    if (!d.when() || Math.random() >= d.rate * disasterOdds(id) * dt) continue;
    const happened = DISASTER_EFFECT[id]?.();
    if (happened) lastDisaster = now;
    return;
  }
}

let stormBurst = 0; // strikes left in a climax storm
const SUPER_LAND = 0.01; // new land from one supereruption

// An eruption: CO₂ that warms for a long time, and ash and aerosols that cool for a short one. With Lava Fields,
// lava runs out over the land around the volcano. A tapped volcano breathes out mostly gas: much more CO₂ and
// little ash, so tapping warms the planet. A supereruption (`huge`) is a natural disaster. Returns the CO₂ added.
const TAPPED_CO2 = 400;
function erupt(volcano = -1, huge = false, tapped = false) {
  const size = best('eruptionSize', 1) * (huge ? 2 : 1);
  state.eruptions++;
  state.aerosols = Math.min(1, state.aerosols + (tapped ? 0.04 : 0.25) * size);
  state.ash = Math.min(0.4, state.ash + (tapped ? 0.01 : 0.08) * size);
  const co2 = (tapped ? TAPPED_CO2 : 150) * size;
  state.co2 += co2;
  const spot = Scene.erupt(size, volcano);
  if (spot && bandHunt('infrared') && Scene.spotCount('band') === 0) Scene.glimmer('infrared', spot, 8);
  if (spot && has('lavafields'))
    Terrain.spread('lava', spot.u, spot.v, huge ? 10 + Math.random() * 5 : 2 + Math.random() * 2);
  if (
    has('lavafields') &&
    !tapped &&
    !setDone('treasures') &&
    Scene.spotCount('treasure') === 0 &&
    Math.random() < 0.25
  )
    Scene.spawnSpot('treasure');
  if (huge) {
    state.land = Math.min(MAX_LAND, state.land + SUPER_LAND);
    disaster('supereruption');
  }
  return co2;
}
