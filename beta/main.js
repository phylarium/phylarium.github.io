'use strict';

// Input on the scene, offline progress, the main loop and boot. Loads last: it starts the game.

/* ================= Effects ================= */

const buzz = ms => navigator.userActivation?.hasBeenActive && navigator.vibrate?.(ms);

function floatText(x, y, text, cls = '') {
  if (el.fx.childElementCount > 60) return;
  const d = document.createElement('div');
  d.className = `float ${cls}`;
  d.textContent = text;
  d.style.left = `${x}px`;
  d.style.top = `${y}px`;
  d.addEventListener('animationend', () => d.remove());
  el.fx.appendChild(d);
}

const TEMP_COLORS = [[-300, '#8a7cff'], [-100, '#9fd3ff'], [-20, '#bfe6ff'], [LIFE_WINDOW[0], '#8af0b0'], [LIFE_WINDOW[1], '#ffa040'], [50, '#ff5a3a']];

function tempColor(c) {
  let color = TEMP_COLORS[0][1];
  for (const [limit, col] of TEMP_COLORS) if (c >= limit) color = col;
  return color;
}

/* ================= Input ================= */

// A sun tap is fusion: hydrogen nuclei collide in the core and become helium, releasing energy.
// Before ignition, each tap squeezes the core hotter. Once lit, the sun burns on its own and a tap sends out a ray.
Scene.onSunTap((x, y) => {
  state.clicks++;
  state.sinceTap = 0;
  Scene.fusion();
  if (state.ignition < 1) {
    state.ignition = Math.min(1, state.ignition + 1 / IGNITION_TAPS);
    floatText(x, y - 10, state.ignition >= 1 ? 'Ignition!' : pct(state.ignition));
    buzz(6);
    return;
  }
  Scene.ray();
  buzz(6);
});

// Each tap squeezes the singularity hotter. At full heat it bangs and the flight through space begins;
// from then on each tap speeds up the flight.
Scene.onBangTap(() => {
  if (state.banged) {
    warpSpeed = Math.min(WARP_MAX, warpSpeed + WARP_TAP);
    buzz(4);
    return;
  }
  state.sinceTap = 0;
  state.bang = Math.min(1, state.bang + 1 / BANG_TAPS);
  buzz(6);
  if (state.bang >= 1) {
    state.banged = true;
    movieP = 0;
    warpSpeed = WARP_START;
    buzz([60, 40, 120]);
    save();
  }
});

// Tapping a glowing volcano on the planet makes it erupt.
// Tapping a critter on the map tells how its species is doing.
Scene.onCritterTap((id, x, y) => {
  const s = SPECIES_BY_ID[id];
  floatText(x, y - 10, `${s.name}: ${lifeState(s)}`, `critter ${lifeState(s) === 'thriving' || lifeState(s) === 'spreading' ? 'good' : 'bad'}`);
  buzz(6);
});

Scene.onVolcanoTap(i => {
  erupt(i);
  buzz([20, 30, 20]);
});

// Swiping the planet spins it. At full spin the planet throws off a blob of molten rock, the moon, and the
// spin locks for good: days begin.
Scene.onSpin(amount => {
  if (state.spinLocked) return;
  state.spin = Math.min(1, state.spin + amount * SPIN_PER_SCREEN);
  if (state.spin >= 1) {
    state.spinLocked = true;
    floatText(innerWidth / 2, innerHeight / 2, 'Spin locked!');
    buzz([30, 50, 30]);
  }
  if (!state.moonBorn && state.spin >= MOON_SPIN) {
    state.moonBorn = true;
    Scene.flingMoon();
    buzz([40, 60, 40, 60]);
  }
});


