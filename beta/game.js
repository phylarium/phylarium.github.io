'use strict';

/* ================= Config ================= */

// The beta and the branch previews keep their own saves, so a newer save format never reaches the stable game.
const STABLE_SAVE_KEY = 'phylarium-save';
const CHANNEL_SAVE_KEY =
  CHANNEL === 'beta' ? 'phylarium-beta-save' : CHANNEL === 'preview' ? 'phylarium-preview-save' : STABLE_SAVE_KEY;
// Outside stable, the player can keep several worlds, each with its own save. The open world is in the
// URL (?world=id), so different tabs can run different worlds side by side. Without one, the start menu shows.
const MULTI_WORLD = CHANNEL !== 'stable';
const WORLDS_KEY = `${CHANNEL_SAVE_KEY}-worlds`;
const worldId = MULTI_WORLD ? new URLSearchParams(location.search).get('world') : null;
const SAVE_KEY = worldId ? `${CHANNEL_SAVE_KEY}-w-${worldId}` : CHANNEL_SAVE_KEY;
const SAVE_VERSION = 26; // bump with a new step in MIGRATIONS when old saves need fixing
const OFFLINE_RATE = 0.5; // fraction of production earned while away
const OFFLINE_CAP_S = 12 * 3600; // max offline time counted
const KELVIN = 273.15;
const CORE_K = 35; // surface of a planet with no sun, warmed only by its core (spec: Climate scale)
const START_LAND = 0.05; // share of the planet that is land at the start: a few islands; volcanoes build the rest
const VOLCANIC_LAND = 0.3; // volcanoes quickly build continents up to this share, then lava adds land slowly
const MAX_LAND = 0.5;
const BASE_LAND = 0.38; // today's land share, where weathering runs at its normal rate
const SOUP_FULL = 100;
const STORM_CLOUDS = 0.35; // cloud cover where storms start
const OZONE_FOR_LAND = 0.6;
const MAX_O2 = 21;
const LIFE_WINDOW = [11, 36]; // global mean °C range of complex life over the last 485 million years
const SUN_GYR_S = 120; // real seconds per billion years of the sun's life
const SUN_IGNITED = 0.7; // the young sun shone at about 70% of today's brightness
// Spinning the planet (swipe it) can start any time after the opening. At full spin the planet throws off the
// moon and the spin locks, in one go: days begin, the sun rises at 6 and sets at 18, and Rotation is known.
const SPIN_PER_SCREEN = 0.16; // spin added by a swipe across the whole screen width
const MOON_SPIN = 1;
// Game days from new moon to new moon, the real month: at 30 s a day a cycle takes about 15 minutes, so the
// eight phases (a collection that opens an ultra) take a while to see, on purpose (2026-11-09).
const MOON_MONTH_DAYS = 29.5;
const moonPhase = () => (state.clock / 24 / MOON_MONTH_DAYS + 0.5) % 1; // starts full, 0 new, 0.5 full
const MOON_PHASES = [
  'newmoon',
  'waxcrescent',
  'firstquarter',
  'waxgibbous',
  'fullmoon',
  'wangibbous',
  'lastquarter',
  'wancrescent',
];
const moonPhaseId = () => MOON_PHASES[Math.round(moonPhase() * 8) % 8];
const DAY_S = 30; // real seconds per day once the spin is locked
// The young planet is molten: it glows with its own heat, no water, no ice. Once the moon is thrown off the
// surface cools into a crust (state.crust 0..1, COOL_S seconds), the Crust research coming by itself with it.
// Water comes by comet: from the first comet caught the basins fill (state.oceans 0..1, SEA_FILL_S seconds)
// and the water freezes over at once under the faint young sun, until the ice is cracked (minigame `ice`).
const COOL_S = 60,
  SEA_FILL_S = 60;
// Volcanoes: three cones at most (Terrain VOLCANO_COUNT). The cracks game (Restless Earth) builds them: a tap on
// a glowing crack raises a cone on it, two more taps on the cone make it erupt; three eruptions win.
const CONES = 3;
const SUNRISE = 6,
  SUNSET = 18;
const sunUp = () => state.spinLocked && state.clock % 24 >= SUNRISE && state.clock % 24 <= SUNSET;
// With no gas in the air the sky stays black: stars shine by day and the sun is plain to see, so research that
// needs night or daytime does not wait for the hour until the first gas thaws.
const airless = () => !(has('thawN2') || has('thawCH4') || has('thawCO2'));
// A count that goes up once a day: nights once the spin is locked, before that a day's worth of play.
const skyNight = () => (state.spinLocked ? Math.floor((state.clock + 6) / 24) : Math.floor(state.time / DAY_S));
const THERMAL_LAG_S = 20; // how fast temperature follows its target on an ice-covered planet
const OCEAN_LAG_S = 180; // extra lag once oceans are open: water takes long to heat
// Frozen gases thaw slowly once warm enough: the air builds up over a couple of minutes, not at once.
const THAW_N2 = 0.01, // bar a second
  THAW_CH4 = 0.1, // ppm a second
  THAW_CO2 = 25; // ppm a second

// Things that happen to the planet, each one after the one before. Each opens more of the game for good, and
// the panel it opens (`tab`) slides up. There are no goals on screen: the player finds out by exploring.
// See spec.md, "Unlock sequence".
const EVENTS = [
  { id: 'sunlit', happens: () => state.ignition >= 1 },
  // The ocean first appears when the player cracks the ice, once it is warm enough (minigame `ice`).
  { id: 'thaw', happens: () => gameWon('ice') },
  { id: 'ocean', happens: () => openOcean() >= 0.3 },
  { id: 'storms', happens: () => state.clouds >= STORM_CLOUDS && has('lightning') },
  { id: 'life', happens: () => state.soup >= SOUP_FULL },
  { id: 'cells', happens: () => pop('cell') >= 0.5 },
  { id: 'ozone', happens: () => ozone() >= OZONE_FOR_LAND },
  { id: 'flight', happens: () => evolved('flyer') },
];
const seen = id => state.happened.includes(id);

// When each book section unlocks. Section titles and the subjects they sit in are in data/book.yaml.
// Order: Visible light, then the stars, comets and The molten heart side by side: Magma leads to the core, mantle
// and crust, and to spinning the planet (the moon flies out, the spin locks, the sun rises); the iron core and the
// spin bring the Magnetic Field, which lets the air stay (Atmosphere) and opens the volcanoes.
const SECTION_UNLOCKED = {
  temperature: () => has('starlight'),
  weather: () => has('clouds'),
  gases: () => has('thawN2') || has('thawCH4') || has('thawCO2'),
  surface: () => has('magnet') || seen('thaw'), // land and sea, on the Climate tab
  atmosphere: () => has('magnet'),
  noble: () => false, // hidden until the noble gases have a use (issue #5)
  airlife: () => seen('flight'),
  life: () => seen('life'),
  elements: () => state.atoms.length > 0,
  laws: () => state.laws.length > 0,
  // Posters open once something on them is known or can be researched (filled in below from posters.yaml),
  // except where a poster waits for a moment of its own: the air comes with the Magnetic Field (and the
  // Atmosphere page), the stars with Visible light, which the fifth tapped star brings.
  air: () => has('magnet'),
  stars: () => has('starlight'),
  comets: () => has('starlight'),
  disasters: () => Object.keys(state.disasters).length > 0,
  signs: () => state.signs.length > 0,
  planets: () => state.planets.length > 0,
  index: () => SPECIES.some(known),
  world: () => true,
  stories: () => STORIES.some(storyOpen),
};

// The science book (data/book.yaml): one tab per subject, each a page of sections.
const SUBJECTS = DATA.book.subjects.map(c => (c.groups ? { ...c, sections: c.groups.flatMap(g => g.sections) } : c));
// The posters (data/posters.yaml): one phenomenon each, the research on it done by tapping. A slot is research,
// or an item of a collection that is part of the phenomenon (collections.yaml `poster`).
const POSTERS = DATA.posters;
const POSTER_BY_ID = Object.fromEntries(POSTERS.map(p => [p.id, p]));
/** @type {Record<string, { item: any, collection: any }>} */
const ITEM_BY_ID = Object.fromEntries(
  DATA.collections.filter(c => c.poster).flatMap(c => c.items.map(it => [it.id, { item: it, collection: c }])),
);
const itemFound = id => (state.found[ITEM_BY_ID[id].collection.id] || []).includes(id);
// A slot is known once its research is done or its item found. An item first, where an item and a research
// share an id (the glowing gases and the noble gases).
const slotResearch = id => (ITEM_BY_ID[id] ? null : RESEARCH_BY_ID[id]);
const slotKnown = id => (ITEM_BY_ID[id] ? itemFound(id) : has(id));
// The chapters (data/chapters.yaml): the game in stretches. A chapter is reached once the gates of every chapter
// before it are done; a poster of a chapter not reached stays hidden and its research cannot be done. Posters in
// no chapter, and research on the science book pages, are never gated.
const CHAPTERS = DATA.chapters;
const CHAPTER_OF_POSTER = Object.fromEntries(CHAPTERS.flatMap(ch => ch.posters.map(id => [id, ch])));
const chapterReached = ch => {
  for (const c of CHAPTERS) {
    if (c === ch) return true;
    if (!c.gate.every(has)) return false;
  }
  return true;
};
// The chapter the player is in: the first whose gate is not done (the last one once every gate is).
const currentChapter = () => CHAPTERS.find(ch => !ch.gate.every(has)) || CHAPTERS[CHAPTERS.length - 1];
const tabReached = tab => !CHAPTER_OF_POSTER[tab] || chapterReached(CHAPTER_OF_POSTER[tab]);
// A poster opens once a slot on it is known, or research on it can be done, in a chapter that is reached.
const posterOpen = pst =>
  tabReached(pst.id) &&
  pst.slots.some(sl => slotKnown(sl.id) || (slotResearch(sl.id) && researchVisible(slotResearch(sl.id))));
for (const pst of POSTERS) {
  const own = SECTION_UNLOCKED[pst.id];
  SECTION_UNLOCKED[pst.id] = own ? () => tabReached(pst.id) && own() : () => posterOpen(pst);
}
// A collection of its own (a card poster) opens with its first find. The Ultras deck opens with the first ultra.
for (const c of DATA.collections)
  if (c.section) SECTION_UNLOCKED[c.section] = () => (state.found[c.id] || []).length > 0;
SECTION_UNLOCKED.ultras = () => RESEARCH.some(u => u.ultra && has(u.id));
const SECTIONS = Object.fromEntries(
  Object.entries(DATA.book.sections).map(([id, name]) => [
    id,
    { name, unlocked: SECTION_UNLOCKED[id] || (() => false) },
  ]),
);
const SUBJECT_BY_ID = Object.fromEntries(SUBJECTS.map(c => [c.id, c]));
const subjectOf = section => SUBJECTS.find(c => c.sections.includes(section));

const VOLCANO_CO2 = 12; // ppm CO2/s from one volcano at full activity
const VOLCANO_DUST = 0.05;
const VOLCANO_SPELL_S = 90; // mean time between changes of volcanic mood
// Eruptions: sulfate aerosols reflect sunlight for a while (cooling), the CO2 stays (warming), ash darkens ice.
const ERUPTION_EVERY_S = 200; // mean time between eruptions for one volcano at full activity
const AEROSOL_LIFE_S = 45; // aerosols rain out with this time constant (Pinatubo: about a year)
const ASH_LIFE_S = 120;

// Gauges: [level 0..1, text]. A researched node shows its gauge instead of a description, so the player
// learns what it does by watching it move as the rest of the planet changes.
const logLevel = (v, max) => clamp01(Math.log10(1 + Math.max(0, v)) / Math.log10(1 + max));
const sunGauge = () => [
  sunBrightness(),
  `${pct(sunBrightness())} of today · ${state.sunAge.toFixed(1)} billion years old`,
];
const volcanoGauge = () => [clamp01(rates.co2 / 200), `+${fmt(rates.co2)} ppm CO₂/s · ${pct(state.land)} land`];
const soupGauge = () => [clamp01(soupMult() / 12), `x${soupMult().toFixed(1)} soup per strike`];
const rainGauge = () => [
  logLevel(state.minerals, 1e4),
  `${fmt(state.minerals)} minerals · +${fmt(mult('rainMult'))} per drop`,
];

