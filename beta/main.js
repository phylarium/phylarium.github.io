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

const TEMP_COLORS = [
  [-300, '#8a7cff'],
  [-100, '#9fd3ff'],
  [-20, '#bfe6ff'],
  [LIFE_WINDOW[0], '#8af0b0'],
  [LIFE_WINDOW[1], '#ffa040'],
  [50, '#ff5a3a'],
];

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
    findColor('yellow', x, y);
    buzz(6);
    return;
  }
  Scene.ray();
  findColor('yellow', x, y);
  buzz(6);
});

// Each tap swells the singularity. At full size it bangs: a flash, and then the dark.
Scene.onBangTap(() => {
  if (state.banged) return;
  state.sinceTap = 0;
  state.bang = Math.min(1, state.bang + 1 / BANG_TAPS);
  buzz(6);
  if (state.bang >= 1) {
    state.banged = true;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) Scene.flash();
    buzz([60, 40, 120]);
    save();
  }
});

// Tapping a glowing volcano on the planet makes it erupt.
// Tapping a critter on the map tells how its species is doing.
Scene.onCritterTap((id, x, y) => {
  const s = SPECIES_BY_ID[id];
  floatText(
    x,
    y - 10,
    `${s.name}: ${lifeState(s)}`,
    `critter ${lifeState(s) === 'thriving' || lifeState(s) === 'spreading' ? 'good' : 'bad'}`,
  );
  buzz(6);
});

// Tapping a glowing volcano lets it breathe out a cloud of CO₂: a little more warmth each time, like comets
// bring their atoms. Each volcano needs a while to glow again, and too many taps heat the planet too much.
Scene.onVolcanoTap((i, x, y) => {
  if (!has('volcgas')) return; // a volcano breathes out gas once Volcanic Gas is known
  state.gasTaps = (state.gasTaps || 0) + 1;
  const add = erupt(i, false, true);
  findColor('red', x ?? innerWidth / 2, y ?? innerHeight / 2);
  floatText(x ?? innerWidth / 2, (y ?? innerHeight / 2) - 20, `+${fmt(add)} ppm CO₂`);
  buzz([20, 30, 20]);
});

// A tap on the sky or the sea finds the color that shows there: blue air, green life in the water.
Scene.onZoneTap((zone, x, y) => {
  if (zone === 'atmosphere') findColor('blue', x, y);
  if (zone === 'ocean') findColor('green', x, y);
});