function lightningHit(zone, x, y, hit) {
  state.strikes++;
  // The first thunderstorm counts as found in the natural disasters collection.
  if (has('storms') && !state.disasters.thunderstorm) disaster('thunderstorm', x, y);
  if (bandHunt('radio') && Scene.spotCount('band') === 0 && Math.random() < 0.4) Scene.glimmer('radio', { x, y: y - 20 }, 4);
  // Once thunderstorms are known, a bolt into dry plants can start a wildfire.
  if (zone === 'ground' && hit?.u >= 0 && has('storms') && !(state.rainbowShield > 0) && Math.random() < WILDFIRE_CHANCE * (state.drought > 0 ? 2 : 1) && Terrain.ignite(hit.u, hit.v, 5 + Math.random() * 5)) {
    disaster('wildfire', x, y);
  }
  // The soup of life forms where lightning strikes tidal pools: warm, shallow, rich water that dries and wets.
  if (zone === 'ocean' && seen('storms') && soupBuilds() && !(has('pools') && has('rna'))) {
    // Lightning on the open sea alone makes no soup; it takes tidal pools and RNA, the first genes.
  } else if (zone === 'ocean' && seen('storms') && soupBuilds()) {
    const add = soupMult();
    state.soup = Math.min(SOUP_FULL, state.soup + add);
    floatText(x, y - 10, `+${add.toFixed(1)} soup`, 'soup');
  } else if (zone === 'ocean' && seen('life')) {
    // After life appears, lightning still feeds the ocean with nitrogen: a little DNA.
    const add = 1 + rates.dna * 2;
    state.dna += add;
    floatText(x, y - 10, `+${fmt(add)} DNA`, 'soup');
  } else {
    floatText(x, y - 10, 'Missed the ocean', 'miss');
  }
  buzz(15);
}

Scene.onCloudTap((kind, zone, x, y, hit) => {
  if (kind === 'storm') {
    lightningHit(zone, x, y, hit);
    return;
  }
  if (!has('rain')) return;
  state.clouds = Math.max(0, state.clouds - 0.004);
  // Rain is nearly pure water; it picks up minerals by wearing down rock, so only rain on land brings any.
  if (!(hit.land > 0)) {
    floatText(x, y, 'Rain on the sea', 'miss');
  } else {
    const add = mult('rainMult') * hit.land;
    state.minerals += add;
    floatText(x, y, `+${fmt(add)} minerals`, 'rain');
  }
  buzz(4);
});

// A tapped comet crashes into the planet. It delivers the atoms in its tail, changes the air,
// throws up dust that cools the planet for a while, and brings water and organic molecules.
Scene.onCometTap((x, y, atoms) => {
  atoms.forEach(sym => {
    COMET_ATOMS[sym].hit();
    state.matter[sym] = (state.matter[sym] || 0) + 1;
    discover(sym, x, y - 30);
  });
  state.aerosols = Math.min(1, state.aerosols + COMET_DUST);
  const reward = Math.max(20, state.minerals * 0.1);
  state.minerals += reward;
  state.comets++;
  let text = `${atoms.map(a => `+1 ${a}`).join(' ')} · +${fmt(reward)} minerals`;
  if (seen('life')) {
    const dna = Math.max(5, rates.dna * 30);
    state.dna += dna;
    text += ` and +${fmt(dna)} DNA`;
  }
  floatText(x, y, text);
  buzz([20, 40, 20]);
});

// Each atom rides along by its own chance; a comet always carries at least one.
function cometAtoms() {
  const atoms = Object.keys(COMET_ATOMS).filter(a => Math.random() < COMET_ATOMS[a].chance);
  return atoms.length ? atoms : ['H'];
}

// While some visible research still waits for comet matter, comets come more often.
const needsMatter = () => RESEARCH.some(u => !has(u.id) && chainOpen(u) && (u.needs || []).some(n => n[0] === 'matter' && !needMet(n)));

function scheduleComet() {
  const missing = needsMatter();
  setTimeout(() => {
    if (!document.hidden && has('cometsight')) {
      const atoms = cometAtoms();
      Scene.launchComet(atoms, atoms.map(a => COMET_ATOMS[a].color));
    }
    scheduleComet();
  }, (missing ? 12 + Math.random() * 14 : 50 + Math.random() * 90) * 1000);
}