// What a research node needs before the player can choose to research it: real physical conditions,
// not a currency. Each kind reads the planet now and shows the target.
const NEEDS = {
  temp: { label: v => `${v}°C`, now: () => tempC(), show: v => fmtTemp(v) },
  sunAge: {
    label: v => `sun ${v} billion years old`,
    now: () => state.sunAge,
    show: v => `${v.toFixed(1)} billion years`,
  },
  spin: { label: v => `${v}% spin`, now: () => state.spin * 100, show: v => `${v.toFixed(0)}%` },
  ignition: { label: v => `${v}% ignition`, now: () => state.ignition * 100, show: v => `${v.toFixed(0)}%` },
  days: { label: v => `${v} days`, now: () => Math.floor(state.clock / 24), show: v => `${v}` },
  air: { label: v => `${v} bar air`, now: () => state.pressure, show: v => `${v.toFixed(2)} bar` },
  water: { label: v => `${v}% open water`, now: () => openOcean() * 100, show: v => `${v.toFixed(0)}%` },
  clouds: { label: v => `${v}% clouds`, now: () => state.clouds * 100, show: v => `${v.toFixed(0)}%` },
  strikes: { label: v => `${v} lightning strikes`, now: () => state.strikes, show: v => `${v}` },
  eruptions: { label: v => `${v} eruptions`, now: () => state.eruptions, show: v => `${v}` },
  volcanic: { label: v => `${v} gas clouds from volcanoes`, now: () => state.gasTaps || 0, show: v => `${v}` },
  land: { label: v => `${v}% land`, now: () => state.land * 100, show: v => `${v.toFixed(0)}%` },
  mountains: { label: v => `${v}% mountains`, now: () => state.mountains * 100, show: v => `${v.toFixed(0)}%` },
  minerals: { label: v => `${v} minerals`, now: () => state.minerals, show: v => fmt(v) },
  species: {
    label: v => `${v} species alive`,
    now: () => SPECIES.filter(sp => evolved(sp.id)).length,
    show: v => `${v}`,
  },
  desert: { label: v => `${v}% desert`, now: () => Terrain.biomes().desert * 100, show: v => `${v.toFixed(0)}%` },
  plants: {
    label: v => `${v} land plants`,
    now: () => SPECIES.filter(sp => sp.green && evolved(sp.id)).length,
    show: v => `${v}`,
  },
  comets: { label: v => `${v} ${v === 1 ? 'comet' : 'comets'} caught`, now: () => state.comets, show: v => `${v}` },
  oxygen: { label: v => `${v}% oxygen`, now: () => state.o2, show: v => `${v.toFixed(2)}%` },
  planets: { label: v => `${v} planets found`, now: () => state.planets.length, show: v => `${v}` },
  signs: { label: v => `${v} star signs found`, now: () => state.signs.length, show: v => `${v}` },
  // A molecule needs enough of its atoms, brought down by comets.
  atom: { label: sym => `${ATOMS[sym].name} found`, met: sym => state.atoms.includes(sym) },
  // A link to another branch of the tree: that research must be done first.
  done: { label: id => RESEARCH_BY_ID[id].name, met: id => has(id) },
  evolved: { label: id => `${SPECIES_BY_ID[id].name} alive`, met: id => evolved(id) },
  // A species that lives or has lived (died out counts).
  lived: { label: id => `${SPECIES_BY_ID[id].name} has lived`, met: id => evolved(id) || isExtinct(id) },
  daytime: { label: () => 'the sun in the sky', met: () => airless() || sunUp() },
  // A minigame won (MINIGAMES): Visible light comes with the fifth tapped star.
  won: { label: id => `the ${id} game won`, met: id => gameWon(id) },
  // The surface has cooled into rock (Crust comes with it).
  cooled: { label: () => 'the surface cooled into rock', met: () => state.crust >= 1 },
  night: { label: () => 'night', met: () => airless() || (state.spinLocked && !sunUp()) },
  disaster: {
    label: id => {
      const n = DISASTERS[id].name.toLowerCase();
      return `${/^[aeiou]/.test(n) ? 'an' : 'a'} ${n}`;
    },
    met: id => (state.disasters[id] || 0) > 0,
  },
  // A full collection: an ultra is gained by collecting its set first (the Moon phases open Eclipse).
  // The asteroid that ended the age of the dinosaurs has struck (asteroidHit).
  impact: { label: () => 'the end of the dinosaurs', met: () => !!state.impact },
  set: {
    label: id => `all ${DATA.collections.find(c => c.id === id).name.toLowerCase()}`,
    met: id => setDone(id),
    progress: id => found(id).length,
  },
};
const needMet = ([kind, v]) => (NEEDS[kind].met ? NEEDS[kind].met(v) : NEEDS[kind].now() >= v);

// The research tree is data/research.yaml (see the notes at its top). What a node does that data can't say is
// here, by id: its gauge [level 0..1, text], shown once researched so the player learns what it does by watching
// it move; `tick(dt)` changes the planet every frame; `climax` runs once when a story's last chapter is done;
// and any effect field that is a function of the planet now. The features a node puts on the map are set in updateScene.
const RESEARCH_CODE = {
  starcolors: { gauge: () => [1, 'Hot stars shine blue, cool ones red'] },
  nebulae: { gauge: () => [1, 'Clouds of gas where new stars are born'] },
  milkyway: { gauge: () => [clamp01(state.signs.length / 12), `${state.signs.length} star signs found`] },
  // The sun keeps brightening as it ages, as the real one did: from 86% at 1.5 billion years to today's 100% at 4.5.
  sun2: { gauge: sunGauge, sun: () => Math.min(1, 0.86 + (Math.max(0, state.sunAge - 1.5) * 0.14) / 3) },
  uv: { gauge: () => [1, 'Mutations: life evolves 25% faster'] },
  mN2: { gauge: () => [1, 'Two nitrogen atoms: nitrogen gas'] },
  mCH4: { gauge: () => [1, 'One carbon, four hydrogens: methane'] },
  mH2O: { gauge: () => [1, 'Two hydrogens, one oxygen: water'] },
  mCO2: { gauge: () => [1, 'One carbon, two oxygens: carbon dioxide'] },
  mO2: { gauge: () => [1, 'Two oxygens: the gas life breathes'] },
  mH2: { gauge: () => [1, 'Two hydrogens: the lightest gas'] },
  mNH3: { gauge: () => [1, 'One nitrogen, three hydrogens: ammonia'] },
  firstcell: {
    climax: () => (state.species.cell ??= 0.02),
    gauge: () => [clamp01(pop('cell')), `${pct(pop('cell'))} of the sea holds cells`],
  },
  rna: { gauge: () => [1, 'A single strand of genes that copies itself'] },
  mO3: { gauge: () => [1, 'Three oxygens: ozone'] },
  ozonegas: { gauge: () => [ozone(), `${pct(ozone())} · O₂ ${state.o2.toFixed(2)}%`] },
  thawN2: {
    tick: dt => (state.pressure = Math.min(1, state.pressure + THAW_N2 * dt)),
    gauge: () => frozenGauge('thawN2') || [state.pressure, `${state.pressure.toFixed(2)} bar`],
  },
  thawCH4: {
    tick: dt => thaw('ch4', THAW_CH4 * dt),
    gauge: () =>
      frozenGauge('thawCH4') || [
        logLevel(state.ch4, 30),
        `${state.ch4.toFixed(1)} ppm · +${gasWarming('ch4').toFixed(0)}°C`,
      ],
  },
  thawCO2: {
    tick: dt => thaw('co2', THAW_CO2 * dt),
    gauge: () =>
      frozenGauge('thawCO2') || [
        logLevel(state.co2, 1e5),
        `${fmt(state.co2)} ppm · +${gasWarming('co2').toFixed(0)}°C`,
      ],
  },
  helium: {
    tick: dt => (state.he += (0.1 - state.he * 0.02) * dt),
    gauge: () => [clamp01(state.he / 6), `${state.he.toFixed(2)} ppm`],
  },
  neon: { gauge: () => [0.5, '18 ppm'] },
  argon: {
    tick: dt => (state.ar = Math.min(9340, state.ar + 0.5 * volcanoes() * dt)),
    gauge: () => [state.ar / 9340, `${fmt(state.ar)} ppm`],
  },
  krypton: { gauge: () => [0.3, '1.1 ppm'] },
  xenon: { gauge: () => [0.1, '0.09 ppm'] },
  radon: {
    tick: dt => (state.rn += (1000 / DAY_S - (state.rn * Math.LN2) / (3.8 * DAY_S)) * dt),
    gauge: () => [clamp01(state.rn / 6000), `${fmt(state.rn)} atoms/L`],
  },
  clouds: { cloudRate: () => cloudFormation(), gauge: () => [state.clouds, `${pct(state.clouds)} cover`] },
  evap: { gauge: () => [clamp01(rates.clouds / 0.05), `+${(rates.clouds * 100).toFixed(1)}% cover/s`] },
  // Heavier clouds rain harder: up to three times as much from 25% cloud cover on.
  rain: { gauge: rainGauge, rainMult: () => 1 + 2 * clamp01((state.clouds - 0.1) / 0.15) },
  lightning: {
    gauge: () =>
      !soupBuilds()
        ? [logLevel(state.strikes, 1000), `${fmt(state.strikes)} strikes`]
        : [state.soup / SOUP_FULL, `Soup ${pct(state.soup / SOUP_FULL)}`],
  },
  storms: {
    climax: () => {
      stormBurst = 10;
    },
    gauge: () => [clamp01(rates.lightning / 0.4), `${(rates.lightning * 60).toFixed(0)} strikes/min`],
  },
  solarwind: { gauge: () => [clamp01(state.pressure), `${state.pressure.toFixed(2)} bar of air held`] },
  starlight: { gauge: () => [1, 'Light the eye can see, 380–750 nm'] },
  starsight: { gauge: () => [1, 'Stars in the night sky'] },
  photosynthesis: { gauge: () => [1, 'Sunlight into sugar, oxygen out'] },
  nucleus: { gauge: () => [1, 'A cell inside a cell, keeping its genes safe'] },
  multicell: { gauge: () => [1, 'Cells that stay together and share the work'] },
  shells: { gauge: () => [1, 'Armor grown from the minerals in the sea'] },
  eyes: { gauge: () => [1, 'Light-sensing cells that became eyes'] },
  backbone: { gauge: () => [1, 'A spine of small bones around the nerve cord'] },
  jaws: { gauge: () => [1, 'Gill arches that became jaws: now fish can bite'] },
  antennae: { gauge: () => [1, 'Feelers that smell and touch the way ahead'] },
  wings: { gauge: () => [1, 'Flaps of the body wall that learned to beat'] },
  lungs: { gauge: () => [1, 'Breathing air and walking on fins turned legs'] },
  seeds: { gauge: () => [1, 'A plant packs a baby and its lunch'] },
  flowering: { gauge: () => [1, 'Colors and nectar that pay insects to carry pollen'] },
  eggs: { gauge: () => [1, 'An egg that carries its own pond'] },
  feathers: { gauge: () => [1, 'Fluff for warmth that became wings'] },
  fur: { gauge: () => [1, 'Warm from the inside, awake at night'] },
  brain: { gauge: () => [1, 'More brain than the body needs: for thinking'] },
  upright: { gauge: () => [1, 'Two legs free the hands, out on the open grassland'] },
  volcgas: { gauge: () => [clamp01((state.gasTaps || 0) / 20), `${state.gasTaps || 0} gas clouds breathed out`] },
  eruption: { gauge: () => [clamp01(state.eruptions / 20), `${state.eruptions} eruptions`] },
  moonphases: { gauge: () => [found('phases').length / 8, `${found('phases').length} of 8 phases seen`] },
  starsigns: { gauge: () => [clamp01(state.signs.length / 12), `${state.signs.length} of 12 star signs`] },
  cometsight: { gauge: () => [clamp01(state.comets / 50), `${fmt(state.comets)} comets caught`] },
  wanderers: { gauge: () => [state.planets.length / Sky.PLANETS.length, `${state.planets.length} planets found`] },
  cometpaths: { gauge: () => [clamp01(state.comets / 50), `${fmt(state.comets)} comets caught`] },
  orbits: { gauge: () => [state.planets.length / Sky.PLANETS.length, `${state.planets.length} planets found`] },
  asteroids: { gauge: () => [state.ages ? 1 : 0, state.ages ? 'The impact ended an age' : 'Rocks on the move'] },
  rainbow: {
    gauge: () =>
      state.rainbowShield > 0
        ? [state.rainbowShield / RAINBOW_SHIELD_S, `Calm for ${Math.ceil(state.rainbowShield)} s`]
        : [clamp01(state.clouds * 3), `${pct(clamp01(state.clouds * 3))} chance of rainbows`],
  },
  lava: {
    gauge: () => [logLevel(rates.weatherMinerals, 5), `+${fmt(rates.weatherMinerals)} minerals/s from worn rock`],
  },
  ironcore: { gauge: () => [1, 'Iron and nickel sank to the middle'] },
  mantle: { gauge: () => [1, 'Hot rock round the core, slowly stirring'] },
  crust: { gauge: () => [1, 'The surface cooled into a thin skin of rock'] },
  rotation: { gauge: () => [1, 'One turn a day'] },
  ignition: { gauge: () => [1, 'Hydrogen fuses into helium in the core'] },
  magnet: { gauge: () => [state.pressure, `${state.pressure.toFixed(2)} bar of air kept`] },
  volcano: { gauge: volcanoGauge },
  lavafields: { gauge: () => [state.land / MAX_LAND, `${pct(state.land)} land`] },
  supervolcano: { gauge: volcanoGauge },
  plates: { gauge: () => [logLevel(rates.weathering, 100), `−${fmt(rates.weathering)} ppm CO₂/s`] },
  collision: { gauge: () => [1, 'Plates push together and the crust crumples'] },
  mountains: {
    tick: dt => (state.mountains = Math.min(1, state.mountains + 0.004 * (1 - state.mountains) * dt)),
    gauge: () => [state.mountains, `${pct(state.mountains)} mountains`],
  },
  faults: { gauge: () => [1, 'Plates stick, then slip along the faults'] },
  snow: { gauge: () => [clamp01(iceCover() * 2), 'Snow falls where the air under a cloud is below freezing'] },
  hail: { gauge: () => [clamp01(state.clouds * 3), 'Hail falls from storm clouds'] },
  glaciers: { albedo: () => 0.02 * glacierIce(), gauge: () => [glacierIce(), `${pct(glacierIce())} snow on peaks`] },
  rivers: {
    minerals: () => 2 * riverFlow(),
    weatherMult: () => 1 + 0.5 * riverFlow(),
    gauge: () => [riverFlow(), riverFlow() > 0 ? `${pct(riverFlow())} flow` : 'frozen'],
  },
  lakes: { gauge: () => [clamp01(Terrain.lakeCount() / 12), `${Terrain.lakeCount()} lakes`] },
  currents: { gauge: () => [1 - state.ice, `${pct(state.ice)} ice`] },
  vents: { gauge: () => [logLevel(state.minerals, 1e4), `${fmt(state.minerals)} minerals`] },
  tides: { gauge: () => [openOcean() / (1 - state.land), `${pct(openOcean())} open water`] },
  pools: { gauge: soupGauge },
  tilt: {
    gauge: () => {
      const n = SPECIES.filter(sp => evolved(sp.id)).length;
      return [n / SPECIES.length, `${n} species alive`];
    },
  },
  shallows: {
    gauge: () => [
      Terrain.zones().reef,
      `${pct(Terrain.zones().reef)} reef${Terrain.zones().bleached > 0.005 ? ` · ${pct(Terrain.zones().bleached)} bleached` : ''}`,
    ],
  },
  soil: {
    gauge: () => [
      Terrain.biomes().green,
      `${pct(Terrain.biomes().green)} green · ${pct(Terrain.biomes().desert)} desert`,
    ],
  },
  grass: {
    gauge: () => [
      Terrain.biomes().grass,
      `${pct(Terrain.biomes().grass)} grassland · ${pct(Terrain.biomes().desert)} desert`,
    ],
  },
  forests: { gauge: () => [Terrain.biomes().forest, `${pct(Terrain.biomes().forest)} forest`] },
  wetlands: {
    ch4: () => wetlandMethane(),
    gauge: () => [
      clamp01(Terrain.biomes().wetland * 10),
      `${pct(Terrain.biomes().wetland)} wetland · +${wetlandMethane().toFixed(2)} ppm CH₄/s`,
    ],
  },
  moonlight: { gauge: () => [1, 'The moon lights the night'] },
  circadian: {
    gauge: () => {
      const n = SPECIES.filter(sp => evolved(sp.id)).length;
      return [n / SPECIES.length, `${n} species keep time by day and night`];
    },
  },
  spring: { gauge: () => [1, 'The days grow longer'] },
  summer: { gauge: () => [1, 'The longest days'] },
  autumn: { gauge: () => [1, 'The days grow shorter'] },
  winter: { gauge: () => [1, 'The longest nights'] },
  predators: {
    gauge: () => {
      const n = SPECIES.filter(sp => evolved(sp.id)).length;
      return [n / SPECIES.length, `${n} species alive`];
    },
  },
  waves: { gauge: () => [openOcean(), `${pct(openOcean())} open water · ${state.pressure.toFixed(2)} bar of wind`] },
  blooms: { gauge: () => [clamp01(pop('algae')), `${pct(pop('algae'))} of the sea holds algae`] },
  eclipse: { gauge: () => [1, 'The moon covers the sun exactly'] },
  // Life switches its genes from RNA to DNA, a sturdier double strand.
  dna: {
    gauge: () => {
      const n = SPECIES.filter(known).length;
      return [n / SPECIES.length, `${n} of ${SPECIES.length} in the tree of life`];
    },
  },
  aurora: { gauge: () => setGauge('glows') },
  delta: { gauge: () => [1, 'Silt builds new land where rivers meet the sea'] },
  superbloom: {
    gauge: () =>
      state.bloom > 0 ? [state.bloom / BLOOM_S, `In bloom: ${Math.ceil(state.bloom)} s`] : setGauge('flowers'),
  },
  richsoil: { gauge: () => [1, 'Ash and crushed rock weather into rich soil'] },
  drift: { gauge: () => [state.drift, state.drift < 1 ? 'The continent splits' : 'Two continents drift apart'] },
  biolum: { gauge: () => (glowTonight() ? [1, 'The sea glows tonight'] : setGauge('lights')) },
  meteors: { gauge: () => (state.meteorShower > 0 ? [1, 'A meteor shower is falling'] : setGauge('meteorites')) },
  roots: { gauge: () => [1 - Terrain.biomes().desert, `${pct(Terrain.biomes().desert)} desert`] },
};

