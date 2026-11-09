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
    findSunColors(x, y);
    buzz(6);
    return;
  }
  Scene.ray(state.games.shine || 0);
  findSunColors(x, y);
  buzz(6);
});

// The burning sun shows yellow, orange and red at once.
function findSunColors(x, y) {
  for (const name of ['yellow', 'orange', 'red']) findColor(name, x, y);
}

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
  // The cracks game (Restless Earth): a cone raised on a crack rumbles at a tap and erupts at the second; a cone
  // that has erupted in the game only rumbles after. Three eruptions, on three cones, win.
  if (!gameWon('cracks')) {
    findColor('red', x ?? innerWidth / 2, y ?? innerHeight / 2);
    const taps = (state.coneTaps ||= {});
    if (taps[i] === -1 || (taps[i] = (taps[i] || 0) + 1) < 2) {
      Scene.rumble(i);
      buzz(15);
      return;
    }
    taps[i] = -1;
    erupt(i);
    playHit('cracks', x ?? innerWidth / 2, y ?? innerHeight / 2);
    return;
  }
  if (!has('volcgas')) return; // a volcano breathes out gas once Volcanic Gas is known
  state.gasTaps = (state.gasTaps || 0) + 1;
  const add = erupt(i, false, true);
  findColor('red', x ?? innerWidth / 2, y ?? innerHeight / 2);
  floatText(x ?? innerWidth / 2, (y ?? innerHeight / 2) - 20, `+${fmt(add)} ppm CO₂`);
  buzz([20, 30, 20]);
});

// A tap on the sky or the sea finds the color that shows there: blue air, green life in the water.
// Once the planet holds still, a tap on the ground opens a close-up of that spot (tiles.js).
Scene.onZoneTap((zone, x, y) => {
  if (zone === 'atmosphere') findColor('blue', x, y);
  if (zone === 'ocean') findColor('green', x, y);
  const texel = zone === 'ground' && state.spinLocked && !inCinema() && Scene.texelAt(x, y);
  if (texel) Tiles.open(texel.u, texel.v);
});

// Swiping the planet spins it. At full spin the planet throws off a blob of molten rock, the moon, and the
// spin locks for good: days begin.
function spinBy(amount) {
  // The planet can be spun any time after the opening: The molten heart is a page of research, not a line of steps.
  if (state.spinLocked || inCinema()) return;
  state.spin = Math.min(1, state.spin + amount * SPIN_PER_SCREEN);
  if (state.spin >= 1) {
    state.spinLocked = true;
    floatText(innerWidth / 2, innerHeight / 2, 'Spin locked!');
    recalc(); // Rotation (The molten heart) is known from now on
    buzz([30, 50, 30]);
  }
  if (!state.moonBorn && state.spin >= MOON_SPIN) {
    state.moonBorn = true;
    Scene.flingMoon();
    buzz([40, 60, 40, 60]);
  }
}
Scene.onSpin(spinBy);

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
  // A snowing cloud: each tap finds the snowflake that grows in the air under it.
  if (kind === 'snow') {
    const flake = snowflakeAt(hit.temp);
    if (flake && !collect('snowflakes', x, y, flake.id)) floatText(x, y, flake.name, 'rain');
    buzz(4);
    return;
  }
  if (!has('rain')) return;
  state.clouds = Math.max(0, state.clouds - 0.004);
  floatText(x, y, hit.land > 0 ? 'Rain on the land' : 'Rain on the sea', hit.land > 0 ? 'rain' : 'miss');
  buzz(4);
});

// One comet a night, once Comets is known: a famous comet not caught yet, at random. With no air yet they come by
// day too, and before the spin locks one comes each day's worth of play. A caught comet never comes
// back; one that flies by uncaught can come another night. Catching the last one completes the matter: carbon,
// nitrogen and oxygen are found, and the molecules can be made (ATOM_FOUND, data/research.yaml).
// While dinosaurs live, a body still comes each night until one is caught: the asteroid that ends their age.
let cometNight = -1;
function cometTick() {
  if (!has('cometsight') || (sunUp() && !airless()) || Scene.cometPoint()) return;
  const night = skyNight();
  if (night === cometNight) return;
  const dinosaurs = (evolved('dinosaur') || isExtinct('dinosaur')) && !state.impact,
    left = COLLECTION_BY_ID.comets.items.filter(it => !found('comets').includes(it.id));
  if (!left.length && !dinosaurs) return;
  cometNight = night;
  state.cometNext = left.length ? left[Math.floor(Math.random() * left.length)].id : null;
  Scene.launchComet([], ['#bfe8ff', '#ffffff']);
}

// A tapped comet crashes into the planet: its ices change the air, its dust cools the planet for a while, and its
// card is found.
Scene.onCometTap((x, y) => {
  // While dinosaurs live, a caught comet is the big one: it falls as the asteroid that ends their age.
  if ((evolved('dinosaur') || isExtinct('dinosaur')) && !state.impact) {
    asteroidImpact();
    return;
  }
  cometImpact();
  state.aerosols = Math.min(1, state.aerosols + COMET_DUST);
  state.comets++;
  findColor('orange', x, y);
  if (state.cometNext) collect('comets', x, y, state.cometNext);
  state.cometNext = null;
  buzz([20, 40, 20]);
});

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
  resetSession();
  recalc();
  if (bookOpen) closeBook();
}