let resetArmed = null;
$('#reset').addEventListener('click', () => {
  const btn = $('#reset');
  if (!resetArmed) {
    btn.textContent = 'Tap again to erase';
    resetArmed = setTimeout(() => {
      resetArmed = null;
      btn.textContent = 'Reset game';
    }, 3000);
    return;
  }
  clearTimeout(resetArmed);
  resetArmed = null;
  btn.textContent = 'Reset game';
  newGame();
});

function newGame() {
  localStorage.removeItem(SAVE_KEY);
  state = freshState();
  owned = new Set();
  Scene.setSky([], []);
  Object.keys(tabKeys).forEach(k => delete tabKeys[k]);
  recalc();
  if (bookOpen) closeBook();
}

$('#version').textContent = `Phylarium ${VERSION}${CHANNEL === 'stable' ? '' : ' ' + CHANNEL}`;
$('#worlds-btn').classList.toggle('hidden', !worldId);
$('#wiki-link').classList.toggle('hidden', CHANNEL === 'stable');
if (worldId) {
  $('#world-name').textContent = worldName() || '';
  document.title += ` · ${worldName() || 'World'}`;
}
$('#update').addEventListener('click', () => {
  save();
  location.reload();
});

/* ================= Offline progress ================= */

function applyOffline() {
  if (!state.banged) return;
  const away = Math.min((Date.now() - state.lastTick) / 1000, OFFLINE_CAP_S);
  state.lastTick = Date.now();
  if (away < 10) return;
  // Simulate in small steps so the climate and populations play out believably.
  const step = Math.min(2, Math.max(0.5, away / 3000));
  for (let done = 0; done < away; done += step) {
    recalc();
    simulate(step * OFFLINE_RATE);
  }
  recalc();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) save();
  else applyOffline();
});
window.addEventListener('pagehide', save);

// Another tab reset the game: reload so this tab does not write its old state back.
window.addEventListener('storage', e => {
  if (e.key === SAVE_KEY && e.newValue === null) {
    skipSave = true;
    location.reload();
  }
});

/* ================= Main loop ================= */

// Years since the Big Bang during the flight: slow at first, then racing, reaching the sun's birth on arrival.
const movieYears = () => SUN_BIRTH_YEARS * clamp01(movieP / 0.8) ** 3;

// The hour of the day as a 24-hour clock, e.g. 07:30.
// Years since the Big Bang, going on from where the opening movie stops; the sun ages from there.
// Days and the time of day begin when the spin locks.
function dateText() {
  const years = `${(SUN_BIRTH_YEARS / 1e9 + state.sunAge).toFixed(2)} billion years`;
  return state.spinLocked ? `${years} · Day ${Math.floor(state.clock / 24) + 1} · ${clockText()}` : years;
}

function clockText() {
  const h = state.clock % 24;
  return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
}

function fmtYears(y) {
  if (y < 1e3) return `${Math.floor(y)} years`;
  if (y < 1e6) return `${Math.floor(y / 1e3)} thousand years`;
  if (y < 1e9) return `${Math.floor(y / 1e6)} million years`;
  return `${(y / 1e9).toFixed(1)} billion years`;
}

function renderHud(c) {
  if (inCinema()) {
    el.temp.textContent = state.banged ? fmtYears(movieYears()) : '0 years';
    el.tempSub.textContent = state.banged ? 'since the Big Bang' : state.bang < 0.02 ? 'Singularity' : `Singularity ${pct(state.bang)}`;
    document.documentElement.style.setProperty('--temp-color', Hues.css('#ffe08a'));
    return;
  }
  // On screen: only the date and the temperature. Everything else is in the science book.
  el.temp.textContent = fmtTemp(c);
  el.tempSub.textContent = '';
  el.hudLine.textContent = dateText();
  document.documentElement.style.setProperty('--temp-color', Hues.css(tempColor(c)));
}