// A gas still frozen on the ground shows how warm it must get.
function frozenGauge(id) {
  const t = RESEARCH_BY_ID[id].needs.find(n => n[0] === 'temp');
  return t && tempC() < t[1] ? [0, `Frozen until ${fmtTemp(t[1])}`] : null;
}

// "temp -210" -> ['temp', -210], "done magnet" -> ['done', 'magnet']
function parseNeed(text) {
  const [kind, ...rest] = String(text).split(' ').filter(Boolean);
  const values = rest.map(v => (v !== '' && !isNaN(Number(v)) ? Number(v) : v));
  return [kind, values.length === 1 ? values[0] : values];
}

// A disaster's research node shows how often it has struck.
const disasterGauge = id => () => {
  const n = state.disasters[id] || 0;
  return [clamp01(n / 5), n ? `Struck ${n} time${n > 1 ? 's' : ''}` : 'Has not struck yet'];
};
const RESEARCH = DATA.research.map(r => ({
  ...r,
  ...(r.needs && { needs: r.needs.map(parseNeed) }),
  ...(r.disaster && { gauge: disasterGauge(r.id) }),
  ...RESEARCH_CODE[r.id],
}));
const RESEARCH_BY_ID = Object.fromEntries(RESEARCH.map(r => [r.id, r]));
// The opening (design docs: Game opening). t = 0: the singularity fades in; tap it and it swells until it
// bangs. A flash, then all is dark: a star twinkles, somewhere else each time. Each tapped star stays lit; the
// fifth opens A cow on the road and brings Visible light (the sky lights up), and the book appears for the
// first time. Then the game is on. (The sun formed about 9.2 billion years after the Big Bang, 4.6 billion
// years ago.)
const BANG_TAPS = 15;
const BANG_DECAY = 0.1;
const SUN_BIRTH_YEARS = 9.2e9;
const IGNITION_TAPS = 50;
const IGNITION_GRACE_S = 0.6; // a pause this long between taps lets the core start cooling
const IGNITION_DECAY = 0.08; // ignition lost per second while not tapping

// The tree of life is data/species.yaml (fields explained at its top).
const SPECIES = DATA.species.map(s => (s.needs ? { ...s, needs: s.needs.map(parseNeed) } : s));
const MICROBES = new Set(SPECIES.filter(s => s.microbe).map(s => s.id));
const SPECIES_BY_ID = Object.fromEntries(SPECIES.map(s => [s.id, s]));
// What must have happened before a habitat's species can evolve. Flyers only need land; evolving one opens the sky.
const DOMAIN_OPENS = { ocean: 'cells', ground: 'ozone', atmosphere: 'ozone' };
// Flyers are listed with land life until the sky opens.

// Stories (data/stories.yaml): research chapters in a logical order, then the story's natural disaster as a research
// node of its own (researching it adds a chance that it strikes), then the ultra.
const STORIES = DATA.stories;

// Minigames (stories.yaml `minigame`): what the player does to open a story. Its first win shows the story's
// first chapter and names the story; later wins bring a small reward. The sun, spin and comet games are the
// opening's own taps (`won`). The others show spots on screen (Scene: spawnSpot, sunspot, setMoonPlay):
// `ready` says when, `need` how many successes make the first win, `every` the mean seconds between spots
// before the first win; after it they come PLAY_REPEAT times more slowly.
const PLAY_REPEAT = 4;
const ICE_OPENS = -8; // sea ice starts to open from this warm on (iceCover)
const ICE_CRACKS_C = ICE_OPENS; // the sea ice can be cracked open once it starts to open: the first ocean
const mineralReward = (x, y) => {
  const n = Math.max(50, Math.round(state.minerals * 0.02));
  state.minerals += n;
  floatText(x, y, `+${fmt(n)} minerals`);
};
// A repeated minigame speeds up the species evolving now (or gives minerals when none is).
const evolveReward = (x, y, share = 0.1) => {
  const ev = state.evolving;
  if (!ev) return mineralReward(x, y);
  ev.done = Math.min(0.99, ev.done + share);
  floatText(x, y, `${SPECIES_BY_ID[ev.id].name} ${pct(ev.done)}`);
};
const MINIGAMES = {
  // In the dark after the Big Bang a star twinkles, somewhere else each time. A tapped star stays lit (Scene keeps
  // them); the fifth wins: it opens A cow on the road and brings Visible light, and the game is over for good.
  twinkle: {
    spot: 'twinkle',
    ready: () => state.banged && !gameWon('twinkle'),
    need: 5,
    every: 0.6,
    max: 1,
    reward: mineralReward,
  },
  ignite: { won: () => state.ignition >= 1 },
  spin: { won: () => state.spinLocked }, // the moon is out and the spin locked at full: the Magnetic Field can come
  // The moon has no light of its own: it is a dark circle until the sun is lit, then a tap on it counts.
  // The moon shines only by sunlight: its story opens with a tap on it once the sun is lit.
  moonlit: { ready: () => has('ignition') && state.moonBorn, need: 1, reward: mineralReward },
  comets: { won: () => state.comets > 0 },
  ice: {
    spot: 'ice',
    ready: () => tempC() >= ICE_CRACKS_C && iceCover() > 0.05,
    won: () => seen('thaw'),
    need: 1,
    every: 10,
    reward: mineralReward,
  },
  // Opens Restless Earth: cracks glow once the crust has set (the Stone and water chapter), anywhere on the land
  // in view; a tapped crack raises a cone right there, two taps on the cone erupt it (main.js, onVolcanoTap).
  // Cracks show until the three cones stand, then the cones are tapped; no cracks after.
  cracks: {
    spot: 'crack',
    ready: () => tabReached('volcanoes') && (state.cones || 0) < CONES,
    need: 3,
    every: 6,
    reward: mineralReward,
  },
  sunspots: { spot: 'sunspot', ready: () => seen('life') && sunUp(), need: 3, every: 8, reward: evolveReward },
  moon: { ready: () => seen('thaw') && state.moonBorn, need: 1, reward: mineralReward },
  // Rain on a mountain: turn the planet until a mountain is under a raining cloud (Scene.setMountainRain).
  river: { ready: () => has('snow') && has('mountains') && tempC() > 0, need: 1, reward: mineralReward },
  plates: { spot: 'plates', ready: () => has('volcano') && seen('sunlit'), need: 1, every: 15, reward: mineralReward },
  seeds: { spot: 'seed', ready: () => seen('ozone'), need: 3, every: 6, reward: evolveReward },
};
const STORY_OF_GAME = Object.fromEntries(STORIES.filter(st => st.minigame).map(st => [st.minigame, st]));
const gameWon = id =>
  (MINIGAMES[id].won && MINIGAMES[id].won()) || (!!MINIGAMES[id].need && (state.games[id] || 0) >= MINIGAMES[id].need);
// The first chapter of each story waits for its minigame.
const STORY_GATE = Object.fromEntries(STORIES.filter(st => st.minigame).map(st => [st.chapters[0], st.minigame]));

// Natural disasters (data/disasters.yaml). Thunderstorms set dry plants on fire once there are plants to burn.
const DISASTERS = Object.fromEntries(DATA.disasters.map(d => [d.id, d]));
const WILDFIRE_CHANCE = 0.35; // a bolt into plants starts a fire this often
const FIRE_KILL = 4; // land species lose this many times the share of land that just caught fire
const FIRE_CO2 = 3000; // ppm CO2 from burning all the land's plants at once
const FLOOD_MINERALS = 5000; // minerals from silt when floods cover all the land's plants
const WEATHER_MINERALS = 0.05; // minerals washed to the sea per ppm of CO2 that weathering takes up
const DISASTER_GAP_S = 60; // at least this long between two natural disasters striking on their own
const SUPERNOVA_S = 60;
const DROUGHT_S = 60,
  SOLAR_STORM_S = 40,
  RED_TIDE_S = 45,
  ICE_AGE_S = 90;
const ICE_AGE_COOLING = 10; // °C off the climate's target while an ice age lasts
const RED_TIDE_KILL = 0.015; // share of each sea species (except the algae and microbes that bloom) lost per second
// What the planet must be like for each disaster to strike on its own; how often (`every` seconds) is in
// data/disasters.yaml. Every disaster also needs its research node (same id) known: researching it adds the
// chance. A disaster not listed here needs only that. The asteroid strikes once, and only once there is life for
// it to end an age of.
const DISASTER_WHEN = {
  supereruption: () => volcanoes() > 0,
  flood: () => state.clouds > 0.4,
  hurricane: () => tempC() > 15 && openOcean() > 0.3, // today's Earth averages 15 °C and has hurricanes
  iceage: () => state.iceAge <= 0 && tempC() < 30,
  drought: () => tempC() > 17 && state.drought <= 0,
  solarstorm: () => state.solarStorm <= 0,
  redtide: () => tempC() > 15 && openOcean() > 0.2 && state.redTide <= 0,
  asteroid: () => seen('life') && !state.disasters.asteroid,
  supernova: () => state.supernova <= 0,
};
const DISASTER_ODDS = Object.fromEntries(
  DATA.disasters
    .filter(d => d.every)
    .map(d => [d.id, { rate: 1 / d.every, when: () => has(d.id) && (DISASTER_WHEN[d.id]?.() ?? true) }]),
);
const RAINBOW_ODDS = 0.75; // once Rainbow is known, every disaster strikes this much as often
// Each ultra answers its own story's disaster: once gained, that disaster strikes half as often.
const ULTRA_ODDS = 0.5;
const ULTRA_OF_DISASTER = Object.fromEntries(
  STORIES.filter(st => st.disaster && st.ultra).map(st => [st.disaster, st.ultra]),
);
const disasterOdds = id =>
  (has('rainbow') ? RAINBOW_ODDS : 1) *
  (has(ULTRA_OF_DISASTER[id]) ? ULTRA_ODDS : 1) *
  (disastersDone() ? DISASTERS_DONE_ODDS : 1);
