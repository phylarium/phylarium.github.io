'use strict';

// Stories, minigames, collections and the phenomena ultras bring (rainbows, auroras, eclipses, glowing seas,
// superblooms, meteor showers). Loads after game.js, which holds the state and the climate model; the puzzle
// screens themselves are in puzzles.js.

/* ================= Stories ================= */

// A story opens with its minigame's first win. A big splash names it the first time, and the Stories page
// lists every story: open ones with what has been done of them, the rest as blanks.
const storyOpen = st => gameWon(st.minigame) || st.chapters.some(has);
const storyItems = st => [...st.chapters.map(id => ({ id, name: RESEARCH_BY_ID[id].name, done: () => has(id) })),
  { id: st.disaster, name: RESEARCH_BY_ID[st.disaster].name, done: () => has(st.disaster) },
  { id: st.ultra, name: RESEARCH_BY_ID[st.ultra].name, done: () => has(st.ultra) }];
const storyDone = st => storyItems(st).filter(it => it.done());
// Big moments show a splash, one at a time. A story opening covers the screen; a discovery shows as a banner
// at the top that does not stop play. Discoveries of the same kind found together share one banner.
let splashQueue = [];
const STORY_SPLASH_S = 15;
function queueSplash(s) {
  const last = splashQueue[splashQueue.length - 1];
  if (s.merge && last?.merge === s.merge) {
    last.title += `, ${s.title}`;
    last.sub = [last.sub, s.sub].filter(Boolean).join('  ');
  } else splashQueue.push(s);
}
const discovered = (title, sub = '', merge = title, kicker = 'Discovered') => queueSplash({ discovery: true, kicker, title, sub, merge });

function storyTick() {
  if (state.quietStories) {
    state.storiesSeen = STORIES.filter(storyOpen).map(st => st.id);
    delete state.quietStories;
  }
  if (inCinema()) return;
  for (const st of STORIES) {
    if (state.storiesSeen.includes(st.id) || !storyOpen(st)) continue;
    state.storiesSeen.push(st.id);
    queueSplash({ kicker: 'A new story', title: st.name, sub: `${storyDone(st).length} of ${storyItems(st).length}` });
  }
  if (splashQueue.length && $('#splash').classList.contains('hidden')) showSplash(splashQueue.shift());
}

function showSplash(s) {
  $('#splash-kicker').textContent = s.kicker;
  $('#splash-title').textContent = s.title;
  $('#splash-count').textContent = s.sub;
  $('#splash').classList.toggle('discovery', !!s.discovery);
  $('#splash').classList.remove('hidden');
  buzz(s.discovery ? [20, 30, 20] : [30, 30, 60]);
  // A discovery banner goes by itself. A story's splash fills the screen until its Close button is tapped (or
  // 15 s pass), so a player busy tapping (catching stars, cracking ice) does not miss it or close it by accident.
  clearTimeout(showSplash.timer);
  showSplash.timer = setTimeout(hideSplash, s.discovery ? 2800 : STORY_SPLASH_S * 1000);
}
const hideSplash = () => $('#splash').classList.add('hidden');

function renderStories(force) {
  const root = $('#stories'), key = STORIES.map(st => (storyOpen(st) ? storyDone(st).map(it => it.id).join('.') : '?')).join('|');
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  root.innerHTML = STORIES.map(st => {
    if (!storyOpen(st)) return '<div class="story-entry unknown"><h4>?</h4></div>';
    const items = storyItems(st), done = storyDone(st);
    return `<div class="story-entry"><h4>${st.name}<span>${done.length} of ${items.length}</span></h4>
      <ul>${items.map(it => `<li class="${it.done() ? 'done' : ''}">${it.done() ? it.name : '?'}</li>`).join('')}</ul></div>`;
  }).join('');
}