function updateScene(c) {
  // The scene's colors were tuned for big swings; a warm-but-livable planet should still look blue.
  Scene.setClimate(c < 14 ? c - 14 : (c - 14) * 0.4);
  Scene.setIce(iceCover());
  // The unlit sun glows brighter as ignition builds, though it gives no heat yet.
  Scene.setAtmosphere(state.pressure, methaneHaze(), Math.max(sunBrightness(), SUN_IGNITED * state.ignition ** 3));
  Scene.setOpening(1);
  Scene.setSunBackground(componentDone('sun'));
  Scene.setMoon(state.moonBorn, state.ignition >= 1 ? 1 : 0, componentDone('moon'));
  Scene.setSpin(state.spin);
  Scene.setVolcanoes(has('supervolcano') ? 4 : has('volcano') ? 2 : 0);
  Scene.setLand(state.land, state.mountains, state.aerosols);
  Scene.setWaves(has('waves') ? clamp01(0.3 + state.pressure * 0.7) : 0, glowTonight());   // wind on open water; the glow at night
  Scene.setFeatures({
    peaks: has('collision') ? Math.max(1, Math.round(state.mountains * 8)) : 0,
    snow: glacierIce() > 0.05, rivers: has('rivers'), lakes: has('lakes'), frozen: tempC() < 0,
    temp: Math.round(tempC()), rain: has('rain') ? Math.round(state.clouds * 20) / 20 : 0,
    grass: has('grass'), forests: has('forests'), wetlands: has('wetlands'), reefs: has('shallows'), roots: has('roots'),
    drought: state.drought > 0 && !setDone('grasses'), redTide: state.redTide > 0,   // wild grasses hold the land through droughts
  });
  Scene.setHeatView(state.heatView && setDone('bands'));
  const storms = seen('storms') ? Math.min(3, 1 + Math.floor((state.clouds - STORM_CLOUDS) * 10)) : 0;
  Scene.setClouds(has('clouds') ? state.clouds : 0, Math.max(0, storms));
  Scene.setLife(clamp01(rates.green), clamp01(rates.life / 6), ozone());
  // Every living species shows on the map, up to three of each; microbes are too small to see.
  Scene.setCritters(SPECIES.filter(s => state.species[s.id] > 0.05 && !MICROBES.has(s.id))
    .map(s => ({ id: s.id, sprite: s.icon, home: s.home || ['sea'], n: Math.ceil(state.species[s.id] * 3) })));
}

let last = performance.now();
let slowTimer = 0, worldTimer = 0, lifeTimer = 0, saveTimer = 0, lightningTimer = 0;

function frame(now) {
  const dt = Math.min((now - last) / 1000, 1);
  last = now;
  if (!state.banged) {
    // The singularity cools back down when the player stops tapping, like the sun before ignition.
    state.sinceTap = (state.sinceTap || 0) + dt;
    if (state.sinceTap > IGNITION_GRACE_S) state.bang = Math.max(0, state.bang - BANG_DECAY * dt);
  } else if (movieP !== null) {
    movieP += movieP < 0.8 ? warpSpeed * WARP_RATE * dt : 0.2 * dt / ARRIVAL_S;
    if (movieP >= 1) movieP = null;
  } else simulate(dt);
  state.lastTick = Date.now();
  Scene.setCinema(!state.banged ? 'pre' : movieP !== null ? 'warp' : null, !state.banged ? state.bang : movieP, warpSpeed);
  document.body.classList.toggle('cinema', inCinema());
  Scene.setDay(state.spinLocked, state.clock % 24, state.clock / 24);
  Scene.setStars(has('starlight'), zodiacOpen(), planetsOpen());
  Scene.setStarExtras(has('starcolors'), has('nebulae'), has('milkyway'));
  updateTonight();
  Scene.setTonight(state.tonight?.sign, state.tonight?.night);

  const c = tempC();
  renderHud(c);

  // Thunderstorms strike on their own; a climax storm strikes fast.
  if (rates.lightning > 0 && seen('storms')) {
    lightningTimer += dt * (stormBurst > 0 ? 3 : rates.lightning);
    if (lightningTimer >= 1) {
      lightningTimer = 0;
      const s = Scene.autoStrike();
      if (s) lightningHit(s.zone, s.x, s.y, s);
      stormBurst = Math.max(0, stormBurst - 1);
    }
  }

  slowTimer += dt;
  if (slowTimer > 0.2) {
    slowTimer = 0;
    recalc();
    checkEvents();
    lifeTick();
    updateScene(c);
    stepFires(0.2);
    disasterTick(0.2, now);
    playTick(0.2);
    bandTick(0.2);
    auroraTick(0.2);
    eclipseTick(0.2);
    collectTick(0.2);
    storyTick();
    findAtoms();
    renderCategory(false, true);
    updateDots();
    renderResearchBar();
  }

  worldTimer += dt;
  if (worldTimer > 1) {
    worldTimer = 0;
    if (bookOpen && currentCat === 'game') renderWorld();
  }

  lifeTimer += dt;
  if (lifeTimer > 0.5) {
    lifeTimer = 0;
    if (bookOpen && currentCat === 'science' && SECTIONS.life.unlocked()) renderLife();
  }

  saveTimer += dt;
  if (saveTimer > 10) {
    saveTimer = 0;
    save();
  }

  updateColors(dt);
  Scene.draw(now, dt);
  requestAnimationFrame(frame);
}