// Natural disasters are a collection too (Stories › Natural disasters): each is found when it first strikes.
// With every one found, the planet knows them all, and they strike half as often.
const DISASTERS_DONE_ODDS = 0.5;
const disastersDone = () => DATA.disasters.every(d => state.disasters[d.id]);

// All 118 elements in order of atomic number, for the periodic table.
const ELEMENT_SYMBOLS = (
  'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr ' +
  'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu ' +
  'Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr ' +
  'Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'
).split(' ');
// Electrons per shell, one row per element (the Bohr model drawn under the periodic table): the real filling, so
// potassium is 2,8,8,1 and chromium 2,8,13,1.
const ELEMENT_SHELLS = (
  '1 2 2,1 2,2 2,3 2,4 2,5 2,6 2,7 2,8 2,8,1 2,8,2 2,8,3 2,8,4 2,8,5 2,8,6 2,8,7 2,8,8 2,8,8,1 2,8,8,2 ' +
  '2,8,9,2 2,8,10,2 2,8,11,2 2,8,13,1 2,8,13,2 2,8,14,2 2,8,15,2 2,8,16,2 2,8,18,1 2,8,18,2 2,8,18,3 2,8,18,4 ' +
  '2,8,18,5 2,8,18,6 2,8,18,7 2,8,18,8 2,8,18,8,1 2,8,18,8,2 2,8,18,9,2 2,8,18,10,2 2,8,18,12,1 2,8,18,13,1 ' +
  '2,8,18,13,2 2,8,18,15,1 2,8,18,16,1 2,8,18,18 2,8,18,18,1 2,8,18,18,2 2,8,18,18,3 2,8,18,18,4 2,8,18,18,5 ' +
  '2,8,18,18,6 2,8,18,18,7 2,8,18,18,8 2,8,18,18,8,1 2,8,18,18,8,2 2,8,18,18,9,2 2,8,18,19,9,2 2,8,18,21,8,2 ' +
  '2,8,18,22,8,2 2,8,18,23,8,2 2,8,18,24,8,2 2,8,18,25,8,2 2,8,18,25,9,2 2,8,18,27,8,2 2,8,18,28,8,2 ' +
  '2,8,18,29,8,2 2,8,18,30,8,2 2,8,18,31,8,2 2,8,18,32,8,2 2,8,18,32,9,2 2,8,18,32,10,2 2,8,18,32,11,2 ' +
  '2,8,18,32,12,2 2,8,18,32,13,2 2,8,18,32,14,2 2,8,18,32,15,2 2,8,18,32,17,1 2,8,18,32,18,1 2,8,18,32,18,2 ' +
  '2,8,18,32,18,3 2,8,18,32,18,4 2,8,18,32,18,5 2,8,18,32,18,6 2,8,18,32,18,7 2,8,18,32,18,8 2,8,18,32,18,8,1 ' +
  '2,8,18,32,18,8,2 2,8,18,32,18,9,2 2,8,18,32,18,10,2 2,8,18,32,20,9,2 2,8,18,32,21,9,2 2,8,18,32,22,9,2 ' +
  '2,8,18,32,24,8,2 2,8,18,32,25,8,2 2,8,18,32,25,9,2 2,8,18,32,27,8,2 2,8,18,32,28,8,2 2,8,18,32,29,8,2 ' +
  '2,8,18,32,30,8,2 2,8,18,32,31,8,2 2,8,18,32,32,8,2 2,8,18,32,32,8,3 2,8,18,32,32,10,2 2,8,18,32,32,11,2 ' +
  '2,8,18,32,32,12,2 2,8,18,32,32,13,2 2,8,18,32,32,14,2 2,8,18,32,32,15,2 2,8,18,32,32,16,2 2,8,18,32,32,17,2 ' +
  '2,8,18,32,32,18,2 2,8,18,32,32,18,3 2,8,18,32,32,18,4 2,8,18,32,32,18,5 2,8,18,32,32,18,6 2,8,18,32,32,18,7 ' +
  '2,8,18,32,32,18,8'
)
  .split(' ')
  .map(row => row.split(',').map(Number));

// Atoms (data/atoms.yaml), and what on the planet reveals each one. Found atoms stay found.
// Atoms with no entry here only arrive with comets.
const ATOM_FOUND = {
  H: () => state.ignition > 0,
  He: () => state.ignition >= 1,
  Ne: () => state.comets >= 1, // neon, krypton and xenon arrive with comets and stay
  Na: () => seen('ocean'),
  Mg: () => evolved('cyano') || isExtinct('cyano'),
  Al: () => has('plates'),
  Si: () => has('volcano'),
  P: () => seen('life'),
  S: () => state.eruptions > 0,
  Cl: () => seen('ocean'),
  Ar: () => has('volcgas'), // argon comes out with volcanic gas
  K: () => has('soil'),
  Ca: () => evolved('coral') || isExtinct('coral'),
  Fe: () => has('magnet'),
  Ni: () => has('magnet'),
  Cu: () => evolved('arthropod') || isExtinct('arthropod'),
  Kr: () => state.comets >= 2,
  // The first eruptions (Restless Earth) vent carbon dioxide and steam: carbon and oxygen. The full set of
  // famous comets brings nitrogen (and carbon and oxygen too, for a world that catches them first).
  C: () => gameWon('cracks') || setDone('comets'),
  N: () => setDone('comets'),
  O: () => gameWon('cracks') || setDone('comets'),
  Xe: () => state.comets >= 3,
  Rn: () => has('plates'), // radon seeps from moving crust, from uranium
  U: () => has('plates'),
  Au: () => (state.disasters.supernova || 0) > 0, // heavy atoms are forged in supernovae
};
const ATOMS = Object.fromEntries(DATA.atoms.map(a => [a.id, ATOM_FOUND[a.id] ? { ...a, found: ATOM_FOUND[a.id] } : a]));

// What a comet's ices do to the planet when it crashes: carbon ices add CO₂ (frozen while the planet is), and
// nitrogen thickens the air once it can stay.
function cometImpact() {
  if (has('thawCO2')) state.co2 += 60;
  else state.co2Ice += 60;
  if (has('thawN2')) state.pressure = Math.min(1, state.pressure + 0.02);
}
const COMET_DUST = 0.12; // aerosols from one impact: a short cooling

// Laws of nature (data/laws.yaml), found the first time the player sees them at work on the planet, like atoms.
const LAW_FOUND = {
  spacetime: () => state.banged,
  heat: () => state.ignition > 0,
  fusion: () => state.ignition >= 1,
  light: () => state.ignition >= 1,
  inertia: () => state.spinLocked,
  gravity: () => state.comets > 0,
  melting: () => seen('thaw'),
  magnetism: () => has('magnet'),
  pressure: () => has('thawN2'),
  greenhouse: () => has('thawCH4') || has('thawCO2'),
  electricity: () => state.strikes > 0,
  radioactivity: () => has('plates'),
  tides: () => has('tides'),
};
const LAWS = Object.fromEntries(DATA.laws.map(l => [l.id, { ...l, found: LAW_FOUND[l.id] }]));

// Where an element sits in the table: [row, column], 1-based. Rows 9 and 10 hold the lanthanides and actinides.
function elementCell(z) {
  if (z === 1) return [1, 1];
  if (z === 2) return [1, 18];
  const starts = [3, 11, 19, 37, 55, 87]; // first element of rows 2 to 7
  const row = starts.findLastIndex(s => z >= s) + 2,
    i = z - starts[row - 2];
  if (row <= 3) return [row, i < 2 ? i + 1 : i + 11];
  if (row <= 5) return [row, i + 1];
  if (i < 2) return [row, i + 1];
  if (i < 17) return [row + 3, i + 1]; // La to Lu, Ac to Lr
  return [row, i - 13];
}

/* ================= State ================= */

const freshState = () => ({
  saveVersion: SAVE_VERSION,
  happened: /** @type {string[]} */ ([]), // EVENTS that have happened, in order
  sunAge: 0, // billion years since the sun ignited
  tempK: CORE_K,
  bang: 0, // 0..1, how hot the singularity is
  banged: false, // the Big Bang has happened
  opened: false, // the opening is over: the star was caught and the book has opened
  ignition: 0, // 0..1, how far the sun is lit
  pressure: 0, // nitrogen air, 0..1 bar
  co2: 0, // ppm in the air
  co2Ice: 5000, // ppm still frozen on the surface
  ch4: 0, // ppm in the air
  ch4Ice: 10, // ppm still frozen on the surface
  ice: 0, // share of the planet under ice; none until water comes, then it follows temperature with a lag
  crust: 0, // 0..1, how far the molten surface has cooled into rock (from the moon's birth on)
  oceans: 0, // 0..1, how far the basins have filled with the comets' water (from the first comet on)
  cones: 0, // volcano cones raised on lava cracks (the cracks game)
  volcanoActivity: 1,
  volcanoGoal: 1, // where volcanic activity is heading; it changes now and then by itself
  land: START_LAND, // share of the planet that is land
  mountains: 0, // 0..1, how much of the land is mountains
  aerosols: 0, // 0..1, eruption sulfate high in the air
  researching: /** @type {{ id: string, done: number }[]} */ ([]), // { id, done: 0..1 } per node being researched, one per slot
  he: 0,
  ar: 0,
  rn: 0, // noble gases that change over time: helium and argon in ppm, radon in atoms per liter
  ash: 0, // ash from eruptions on the ice
  eruptions: 0,
  gasTaps: 0, // gas clouds a tapped volcano has breathed out
  impact: false, // the asteroid that ended the dinosaurs has struck
  spin: 0, // 0..1, how fast the planet turns
  spinLocked: false, // the planet has reached full spin and keeps it
  clock: 3, // hours since the spin locked; the hour of day is clock % 24
  moonBorn: false, // the planet has thrown off its moon
  clouds: 0,
  minerals: 0,
  soup: 0,
  evolving: /** @type {{ id: string, done: number } | null} */ (null), // the species evolving now
  o2: 0,
  clicks: 0,
  strikes: 0,
  comets: 0,
  extinct: /** @type {string[]} */ ([]),
  atoms: /** @type {string[]} */ ([]), // symbols of the atoms found, in the order found
  cometNext: /** @type {string | null} */ (null), // the famous comet in the sky now, caught or not
  laws: /** @type {string[]} */ ([]), // ids of the laws of nature found, in the order found
  signs: /** @type {string[]} */ ([]), // star signs found in the night sky
  planets: /** @type {string[]} */ ([]), // planets found in the night sky
  seed: Math.floor(Math.random() * 2 ** 31), // this world's own luck, e.g. which star sign shows which night
  // The map (Terrain.mapState): its noise seed, the volcano spots, the peaks in use and the volcanoes in use, so
  // a world looks the same after a reload. A new world's map seed is its own; a save from before maps were kept
  // has none, and keeps the one map every world had then (sanitize).
  map: /** @type {{ seed: number, volcanoes?: number[][], peaks?: number[][], used?: number[] } | null} */ (null),
  tonight: /** @type {{ night: number, sign: string | null, planet?: string | null } | null} */ (null), // { night, sign }: the star sign in the sky tonight
  disasters: {}, // how many times each natural disaster has happened
  drought: 0, // seconds left of a drought
  solarStorm: 0, // seconds left of a solar storm
  supernova: 0, // seconds left of a supernova's blaze
  redTide: 0, // seconds left of a red tide
  iceAge: 0, // seconds left of an ice age
  rainbowShield: 0, // seconds left of the calm a tapped rainbow brings
  // A storm surge or tsunami on its way: where it lands, in how many seconds, how big, and what it does to the
  // reefs. Kept in the state so a save or a closed tab never loses it (resolved in disasterTimers, play.js).
  surge: /** @type {{ u: number, v: number, in: number, size: number, reefs: number, tsunami?: boolean } | null} */ (
    null
  ),
  games: {}, // per minigame, how many times it has been won
  heatView: false, // the planet shown in infrared (once every band is found)
  auroraShield: false, // a tapped aurora shields the ozone layer until this solar storm ends
  found: {}, // per collection (data/collections.yaml), the item ids found
  bloom: 0, // seconds left of a superbloom
  drift: 0, // how far the continent has split, 0 to 1 (Continental Drift)
  meteorShower: 0, // seconds left of a meteor shower
  treeDone: false, // the whole tree of life has been known once
  storiesSeen: /** @type {string[]} */ ([]), // stories whose opening splash has been shown
  storiesDone: /** @type {string[]} */ ([]), // stories whose completion splash has been shown
  unseen: /** @type {string[]} */ ([]), // discoveries whose card in the book still carries a new badge, e.g. 'atom:H'
  time: 0, // seconds of play since the opening
  climateLog: /** @type {Record<string, number[]>} */ ({}), // the climate page's graphs: per series id (and t), the samples
  tries: {}, // per molecule, today's tries at its reaction: { day, rows }
  ages: 0, // ages ended by an asteroid impact
  bookSeen: {}, // per subject, how many entries the player has seen; more than that shows a dot
  lifeGone: false, // every species died out; a new soup can bring the first cells back
  upgrades: /** @type {string[]} */ ([]),
  species: {},
  start: Date.now(),
  lastTick: Date.now(),
});