// The research in progress shows at the bottom of the screen, also with the book closed. Tap it to open its page.
function renderResearchBar() {
  const bar = $('#research-bar'), r = state.researching;
  if (r) {
    bar.classList.remove('hidden', 'finished');
    bar.querySelector('span').textContent = RESEARCH_BY_ID[r.id].name;
    bar.querySelector('b').style.width = pct(r.done);
    bar.dataset.id = r.id;
  } else if (bar.dataset.id && !bar.classList.contains('hidden') && !bar.classList.contains('finished')) {
    bar.classList.add('finished');
    bar.querySelector('b').style.width = '100%';
    setTimeout(() => bar.classList.contains('finished') && bar.classList.add('hidden'), 2500);
  }
}

/* ================= Minigames and puzzles ================= */

function playTick(dt) {
  const moonReady = MINIGAMES.moon.ready();
  Scene.setMoonPlay(moonReady);
  if (moonReady && !gameWon('moon') && Math.random() < dt / 3) Scene.sparkleMoon();
  if (MINIGAMES.moonlit.ready() && !gameWon('moonlit') && Math.random() < dt / 2) Scene.sparkleMoon();
  for (const [id, g] of Object.entries(MINIGAMES)) {
    if (!g.spot || !g.ready()) continue;
    const won = gameWon(id) || !STORY_OF_GAME[id];   // a game that opens no story only brings rewards
    if (Scene.spotCount(g.spot) >= (g.max || (won ? 1 : 2)) || Math.random() >= dt / (g.every * (won ? PLAY_REPEAT : 1))) continue;
    if (g.spot === 'sunspot') Scene.sunspot();
    else Scene.spawnSpot(g.spot);
  }
}