/* ================= Boot ================= */

// Checks the links inside data/*.yaml and between it and the code, so a typo shows up in the console
// (and fails the smoke test) instead of quietly breaking a chain.
function checkData() {
  const problems = [], ids = new Set(RESEARCH.map(r => r.id)), events = new Set(EVENTS.map(e => e.id));
  const ref = (ok, what) => ok || problems.push(what);
  for (const r of RESEARCH) {
    ref(!r.ultra || STORIES.some(st => st.ultra === r.id), `research ${r.id}: ultra but no story names it`);
    ref(!r.puzzle || PUZZLES[r.puzzle], `research ${r.id}: unknown puzzle ${r.puzzle}`);
    (r.reaction || []).forEach(t => ref(ATOMS[t] || ids.has(t), `research ${r.id}: unknown reactant ${t}`));
    ref(SECTIONS[r.tab], `research ${r.id}: unknown tab ${r.tab}`);
    ref(!r.after || events.has(r.after), `research ${r.id}: unknown event ${r.after}`);
    ref(!r.replaces || ids.has(r.replaces), `research ${r.id}: replaces unknown ${r.replaces}`);
    (r.requires || []).forEach(id => ref(ids.has(id), `research ${r.id}: requires unknown ${id}`));
    (r.needs || []).forEach(([kind, v]) => {
      ref(NEEDS[kind], `research ${r.id}: unknown need ${kind}`);
      ref(kind !== 'done' || ids.has(v), `research ${r.id}: needs unknown research ${v}`);
      ref(kind !== 'matter' || ATOMS[v[0]], `research ${r.id}: needs unknown atom ${v[0]}`);
      ref(kind !== 'atom' || ATOMS[v], `research ${r.id}: needs unknown atom ${v}`);
    });
    ref(r.gauge, `research ${r.id}: no gauge in RESEARCH_CODE`);
    ref(SPRITES[r.icon], `research ${r.id}: unknown icon ${r.icon}`);
    (r.needs || []).forEach(([kind, v]) => ref(kind !== 'evolved' || SPECIES_BY_ID[v], `research ${r.id}: needs unknown species ${v}`));
  }
  Object.keys(RESEARCH_CODE).forEach(id => ref(ids.has(id), `RESEARCH_CODE: ${id} is not in research.yaml`));
  for (const sp of SPECIES) {
    ref(!sp.parent || SPECIES_BY_ID[sp.parent], `species ${sp.id}: unknown parent ${sp.parent}`);
    ref(!sp.research || ids.has(sp.research), `species ${sp.id}: unknown research ${sp.research}`);
    ref(DOMAIN_OPENS[sp.domain], `species ${sp.id}: unknown domain ${sp.domain}`);
    ref(SPRITES[sp.icon], `species ${sp.id}: unknown icon ${sp.icon}`);
  }
  for (const st of STORIES) {
    st.chapters.forEach(id => ref(ids.has(id), `story ${st.id}: unknown chapter ${id}`));
    ref(!st.disaster || (DISASTERS[st.disaster] && RESEARCH_BY_ID[st.disaster]?.disaster), `story ${st.id}: disaster ${st.disaster} needs an entry in disasters.yaml and a research node with disaster: true`);
    ref(!st.ultra || RESEARCH_BY_ID[st.ultra]?.ultra, `story ${st.id}: ultra ${st.ultra} is not an ultra research`);
    ref(!st.minigame || MINIGAMES[st.minigame], `story ${st.id}: unknown minigame ${st.minigame}`);
  }
  for (const c of SUBJECTS) c.sections.forEach(sec => ref(SECTIONS[sec], `subject ${c.id}: unknown section ${sec}`));
  Object.keys(SECTIONS).forEach(sec => ref(SECTION_UNLOCKED[sec], `section ${sec}: no SECTION_UNLOCKED`));
  Object.values(DISASTER_ODDS).forEach((d, i) => ref(d.when, `disaster ${Object.keys(DISASTER_ODDS)[i]}: no DISASTER_WHEN`));
  Object.keys(LAWS).forEach(id => ref(LAWS[id].found, `law ${id}: no LAW_FOUND`));
  COLLECTION_BY_ID.bands.items.forEach(b => ref(BAND_GLIMMER[b.id], `band ${b.id}: no BAND_GLIMMER`));
  COLLECTION_BY_ID.glows.items.forEach(g => ref(GLOW_IN_AIR[g.id], `glow ${g.id}: no GLOW_IN_AIR`));
  COLLECTIONS.forEach(c => ref(SECTIONS[c.section] && ids.has(c.opens), `collection ${c.id}: unknown section or ultra`));
  [...Object.keys(ATOM_FOUND), ...Object.keys(COMET_HIT)].forEach(sym => ref(ATOMS[sym], `atom code: ${sym} is not in atoms.yaml`));
  problems.forEach(p => console.error(`Data: ${p}`));
  // Outside stable, show them on screen too, so an edit to the YAML that breaks a link is seen at once. Tap to close.
  if (problems.length && CHANNEL !== 'stable') {
    const box = document.createElement('pre');
    box.className = 'data-error';
    box.textContent = `Problems in data/*.yaml (tap to close):\n\n${problems.join('\n')}`;
    box.addEventListener('click', () => box.remove());
    document.body.appendChild(box);
  }
}

checkData();

load();
Scene.init();
buildPanels();
recalc();
grantSeenColors();
grantFirstCell();
updateColors(0);
updateScene(tempC());   // the scene works out the climate zones that habitats depend on
applyOffline();
updateScene(tempC());
updateDots();
Scene.setSky(state.signs, state.planets);
setupMenu();
if (MULTI_WORLD && !worldId) showMenu();
scheduleComet();
requestAnimationFrame(frame);

// Offline support only on the real HTTPS site. During local development, remove any
// service worker and cache left over from earlier versions so a stopped server looks stopped.
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator) {
  if (location.protocol === 'https:' && !isLocal) {
    // A new version takes over at once; offer a reload instead of swapping the game under the player.
    const hadWorker = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadWorker) $('#update').classList.remove('hidden');
    });
    // Check for a new version every 30 minutes, and whenever the app comes back to the front: an installed
    // app on a phone can stay suspended for days without ever starting again.
    navigator.serviceWorker.register('sw.js').then(reg => {
      setInterval(() => !document.hidden && reg.update(), 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => !document.hidden && reg.update().catch(() => {}));
    }).catch(() => {});
  } else {
    navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
    window.caches?.keys().then(keys => keys.forEach(k => caches.delete(k)));
  }
}