let state = freshState();
let owned = new Set(); // purchased upgrade ids
let rates = {}; // per-second rates and climate parts, recalculated often
let skipSave = false;
// The opening runs until the book first opens after the lone star: until then the planet waits in the dark.
const inCinema = () => !state.banged || !state.opened;

// Steps that bring an old save up to SAVE_VERSION: step i turns a version i save into version i + 1.
// Never edit a step that has been released; add a new one.
const MIGRATIONS = [
  // 0 to 1: colors must now be found. Older worlds get Starlight and the colors their planet already shows.
  saved => {
    saved.grantColors = true;
  },
  // 1 to 2: stories get a splash when they open. Stories already open in an older world open quietly.
  saved => {
    saved.quietStories = true;
  },
  // 2 to 3: the bands and glowing gases found move into the collections, with the rest.
  saved => {
    saved.found = { ...saved.found, bands: saved.bands || [], glows: saved.glows || [] };
    delete saved.bands;
    delete saved.glows;
  },
  // 3 to 4: there is no game over any more. Ended worlds play on; lifeTick restarts life if none is left.
  saved => {
    delete saved.over;
  },
  // 4 to 5: disasters are research nodes, each its story's last chapter. Worlds that had the chapter before
  // (whose climax unlocked the disaster) know the disaster.
  // The pairs are frozen as the stories stood then, so later story edits don't change this step.
  saved => {
    const known = new Set(saved.upgrades || []);
    const LAST_CHAPTER = {
      supervolcano: 'supereruption',
      solarwind: 'solarstorm',
      storms: 'hurricane',
      wetlands: 'flood',
      seasons: 'iceage',
      blooms: 'redtide',
      roots: 'drought',
      asteroids: 'asteroid',
    };
    for (const [chapter, disaster] of Object.entries(LAST_CHAPTER)) if (known.has(chapter)) known.add(disaster);
    saved.upgrades = [...known];
  },
  // 5 to 6: A star is born is the first story, and the Milky Way opens the molecules. Worlds past Starlight
  // already used molecules, so they get the story whole, quietly, and keep the zodiac they had from Eclipse.
  saved => {
    const known = new Set(saved.upgrades || []);
    if (known.has('starlight')) {
      ['starcolors', 'nebulae', 'supernova', 'milkyway'].forEach(id => known.add(id));
      saved.storiesSeen = [...new Set([...(saved.storiesSeen || []), 'stars'])];
    }
    saved.upgrades = [...known];
  },
  // 6 to 7: a completed story gets a splash. Stories an older world already completed are marked quietly.
  saved => {
    saved.quietDone = true;
  },
  // 7 to 8: the opening ends in the dark with one star. Worlds past the Big Bang are past the opening.
  saved => {
    if (saved.banged) saved.opened = true;
  },
  // 8 to 9: the upgrade-style research is gone (Main Sequence, Mature Sun, Downpour, Bigger Bolts): the sun
  // brightens with its age, Rain and Thunderstorms carry their effects.
  saved => {
    saved.upgrades = (saved.upgrades || []).filter(id => !['sun3', 'sun4', 'downpour', 'bigbolt'].includes(id));
  },
  // 9 to 10: the clock shows once the second is read, the temperature once the kelvin is. Older worlds already
  // had both on screen, so they get those two units read.
  saved => {
    const units = new Set(saved.found?.units || []);
    if (saved.banged) units.add('second');
    if ((saved.upgrades || []).includes('starlight')) units.add('kelvin');
    saved.found = { ...saved.found, units: [...units] };
    saved.unseen = (saved.unseen || []).filter(k => k !== 'units:second' && k !== 'units:kelvin');
  },
  // 10 to 11: the River fish collection is gone (it showed fish before there was life).
  saved => {
    if (saved.found) delete saved.found.fish;
    saved.unseen = (saved.unseen || []).filter(k => !k.startsWith('fish:'));
  },
  // 11 to 12: colors are found by tapping, not researched: researched colors become found ones. Star Signs is
  // research that starts the zodiac: worlds that had the zodiac (from the Milky Way) get it.
  saved => {
    const COLOR_IDS = {
      colorRed: 'red',
      colorOrange: 'orange',
      colorYellow: 'yellow',
      colorGreen: 'green',
      colorBlue: 'blue',
      colorViolet: 'violet',
    };
    const upgrades = saved.upgrades || [];
    const colors = new Set([
      ...(saved.found?.colors || []),
      ...upgrades.filter(id => COLOR_IDS[id]).map(id => COLOR_IDS[id]),
    ]);
    saved.found = { ...saved.found, colors: [...colors] };
    saved.upgrades = upgrades.filter(id => !COLOR_IDS[id]);
    if (saved.upgrades.includes('milkyway')) saved.upgrades.push('starsigns');
  },
  // 12 to 13: Visible light opens Starlight (the stars), Sunlight and Moonlight, and Moonlight opens Phases.
  // Worlds that saw stars or moon phases already get those.
  saved => {
    const upgrades = new Set(saved.upgrades || []);
    if (upgrades.has('starlight') && (saved.storiesSeen || []).includes('stars')) upgrades.add('starsight');
    if (upgrades.has('moonlight')) upgrades.add('moonphases');
    saved.upgrades = [...upgrades];
  },
  // 13 to 14: Volcanic Gas and Eruptions come between Volcanoes and Lava Fields. Worlds with Volcanoes already
  // had both (their volcanoes breathed gas and erupted), so they get them.
  saved => {
    const upgrades = new Set(saved.upgrades || []);
    if (upgrades.has('volcano')) ['volcgas', 'eruption'].forEach(id => upgrades.add(id));
    saved.upgrades = [...upgrades];
  },
  // 14 to 15: Magma comes between Magnetic Field and Volcanoes (and opens Hydrothermal Vents too).
  saved => {
    const upgrades = new Set(saved.upgrades || []);
    if (upgrades.has('volcano') || upgrades.has('vents')) upgrades.add('magma');
    saved.upgrades = [...upgrades];
  },
  // 15 to 16: Lava is renamed Magma (id lava) and is the root again; the separate Magma research is gone.
  saved => {
    saved.upgrades = (saved.upgrades || []).filter(id => id !== 'magma');
    if (saved.researching?.id === 'magma') saved.researching = null;
  },
  // 16 to 17: no DNA. Species evolve like research, one at a time over days; the DNA a world had is dropped.
  saved => {
    delete saved.dna;
  },
  // 17 to 18: traits (Life › Traits) open the branches of the tree of life. Worlds where a branch already lives
  // (or lived) get its trait, and the traits it requires.
  saved => {
    const OPENS = {
      photosynthesis: ['algae', 'plankton'],
      nucleus: ['amoeba'],
      multicell: ['kelp', 'sponge'],
      shells: ['coral', 'mollusc', 'trilobite'],
      eyes: ['octopus', 'arthropod', 'chordate'],
      backbone: ['jawless'],
      jaws: ['fish'],
      antennae: ['insect'],
      wings: ['flyer'],
      lungs: ['amphibian'],
      seeds: ['seedfern'],
      flowering: ['flower'],
      eggs: ['reptile'],
      feathers: ['bird'],
      fur: ['mammal'],
      brain: ['ape'],
      upright: ['lucy'],
    };
    const REQUIRES = {
      photosynthesis: ['firstcell'],
      nucleus: ['firstcell'],
      multicell: ['nucleus'],
      shells: ['multicell'],
      eyes: ['multicell'],
      backbone: ['eyes'],
      jaws: ['backbone'],
      antennae: ['eyes'],
      wings: ['antennae'],
      lungs: ['jaws'],
      seeds: ['photosynthesis'],
      flowering: ['seeds'],
      eggs: ['lungs'],
      feathers: ['eggs'],
      fur: ['eggs'],
      brain: ['fur'],
      upright: ['brain'],
    };
    const upgrades = new Set(saved.upgrades || []);
    const grant = id => {
      if (!REQUIRES[id] || upgrades.has(id)) return;
      upgrades.add(id);
      REQUIRES[id].forEach(grant);
    };
    for (const [trait, species] of Object.entries(OPENS))
      if (species.some(id => saved.species?.[id] !== undefined)) grant(trait);
    saved.upgrades = [...upgrades];
  },
  // 18 to 19: plate tectonics is its own story (Puzzle pieces), with the earthquake as its disaster, a research
  // node after Fault Lines. Worlds where earthquakes already struck (they came with Fault Lines) know it.
  saved => {
    const upgrades = new Set(saved.upgrades || []);
    if (upgrades.has('faults')) upgrades.add('earthquake');
    saved.upgrades = [...upgrades];
  },
  // 19 to 20: Snow comes before Mountain Glaciers (the first chapter of Rivers and ice), and Mountains after
  // Collision (which used to raise them). Worlds with glaciers know Snow; worlds with Collision know Mountains.
  saved => {
    const upgrades = new Set(saved.upgrades || []);
    if (upgrades.has('glaciers')) upgrades.add('snow');
    if (upgrades.has('collision')) upgrades.add('mountains');
    saved.upgrades = [...upgrades];
  },
  // 20 to 21: The molten heart: Magma, then Iron Core, Mantle and Crust, then the spin unlocks the Magnetic Field,
  // which opens Restless Earth (its minigame is now the lava cracks). Worlds with Magma know the layers; worlds
  // with Volcanoes know the Magnetic Field and have won the cracks.
  saved => {
    const upgrades = new Set(saved.upgrades || []);
    if (upgrades.has('lava')) ['ironcore', 'mantle', 'crust'].forEach(id => upgrades.add(id));
    if (upgrades.has('volcano')) {
      upgrades.add('magnet');
      saved.games = { ...saved.games, cracks: Math.max(3, saved.games?.cracks || 0) };
    }
    saved.upgrades = [...upgrades];
  },
  // 21 to 22: comets no longer count atoms (state.matter is gone): one famous comet comes a night, and the full set
  // completes the matter.
  saved => {
    delete saved.matter;
  },
  // 22 to 23: research slots. The one node being researched becomes a list, one entry per slot.
  saved => {
    saved.researching = saved.researching ? [saved.researching] : [];
  },
  // 23 to 24: Seasons is four research, one a season. A world that knew the seasons knows all four.
  saved => {
    const known = new Set(saved.upgrades || []);
    if (known.delete('seasons')) for (const id of ['spring', 'summer', 'autumn', 'winter']) known.add(id);
    saved.upgrades = [...known];
  },
  // 24 to 25: Visible light is no longer researched: the fifth tapped star brings it. A world past the lone
  // star (one tap won the game) counts as five stars, so the story stays open and the light comes.
  saved => {
    const games = saved.games || {};
    if (games.twinkle || (saved.upgrades || []).includes('starlight')) games.twinkle = Math.max(5, games.twinkle || 0);
    saved.games = games;
  },
  // 25 to 26: the young planet is molten and dry; the crust sets after the moon, water comes by comet. A world
  // past its moon (or with Crust known) has a set crust; one with a comet caught, or already iced over from the
  // start as every old world was, has its water. Its cones are the volcanoes it had.
  saved => {
    const known = saved.upgrades || [];
    const far = saved.moonBorn || known.includes('crust');
    saved.crust = far ? 1 : 0;
    saved.oceans = far || (saved.comets || 0) > 0 ? 1 : 0;
    if (!saved.oceans) saved.ice = 0;
    saved.cones = known.includes('volcano') ? CONES : Math.min(CONES, (saved.games || {}).cracks || 0);
  },
];

// A save from a newer build is never loaded (and so never saved over): the page is out of date.
class NewerSave extends Error {}
function migrate(saved) {
  const from = saved.saveVersion ?? 0;
  if (from > SAVE_VERSION) throw new NewerSave(`save version ${from}, this build ${SAVE_VERSION}`);
  for (let v = from; v < SAVE_VERSION; v++) MIGRATIONS[v](saved);
  saved.saveVersion = SAVE_VERSION;
  return saved;
}

// Drops ids the game no longer knows (research, species, disasters, collections removed from data/), so one stale
// id in a save can't stop the game.
function sanitize(saved) {
  if (saved.upgrades) saved.upgrades = saved.upgrades.filter(id => RESEARCH_BY_ID[id]);
  if (saved.extinct) saved.extinct = saved.extinct.filter(id => SPECIES_BY_ID[id]);
  if (!saved.map) saved.map = { seed: 0 };
  if (saved.researching)
    saved.researching = saved.researching.filter(r => RESEARCH_BY_ID[r.id] && !saved.upgrades?.includes(r.id));
  if (saved.species) for (const id in saved.species) if (!SPECIES_BY_ID[id]) delete saved.species[id];
  if (saved.disasters) for (const id in saved.disasters) if (!DISASTERS[id]) delete saved.disasters[id];
  if (saved.found)
    for (const id in saved.found) {
      const c = DATA.collections.find(o => o.id === id);
      if (!c) delete saved.found[id];
      else saved.found[id] = saved.found[id].filter(it => c.items.some(o => o.id === it));
    }
  return saved;
}