const PLAY_OF = { twinkle: 'twinkle', crack: 'cracks', seed: 'seeds', ice: 'ice', sunspot: 'sunspots', moon: 'moon', river: 'river', plates: 'plates' };
function playHit(id, x = innerWidth / 2, y = innerHeight / 2) {
  const was = gameWon(id), story = STORY_OF_GAME[id];
  state.games[id] = (state.games[id] || 0) + 1;
  buzz(10);
  if (GAME_COLLECTS[id]) collect(GAME_COLLECTS[id], x, y);
  if (was || !story) return MINIGAMES[id].reward(x, y);
  if (!gameWon(id)) return;
  buzz([30, 30, 60]);
  recalc();
}
Scene.onMoonTap((x, y) => {
  if (MINIGAMES.moonlit.ready() && !gameWon('moonlit')) playHit('moonlit', x, y);
});
Scene.onPlay((kind, x, y, band) => {
  if (kind === 'band') return collect('bands', x, y, band);
  if (kind === 'flower') return collect('flowers', x, y) || dnaReward(x, y);
  if (kind === 'plankton') return collect('lights', x, y) || dnaReward(x, y);
  if (kind === 'meteorite') return collect('meteorites', x, y) || mineralReward(x, y);
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

// Collections (data/collections.yaml), opened by ultra-research. Wild grasses come with planted seeds (where
// their climate is on the planet), river fish with traced rivers, flowers in a superbloom (after a drought ends)
// and meteorites where a meteor shower comes down (rare, at night).
const COLLECTIONS = DATA.collections;
const COLLECTION_BY_ID = Object.fromEntries(COLLECTIONS.map(c => [c.id, c]));
const COLLECTION_BY_SECTION = Object.fromEntries(COLLECTIONS.map(c => [c.section, c]));
const GAME_COLLECTS = { seeds: 'grasses', river: 'fish' };
const BLOOM_S = 30, SHOWER_S = 25, SHOWER_EVERY_S = 400;
// Bioluminescence: on about half the nights the waves glow blue, and glowing water can be tapped.
const glowTonight = () => has('biolum') && state.spinLocked && !sunUp() && nightRandom(Math.floor((state.clock + 6) / 24), 7) < 0.5;
const setDone = id => (state.found[id] || []).length === COLLECTION_BY_ID[id].items.length;
const setGauge = id => { const n = (state.found[id] || []).length, all = COLLECTION_BY_ID[id].items.length; return [n / all, `${n} of ${all} ${COLLECTION_BY_ID[id].name.toLowerCase()}`]; };
// Grasses only where their climate is; the rest in any order.
const found = id => state.found[id] || [];
const collectable = (c, it) => (c.id === 'grasses' ? Terrain.zones()[it.zone] > 0.01 : c.id === 'glows' ? GLOW_IN_AIR[it.id]() : true);

// Finds an item of a collection (the given one, or the next that can be found now); returns whether one was found.
function collect(id, x, y, itemId) {
  const c = COLLECTION_BY_ID[id];
  if (!has(c.opens)) return false;
  const list = (state.found[id] ||= []);
  const item = c.items.find(it => !list.includes(it.id) && (itemId ? it.id === itemId : collectable(c, it)));
  if (!item) return false;
  list.push(item.id);
  announce(`${item.name} found`, x, y - 20, 'atom');
  if (setDone(id)) discovered(c.name, `${c.items.length} of ${c.items.length}`, null, 'Collection complete');
  updateDots();
  return true;
}

// Superbloom: when a drought ends, the land bursts into flower for a while. Meteor showers come rarely at night.
let wasDry = false;
function collectTick(dt) {
  if (has('superbloom') && wasDry && state.drought <= 0) {
    state.bloom = BLOOM_S;
    announce('Superbloom!', innerWidth / 2, innerHeight * 0.45, 'disaster big');
  }
  wasDry = state.drought > 0;
  state.bloom = Math.max(0, state.bloom - dt);
  if (state.bloom > 0 && Scene.spotCount('flower') < 3 && Math.random() < dt / 2) Scene.spawnSpot('flower');
  state.meteorShower = Math.max(0, state.meteorShower - dt);
  if (has('meteors') && state.meteorShower <= 0 && state.spinLocked && !sunUp() && Math.random() < dt / SHOWER_EVERY_S) {
    state.meteorShower = SHOWER_S;
    Scene.meteorShower(SHOWER_S);
  }
  if (state.meteorShower > 0 && Scene.spotCount('meteorite') < 2 && Math.random() < dt / 4) Scene.spawnSpot('meteorite');
  if (glowTonight() && Scene.spotCount('plankton') < 2 && Math.random() < dt / 5) Scene.spawnSpot('plankton');
  // The whole tree of life, known once: the key to what comes after.
  if (has('dna') && !state.treeDone && SPECIES.every(known)) {
    state.treeDone = true;
    discovered('Tree of life', '', null, 'Collection complete');
  }
}

function renderCollection(c, force) {
  const root = $(`#${c.section}`), list = state.found[c.id] || [], picked = root.dataset.picked || '';
  const key = list.join() + picked + (c.id === 'bands' ? state.heatView : '');
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  const pickedItem = c.items.find(it => it.id === picked);
  root.innerHTML = `<p class="note">${list.length} of ${c.items.length} found</p>
    <div class="law-grid">${c.items.map(it => list.includes(it.id)
      ? `<button class="law-card${it.id === picked ? ' picked' : ''}" data-id="${it.id}"><b${it.color ? ` style="color:${Hues.css(it.color)}"` : ''}>${it.sign}</b><span>${it.name}</span></button>`
      : '<button class="law-card unknown" disabled><b>?</b><span></span></button>').join('')}</div>
    <p class="atom-info">${pickedItem ? `<b>${pickedItem.name}</b><br>${pickedItem.how}` : 'Tap one.'}</p>
    ${c.id === 'bands' && setDone('bands') ? `<button id="heat-view" class="view-toggle${state.heatView ? ' on' : ''}">Infrared</button>` : ''}`;
  root.querySelectorAll('.law-card[data-id]').forEach(b => b.addEventListener('click', () => {
    root.dataset.picked = b.dataset.id;
    renderCollection(c);
  }));
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
  oxygenRed: () => state.o2 > 1 && state.solarStorm > 0,
  nitrogen: () => state.pressure > 0.3,
  neon: () => state.atoms.includes('Ne'),
  argon: () => state.atoms.includes('Ar'),
  krypton: () => state.atoms.includes('Kr'),
};

function auroraTick(dt) {
  if (has('aurora') && !Scene.auroraUp() && state.spinLocked && !sunUp() && Math.random() < dt / AURORA_EVERY_S) Scene.aurora(20);
}

Scene.onAuroraTap((x, y) => {
  if (!has('aurora')) return;
  if (state.solarStorm > 0 && !state.auroraShield) {
    state.auroraShield = true;
    floatText(x, y + 20, 'Shielded', 'rain');
  }
  collect('glows', x, y);
  Scene.aurora(Math.min(3, SOLAR_STORM_S));
  buzz([20, 30, 20]);
});



function openPuzzle(item) {
  $('#puzzle-title').textContent = item.name;
  $('#puzzle').classList.remove('hidden');
  const body = $('#puzzle-body');
  delete body.dataset.done;   // a fresh puzzle, whatever was solved before
  PUZZLES[item.puzzle](body, () => solvePuzzle(item), item);
}

function closePuzzle() {
  $('#puzzle').classList.add('hidden');
  $('#puzzle-body').innerHTML = '';
}

function solvePuzzle(item) {
  owned.add(item.id);
  buzz([20, 40, 20, 40, 80]);
  recalc();
  save();
  setTimeout(() => {
    closePuzzle();
    discovered(item.name);
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
const calamity = () => state.drought > 0 || state.solarStorm > 0 || state.redTide > 0 || state.iceAge > 0 || stormBurst > 0;
function rainbowTick(dt) {
  const hour = state.clock % 24, day = !state.spinLocked || (hour > 7 && hour < 17);
  if (!has('rainbow') || Scene.rainbowUp() || !day || state.clouds < 0.1) return;
  if (Math.random() < dt / RAINBOW_EVERY_S * (calamity() ? 4 : 1)) Scene.showRainbow();
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
function disasterTick(dt, now) {
  state.drought = Math.max(0, state.drought - dt);
  state.solarStorm = Math.max(0, state.solarStorm - dt);
  state.supernova = Math.max(0, state.supernova - dt);
  if (state.solarStorm <= 0) state.auroraShield = false;
  state.iceAge = Math.max(0, state.iceAge - dt);
  if (state.redTide > 0) {
    state.redTide = Math.max(0, state.redTide - dt);
    for (const sp of SPECIES) if (sp.domain === 'ocean' && !BLOOMERS.has(sp.id) && evolved(sp.id)) state.species[sp.id] *= 1 - RED_TIDE_KILL * (has('biolum') ? 0.5 : 1) * dt;
  }
  state.rainbowShield = Math.max(0, state.rainbowShield - dt);
  rainbowTick(dt);
  if (state.rainbowShield > 0 || now - lastDisaster < DISASTER_GAP_S * 1000) return;
  for (const [id, d] of Object.entries(DISASTER_ODDS)) {
    if (!d.when() || Math.random() >= d.rate * (has('rainbow') ? RAINBOW_ODDS : 1) * (disastersDone() ? DISASTERS_DONE_ODDS : 1) * dt) continue;
    const happened = { supereruption: () => (erupt(-1, true), true), flood, hurricane, earthquake: quake, drought, solarstorm: solarStorm, redtide: redTide, iceage: iceAge, asteroid: asteroidImpact, supernova }[id]();
    if (happened) lastDisaster = now;
    return;
  }
}

let stormBurst = 0;   // strikes left in a climax storm
const SUPER_LAND = 0.01;     // new land from one supereruption

// An eruption: ash and sulfate cool the planet, CO2 warms it. With Lava Fields, lava runs out over the land
// around the volcano. A supereruption (`huge`) is a natural disaster, see DISASTER_ODDS.
function erupt(volcano = -1, huge = false) {
  const size = best('eruptionSize', 1) * (huge ? 2 : 1);
  state.eruptions++;
  state.aerosols = Math.min(1, state.aerosols + 0.25 * size);
  state.ash = Math.min(0.4, state.ash + 0.08 * size);
  state.co2 += 150 * size;
  const spot = Scene.erupt(size, volcano);
  if (spot && bandHunt('infrared') && Scene.spotCount('band') === 0) Scene.glimmer('infrared', spot, 8);
  if (spot && has('lavafields')) Terrain.spread('lava', spot.u, spot.v, huge ? 10 + Math.random() * 5 : 2 + Math.random() * 2);
  if (huge) {
    state.land = Math.min(MAX_LAND, state.land + SUPER_LAND);
    disaster('supereruption');
  }
}