// Everything kept outside the state for the session: timers, caches and what is on screen. A new world starts
// with none of it.
function resetSession() {
  Scene.setSky([]);
  Object.keys(tabKeys).forEach(k => delete tabKeys[k]);
  Object.keys(hudShown).forEach(k => delete hudShown[k]);
  cometNight = -1;
  lastDisaster = -1e9;
  gemRush = 0;
  stormBurst = 0;
  wasDry = false;
  splashQueue.length = 0;
  thumbAt = 0;
  Terrain.calm();
  $('#research-bars').innerHTML = '';
}

$('#version').textContent = `Phylarium ${VERSION}${CHANNEL === 'stable' ? '' : ' ' + CHANNEL}`;
$('#worlds-btn').classList.toggle('hidden', !worldId);
$('#wiki-link').classList.toggle('hidden', CHANNEL === 'stable');
if (worldId) {
  /** @type {HTMLInputElement} */ ($('#world-name')).value = worldName() || '';
  $('#world-name').classList.remove('hidden');
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
  if (inCinema()) return;
  if (away < 10) {
    advanceResearch(away);
    return;
  }
  state.offlineToday = (state.offlineToday || 0) + away;
  // Simulate in small steps so the climate and populations play out believably; disasters wear off meanwhile.
  // Production runs at the offline rate, but research runs on real time.
  const step = Math.min(4, Math.max(0.5, away / 3000));
  for (let done = 0; done < away; done += step) {
    recalc();
    simulate(step * OFFLINE_RATE);
    advanceResearch(step * (1 - OFFLINE_RATE));
    disasterTimers(step);
  }
  recalc();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    save();
    saveThumb(true);
  } else applyOffline();
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
    // Nothing on the HUD: the scene types the word Singularity and sucks it into the dot; the flash says BIG BANG!.
    setText(el.temp, 'temp')('');
    setText(el.tempSub, 'sub')('');
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
    // Dark (only faint earthshine) until the sun is lit; from then on it waxes and wanes with the month.
    state.ignition >= 1 ? moonPhase() : 0,
  );
  Scene.setSpin(state.spin);
  Scene.setVolcanoes(has('volcano') ? CONES : Math.min(CONES, state.cones || 0)); // the cones the cracks game raised
  Scene.setLand(state.land, state.mountains, state.aerosols);
  Scene.setDrift(state.drift);
  Scene.setWeather({ rain: has('rain'), snow: has('snow'), hail: has('hail') });
  Scene.setWaves(has('waves') ? clamp01(0.3 + state.pressure * 0.7) : 0, glowTonight()); // wind on open water; the glow at night
  Scene.setFeatures({
    peaks: has('mountains') ? Math.max(1, Math.min(3, Math.ceil(state.mountains * 3))) : 0,
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
    heat: Math.round((1 - state.crust) * 50) / 50, // the molten surface, cooling into rock
    oceans: Math.round(state.oceans * 50) / 50, // the basins filling with the comets' water
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
  Scene.setGlowPulse(state.banged && state.crust < 1 ? 0.5 + 0.5 * Math.sin(now / 500) : 0); // the molten surface breathes
  Scene.setStars(has('starlight'), zodiacOpen(), planetsOpen()); // the stars come with the fifth tapped star
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
    gemTick(0.2);
    driftTick(0.2);
    cometTick();
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
      (c.section ? SECTIONS[c.section] : POSTER_BY_ID[c.poster]) && (!c.ultra || RESEARCH_BY_ID[c.ultra]?.ultra),
      `collection ${c.id}: unknown section, poster or ultra`,
    ),
  );
  RESEARCH.filter(u => u.ultra).forEach(u => ref(u.card, `ultra ${u.id}: no card text`));
  Object.keys(ATOM_FOUND).forEach(sym => ref(ATOMS[sym], `atom code: ${sym} is not in atoms.yaml`));
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
// A world closed right after the fifth star is past the opening.
if (state.banged && !state.opened && gameWon('twinkle')) state.opened = true;
if (state.banged && !has('starlight')) Scene.relight(state.games.twinkle || 0);
grantSeenColors();
grantFirstCell();
updateColors(0);
updateScene(tempC()); // the scene works out the climate zones that habitats depend on
applyOffline();
updateScene(tempC());
updateDots();
Scene.setSky(state.signs);
setupMenu();
// The title shows on the start menu, and on stable (one world, no menu) once per visit.
let titled = false;
try {
  titled = !MULTI_WORLD && sessionStorage.getItem('phylarium-titled') === '1';
  if (!MULTI_WORLD) sessionStorage.setItem('phylarium-titled', '1');
} catch {}
if (!worldId && !titled) showMenu();
document.body.classList.remove('loading'); // the game is on screen: the HUD may show (hidden while the data loaded)
// A milestone (?milestone=<n>, opened from /beta/<n>/): a new world starting from a save the pacing bot made at
// that point (tools/milestones.mjs), so testers need not play all the way there.
const milestone = MULTI_WORLD && !worldId && new URLSearchParams(location.search).get('milestone');
if (milestone && /^\d+$/.test(milestone))
  Promise.all([fetch(`milestones/${milestone}.json`), fetch('milestones/index.json')])
    .then(async ([save, index]) => {
      if (!save.ok || !index.ok) throw new Error(`no milestone ${milestone}`);
      const data = await save.json(),
        name = (await index.json()).find(m => String(m.n) === milestone)?.name || '';
      const id = newWorldId();
      store.set(`${CHANNEL_SAVE_KEY}-w-${id}`, JSON.stringify({ ...data, lastTick: Date.now() }));
      writeWorlds([
        ...readWorlds(),
        { id, name: `Milestone ${milestone}: ${name}`, created: Date.now(), played: Date.now(), summary: '' },
      ]);
      openWorld(id);
    })
    .catch(e => reportSaveProblem(`Could not open milestone ${milestone}: ${e.message}`));
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