// localStorage can throw (storage blocked, private mode, quota): every access goes through here.
const store = {
  get: key => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      console.warn('Storage failed', e);
      return false;
    }
  },
  remove: key => {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};
// Shown over the game when a save can't be read or written. The save itself is left alone.
let saveProblem = null;
function reportSaveProblem(text) {
  saveProblem = text;
  const box = document.getElementById('save-problem');
  if (box) {
    box.textContent = text;
    box.classList.remove('hidden');
  }
}

function load() {
  // Open the game with ?reset to start over with a fresh save.
  const params = new URLSearchParams(location.search);
  if (params.has('reset')) {
    store.remove(SAVE_KEY);
    params.delete('reset');
    history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : ''));
  }
  // The start menu plays the opening behind it and saves nothing.
  if (MULTI_WORLD && !worldId) {
    skipSave = true;
    return;
  }
  // A world deleted in another tab, or a stale link: back to the start menu.
  if (worldId && !readWorlds().some(o => o.id === worldId)) {
    skipSave = true;
    location.replace(location.pathname);
    return;
  }
  // A new beta player starts from their stable save. A save that loads becomes the backup; one that fails falls
  // back to the backup, and failing that, the game runs without saving, so the save is never written over.
  const raw = store.get(SAVE_KEY) || (!MULTI_WORLD && SAVE_KEY !== STABLE_SAVE_KEY && store.get(STABLE_SAVE_KEY));
  const read = text => ({ ...freshState(), ...sanitize(migrate(JSON.parse(text))) });
  if (raw) {
    try {
      state = read(raw);
      store.set(`${SAVE_KEY}-backup`, raw);
    } catch (e) {
      console.warn('Save load failed', e);
      const backup = store.get(`${SAVE_KEY}-backup`);
      let restored = false;
      if (!(e instanceof NewerSave) && backup && backup !== raw) {
        try {
          state = read(backup);
          restored = true;
        } catch {}
      }
      if (e instanceof NewerSave) {
        skipSave = true;
        reportSaveProblem('This world was saved by a newer version of the game. Reload to update.');
      } else {
        store.set(`${SAVE_KEY}-broken-${Date.now()}`, raw);
        if (restored) reportSaveProblem('This world could not be read, so it went back to its last backup.');
        else {
          skipSave = true;
          reportSaveProblem('This world could not be read. It is kept as it was, and nothing is saved.');
        }
      }
    }
  }
  owned = new Set(state.upgrades);
  // A new world gets a map of its own; a loaded one gets its map back.
  if (!state.map) state.map = { seed: state.seed || 1 };
  Terrain.setMap(state.map);
  Scene.setVolcanoSpots(state.map.used || []);
}

function save() {
  if (skipSave) return;
  state.upgrades = [...owned];
  state.map = { ...Terrain.mapState(), used: Scene.volcanoSpots() };
  state.lastTick = Date.now();
  if (store.set(SAVE_KEY, JSON.stringify(state))) {
    if (worldId) updateWorld(worldId, { played: state.lastTick, summary: worldSummary() });
    saveThumb();
  } else if (!saveProblem)
    reportSaveProblem('The game could not save. Free some space on the device, or allow site storage.');
}

/* ================= Worlds ================= */

// The list of worlds: { id, name, created, played, summary }. The saves themselves live under their own keys.
function readWorlds() {
  try {
    const list = JSON.parse(store.get(WORLDS_KEY) ?? 'null');
    if (Array.isArray(list)) return list;
  } catch {}
  // First run with worlds: the old single save, or the stable one, becomes the first world.
  const old = store.get(CHANNEL_SAVE_KEY) || store.get(STABLE_SAVE_KEY);
  if (!old) return [];
  const id = newWorldId();
  store.set(`${CHANNEL_SAVE_KEY}-w-${id}`, old);
  const list = [{ id, name: 'First world', created: Date.now(), played: Date.now(), summary: '' }];
  store.set(WORLDS_KEY, JSON.stringify(list));
  return list;
}

const writeWorlds = list => store.set(WORLDS_KEY, JSON.stringify(list));
const newWorldId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function updateWorld(id, fields) {
  const list = readWorlds(),
    w = list.find(o => o.id === id);
  if (!w) return;
  Object.assign(w, fields);
  writeWorlds(list);
}

// One line about a world for the start menu.
function worldSummary() {
  if (!state.banged) return 'Before the Big Bang';
  const species = Object.values(state.species).filter(n => n >= 0).length;
  return `${(SUN_BIRTH_YEARS / 1e9 + state.sunAge).toFixed(2)} billion years · ${fmtTemp(tempC())}${species ? ` · ${species} species` : ''}`;
}

const worldName = () => readWorlds().find(o => o.id === worldId)?.name;
const thumbKey = id => `${CHANNEL_SAVE_KEY}-w-${id}-thumb`;

// Leaves the page with a fade to black; the next page fades in from black (#fade starts dark).
const FADE_MS = 400;
function fadeOut(then) {
  $('#fade').classList.add('on');
  setTimeout(then, FADE_MS);
}
const openWorld = id => fadeOut(() => (location.href = `${location.pathname}?world=${encodeURIComponent(id)}`));

// A new world, named World N, opened at once. The name can be changed in the book (Game page).
function newWorld(name) {
  const list = readWorlds(),
    id = newWorldId();
  let n = list.length + 1;
  while (list.some(o => o.name === `World ${n}`)) n++;
  writeWorlds([...list, { id, name: name || `World ${n}`, created: Date.now(), played: Date.now(), summary: '' }]);
  openWorld(id);
}

// A small square picture of the world for the start menu: the scene's own pixels round the planet's horizon,
// at the canvas's low resolution, as a PNG (a few kilobytes).
const THUMB_EVERY_MS = 30000;
let thumbAt = 0;
function saveThumb(force = false) {
  if (!worldId || skipSave || (!force && Date.now() - thumbAt < THUMB_EVERY_MS)) return;
  thumbAt = Date.now();
  try {
    const src = /** @type {HTMLCanvasElement} */ ($('#scene')),
      side = Math.min(src.width, src.height),
      out = document.createElement('canvas');
    out.width = out.height = side;
    context2d(out).drawImage(src, (src.width - side) / 2, (src.height - side) / 2, side, side, 0, 0, side, side);
    store.set(thumbKey(worldId), out.toDataURL('image/png'));
  } catch (e) {
    console.warn('No world picture', e);
  }
}

function renderMenu() {
  const list = readWorlds().sort((a, b) => b.played - a.played);
  $('#menu-worlds').innerHTML =
    list
      .map(
        w => `<li class="world-tile" data-id="${w.id}">
      <button class="world-open"><span class="world-pic"></span><b></b><small></small></button>
      <button class="world-del hidden">Delete</button>
    </li>`,
      )
      .join('') +
    '<li class="world-tile new"><button class="world-open world-new"><span class="world-pic">+</span><b>New world</b></button></li>';
  $('#menu-worlds')
    .querySelectorAll('.world-tile[data-id]')
    .forEach((li, k) => {
      li.querySelector('b').textContent = list[k].name;
      li.querySelector('small').textContent = list[k].summary || 'New world';
      const pic = store.get(thumbKey(list[k].id));
      if (pic) /** @type {HTMLElement} */ (li.querySelector('.world-pic')).style.backgroundImage = `url(${pic})`;
    });
}

// The start menu: the title over a drifting starfield until a tap, then the worlds. Stable has one world, so
// the tap goes straight into the game.
function showMenu() {
  renderMenu();
  $('#menu').classList.remove('hidden');
  Title.start(/** @type {HTMLCanvasElement} */ ($('#title-sky')));
  document.body.classList.add('in-menu');
}

function closeTitle() {
  if (MULTI_WORLD) {
    $('#title-screen').classList.add('gone');
    $('#world-pick').classList.remove('hidden');
    return;
  }
  fadeOut(() => {
    $('#menu').classList.add('hidden');
    document.body.classList.remove('in-menu');
    Title.stop();
    Scene.setCinema(null, 0); // the opening starts over now that it can be seen
    $('#fade').classList.remove('on');
  });
}

// Wired at boot, once the DOM helpers exist.
function setupMenu() {
  $('#title-screen').addEventListener('click', closeTitle);

  // A long press on a world shows its Delete button; a tap anywhere else hides it again.
  /** @type {number | undefined} */
  let press;
  let pressed = false;
  const grid = $('#menu-worlds');
  const unarm = () => grid.querySelectorAll('.world-del').forEach(b => b.classList.add('hidden'));
  grid.addEventListener('pointerdown', e => {
    const li = /** @type {HTMLElement} */ (e.target).closest('.world-tile[data-id]');
    pressed = false;
    if (!li) return;
    press = setTimeout(() => {
      pressed = true;
      unarm();
      li.querySelector('.world-del')?.classList.remove('hidden');
      buzz(20);
    }, 550);
  });
  const cancel = () => clearTimeout(press);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => grid.addEventListener(t, cancel));
  grid.addEventListener('contextmenu', e => e.preventDefault());
  grid.addEventListener('click', e => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (pressed) {
      pressed = false;
      return;
    }
    const li = t.closest('.world-tile');
    if (t.closest('.world-del') && li instanceof HTMLElement) {
      const id = li.dataset.id;
      writeWorlds(readWorlds().filter(o => o.id !== id));
      ['', '-backup', '-thumb'].forEach(end => store.remove(`${CHANNEL_SAVE_KEY}-w-${id}${end}`));
      renderMenu();
      return;
    }
    if (grid.querySelector('.world-del:not(.hidden)')) {
      unarm();
      return;
    }
    if (t.closest('.world-new')) newWorld();
    else if (li instanceof HTMLElement && li.dataset.id) openWorld(li.dataset.id);
  });

  $('#world-name').addEventListener('change', () => {
    const name = /** @type {HTMLInputElement} */ ($('#world-name')).value.trim().slice(0, 30);
    if (!name || !worldId) return;
    updateWorld(worldId, { name });
    document.title = `Phylarium · ${name}`;
  });

  $('#worlds-btn').addEventListener('click', () => {
    save();
    saveThumb(true);
    fadeOut(() => (location.href = location.pathname));
  });
}

/* ================= Climate model ================= */

const pop = id => state.species[id] ?? -1; // -1 = not evolved, -2 = extinct
const evolved = id => pop(id) >= 0;
const isExtinct = id => state.extinct.includes(id);
const clamp01 = k => Math.max(0, Math.min(1, k));
// A copy of the list in random order (Fisher-Yates: every order equally likely).
function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const log2 = Math.log2;

const tempC = () => state.tempK - KELVIN;

const has = id => owned.has(id);

// A research field's value on a node: a number, or a function of the planet now. See RESEARCH.
const field = (u, key) => (typeof u[key] === 'function' ? u[key]() : u[key]);
// The nodes that carry each effect field, found once; then only the researched ones count.
const FIELD_NODES = {};
const withField = key => (FIELD_NODES[key] ??= RESEARCH.filter(u => u[key] !== undefined)).filter(u => has(u.id));
const mult = key => withField(key).reduce((m, u) => m * field(u, key), 1);
const total = key => withField(key).reduce((n, u) => n + field(u, key), 0);
// The highest value among researched nodes, or `base`.
const best = (key, base = 0) => withField(key).reduce((v, u) => Math.max(v, field(u, key)), base);
const soupMult = () => (1 + Math.log10(1 + state.minerals)) * mult('boltMult');

// A component is complete when all its research is done; the sun and moon then move to the background.
const componentDone = tab => RESEARCH.filter(u => u.tab === tab).every(u => has(u.id));

// A node shows up once its prerequisites are researched and its `after` event has happened.
const chainOpen = u =>
  !u.hidden &&
  (!u.after || seen(u.after)) &&
  (u.requires || []).every(has) &&
  (!STORY_GATE[u.id] || gameWon(STORY_GATE[u.id]));
// ... and, on a poster, once its chapter is reached (data/chapters.yaml).
const researchVisible = u => chainOpen(u) && tabReached(u.tab);

// Research slots: one to start with, and one more for every ultra gained.
const researchSlots = () => 1 + RESEARCH.filter(u => u.ultra && has(u.id)).length;
const researchingNow = id => state.researching.find(r => r.id === id);
const canResearch = u =>
  !u.auto &&
  !has(u.id) &&
  state.researching.length < researchSlots() &&
  !researchingNow(u.id) &&
  researchVisible(u) &&
  (u.needs || []).every(needMet);
// An ultra with a puzzle is gained by solving it, not by research time, so it never waits for other research.
const puzzleReady = u => !has(u.id) && researchVisible(u) && (u.needs || []).every(needMet);

const methaneHaze = () => clamp01(state.ch4 / 15) * (1 - clamp01(state.o2));

// Sun brightness as a share of today's: dark until ignition, then 70%, and the "Sun Matures"
// upgrades brighten it toward today's level, as the real sun did.
function sunBrightness() {
  const lit = state.ignition >= 1 ? SUN_IGNITED : 0;
  return best('sun', lit);
}