// Swiping the planet spins it. At full spin the planet throws off a blob of molten rock, the moon, and the
// spin locks for good: days begin.
Scene.onSpin(amount => {
  if (state.spinLocked || inCinema()) return;
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
  findColor('violet', x, y);
  // The first thunderstorm counts as found in the natural disasters collection.
  if (has('storms') && !state.disasters.thunderstorm) disaster('thunderstorm', x, y);
  if (bandHunt('radio') && Scene.spotCount('band') === 0 && Math.random() < 0.4)
    Scene.glimmer('radio', { x, y: y - 20 }, 4);
  // Once thunderstorms are known, a bolt into dry plants can start a wildfire.
  if (
    zone === 'ground' &&
    hit?.u >= 0 &&
    has('storms') &&
    !(state.rainbowShield > 0) &&
    Math.random() < WILDFIRE_CHANCE * (state.drought > 0 ? 2 : 1) &&
    Terrain.ignite(hit.u, hit.v, 5 + Math.random() * 5)
  ) {
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
    // After life appears, lightning still feeds the ocean with nitrogen: the species evolving now gets on a bit.
    evolveReward(x, y - 10, 0.02);
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
  // While dinosaurs live, a caught comet is the big one: it falls as the asteroid that ends their age.
  if (evolved('dinosaur') && !state.impact) {
    asteroidImpact();
    return;
  }
  atoms.forEach(sym => {
    COMET_ATOMS[sym].hit();
    state.matter[sym] = (state.matter[sym] || 0) + 1;
    discover(sym, x, y - 30);
  });
  state.aerosols = Math.min(1, state.aerosols + COMET_DUST);
  const reward = Math.max(20, state.minerals * 0.1);
  state.minerals += reward;
  state.comets++;
  findColor('orange', x, y);
  if (!found('comets').length || Math.random() < 0.4) collect('comets', x, y);
  const text = `${atoms.map(a => `+1 ${a}`).join(' ')} · +${fmt(reward)} minerals`;
  floatText(x, y, text);
  buzz([20, 40, 20]);
});

// Each atom rides along by its own chance; a comet always carries at least one.
function cometAtoms() {
  const atoms = Object.keys(COMET_ATOMS).filter(a => Math.random() < COMET_ATOMS[a].chance);
  return atoms.length ? atoms : ['H'];
}

// While some visible research still waits for comet matter, comets come more often.
// Comets come often while there is something to get from them: an atom they carry that is not found yet,
// research waiting on atoms or comet matter, or fewer comets caught than Visitors from space asks for.
const COMET_GOAL = Math.max(...RESEARCH.flatMap(u => (u.needs || []).filter(n => n[0] === 'comets').map(n => n[1])));
const needsMatter = () =>
  Object.keys(COMET_ATOMS).some(a => !state.atoms.includes(a)) ||
  state.comets < COMET_GOAL ||
  RESEARCH.some(
    u => !has(u.id) && chainOpen(u) && (u.needs || []).some(n => (n[0] === 'matter' || n[0] === 'atom') && !needMet(n)),
  );

function scheduleComet() {
  const missing = needsMatter();
  setTimeout(
    () => {
      if (!document.hidden && has('cometsight')) {
        const atoms = cometAtoms();
        Scene.launchComet(
          atoms,
          atoms.map(a => COMET_ATOMS[a].color),
        );
      }
      scheduleComet();
    },
    ((missing ? 10 + Math.random() * 12 : 40 + Math.random() * 60) * 1000) / (setDone('comets') ? 2 : 1),
  );
}

/** @type {number | null} */
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
  store.remove(SAVE_KEY);
  store.remove(`${SAVE_KEY}-backup`);
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

// Time away counts once: a clock set back (lastTick in the future) counts nothing, and the time counted per real
// day is capped, so moving the device clock back and forth earns no extra time.
function applyOffline() {
  if (!state.banged) return;
  const now = Date.now();
  let away = Math.max(0, Math.min((now - state.lastTick) / 1000, OFFLINE_CAP_S));
  const day = Math.floor(now / 864e5);
  if (state.offlineDay !== day) {
    state.offlineDay = day;
    state.offlineToday = 0;
  }
  away = Math.min(away, Math.max(0, OFFLINE_CAP_S - (state.offlineToday || 0)));
  state.lastTick = now;
  if (away < 10 || inCinema()) return;
  state.offlineToday = (state.offlineToday || 0) + away;
  // Simulate in small steps so the climate and populations play out believably; disasters wear off meanwhile.
  const step = Math.min(4, Math.max(0.5, away / 3000));
  for (let done = 0; done < away; done += step) {
    recalc();
    simulate(step * OFFLINE_RATE);
    disasterTimers(step);
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

// The HUD writes to the page only when a value changed: a style or text change every frame costs layout work.
const hudShown = {};
function setHud(key, value, write) {
  if (hudShown[key] === value) return;
  hudShown[key] = value;
  write(value);
}
const setText = (node, key) => value => setHud(key, value, v => (node.textContent = v));
function renderHud(c) {
  const setColor = v => setHud('color', v, x => document.documentElement.style.setProperty('--temp-color', x));
  if (inCinema()) {
    // t = 0 and the word Singularity typed out letter by letter; after the bang, nothing at all.
    const word = 'Singularity',
      typed = Math.floor((performance.now() - openedAt) / 140);
    setText(el.temp, 'temp')(state.banged ? '' : 't = 0');
    setText(el.tempSub, 'sub')(state.banged ? '' : word.slice(0, Math.max(0, typed - 4)));
    setColor(Hues.css('#ffe08a'));
    return;
  }
  // On screen: only the date and the temperature, each once its SI unit has been found and tapped in the book
  // (the second for the clock, the kelvin for the temperature). Everything else is in the book.
  setText(el.temp, 'temp')(unitRead('kelvin') ? fmtTemp(c) : '');
  setText(el.tempSub, 'sub')('');
  setText(el.hudLine, 'line')(unitRead('second') ? dateText() : '');
  setColor(Hues.css(tempColor(c)));
}

function updateScene(c) {
  // The scene's colors were tuned for big swings; a warm-but-livable planet should still look blue.
  Scene.setClimate(c < 14 ? c - 14 : (c - 14) * 0.4);
  Scene.setIce(iceCover());
  // The unlit sun glows brighter as ignition builds, though it gives no heat yet.
  Scene.setAtmosphere(state.pressure, methaneHaze(), Math.max(sunBrightness(), SUN_IGNITED * state.ignition ** 3));
  Scene.setOpening(1);
  Scene.setSunBackground(componentDone('sun'));
  Scene.setMoon(
    state.moonBorn,
    state.ignition >= 1 ? 1 : 0,
    componentDone('moon'),
    // Dark (only faint earthshine) until Moonlight, full until Phases, then waxing and waning.
    !has('moonlight') ? 0 : has('moonphases') ? moonPhase() : 0.5,
  );
  Scene.setSpin(state.spin);
  Scene.setVolcanoes(has('supervolcano') ? 4 : has('volcano') ? 2 : 0);
  Scene.setLand(state.land, state.mountains, state.aerosols);
  Scene.setWaves(has('waves') ? clamp01(0.3 + state.pressure * 0.7) : 0, glowTonight()); // wind on open water; the glow at night
  Scene.setFeatures({
    peaks: has('collision') ? Math.max(1, Math.round(state.mountains * 8)) : 0,
    snow: glacierIce() > 0.05,
    rivers: has('rivers'),
    lakes: has('lakes'),
    frozen: tempC() < 0,
    temp: Math.round(tempC()),
    rain: has('rain') ? Math.round(state.clouds * 20) / 20 : 0,
    grass: has('grass'),
    forests: has('forests'),
    wetlands: has('wetlands'),
    reefs: has('shallows'),
    roots: has('roots'),
    drought: state.drought > 0 && !setDone('grasses'),
    redTide: state.redTide > 0, // wild grasses hold the land through droughts
  });
  Scene.setHeatView(state.heatView && setDone('bands'));
  const storms = seen('storms') ? Math.min(3, 1 + Math.floor((state.clouds - STORM_CLOUDS) * 10)) : 0;
  Scene.setClouds(has('clouds') ? state.clouds : 0, Math.max(0, storms));
  Scene.setLife(clamp01(rates.green), clamp01(rates.life / 6), ozone());
  // Every living species shows on the map, up to three of each; microbes are too small to see.
  Scene.setCritters(
    SPECIES.filter(s => state.species[s.id] > 0.05 && !MICROBES.has(s.id)).map(s => ({
      id: s.id,
      sprite: s.icon,
      home: s.home || ['sea'],
      n: Math.ceil(state.species[s.id] * 3),
    })),
  );
}

let last = performance.now();
const openedAt = performance.now(); // when the page opened: the singularity's word types out from here
let slowTimer = 0,
  worldTimer = 0,
  lifeTimer = 0,
  saveTimer = 0,
  lightningTimer = 0;

// Frames run at up to 60 fps while the player touches the screen and 30 fps otherwise: the pixel art gains
// nothing from more, and phones with 90-120 Hz screens would draw two to four times as often. An error in one
// frame is reported and the loop goes on.
const FRAME_ACTIVE_S = 1 / 60,
  FRAME_IDLE_S = 1 / 30,
  ACTIVE_FOR_MS = 1500;
let lastInput = 0,
  frameErrors = 0;
addEventListener('pointerdown', () => (lastInput = performance.now()), { capture: true, passive: true });
addEventListener('pointermove', () => (lastInput = performance.now()), { capture: true, passive: true });
function frame(now) {
  requestAnimationFrame(frame);
  const gap = now - lastInput < ACTIVE_FOR_MS ? FRAME_ACTIVE_S : FRAME_IDLE_S;
  if ((now - last) / 1000 < gap - 0.002) return;
  try {
    tick(now);
  } catch (e) {
    if (frameErrors++ < 5) console.error('Frame failed', e);
  }
}

function tick(now) {
  const dt = Math.min((now - last) / 1000, 1);
  last = now;
  if (!state.banged) {
    // The singularity cools back down when the player stops tapping, like the sun before ignition.
    state.sinceTap = (state.sinceTap || 0) + dt;
    if (state.sinceTap > IGNITION_GRACE_S) state.bang = Math.max(0, state.bang - BANG_DECAY * dt);
  } else if (state.opened) simulate(dt); // before that, the dark after the bang holds only the lone star
  state.lastTick = Date.now();
  // The planet's silhouette shows only once Starlight is known; until then the sky stays dark.
  Scene.setCinema(!state.banged ? 'pre' : !state.opened || !has('starlight') ? 'dark' : null, state.bang);
  document.body.classList.toggle('cinema', inCinema());
  Scene.setDay(state.spinLocked, state.clock % 24, state.clock / 24);
  Scene.setStars(has('starsight'), zodiacOpen(), planetsOpen());
  Scene.setStarExtras(has('starcolors'), has('nebulae'), has('milkyway'));
  updateTonight();
  Scene.setTonight(state.tonight?.sign, state.tonight?.night, state.tonight?.planet);

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
    if (bookOpen && currentCat === 'biology' && SECTIONS.life.unlocked()) renderLife();
  }

  saveTimer += dt;
  if (saveTimer > 10) {
    saveTimer = 0;
    save();
  }

  updateColors(dt);
  Scene.draw(now, dt);
}

/* ================= Boot ================= */

// Checks the links inside data/*.yaml and between it and the code, so a typo shows up in the console
// (and fails the smoke test) instead of quietly breaking a chain.
function checkData() {
  const problems = [],
    ids = new Set(RESEARCH.map(r => r.id)),
    events = new Set(EVENTS.map(e => e.id));
  const ref = (ok, what) => ok || problems.push(what);
  for (const r of RESEARCH) {
    ref(!r.ultra || STORIES.some(st => st.ultra === r.id), `research ${r.id}: ultra but no story names it`);
    ref(!r.puzzle || PUZZLES[r.puzzle], `research ${r.id}: unknown puzzle ${r.puzzle}`);
    (r.reaction || []).forEach(t => ref(ATOMS[t] || ids.has(t), `research ${r.id}: unknown reactant ${t}`));
    ref(SECTIONS[r.tab], `research ${r.id}: unknown tab ${r.tab}`);
    ref(!r.after || events.has(r.after), `research ${r.id}: unknown event ${r.after}`);
    (r.requires || []).forEach(id => ref(ids.has(id), `research ${r.id}: requires unknown ${id}`));
    (r.needs || []).forEach(([kind, v]) => {
      ref(NEEDS[kind], `research ${r.id}: unknown need ${kind}`);
      ref(kind !== 'done' || ids.has(v), `research ${r.id}: needs unknown research ${v}`);
      ref(kind !== 'matter' || ATOMS[v[0]], `research ${r.id}: needs unknown atom ${v[0]}`);
      ref(kind !== 'atom' || ATOMS[v], `research ${r.id}: needs unknown atom ${v}`);
    });
    ref(r.gauge, `research ${r.id}: no gauge in RESEARCH_CODE`);
    ref(SPRITES[r.icon], `research ${r.id}: unknown icon ${r.icon}`);
    (r.needs || []).forEach(([kind, v]) =>
      ref(kind !== 'evolved' || SPECIES_BY_ID[v], `research ${r.id}: needs unknown species ${v}`),
    );
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
    ref(
      !st.disaster || (DISASTERS[st.disaster] && RESEARCH_BY_ID[st.disaster]?.disaster),
      `story ${st.id}: disaster ${st.disaster} needs an entry in disasters.yaml and a research node with disaster: true`,
    );
    ref(!st.ultra || RESEARCH_BY_ID[st.ultra]?.ultra, `story ${st.id}: ultra ${st.ultra} is not an ultra research`);
    ref(!st.minigame || MINIGAMES[st.minigame], `story ${st.id}: unknown minigame ${st.minigame}`);
  }
  for (const c of SUBJECTS) c.sections.forEach(sec => ref(SECTIONS[sec], `subject ${c.id}: unknown section ${sec}`));
  Object.keys(SECTIONS).forEach(sec => ref(SECTION_UNLOCKED[sec], `section ${sec}: no SECTION_UNLOCKED`));
  Object.values(DISASTER_ODDS).forEach((d, i) =>
    ref(d.when, `disaster ${Object.keys(DISASTER_ODDS)[i]}: no DISASTER_WHEN`),
  );
  Object.keys(DISASTER_ODDS).forEach(id => ref(DISASTER_EFFECT[id], `disaster ${id}: no DISASTER_EFFECT`));
  Object.keys(LAWS).forEach(id => ref(LAWS[id].found, `law ${id}: no LAW_FOUND`));
  COLLECTION_BY_ID.bands.items.forEach(b => ref(BAND_GLIMMER[b.id], `band ${b.id}: no BAND_GLIMMER`));
  COLLECTION_BY_ID.glows.items.forEach(g => ref(GLOW_IN_AIR[g.id], `glow ${g.id}: no GLOW_IN_AIR`));
  COLLECTION_BY_ID.units.items.forEach(u => ref(UNIT_FOUND[u.id], `unit ${u.id}: no UNIT_FOUND`));
  COLLECTIONS.forEach(c =>
    ref(
      SECTIONS[c.section] && (!c.ultra || RESEARCH_BY_ID[c.ultra]?.ultra),
      `collection ${c.id}: unknown section or ultra`,
    ),
  );
  RESEARCH.filter(u => u.ultra).forEach(u => ref(u.card, `ultra ${u.id}: no card text`));
  [...Object.keys(ATOM_FOUND), ...Object.keys(COMET_HIT)].forEach(sym =>
    ref(ATOMS[sym], `atom code: ${sym} is not in atoms.yaml`),
  );
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
// A world closed between the lone star's tap and the end of its story splash is past the opening.
if (state.banged && !state.opened && gameWon('twinkle') && state.storiesSeen.includes('stars')) state.opened = true;
grantSeenColors();
grantFirstCell();
updateColors(0);
updateScene(tempC()); // the scene works out the climate zones that habitats depend on
applyOffline();
updateScene(tempC());
updateDots();
Scene.setSky(state.signs, state.planets);
setupMenu();
if (MULTI_WORLD && !worldId) showMenu();
scheduleComet();
if (saveProblem) reportSaveProblem(saveProblem);
// Ask the browser to keep this site's storage (the worlds) when the device runs low on space.
navigator.storage?.persist?.().catch(() => {});
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
    navigator.serviceWorker
      .register('sw.js', { updateViaCache: 'none' })
      .then(reg => {
        setInterval(() => !document.hidden && reg.update(), 30 * 60 * 1000);
        document.addEventListener('visibilitychange', () => !document.hidden && reg.update().catch(() => {}));
      })
      .catch(() => {});
  } else {
    navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
    window.caches?.keys().then(keys => keys.forEach(k => caches.delete(k)));
  }
}