// Ice the planet settles toward at a global mean temperature. The warm equator opens first, at a mean of about
// −8 °C; once dark water shows, it soaks up sunlight and the thaw speeds itself up. Ice sheets are gone at about 22 °C.
function iceTarget(c = tempC() + total('iceShift')) {
  if (c <= ICE_OPENS) return 1;
  if (c <= 14) return 1 - 0.9 * Math.sqrt((c - ICE_OPENS) / (14 - ICE_OPENS));
  return Math.max(0, 0.1 * (1 - (c - 14) / 8));
}

const iceCover = () => state.ice;
const openOcean = () => (1 - state.land) * (1 - iceCover());
// Ozone forms as O2 approaches 2%, once the Ozone Layer is researched. A solar storm thins it for a while.
const ozone = () =>
  has('ozonegas')
    ? clamp01(state.o2 / (setDone('glows') ? 1.5 : 2)) *
      (state.solarStorm > 0 && !state.auroraShield ? 0.4 : 1) *
      (state.supernova > 0 ? 0.6 : 1)
    : 0;
const volcanoes = () => best('volcanoes') * state.volcanoActivity;
// Snow on the peaks: glaciers grow on high mountains while the planet is cool enough.
const glacierIce = () => (has('glaciers') ? clamp01((30 - tempC()) / 30) * Math.min(1, state.mountains * 2) : 0);
// Water running down the rivers: glacier melt and rain, none while frozen.
const riverFlow = () => (has('rivers') ? clamp01(tempC() / 15) * clamp01(0.4 + state.clouds) : 0);
// Wetlands rot plants without oxygen and give off methane, more in the warmth.
const wetlandMethane = () => (has('wetlands') ? 0.04 * clamp01(tempC() / 15) : 0);
// Evaporation from open water, faster when the air is warm. Thin air holds little water vapor, so clouds
// need a thick (nitrogen) atmosphere.
const cloudFormation = () => 0.03 * openOcean() * Math.max(0, tempC() / 14 + 0.3) * Math.max(0.3, state.pressure);

// A frozen gas thaws into the air, up to `amount` this frame.
function thaw(gas, amount) {
  const out = Math.min(state[`${gas}Ice`], amount);
  state[`${gas}Ice`] -= out;
  state[gas] += out;
}

// Warming (K) from one greenhouse gas in thin air. The air pressure and water vapor amplify it in climate().
const gasWarming = gas => (gas === 'co2' ? 3.3 * log2(1 + state.co2 / 10) : 2 * log2(1 + state.ch4 / 0.5));

// How much cooler (K) the planet settles because of eruption aerosols right now.
function aerosolCooling() {
  if (state.aerosols < 0.001) return 0;
  const saved = state.aerosols;
  state.aerosols = 0;
  const clear = climate().target;
  state.aerosols = saved;
  return clear - climate().target;
}

// Target temperature (K) from a simple energy balance:
// sunlight absorbed (less what ice, clouds and dust reflect) plus the greenhouse effect of the air.
function climate() {
  const ice = iceCover();
  const dust = seen('sunlit') ? Math.min(0.8, volcanoes() * VOLCANO_DUST + state.ash) : 0;
  // Methane haze without oxygen reflects sunlight too (like Titan's haze). So do eruption aerosols and snowy peaks.
  const albedo =
    0.22 +
    0.37 * ice * (1 - 0.5 * dust) +
    0.08 * state.clouds +
    0.1 * methaneHaze() +
    0.2 * state.aerosols +
    0.03 * state.mountains +
    total('albedo') +
    state.land * (0.15 * Terrain.biomes().desert - 0.08 * Terrain.biomes().forest); // bright sand, dark forest
  const sunK = 255 * Math.pow(Math.max(0, (sunBrightness() * (1 - albedo)) / 0.7), 0.25);
  const bare = Math.pow(sunK ** 4 + CORE_K ** 4, 0.25);
  // Greenhouse: each doubling of CO2 adds a few degrees; thin air holds less heat; water vapor amplifies it.
  const gasK = gasWarming('co2') + gasWarming('ch4');
  const greenhouse = gasK * (0.3 + 0.7 * state.pressure) * (1 + 0.45 * (1 - ice));
  // An ice age: the tilt wobbles and the summers grow cool.
  const iceAgeK = state.iceAge > 0 ? ICE_AGE_COOLING : 0;
  return { target: bare + greenhouse - iceAgeK, albedo, dust, greenhouse, sunK: bare };
}

function recalc() {
  const r = {
    co2: 0,
    ch4: total('ch4'),
    minerals: total('minerals'),
    o2: 0,
    clouds: total('cloudRate') * mult('cloudMult'),
    green: 0,
    life: 0,
    weathering: rates.weathering || 0,
    weatherMinerals: rates.weatherMinerals || 0,
    // Thunderstorms strike on their own, more often the stormier the sky.
    lightning: best('lightning') * clamp01(state.clouds / STORM_CLOUDS),
  };
  // Volcanoes: a little natural outgassing always, plus the player's volcanoes.
  if (seen('sunlit')) r.co2 += 2 + volcanoes() * VOLCANO_CO2;

  for (const s of SPECIES) {
    const p = pop(s.id);
    if (p < 0) continue;
    r.o2 += (s.o2 || 0) * p;
    if (s.green) r.green += s.green * p;
    if (s.domain === 'ocean') r.life += p;
  }
  r.climate = climate();
  rates = r;
}

// How much of a full population the habitat holds (0..1): by default 60% of the land in its zones is plenty.
function habitat(s) {
  if (!s.home) return 1;
  const z = Terrain.zones();
  return clamp01(s.home.reduce((n, k) => n + z[k], 0) / (s.plenty || 0.6));
}

// Why a living species grows or shrinks, in a few words.
function lifeState(s) {
  const p = pop(s.id),
    room = habitat(s),
    c = tempC();
  if (fitness(s, c) < 0) return c > s.temp[1] ? 'too hot' : 'too cold';
  if (p > room + 0.01) return room < 0.01 ? 'no home left' : 'losing its home';
  if (p < room - 0.02) return 'spreading';
  return 'thriving';
}

// How well a species fits the current temperature: 1 inside its range, negative outside.
function fitness(s, c) {
  const [lo, hi] = s.temp;
  if (c >= lo && c <= hi) return 1;
  return -Math.min(1, (c < lo ? lo - c : c - hi) / 6);
}

// Advance the world by dt seconds.
// The climate page in the book: each series is a number and a graph of its last hour, sampled every
// CLIMATE_SAMPLE_S seconds of play. A series shows once the research that brings it is known. A graph spans at least
// `span` (else a tenth of its values' size), so small wobbles stay small.
const CLIMATE_SAMPLE_S = 15,
  CLIMATE_SAMPLES = 240;
const percent = v => `${v < 10 ? v.toFixed(1) : v.toFixed(0)}%`,
  ppm = v => `${fmt(v)} ppm`;
const CLIMATE = [
  {
    id: 'temp',
    section: 'temperature',
    name: 'Temperature',
    now: () => tempC(),
    show: v => fmtTemp(v),
    known: () => true,
    span: 2,
  },
  { id: 'ice', section: 'temperature', name: 'Ice', now: () => state.ice * 100, show: percent, known: () => true },
  {
    id: 'clouds',
    section: 'weather',
    name: 'Clouds',
    now: () => state.clouds * 100,
    show: percent,
    known: () => has('clouds'),
  },
  {
    id: 'rain',
    section: 'weather',
    name: 'Rain',
    now: () => clamp01((state.clouds - 0.1) / 0.15) * 100,
    show: percent,
    known: () => has('rain'),
  },
  {
    id: 'rivers',
    section: 'weather',
    name: 'Rivers',
    now: () => riverFlow() * 100,
    show: percent,
    known: () => has('rivers'),
  },
  {
    id: 'air',
    section: 'gases',
    name: 'Air',
    now: () => state.pressure,
    show: v => `${v.toFixed(2)} bar`,
    known: () => has('thawN2'),
  },
  { id: 'co2', section: 'gases', name: 'CO₂', now: () => state.co2, show: ppm, known: () => has('thawCO2') },
  { id: 'ch4', section: 'gases', name: 'CH₄', now: () => state.ch4, show: ppm, known: () => has('thawCH4') },
  {
    id: 'o2',
    section: 'gases',
    name: 'O₂',
    now: () => state.o2,
    show: v => `${v.toFixed(2)}%`,
    known: () => has('photosynthesis'),
  },
  {
    id: 'ozone',
    section: 'gases',
    name: 'Ozone',
    now: () => ozone() * 100,
    show: percent,
    known: () => has('ozonegas'),
  },
];
// Weather spells shown as words beside the graphs while they last.
const WEATHER_NOW = [
  { name: 'Storms', now: () => seen('storms') && state.clouds >= STORM_CLOUDS },
  { name: 'Drought', now: () => state.drought > 0 },
  { name: 'Ice age', now: () => state.iceAge > 0 },
  { name: 'Solar storm', now: () => state.solarStorm > 0 },
];

function logClimate() {
  state.climateNext = state.time + CLIMATE_SAMPLE_S;
  const log = (state.climateLog ||= {});
  const add = (id, v) => {
    const a = (log[id] ||= []);
    a.push(Number(v.toPrecision(4)));
    if (a.length > CLIMATE_SAMPLES) a.splice(0, a.length - CLIMATE_SAMPLES);
  };
  add('t', state.time);
  for (const c of CLIMATE) add(c.id, c.now());
}

// Research in progress finishes after its number of days. It runs on real time, also while the app is closed.
function advanceResearch(dt) {
  for (const r of state.researching) r.done += dt / ((RESEARCH_BY_ID[r.id].days || 1) * DAY_S);
  const finished = state.researching.filter(r => r.done >= 1);
  if (!finished.length) return;
  state.researching = state.researching.filter(r => r.done < 1);
  for (const r of finished) owned.add(r.id);
  recalc();
  for (const r of finished) RESEARCH_BY_ID[r.id].climax?.();
}

function simulate(dt) {
  // The sun ages once lit, and brightens with age (research Brighter Sun and its chain).
  state.time = (state.time || 0) + dt; // seconds of play, for game days before the spin locks too
  if (state.time >= (state.climateNext || 0)) logClimate();
  if (state.ignition >= 1) state.sunAge += dt / SUN_GYR_S;

  // An unlit sun cools back down when the player stops tapping.
  state.sinceTap = (state.sinceTap || 0) + dt;
  if (state.ignition < 1 && state.sinceTap > IGNITION_GRACE_S) {
    state.ignition = Math.max(0, state.ignition - IGNITION_DECAY * Math.min(dt, state.sinceTap - IGNITION_GRACE_S));
  }

  // The spin runs down when the player stops swiping, faster the faster it turns. Full spin locks it (and
  // throws off the moon), and the clock starts.
  if (state.spinLocked) state.clock += (24 * dt) / DAY_S;
  else state.spin = Math.max(0, state.spin - (0.03 + 0.09 * state.spin) * dt);

  // Volcanic activity wanders by itself: restless spells and quiet ones, each lasting a minute or two.
  if (Math.random() < dt / VOLCANO_SPELL_S) state.volcanoGoal = 0.5 + Math.random(); // 50% to 150%, 100% on average
  state.volcanoActivity += ((state.volcanoGoal ?? 1) - state.volcanoActivity) * Math.min(1, dt / 20);

  advanceResearch(dt);

  // What research does over time: gases thaw and build up, colliding plates pile up mountains.
  for (const u of withField('tick')) if (!u.auto || (u.needs || []).every(needMet)) u.tick(dt);

  // Volcanoes slowly build new land.
  const landRate = state.land < VOLCANIC_LAND ? 0.0004 : 0.00004 * mult('landMult') * (1 - state.land / MAX_LAND);
  state.land = Math.min(MAX_LAND, state.land + landRate * volcanoes() * dt);

  // Eruptions come at random. Aerosols and ash then rain out over time.
  if (has('eruption') && volcanoes() > 0 && Math.random() < (volcanoes() * dt) / ERUPTION_EVERY_S) erupt();
  state.aerosols *= Math.exp(-dt / AEROSOL_LIFE_S);
  state.ash *= Math.exp(-dt / ASH_LIFE_S);

  // Without a magnetic field the solar wind slowly strips the air away, as it did on Mars.
  if (seen('ocean') && !has('magnet')) state.pressure = Math.max(0.2, state.pressure - 0.0003 * dt);

  // Carbon cycle: volcanoes add CO2; rock weathering removes it when warm and wet (the planet's thermostat);
  // photosynthesis removes it too. Oxygen destroys methane.
  const c = tempC(),
    open = 1 - iceCover();
  // Weathering speeds up sharply in the heat, with more land, and most of all on fresh mountain rock.
  const rock = (state.land / BASE_LAND) * (1 + 2 * state.mountains);
  const weathering =
    0.002 * state.co2 * Math.max(0, c / 15) ** 1.5 * open * rock * mult('weatherMult') * (1 + Terrain.biomes().forest); // roots break rock
  const photosynthesis = (rates.o2 * 1500 * state.co2) / (state.co2 + 1000); // slows when CO2 runs low
  rates.weathering = weathering;
  // The worn rock does not vanish: rain and rivers wash it to the sea as dissolved minerals.
  rates.weatherMinerals = WEATHER_MINERALS * weathering;
  state.co2 = Math.max(0, state.co2 + (rates.co2 - weathering - photosynthesis) * dt);
  state.ch4 = Math.max(0, state.ch4 + (rates.ch4 - state.ch4 * 0.03 * clamp01(state.o2)) * dt);

  // Temperature follows its target with a lag. Ice sheets grow and melt more slowly still.
  const lag = THERMAL_LAG_S + OCEAN_LAG_S * (1 - state.ice);
  state.tempK += (rates.climate.target - state.tempK) * Math.min(1, dt / lag);
  // The surface cools once the moon is out; the basins fill once a comet has brought water, and that water
  // freezes over and holds until the player cracks it.
  if (state.moonBorn) state.crust = Math.min(1, state.crust + dt / COOL_S);
  if (state.comets > 0) state.oceans = Math.min(1, state.oceans + dt / SEA_FILL_S);
  const iceGoal = gameWon('ice') ? iceTarget() : state.oceans;
  state.ice +=
    (iceGoal - state.ice) * Math.min(1, dt * (gameWon('ice') ? (iceGoal > state.ice ? 0.003 : 0.006) : 0.02));

  state.minerals += (rates.minerals + rates.weatherMinerals) * dt;
  evolveTick(dt);
  state.o2 += rates.o2 * (1 - state.o2 / MAX_O2) * dt; // levels off near today's 21%
  // Clouds form from evaporation and rain out at 5% per second.
  state.clouds = clamp01(state.clouds + (rates.clouds - state.clouds * 0.05) * dt);

  // Species grow toward what their habitat holds inside their temperature range, shrink back when the habitat
  // shrinks, and die back outside the range.
  for (const id of Object.keys(state.species)) {
    const p = state.species[id];
    if (p < 0) continue;
    const s = SPECIES_BY_ID[id],
      f = fitness(s, c),
      room = habitat(s);
    let next;
    if (f <= 0) next = p * (1 + f * 0.15 * mult('dieOff') * dt);
    else if (p > room) next = p - (p - room) * Math.min(1, 0.1 * dt);
    else next = Math.min(room, p + p * (1 - p) * 0.25 * dt);
    if (next < 0.005) {
      state.species[id] = -2;
      state.extinct.push(id);
    } else {
      state.species[id] = next;
    }
  }
}

// A natural disaster happens. The first of each kind is a big moment.
function disaster(id, x = innerWidth / 2, y = innerHeight * 0.4) {
  const first = !state.disasters[id];
  state.disasters[id] = (state.disasters[id] || 0) + 1;
  if (first) markNew(`disaster:${id}`);
  announce(`${DISASTERS[id].name}!`, x, y, first ? 'disaster big' : 'disaster');
  buzz(first ? [60, 40, 60, 40, 120] : [30, 30, 30]);
}

// Fires, lava and floods spread and die down. Land life where they reach dies back. Smoke adds CO2;
// flood water leaves fertile silt (minerals).
function stepFires(dt) {
  const { hit, active } = Terrain.stepFires(dt),
    burnt = hit.fire + hit.lava,
    wet = hit.flood + hit.surge;
  for (const s of SPECIES) {
    if (s.domain === 'ocean' || !evolved(s.id)) continue;
    if (burnt > 0) state.species[s.id] *= 1 - Math.min(0.6, burnt * FIRE_KILL);
    if (wet > 0) state.species[s.id] *= 1 - Math.min(0.5, wet * FIRE_KILL) * (has('delta') ? 0.5 : 1); // a fertile delta drowns less
  }
  state.co2 += burnt * FIRE_CO2;
  state.minerals += wet * FLOOD_MINERALS * (has('delta') ? 2 : 1);
  if (active) Scene.repaint();
}

// Reef life takes the hit of a storm surge or tsunami.
const hitReefs = share =>
  SPECIES.forEach(s => (s.home || []).includes('reef') && evolved(s.id) && (state.species[s.id] *= 1 - share));

// Each disaster below returns whether it happened. `first` marks a story's climax.
function flood() {
  const spot = Terrain.findSpot('flood', Scene.centre());
  if (!spot) return false;
  Terrain.spread('flood', spot.u, spot.v, 8 + Math.random() * 6);
  disaster('flood');
  return true;
}

function hurricane() {
  const spot = Terrain.findSpot('surge', Scene.centre());
  if (!spot) return false;
  Scene.hurricane(spot, 6);
  disaster('hurricane');
  const k = zodiacComplete() ? 0.5 : 1;
  state.surge = { u: spot.u, v: spot.v, in: 4, size: (10 + Math.random() * 5) * k, reefs: 0.25 * k };
  return true;
}

function quake() {
  Scene.shake(2.5);
  disaster('earthquake');
  gemRush = GEM_RUSH_S; // the fault opens: gems glint in the crack for a while (play.js)
  const spot = Terrain.findSpot('surge', Scene.centre());
  if (spot) state.surge = { u: spot.u, v: spot.v, in: 1.8, size: 12 + Math.random() * 6, reefs: 0.3, tsunami: true };
  return true;
}

function drought() {
  state.drought = DROUGHT_S * (setDone('flowers') ? 0.5 : 1); // pollinators bring rain-ready seeds back fast
  disaster('drought');
  return true;
}

// The ice spreads for a while (see climate); the cold does the rest to life.
function iceAge() {
  state.iceAge = ICE_AGE_S;
  disaster('iceage');
  return true;
}

// Toxic algae bloom along the coasts and poison sea life while it lasts (see disasterTick).
function redTide() {
  state.redTide = RED_TIDE_S;
  disaster('redtide');
  return true;
}
const BLOOMERS = new Set(['algae', 'plankton', 'cyano', 'cell']);

// UV gets through the thinned ozone and burns surface life.
// A supernova: a giant star far away blows apart. It blazes in the sky, by day too, and its rays thin the
// ozone for a while; life on land and in the shallow sea suffers, the deep sea is safe.
function supernova() {
  state.supernova = SUPERNOVA_S;
  Scene.supernova(SUPERNOVA_S);
  for (const s of SPECIES)
    if (evolved(s.id) && (s.domain !== 'ocean' || (s.home || []).includes('reef'))) state.species[s.id] *= 0.9; // reefs are the shallow sea
  disaster('supernova');
  return true;
}

function solarStorm() {
  state.solarStorm = SOLAR_STORM_S;
  Scene.aurora(SOLAR_STORM_S);
  for (const s of SPECIES)
    if (s.domain !== 'ocean' && evolved(s.id)) state.species[s.id] *= setDone('meteorites') ? 0.95 : 0.85; // meteoritic iron: a stronger core and field
  disaster('solarstorm');
  return true;
}

// The finale: an asteroid crashes in. Lava and a winter of dust, and most of every species dies;
// small ones die out. The age ends.
function asteroidImpact() {
  Scene.asteroid();
  return true;
}

Scene.onAsteroidHit((x, y) => asteroidHit(x, y));
function asteroidHit(x, y) {
  const at = Scene.texelAt(x, y + 8) || Scene.texelAt(innerWidth / 2, innerHeight * 0.75);
  if (at) Terrain.spread('lava', at.u, at.v, 22);
  state.aerosols = 1;
  state.ash = 0.4;
  state.co2 += 2000;
  for (const id of Object.keys(state.species)) {
    if (state.species[id] < 0) continue;
    state.species[id] *= 0.25;
    if (state.species[id] < 0.02) {
      state.species[id] = -2;
      state.extinct.push(id);
    }
  }
  // While dinosaurs live, the impact ends their age: they and the ammonites die out, and the survivors (birds,
  // small mammals) get the planet. Birds, whales, bats, grazers and primates need this.
  if ((state.species.dinosaur > 0 || isExtinct('dinosaur')) && !state.impact) {
    for (const id of ['dinosaur', 'ammonite'])
      if (state.species[id] >= 0) {
        state.species[id] = -2;
        if (!state.extinct.includes(id)) state.extinct.push(id);
      }
    state.impact = true;
    announce('The age of the dinosaurs ends', innerWidth / 2, innerHeight * 0.35, 'disaster big');
  }
  state.ages++;
  disaster('asteroid', x, y - 30);
  announce('An age ends', innerWidth / 2, innerHeight * 0.45);
  save();
}

/* ================= Tree status ================= */

const CHILDREN = {};
for (const s of SPECIES) if (s.parent) (CHILDREN[s.parent] ||= []).push(s);

// A species is blocked for good when its parent died out before it evolved, or its parent is blocked.
// A survivor (birds) can evolve from its parent after the parent died out; anything else needs it alive.
const parentAlive = s => evolved(s.parent) || (!!s.survivor && isExtinct(s.parent));
const parentOk = s => (s.survivor && isExtinct(s.parent)) || parentReady(s);
function isBlocked(s) {
  if (!s.parent || evolved(s.id) || isExtinct(s.id)) return false;
  if (s.survivor && isExtinct(s.parent)) return false;
  return isExtinct(s.parent) || isBlocked(SPECIES_BY_ID[s.parent]);
}

// alive, extinct, available (can evolve now), waiting (possible later) or blocked.
function speciesStatus(s) {
  if (isExtinct(s.id)) return 'extinct';
  if (evolved(s.id)) return 'alive';
  if (isBlocked(s)) return 'blocked';
  if (state.evolving?.id === s.id) return 'evolving';
  if (parentAlive(s) && parentOk(s) && opened(s) && seen(DOMAIN_OPENS[s.domain]) && conditionsMet(s))
    return 'available';
  return 'waiting';
}

// A species' own conditions: an event that must have happened (`after`) and needs like research has.
const conditionsMet = s => (!s.after || seen(s.after)) && (s.needs || []).every(needMet);

// How much faster a species evolves: research (evolveMult per domain), less on desert land, more in a lit sea.
function evolveSpeed(s) {
  let m = withField('evolveMult').reduce((n, u) => n * (u.evolveMult[s.domain] ?? u.evolveMult.all ?? 1), 1);
  if (s.domain === 'ground') m *= 1 - 0.7 * Terrain.biomes().desert;
  if (s.domain === 'ocean' && setDone('lights')) m *= 1.25;
  return Math.min(EVOLVE_MAX_SPEED, m);
}
const EVOLVE_MAX_SPEED = 3; // research speeds evolution up to this much, however many boosts stack
const EVOLVE_DAY_S = 2 * DAY_S; // real seconds per species day: evolution is slower than research

// Evolution works like research: one species at a time, taking its days, while its conditions hold (it pauses
// if they are lost). There is no currency: what it takes is the planet being ready.
function evolveTick(dt) {
  const ev = state.evolving;
  if (!ev) return;
  const s = SPECIES_BY_ID[ev.id];
  if (!s || evolved(s.id) || isExtinct(s.id)) {
    state.evolving = null;
    return;
  }
  const ready = parentAlive(s) && parentOk(s) && opened(s) && seen(DOMAIN_OPENS[s.domain]) && conditionsMet(s);
  if (!ready) return;
  ev.done += (dt * evolveSpeed(s)) / ((s.days || 1) * EVOLVE_DAY_S);
  if (ev.done < 1) return;
  state.species[s.id] = 0.05;
  state.evolving = null;
  buzz([20, 40, 20]);
}

function treeSummary() {
  const counts = { alive: 0, extinct: 0, evolving: 0, available: 0, waiting: 0, blocked: 0 };
  for (const s of SPECIES) counts[speciesStatus(s)]++;
  return counts;
}

// There is no game over. If every species dies out, life can start again: lightning on tidal pools
// builds a new soup, and a full soup brings the first cells back.
function lifeTick() {
  if (!has('firstcell')) return;
  const alive = Object.values(state.species).some(p => p > 0);
  if (!alive && !state.lifeGone) {
    state.lifeGone = true;
    state.soup = 0;
  } else if (state.lifeGone && state.soup >= SOUP_FULL) {
    state.lifeGone = false;
    state.extinct = state.extinct.filter(id => id !== 'cell');
    state.species.cell = 0.02;
  }
}

// Soup builds before the first life, and again after all life is gone.
const soupBuilds = () => !seen('life') || state.lifeGone;

// The next event happens once the planet gets there.
function checkEvents() {
  // Gases appear in the air by themselves once their molecule is known (`auto` in research.yaml).
  // Research that comes by itself (auto) is known as soon as its chain is open and its needs hold: Rotation, for
  // one, once the planet's spin has locked.
  for (const u of RESEARCH) if (u.auto && !has(u.id) && chainOpen(u) && (u.needs || []).every(needMet)) owned.add(u.id);
  const next = EVENTS[state.happened.length];
  if (!next || !next.happens()) return;
  state.happened.push(next.id);
  buzz([30, 50, 30]);
  recalc();
  renderCategory(true);
}

/* ================= Formatting ================= */

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

function fmt(n) {
  if (!isFinite(n)) return '∞';
  if (n < 1000) return n < 100 && n % 1 ? n.toFixed(1) : Math.floor(n).toString();
  const tier = Math.floor(Math.log10(n) / 3);
  if (tier >= SUFFIXES.length) return n.toExponential(2);
  const v = n / 10 ** (tier * 3);
  return `${v.toFixed(v < 100 ? 2 : 1)}${SUFFIXES[tier]}`;
}

function fmtTime(s) {
  s = Math.floor(s);
  const h = Math.floor(s / 3600),
    m = Math.floor(s / 60) % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
}

const pct = v => `${Math.round(v * 100)}%`;
const fmtTemp = c => `${c.toFixed(1)}°C`;
