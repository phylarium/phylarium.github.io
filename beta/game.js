'use strict';

/* ================= Config ================= */

// The beta keeps its own save, so a newer save format never reaches the stable game.
const STABLE_SAVE_KEY = 'phylarium-save';
const CHANNEL_SAVE_KEY = CHANNEL === 'beta' ? 'phylarium-beta-save' : STABLE_SAVE_KEY;
// Outside stable, the player can keep several worlds, each with its own save. The open world is in the
// URL (?world=id), so different tabs can run different worlds side by side. Without one, the start menu shows.
const MULTI_WORLD = CHANNEL !== 'stable';
const WORLDS_KEY = `${CHANNEL_SAVE_KEY}-worlds`;
const worldId = MULTI_WORLD ? new URLSearchParams(location.search).get('world') : null;
const SAVE_KEY = worldId ? `${CHANNEL_SAVE_KEY}-w-${worldId}` : CHANNEL_SAVE_KEY;
const SAVE_VERSION = 6;          // bump with a new step in MIGRATIONS when old saves need fixing
const OFFLINE_RATE = 0.5;          // fraction of production earned while away
const OFFLINE_CAP_S = 12 * 3600;   // max offline time counted
const KELVIN = 273.15;
const CORE_K = 35;                 // surface of a planet with no sun, warmed only by its core (spec: Climate scale)
const START_LAND = 0.05;           // share of the planet that is land at the start: a few islands; volcanoes build the rest
const VOLCANIC_LAND = 0.3;         // volcanoes quickly build continents up to this share, then lava adds land slowly
const MAX_LAND = 0.5;
const BASE_LAND = 0.38;            // today's land share, where weathering runs at its normal rate
const SOUP_FULL = 100;
const STORM_CLOUDS = 0.35;         // cloud cover where storms start
const OZONE_FOR_LAND = 0.6;
const MAX_O2 = 21;
const LIFE_WINDOW = [11, 36];      // global mean °C range of complex life over the last 485 million years
const SUN_GYR_S = 120;             // real seconds per billion years of the sun's life
const SUN_IGNITED = 0.7;           // the young sun shone at about 70% of today's brightness
// Spinning the planet (swipe it) is the first thing after the Big Bang. At full spin the planet throws off
// the moon and the spin locks, in one go: days begin, the sun rises at 6 and sets at 18, and the Magnetic
// Field can be researched.
const SPIN_PER_SCREEN = 0.16;      // spin added by a swipe across the whole screen width
const MOON_SPIN = 1;
const DAY_S = 30;                  // real seconds per day once the spin is locked
const SUNRISE = 6, SUNSET = 18;
const sunUp = () => state.spinLocked && state.clock % 24 >= SUNRISE && state.clock % 24 <= SUNSET;
const THERMAL_LAG_S = 5;           // how fast temperature follows its target on an ice-covered planet
const OCEAN_LAG_S = 60;            // extra lag once oceans are open: water takes long to heat

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
// Story order: spin the planet (Core), the moon flies out, the spin locks (Land, the sun rises), light the sun,
// research the Magnetic Field, then the air can stay (Atmosphere).
const SECTION_UNLOCKED = {
  core: () => true,
  land: () => state.spinLocked && has('lava'),
  freshwater: () => state.spinLocked,
  moon: () => state.moonBorn,
  sun: () => state.spinLocked,
  atmosphere: () => has('magnet'),
  noble: () => false,   // hidden until the noble gases have a use (issue #5)
  ocean: () => seen('thaw'),
  tides: () => seen('thaw'),
  oceanlife: () => seen('life'),
  landlife: () => seen('ozone'),
  airlife: () => seen('flight'),
  life: () => seen('life'),
  elements: () => state.atoms.length > 0,
  laws: () => state.laws.length > 0,
  spectrum: () => has('starlight'),
  genes: () => RESEARCH.some(u => u.tab === 'genes' && (has(u.id) || researchVisible(u))),
  stars: () => true,
  comets: () => has('starlight'),
  molecules: () => has('milkyway') && state.atoms.length >= 2,   // the Milky Way opens Chemistry's molecules
  disasters: () => Object.keys(state.disasters).length > 0,
  signs: () => state.signs.length > 0,
  planets: () => state.planets.length > 0,
  index: () => SPECIES.some(known),
  world: () => true,
  stories: () => STORIES.some(storyOpen),
};

// The science book (data/book.yaml): one tab per subject, each a page of sections.
const SUBJECTS = DATA.book.subjects.map(c => c.groups ? { ...c, sections: c.groups.flatMap(g => g.sections) } : c);
// Each collection's section opens with its ultra (data/collections.yaml).
for (const c of DATA.collections) SECTION_UNLOCKED[c.section] = () => has(c.opens);
const SECTIONS = Object.fromEntries(Object.entries(DATA.book.sections).map(([id, name]) => [id, { name, unlocked: SECTION_UNLOCKED[id] || (() => false) }]));
const SUBJECT_BY_ID = Object.fromEntries(SUBJECTS.map(c => [c.id, c]));
const subjectOf = section => SUBJECTS.find(c => c.sections.includes(section));

const VOLCANO_CO2 = 12;      // ppm CO2/s from one volcano at full activity
const VOLCANO_DUST = 0.05;
const VOLCANO_SPELL_S = 90;   // mean time between changes of volcanic mood   // ash from one volcano
// Eruptions: sulfate aerosols reflect sunlight for a while (cooling), the CO2 stays (warming), ash darkens ice.
const ERUPTION_EVERY_S = 200;  // mean time between eruptions for one volcano at full activity
const AEROSOL_LIFE_S = 45;     // aerosols rain out with this time constant (Pinatubo: about a year)
const ASH_LIFE_S = 120;

// Gauges: [level 0..1, text]. A researched node shows its gauge instead of a description, so the player
// learns what it does by watching it move as the rest of the planet changes.
const logLevel = (v, max) => clamp01(Math.log10(1 + Math.max(0, v)) / Math.log10(1 + max));
const sunGauge = () => [sunBrightness(), `${pct(sunBrightness())} of today · ${state.sunAge.toFixed(1)} billion years old`];
const volcanoGauge = () => [clamp01(rates.co2 / 200), `+${fmt(rates.co2)} ppm CO₂/s · ${pct(state.land)} land`];
const soupGauge = () => [clamp01(soupMult() / 12), `x${soupMult().toFixed(1)} soup per strike`];
const rainGauge = () => [logLevel(state.minerals, 1e4), `${fmt(state.minerals)} minerals · +${fmt(mult('rainMult'))} per drop`];

// What a research node needs before the player can choose to research it: real physical conditions,
// not a currency. Each kind reads the planet now and shows the target.
const NEEDS = {
  temp: { label: v => `${v}°C`, now: () => tempC(), show: v => fmtTemp(v) },
  sunAge: { label: v => `sun ${v} billion years old`, now: () => state.sunAge, show: v => `${v.toFixed(1)} billion years` },
  spin: { label: v => `${v}% spin`, now: () => state.spin * 100, show: v => `${v.toFixed(0)}%` },
  days: { label: v => `${v} days`, now: () => Math.floor(state.clock / 24), show: v => `${v}` },
  air: { label: v => `${v} bar air`, now: () => state.pressure, show: v => `${v.toFixed(2)} bar` },
  water: { label: v => `${v}% open water`, now: () => openOcean() * 100, show: v => `${v.toFixed(0)}%` },
  clouds: { label: v => `${v}% clouds`, now: () => state.clouds * 100, show: v => `${v.toFixed(0)}%` },
  strikes: { label: v => `${v} lightning strikes`, now: () => state.strikes, show: v => `${v}` },
  eruptions: { label: v => `${v} eruptions`, now: () => state.eruptions, show: v => `${v}` },
  land: { label: v => `${v}% land`, now: () => state.land * 100, show: v => `${v.toFixed(0)}%` },
  mountains: { label: v => `${v}% mountains`, now: () => state.mountains * 100, show: v => `${v.toFixed(0)}%` },
  minerals: { label: v => `${v} minerals`, now: () => state.minerals, show: v => fmt(v) },
  species: { label: v => `${v} species alive`, now: () => SPECIES.filter(sp => evolved(sp.id)).length, show: v => `${v}` },
  desert: { label: v => `${v}% desert`, now: () => Terrain.biomes().desert * 100, show: v => `${v.toFixed(0)}%` },
  plants: { label: v => `${v} land plants`, now: () => SPECIES.filter(sp => sp.green && evolved(sp.id)).length, show: v => `${v}` },
  comets: { label: v => `${v} ${v === 1 ? 'comet' : 'comets'} caught`, now: () => state.comets, show: v => `${v}` },
  oxygen: { label: v => `${v}% oxygen`, now: () => state.o2, show: v => `${v.toFixed(2)}%` },
  planets: { label: v => `${v} planets found`, now: () => state.planets.length, show: v => `${v}` },
  signs: { label: v => `${v} star signs found`, now: () => state.signs.length, show: v => `${v}` },
  // A molecule needs enough of its atoms, brought down by comets.
  atom: { label: sym => `${ATOMS[sym].name} found`, met: sym => state.atoms.includes(sym) },
  matter: { label: ([sym, n]) => `${n} ${sym}`, met: ([sym, n]) => (state.matter[sym] || 0) >= n, progress: ([sym]) => state.matter[sym] || 0 },
  // A link to another branch of the tree: that research must be done first.
  done: { label: id => RESEARCH_BY_ID[id].name, met: id => has(id) },
  evolved: { label: id => `${SPECIES_BY_ID[id].name} alive`, met: id => evolved(id) },
  daytime: { label: () => 'the sun in the sky', met: () => sunUp() },
  night: { label: () => 'night', met: () => state.spinLocked && !sunUp() },
  disaster: { label: id => `a ${DISASTERS[id].name.toLowerCase()}`, met: id => (state.disasters[id] || 0) > 0 },
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
  sun1: { gauge: sunGauge },
  sun2: { gauge: sunGauge },
  sun3: { gauge: sunGauge },
  sun4: { gauge: sunGauge },
  uv: { gauge: () => [logLevel(rates.dna, 1000), `${fmt(rates.dna)} DNA/s`] },
  mN2: { gauge: () => [1, 'Two nitrogen atoms: nitrogen gas'] },
  mCH4: { gauge: () => [1, 'One carbon, four hydrogens: methane'] },
  mH2O: { gauge: () => [1, 'Two hydrogens, one oxygen: water'] },
  mCO2: { gauge: () => [1, 'One carbon, two oxygens: carbon dioxide'] },
  mO2: { gauge: () => [1, 'Two oxygens: the gas life breathes'] },
  mH2: { gauge: () => [1, 'Two hydrogens: the lightest gas'] },
  mNH3: { gauge: () => [1, 'One nitrogen, three hydrogens: ammonia'] },
  firstcell: { climax: () => (state.species.cell ??= 0.02), gauge: () => [clamp01(pop('cell')), `${pct(pop('cell'))} of the sea holds cells`] },
  rna: { gauge: () => [1, 'A single strand of genes that copies itself'] },
  mO3: { gauge: () => [1, 'Three oxygens: ozone'] },
  ozonegas: { gauge: () => [ozone(), `${pct(ozone())} · O₂ ${state.o2.toFixed(2)}%`] },
  thawN2: { tick: dt => (state.pressure = Math.min(1, state.pressure + 0.08 * dt)), gauge: () => frozenGauge('thawN2') || [state.pressure, `${state.pressure.toFixed(2)} bar`] },
  thawCH4: { tick: dt => thaw('ch4', 2 * dt), gauge: () => frozenGauge('thawCH4') || [logLevel(state.ch4, 30), `${state.ch4.toFixed(1)} ppm · +${gasWarming('ch4').toFixed(0)}°C`] },
  thawCO2: { tick: dt => thaw('co2', 120 * dt), gauge: () => frozenGauge('thawCO2') || [logLevel(state.co2, 1e5), `${fmt(state.co2)} ppm · +${gasWarming('co2').toFixed(0)}°C`] },
  helium: { tick: dt => (state.he += (0.1 - state.he * 0.02) * dt), gauge: () => [clamp01(state.he / 6), `${state.he.toFixed(2)} ppm`] },
  neon: { gauge: () => [0.5, '18 ppm'] },
  argon: { tick: dt => (state.ar = Math.min(9340, state.ar + 0.5 * volcanoes() * dt)), gauge: () => [state.ar / 9340, `${fmt(state.ar)} ppm`] },
  krypton: { gauge: () => [0.3, '1.1 ppm'] },
  xenon: { gauge: () => [0.1, '0.09 ppm'] },
  radon: { tick: dt => (state.rn += (1000 / DAY_S - state.rn * Math.LN2 / (3.8 * DAY_S)) * dt), gauge: () => [clamp01(state.rn / 6000), `${fmt(state.rn)} atoms/L`] },
  clouds: { cloudRate: () => cloudFormation(), gauge: () => [state.clouds, `${pct(state.clouds)} cover`] },
  evap: { gauge: () => [clamp01(rates.clouds / 0.05), `+${(rates.clouds * 100).toFixed(1)}% cover/s`] },
  rain: { gauge: rainGauge },
  downpour: { gauge: rainGauge },
  lightning: { gauge: () => (!soupBuilds() ? [logLevel(state.strikes, 1000), `${fmt(state.strikes)} strikes`] : [state.soup / SOUP_FULL, `Soup ${pct(state.soup / SOUP_FULL)}`]) },
  storms: { climax: () => { stormBurst = 10; }, gauge: () => [clamp01(rates.lightning / 0.4), `${(rates.lightning * 60).toFixed(0)} strikes/min`] },
  bigbolt: { gauge: soupGauge },
  solarwind: { gauge: () => [clamp01(state.pressure), `${state.pressure.toFixed(2)} bar of air held`] },
  starlight: { gauge: () => [1, 'Stars in the night sky'] },
  cometsight: { gauge: () => [clamp01(state.comets / 50), `${fmt(state.comets)} comets caught`] },
  wanderers: { gauge: () => [state.planets.length / Sky.PLANETS.length, `${state.planets.length} planets found`] },
  cometpaths: { gauge: () => [clamp01(state.comets / 50), `${fmt(state.comets)} comets caught`] },
  orbits: { gauge: () => [state.planets.length / Sky.PLANETS.length, `${state.planets.length} planets found`] },
  asteroids: { gauge: () => [state.ages ? 1 : 0, state.ages ? 'The impact ended an age' : 'Rocks on the move'] },
  colorRed: { gauge: () => [1, 'Light 620–750 nm long'] },
  colorOrange: { gauge: () => [1, 'Light 590–620 nm long'] },
  colorYellow: { gauge: () => [1, 'Light 570–590 nm long'] },
  colorGreen: { gauge: () => [1, 'Light 495–570 nm long'] },
  colorBlue: { gauge: () => [1, 'Light 450–495 nm long'] },
  colorViolet: { gauge: () => [1, 'Light 380–450 nm long'] },
  rainbow: { gauge: () => (state.rainbowShield > 0 ? [state.rainbowShield / RAINBOW_SHIELD_S, `Calm for ${Math.ceil(state.rainbowShield)} s`] : [clamp01(state.clouds * 3), `${pct(clamp01(state.clouds * 3))} chance of rainbows`]) },
  lava: { gauge: () => [logLevel(rates.weatherMinerals, 5), `+${fmt(rates.weatherMinerals)} minerals/s from worn rock`] },
  magnet: { gauge: () => [state.pressure, `${state.pressure.toFixed(2)} bar of air kept`] },
  volcano: { gauge: volcanoGauge },
  lavafields: { gauge: () => [state.land / MAX_LAND, `${pct(state.land)} land`] },
  supervolcano: { gauge: volcanoGauge },
  plates: { gauge: () => [logLevel(rates.weathering, 100), `−${fmt(rates.weathering)} ppm CO₂/s`] },
  collision: { tick: dt => (state.mountains = Math.min(1, state.mountains + 0.004 * (1 - state.mountains) * dt)), gauge: () => [state.mountains, `${pct(state.mountains)} mountains`] },
  faults: { climax: () => quake(), gauge: () => [clamp01((state.disasters.earthquake || 0) / 5), `${state.disasters.earthquake || 0} earthquakes`] },
  glaciers: { albedo: () => 0.02 * glacierIce(), gauge: () => [glacierIce(), `${pct(glacierIce())} snow on peaks`] },
  rivers: { minerals: () => 2 * riverFlow() * (setDone('fish') ? 2 : 1), weatherMult: () => 1 + 0.5 * riverFlow(), gauge: () => [riverFlow(), riverFlow() > 0 ? `${pct(riverFlow())} flow` : 'frozen'] },
  lakes: { gauge: () => [clamp01(Terrain.lakeCount() / 12), `${Terrain.lakeCount()} lakes`] },
  currents: { gauge: () => [1 - state.ice, `${pct(state.ice)} ice`] },
  vents: { gauge: () => [logLevel(state.minerals, 1e4), `${fmt(state.minerals)} minerals`] },
  tides: { gauge: () => [openOcean() / (1 - state.land), `${pct(openOcean())} open water`] },
  pools: { gauge: soupGauge },
  tilt: { gauge: () => { const n = SPECIES.filter(sp => evolved(sp.id)).length; return [n / SPECIES.length, `${n} species alive`]; } },
  shallows: { gauge: () => [Terrain.zones().reef, `${pct(Terrain.zones().reef)} reef${Terrain.zones().bleached > 0.005 ? ` · ${pct(Terrain.zones().bleached)} bleached` : ''}`] },
  soil: { gauge: () => [Terrain.biomes().green, `${pct(Terrain.biomes().green)} green · ${pct(Terrain.biomes().desert)} desert`] },
  grass: { gauge: () => [Terrain.biomes().grass, `${pct(Terrain.biomes().grass)} grassland · ${pct(Terrain.biomes().desert)} desert`] },
  forests: { gauge: () => [Terrain.biomes().forest, `${pct(Terrain.biomes().forest)} forest`] },
  wetlands: { ch4: () => wetlandMethane(), gauge: () => [clamp01(Terrain.biomes().wetland * 10), `${pct(Terrain.biomes().wetland)} wetland · +${wetlandMethane().toFixed(2)} ppm CH₄/s`] },
  moonlight: { gauge: () => [1, 'The moon lights the night'] },
  circadian: { gauge: () => { const n = SPECIES.filter(sp => evolved(sp.id)).length; return [n / SPECIES.length, `${n} species keep time by day and night`]; } },
  seasons: { gauge: () => [1, 'Summer and winter take turns'] },
  predators: { gauge: () => { const n = SPECIES.filter(sp => evolved(sp.id)).length; return [n / SPECIES.length, `${n} species alive`]; } },
  waves: { gauge: () => [openOcean(), `${pct(openOcean())} open water · ${state.pressure.toFixed(2)} bar of wind`] },
  blooms: { gauge: () => [clamp01(pop('algae')), `${pct(pop('algae'))} of the sea holds algae`] },
  eclipse: { gauge: () => [state.planets.length / Sky.PLANETS.length, `${state.planets.length} planets found`] },
  // Life switches its genes from RNA to DNA, a sturdier double strand.
  dna: { gauge: () => { const n = SPECIES.filter(known).length; return [n / SPECIES.length, `${n} of ${SPECIES.length} in the tree of life`]; } },
  aurora: { gauge: () => setGauge('glows') },
  delta: { gauge: () => setGauge('fish') },
  superbloom: { gauge: () => (state.bloom > 0 ? [state.bloom / BLOOM_S, `In bloom: ${Math.ceil(state.bloom)} s`] : setGauge('flowers')) },
  richsoil: { gauge: () => setGauge('grasses') },
  biolum: { gauge: () => (glowTonight() ? [1, 'The sea glows tonight'] : setGauge('lights')) },
  meteors: { gauge: () => (state.meteorShower > 0 ? [1, 'A meteor shower is falling'] : setGauge('meteorites')) },
  roots: { gauge: () => [1 - Terrain.biomes().desert, `${pct(Terrain.biomes().desert)} desert`] },
};

// A gas still frozen on the ground shows how warm it must get.
function frozenGauge(id) {
  const t = RESEARCH_BY_ID[id].needs.find(n => n[0] === 'temp');
  return t && tempC() < t[1] ? [0, `Frozen until ${fmtTemp(t[1])}`] : null;
}

// "matter C 3" -> ['matter', ['C', 3]], "temp -210" -> ['temp', -210]
function parseNeed(text) {
  const [kind, ...rest] = String(text).split(' ').filter(Boolean);
  const values = rest.map(v => (v !== '' && !isNaN(v) ? Number(v) : v));
  return [kind, values.length === 1 ? values[0] : values];
}

// A disaster's research node shows how often it has struck.
const disasterGauge = id => () => {
  const n = state.disasters[id] || 0;
  return [clamp01(n / 5), n ? `Struck ${n} time${n > 1 ? 's' : ''}` : 'Has not struck yet'];
};
const RESEARCH = DATA.research.map(r => ({ ...r, ...(r.needs && { needs: r.needs.map(parseNeed) }), ...(r.disaster && { gauge: disasterGauge(r.id) }), ...RESEARCH_CODE[r.id] }));
const RESEARCH_BY_ID = Object.fromEntries(RESEARCH.map(r => [r.id, r]));
// The opening: tap the singularity until it bangs, then fly through 9.2 billion years of space
// (the sun formed about 9.2 billion years after the Big Bang, 4.6 billion years ago).
// The flight starts slow; every tap speeds it up for good.
const BANG_TAPS = 40;
const BANG_DECAY = 0.1;
const WARP_START = 0.3;        // flight speed after the bang
const WARP_TAP = 0.25;         // speed added by each tap
const WARP_MAX = 4.3;          // light speed
const WARP_RATE = 0.1 / WARP_MAX;   // progress per second per unit of speed: about 8 s at light speed
const ARRIVAL_S = 2;           // the last stretch, braking at the sun, takes the same time at any speed
const SUN_BIRTH_YEARS = 9.2e9;
const IGNITION_TAPS = 50;
const IGNITION_GRACE_S = 0.6;   // a pause this long between taps lets the core start cooling
const IGNITION_DECAY = 0.08;    // ignition lost per second while not tapping

// The tree of life is data/species.yaml (fields explained at its top).
const SPECIES = DATA.species;
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
const ICE_CRACKS_C = -8;   // the sea ice can be cracked open from this warm on (where ice starts to open, ICE_OPENS): the first ocean
const mineralReward = (x, y) => {
  const n = Math.max(50, Math.round(state.minerals * 0.02));
  state.minerals += n;
  floatText(x, y, `+${fmt(n)} minerals`);
};
const dnaReward = (x, y) => {
  if (!seen('life')) return mineralReward(x, y);
  const n = Math.max(20, Math.round(state.dna * 0.05));
  state.dna += n;
  floatText(x, y, `+${fmt(n)} DNA`);
};
const MINIGAMES = {
  // Right after the Big Bang a lone star twinkles in the dark sky (later only at night, or while there is no air to
  // light the day): catching it opens A star is born.
  // Catch the star: it flares up for a moment, goes out, and shows up somewhere else. Three catches open the story,
  // and then the lone star is gone for good.
  twinkle: { spot: 'twinkle', ready: () => state.banged && !inCinema() && !gameWon('twinkle') && (!sunUp() || state.pressure < 0.1), need: 3, every: 0.6, max: 1, reward: mineralReward },
  ignite: { won: () => state.ignition >= 1 },
  spin: { won: () => state.spinLocked },   // the moon is out and the spin locked at full: Restless Earth opens
  // The moon has no light of its own: it is a dark circle until the sun is lit, then a tap on it counts.
  moonlit: { ready: () => state.ignition >= 1 && state.moonBorn, need: 1, reward: mineralReward },
  comets: { won: () => state.comets > 0 },
  ice: { spot: 'ice', ready: () => tempC() >= ICE_CRACKS_C && iceCover() > 0.05, won: () => seen('thaw'), need: 1, every: 10, reward: mineralReward },
  cracks: { spot: 'crack', ready: () => has('lava'), need: 3, every: 6, reward: mineralReward },
  sunspots: { spot: 'sunspot', ready: () => seen('life') && sunUp(), need: 3, every: 8, reward: dnaReward },
  moon: { ready: () => seen('thaw') && state.moonBorn, need: 1, reward: mineralReward },
  river: { spot: 'spring', ready: () => has('collision') && tempC() > 0, need: 1, every: 15, reward: mineralReward },
  plates: { spot: 'plates', ready: () => has('volcano') && seen('sunlit'), need: 1, every: 15, reward: mineralReward },
  seeds: { spot: 'seed', ready: () => seen('ozone'), need: 3, every: 6, reward: dnaReward },
};
const STORY_OF_GAME = Object.fromEntries(STORIES.filter(st => st.minigame).map(st => [st.minigame, st]));
const gameWon = id => (MINIGAMES[id].won && MINIGAMES[id].won()) || (!!MINIGAMES[id].need && (state.games[id] || 0) >= MINIGAMES[id].need);
// The first chapter of each story waits for its minigame.
const STORY_GATE = Object.fromEntries(STORIES.filter(st => st.minigame).map(st => [st.chapters[0], st.minigame]));

// Natural disasters (data/disasters.yaml). Thunderstorms set dry plants on fire once there are plants to burn.
const DISASTERS = Object.fromEntries(DATA.disasters.map(d => [d.id, d]));
const WILDFIRE_CHANCE = 0.35;   // a bolt into plants starts a fire this often
const FIRE_KILL = 4;            // land species lose this many times the share of land that just caught fire
const FIRE_CO2 = 3000;          // ppm CO2 from burning all the land's plants at once
const FLOOD_MINERALS = 5000;
const WEATHER_MINERALS = 0.05;  // minerals washed to the sea per ppm of CO2 that weathering takes up    // minerals from silt when floods cover all the land's plants
const DISASTER_GAP_S = 60;      // at least this long between two natural disasters striking on their own
const SUPERNOVA_S = 60;
const DROUGHT_S = 60, SOLAR_STORM_S = 40, RED_TIDE_S = 45, ICE_AGE_S = 90;
const ICE_AGE_COOLING = 10;   // °C off the climate's target while an ice age lasts
const RED_TIDE_KILL = 0.015;    // share of each sea species (except the algae and microbes that bloom) lost per second
// When each disaster can strike on its own; how often (`every` seconds) is in data/disasters.yaml.
// A story's disaster can strike only once its research node (same id) is known: researching it adds the chance.
// The asteroid strikes once, and only once there is life for it to end an age of.
const DISASTER_WHEN = {
  supereruption: () => has('supereruption') && volcanoes() > 0,
  flood: () => has('flood') && state.clouds > 0.4,
  hurricane: () => has('hurricane') && tempC() > 15 && openOcean() > 0.3,   // today's Earth averages 15 °C and has hurricanes
  iceage: () => has('iceage') && state.iceAge <= 0 && tempC() < 30,
  earthquake: () => has('faults'),
  drought: () => has('drought') && tempC() > 17 && state.drought <= 0,
  solarstorm: () => has('solarstorm') && state.solarStorm <= 0,
  redtide: () => has('redtide') && tempC() > 15 && openOcean() > 0.2 && state.redTide <= 0,
  asteroid: () => has('asteroid') && seen('life') && !state.disasters.asteroid,
  supernova: () => has('supernova') && state.supernova <= 0,
};
const DISASTER_ODDS = Object.fromEntries(DATA.disasters.filter(d => d.every).map(d => [d.id, { rate: 1 / d.every, when: DISASTER_WHEN[d.id] }]));
const RAINBOW_ODDS = 0.75;   // once Rainbow is known, every disaster strikes this much as often
// Natural disasters are a collection too (Stories › Natural disasters): each is found when it first strikes.
// With every one found, the planet knows them all, and they strike half as often.
const DISASTERS_DONE_ODDS = 0.5;
const disastersDone = () => DATA.disasters.every(d => state.disasters[d.id]);

// All 118 elements in order of atomic number, for the periodic table.
const ELEMENT_SYMBOLS = ('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr ' +
  'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu ' +
  'Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr ' +
  'Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' ');

// Atoms (data/atoms.yaml), and what on the planet reveals each one. Found atoms stay found.
// Atoms with no entry here only arrive with comets.
const ATOM_FOUND = {
  H: () => state.ignition > 0,
  He: () => state.ignition >= 1,
  Ne: () => state.comets >= 1,   // neon, krypton and xenon arrive with comets and stay
  Na: () => seen('ocean'),
  Mg: () => evolved('cyano') || isExtinct('cyano'),
  Al: () => has('plates'),
  Si: () => has('volcano'),
  P: () => seen('life'),
  S: () => state.eruptions > 0,
  Cl: () => seen('ocean'),
  Ar: () => has('volcano'),      // argon comes out with volcanic gas
  K: () => has('soil'),
  Ca: () => evolved('coral') || isExtinct('coral'),
  Fe: () => has('magnet'),
  Ni: () => has('magnet'),
  Cu: () => evolved('arthropod') || isExtinct('arthropod'),
  Kr: () => state.comets >= 2,
  Xe: () => state.comets >= 3,
  Rn: () => has('plates'),       // radon seeps from moving crust, from uranium
  U: () => has('plates'),
  Au: () => (state.disasters.supernova || 0) > 0,   // heavy atoms are forged in supernovae
};
const ATOMS = Object.fromEntries(DATA.atoms.map(a => [a.id, ATOM_FOUND[a.id] ? { ...a, found: ATOM_FOUND[a.id] } : a]));

// What a comet's atom does to the planet when it crashes. Which atoms comets carry, how often and in what
// tail color is in data/atoms.yaml (`comet`).
const COMET_HIT = {
  H: () => {},
  O: () => {},
  C: () => (has('thawCO2') ? (state.co2 += 60) : (state.co2Ice += 60)),
  N: () => has('thawN2') && (state.pressure = Math.min(1, state.pressure + 0.02)),
};
const COMET_ATOMS = Object.fromEntries(DATA.atoms.filter(a => a.comet).map(a => [a.id, { ...a.comet, hit: COMET_HIT[a.id] || (() => {}) }]));
const COMET_DUST = 0.12;   // aerosols from one impact: a short cooling

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
  const starts = [3, 11, 19, 37, 55, 87];   // first element of rows 2 to 7
  const row = starts.findLastIndex(s => z >= s) + 2, i = z - starts[row - 2];
  if (row <= 3) return [row, i < 2 ? i + 1 : i + 11];
  if (row <= 5) return [row, i + 1];
  if (i < 2) return [row, i + 1];
  if (i < 17) return [row + 3, i + 1];    // La to Lu, Ac to Lr
  return [row, i - 13];
}

/* ================= State ================= */

const freshState = () => ({
  saveVersion: SAVE_VERSION,
  happened: [],     // EVENTS that have happened, in order
  sunAge: 0,        // billion years since the sun ignited
  tempK: CORE_K,
  bang: 0,          // 0..1, how hot the singularity is
  banged: false,    // the Big Bang has happened
  ignition: 0,      // 0..1, how far the sun is lit
  pressure: 0,      // nitrogen air, 0..1 bar
  co2: 0,           // ppm in the air
  co2Ice: 5000,     // ppm still frozen on the surface
  ch4: 0,           // ppm in the air
  ch4Ice: 10,       // ppm still frozen on the surface
  ice: 1,           // share of the planet under ice; follows temperature with a lag
  volcanoActivity: 1,
  volcanoGoal: 1,   // where volcanic activity is heading; it changes now and then by itself
  land: START_LAND,     // share of the planet that is land
  mountains: 0,         // 0..1, how much of the land is mountains
  aerosols: 0,          // 0..1, eruption sulfate high in the air
  researching: null,   // { id, done: 0..1 } for the node being researched
  he: 0, ar: 0, rn: 0,  // noble gases that change over time: helium and argon in ppm, radon in atoms per liter
  ash: 0,               // ash from eruptions on the ice
  eruptions: 0,
  spin: 0,          // 0..1, how fast the planet turns
  spinLocked: false, // the planet has reached full spin and keeps it
  clock: 3,         // hours since the spin locked; the hour of day is clock % 24
  moonBorn: false,  // the planet has thrown off its moon
  clouds: 0,
  minerals: 0,
  soup: 0,
  dna: 0,
  o2: 0,
  clicks: 0,
  strikes: 0,
  comets: 0,
  extinct: [],
  atoms: [],        // symbols of the atoms found, in the order found
  matter: {},       // per atom, how much comets have brought down
  laws: [],         // ids of the laws of nature found, in the order found
  signs: [],        // star signs found in the night sky
  planets: [],      // planets found in the night sky
  seed: Math.floor(Math.random() * 2 ** 31),   // this world's own luck, e.g. which star sign shows which night
  tonight: null,    // { night, sign }: the star sign in the sky tonight
  disasters: {},    // how many times each natural disaster has happened
  drought: 0,       // seconds left of a drought
  solarStorm: 0,    // seconds left of a solar storm
  supernova: 0,     // seconds left of a supernova's blaze
  redTide: 0,       // seconds left of a red tide
  iceAge: 0,        // seconds left of an ice age
  rainbowShield: 0, // seconds left of the calm a tapped rainbow brings
  games: {},        // per minigame, how many times it has been won
  heatView: false,  // the planet shown in infrared (once every band is found)
  auroraShield: false, // a tapped aurora shields the ozone layer until this solar storm ends
  found: {},        // per collection (data/collections.yaml), the item ids found
  bloom: 0,         // seconds left of a superbloom
  meteorShower: 0,  // seconds left of a meteor shower
  treeDone: false,  // the whole tree of life has been known once
  storiesSeen: [],  // stories whose opening splash has been shown
  time: 0,          // seconds of play since the opening
  tries: {},        // per molecule, today's tries at its reaction: { day, rows }
  ages: 0,          // ages ended by an asteroid impact
  bookSeen: {},     // per subject, how many entries the player has seen; more than that shows a dot
  lifeGone: false,  // every species died out; a new soup can bring the first cells back
  upgrades: [],
  species: {},
  start: Date.now(),
  lastTick: Date.now(),
});

let state = freshState();
let owned = new Set();   // purchased upgrade ids
let rates = { dnaBy: {} };          // per-second rates and climate parts, recalculated often
let skipSave = false;
let movieP = null;       // progress of the opening flight (0..1), or null when it is not playing
let warpSpeed = WARP_START;

// The opening movie runs until the flight after the Big Bang ends; the planet waits.
const inCinema = () => !state.banged || movieP !== null;

// Steps that bring an old save up to SAVE_VERSION: step i turns a version i save into version i + 1.
// Never edit a step that has been released; add a new one.
const MIGRATIONS = [
  // 0 to 1: colors must now be found. Older worlds get Starlight and the colors their planet already shows.
  saved => { saved.grantColors = true; },
  // 1 to 2: stories get a splash when they open. Stories already open in an older world open quietly.
  saved => { saved.quietStories = true; },
  // 2 to 3: the bands and glowing gases found move into the collections, with the rest.
  saved => {
    saved.found = { ...saved.found, bands: saved.bands || [], glows: saved.glows || [] };
    delete saved.bands;
    delete saved.glows;
  },
  // 3 to 4: there is no game over any more. Ended worlds play on; lifeTick restarts life if none is left.
  saved => { delete saved.over; },
  // 4 to 5: disasters are research nodes, each its story's last chapter. Worlds that had the chapter before
  // (whose climax unlocked the disaster) know the disaster.
  saved => {
    const known = new Set(saved.upgrades || []);
    for (const st of STORIES) if (st.disaster && known.has(st.chapters.at(-1)) && RESEARCH_BY_ID[st.disaster]) known.add(st.disaster);
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
];

function migrate(saved) {
  for (let v = saved.saveVersion ?? SAVE_VERSION; v < SAVE_VERSION; v++) MIGRATIONS[v](saved);
  saved.saveVersion = SAVE_VERSION;
  return saved;
}

function load() {
  // Open the game with ?reset to start over with a fresh save.
  const params = new URLSearchParams(location.search);
  if (params.has('reset')) {
    localStorage.removeItem(SAVE_KEY);
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
  try {
    // A new beta player starts from their stable save.
    const raw = localStorage.getItem(SAVE_KEY) || (!MULTI_WORLD && SAVE_KEY !== STABLE_SAVE_KEY && localStorage.getItem(STABLE_SAVE_KEY));
    if (raw) state = { ...freshState(), ...migrate(JSON.parse(raw)) };
  } catch (e) {
    console.warn('Save load failed', e);
  }
  owned = new Set(state.upgrades);
}

function save() {
  if (skipSave) return;
  state.upgrades = [...owned];
  state.lastTick = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    if (worldId) updateWorld(worldId, { played: state.lastTick, summary: worldSummary() });
  } catch (e) {
    console.warn('Save failed', e);
  }
}

/* ================= Worlds ================= */

// The list of worlds: { id, name, created, played, summary }. The saves themselves live under their own keys.
function readWorlds() {
  try {
    const list = JSON.parse(localStorage.getItem(WORLDS_KEY));
    if (Array.isArray(list)) return list;
  } catch {}
  // First run with worlds: the old single save, or the stable one, becomes the first world.
  const old = localStorage.getItem(CHANNEL_SAVE_KEY) || localStorage.getItem(STABLE_SAVE_KEY);
  if (!old) return [];
  const id = newWorldId();
  localStorage.setItem(`${CHANNEL_SAVE_KEY}-w-${id}`, old);
  const list = [{ id, name: 'First world', created: Date.now(), played: Date.now(), summary: '' }];
  localStorage.setItem(WORLDS_KEY, JSON.stringify(list));
  return list;
}

const writeWorlds = list => localStorage.setItem(WORLDS_KEY, JSON.stringify(list));
const newWorldId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function updateWorld(id, fields) {
  const list = readWorlds(), w = list.find(o => o.id === id);
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
const openWorld = id => (location.href = `${location.pathname}?world=${encodeURIComponent(id)}`);

function renderMenu() {
  const list = readWorlds().sort((a, b) => b.played - a.played);
  $('#menu-worlds').innerHTML = list.map(w => `<li class="world" data-id="${w.id}">
      <button class="world-open"><b></b><span></span></button>
      <button class="world-del" aria-label="Delete world">✕</button>
    </li>`).join('') || '<li class="note">No worlds yet.</li>';
  $('#menu-worlds').querySelectorAll('.world').forEach((li, k) => {
    li.querySelector('b').textContent = list[k].name;
    li.querySelector('span').textContent = list[k].summary || 'New world';
  });
  $('#menu-name').value = '';
  $('#menu-name').placeholder = `World ${list.length + 1}`;
}

function showMenu() {
  renderMenu();
  $('#menu').classList.remove('hidden');
  document.body.classList.add('in-menu');
}

// Wired at boot, once the DOM helpers exist.
function setupMenu() {
  $('#menu-worlds').addEventListener('click', e => {
    const li = e.target.closest('.world');
    if (!li) return;
    if (e.target.closest('.world-open')) {
      openWorld(li.dataset.id);
      return;
    }
    // Deleting takes two taps.
    const del = e.target.closest('.world-del');
    if (!del) return;
    if (!del.classList.contains('armed')) {
      del.classList.add('armed');
      del.textContent = 'Delete?';
      return;
    }
    writeWorlds(readWorlds().filter(o => o.id !== li.dataset.id));
    localStorage.removeItem(`${CHANNEL_SAVE_KEY}-w-${li.dataset.id}`);
    renderMenu();
  });

  $('#menu-new').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#menu-name').value.trim().slice(0, 30) || $('#menu-name').placeholder, id = newWorldId();
    writeWorlds([...readWorlds(), { id, name, created: Date.now(), played: Date.now(), summary: '' }]);
    openWorld(id);
  });

  $('#worlds-btn').addEventListener('click', () => {
    save();
    location.href = location.pathname;
  });
}

/* ================= Climate model ================= */

const pop = id => state.species[id] ?? -1;      // -1 = not evolved, -2 = extinct
const evolved = id => pop(id) >= 0;
const isExtinct = id => state.extinct.includes(id);
const clamp01 = k => Math.max(0, Math.min(1, k));
const log2 = Math.log2;

const tempC = () => state.tempK - KELVIN;

const has = id => owned.has(id);

// A research field's value on a node: a number, or a function of the planet now. See RESEARCH.
const field = (u, key) => (typeof u[key] === 'function' ? u[key]() : u[key]);
const withField = key => RESEARCH.filter(u => u[key] !== undefined && has(u.id));
const mult = key => withField(key).reduce((m, u) => m * field(u, key), 1);
const total = key => withField(key).reduce((n, u) => n + field(u, key), 0);
// The highest value among researched nodes, or `base`.
const best = (key, base = 0) => withField(key).reduce((v, u) => Math.max(v, field(u, key)), base);
const soupMult = () => (1 + Math.log10(1 + state.minerals)) * mult('boltMult');


// A component is complete when all its research is done; the sun and moon then move to the background.
const componentDone = tab => RESEARCH.filter(u => u.tab === tab).every(u => has(u.id));

// A node shows up once its prerequisites are researched and its `after` event has happened.
const chainOpen = u => !u.hidden && (!u.after || seen(u.after)) && (u.requires || []).every(has) && (!STORY_GATE[u.id] || gameWon(STORY_GATE[u.id]));
// A molecule shows once the atoms it is made of have been found.
const atomsFound = u => (u.needs || []).every(([kind, v]) => kind !== 'matter' || state.atoms.includes(v[0]));
const researchVisible = u => chainOpen(u) && atomsFound(u);

// A researched node is hidden once the next node of its chain is researched.
const superseded = u => RESEARCH.some(r => r.replaces === u.id && has(r.id));

const canResearch = u => !u.auto && !has(u.id) && !state.researching && researchVisible(u) && (u.needs || []).every(needMet);
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
const ICE_OPENS = -8;
function iceTarget(c = tempC() + total('iceShift')) {
  if (c <= ICE_OPENS) return 1;
  if (c <= 14) return 1 - 0.9 * Math.sqrt((c - ICE_OPENS) / (14 - ICE_OPENS));
  return Math.max(0, 0.1 * (1 - (c - 14) / 8));
}

const iceCover = () => state.ice;
const openOcean = () => (1 - state.land) * (1 - iceCover());
// Ozone forms as O2 approaches 2%, once the Ozone Layer is researched. A solar storm thins it for a while.
const ozone = () => (has('ozonegas') ? clamp01(state.o2 / (setDone('glows') ? 1.5 : 2)) * (state.solarStorm > 0 && !state.auroraShield ? 0.4 : 1) * (state.supernova > 0 ? 0.6 : 1) : 0);
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
  const albedo = 0.22 + 0.37 * ice * (1 - 0.5 * dust) + 0.08 * state.clouds + 0.1 * methaneHaze()
    + 0.2 * state.aerosols + 0.03 * state.mountains + total('albedo')
    + state.land * (0.15 * Terrain.biomes().desert - 0.08 * Terrain.biomes().forest);   // bright sand, dark forest
  const sunK = 255 * Math.pow(Math.max(0, sunBrightness() * (1 - albedo) / 0.7), 0.25);
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
    co2: 0, ch4: total('ch4'), minerals: total('minerals'), dna: 0, o2: 0, clouds: total('cloudRate') * mult('cloudMult'), green: 0, life: 0,
    dnaBy: { ocean: 0, ground: 0, atmosphere: 0 }, weathering: rates.weathering || 0, weatherMinerals: rates.weatherMinerals || 0,
    // Thunderstorms strike on their own, more often the stormier the sky.
    lightning: best('lightning') * clamp01(state.clouds / STORM_CLOUDS),
  };
  // Volcanoes: a little natural outgassing always, plus the player's volcanoes.
  if (seen('sunlit')) r.co2 += (2 + volcanoes() * VOLCANO_CO2);

  for (const s of SPECIES) {
    const p = pop(s.id);
    if (p < 0) continue;
    let dnaMult = withField('dnaMult').reduce((m, u) => m * (u.dnaMult[s.domain] ?? u.dnaMult.all ?? 1), 1);
    if (s.domain === 'ground') dnaMult *= 1 - 0.7 * Terrain.biomes().desert;   // little lives in the desert
    if (s.domain === 'ocean' && setDone('lights')) dnaMult *= 1.25;   // night hunters of the lit sea
    r.dna += s.dna * p * dnaMult;
    r.dnaBy[s.domain] += s.dna * p * dnaMult;
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
  const p = pop(s.id), room = habitat(s), c = tempC();
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
function simulate(dt) {
  // The sun ages once lit, and brightens with age (research Sunlight and its chain).
  state.time = (state.time || 0) + dt;   // seconds of play, for game days before the spin locks too
  if (state.ignition >= 1) state.sunAge += dt / SUN_GYR_S;

  // An unlit sun cools back down when the player stops tapping.
  state.sinceTap = (state.sinceTap || 0) + dt;
  if (state.ignition < 1 && state.sinceTap > IGNITION_GRACE_S) {
    state.ignition = Math.max(0, state.ignition - IGNITION_DECAY * Math.min(dt, state.sinceTap - IGNITION_GRACE_S));
  }

  // The spin runs down when the player stops swiping, faster the faster it turns. Full spin locks it (and
  // throws off the moon), and the clock starts.
  if (state.spinLocked) state.clock += 24 * dt / DAY_S;
  else state.spin = Math.max(0, state.spin - (0.03 + 0.09 * state.spin) * dt);

  // Volcanic activity wanders by itself: restless spells and quiet ones, each lasting a minute or two.
  if (Math.random() < dt / VOLCANO_SPELL_S) state.volcanoGoal = 0.5 + Math.random();   // 50% to 150%, 100% on average
  state.volcanoActivity += ((state.volcanoGoal ?? 1) - state.volcanoActivity) * Math.min(1, dt / 20);

  // Research in progress finishes after its number of days.
  const r = state.researching;
  if (r) {
    r.done += dt / ((RESEARCH_BY_ID[r.id].days || 1) * DAY_S);
    if (r.done >= 1) {
      owned.add(r.id);
      state.researching = null;
      recalc();
      RESEARCH_BY_ID[r.id].climax?.();
    }
  }

  // What research does over time: gases thaw and build up, colliding plates pile up mountains.
  for (const u of withField('tick')) if (!u.auto || (u.needs || []).every(needMet)) u.tick(dt);

  // Volcanoes slowly build new land.
  const landRate = state.land < VOLCANIC_LAND ? 0.0004 : 0.00004 * mult('landMult') * (1 - state.land / MAX_LAND);
  state.land = Math.min(MAX_LAND, state.land + landRate * volcanoes() * dt);

  // Eruptions come at random. Aerosols and ash then rain out over time.
  if (volcanoes() > 0 && Math.random() < volcanoes() * dt / ERUPTION_EVERY_S) erupt();
  state.aerosols *= Math.exp(-dt / AEROSOL_LIFE_S);
  state.ash *= Math.exp(-dt / ASH_LIFE_S);

  // Without a magnetic field the solar wind slowly strips the air away, as it did on Mars.
  if (seen('ocean') && !has('magnet')) state.pressure = Math.max(0.2, state.pressure - 0.0003 * dt);

  // Carbon cycle: volcanoes add CO2; rock weathering removes it when warm and wet (the planet's thermostat);
  // photosynthesis removes it too. Oxygen destroys methane.
  const c = tempC(), open = 1 - iceCover();
  // Weathering speeds up sharply in the heat, with more land, and most of all on fresh mountain rock.
  const rock = state.land / BASE_LAND * (1 + 2 * state.mountains);
  const weathering = 0.002 * state.co2 * Math.max(0, c / 15) ** 1.5 * open * rock * mult('weatherMult') * (1 + Terrain.biomes().forest);   // roots break rock
  const photosynthesis = rates.o2 * 1500 * state.co2 / (state.co2 + 1000);   // slows when CO2 runs low
  rates.weathering = weathering;
  // The worn rock does not vanish: rain and rivers wash it to the sea as dissolved minerals.
  rates.weatherMinerals = WEATHER_MINERALS * weathering;
  state.co2 = Math.max(0, state.co2 + (rates.co2 - weathering - photosynthesis) * dt);
  state.ch4 = Math.max(0, state.ch4 + (rates.ch4 - state.ch4 * 0.03 * clamp01(state.o2)) * dt);

  // Temperature follows its target with a lag. Ice sheets grow and melt more slowly still.
  const lag = THERMAL_LAG_S + OCEAN_LAG_S * (1 - state.ice);
  state.tempK += (rates.climate.target - state.tempK) * Math.min(1, dt / lag);
  const iceGoal = gameWon('ice') ? iceTarget() : 1;   // the ice holds until the player cracks it
  state.ice += (iceGoal - state.ice) * Math.min(1, dt * (iceGoal > state.ice ? 0.005 : 0.012));

  state.minerals += (rates.minerals + rates.weatherMinerals) * dt;
  state.dna += rates.dna * dt;
  state.o2 += rates.o2 * (1 - state.o2 / MAX_O2) * dt;   // levels off near today's 21%
  // Clouds form from evaporation and rain out at 5% per second.
  state.clouds = clamp01(state.clouds + (rates.clouds - state.clouds * 0.05) * dt);

  // Species grow toward what their habitat holds inside their temperature range, shrink back when the habitat
  // shrinks, and die back outside the range.
  for (const id of Object.keys(state.species)) {
    const p = state.species[id];
    if (p < 0) continue;
    const s = SPECIES_BY_ID[id], f = fitness(s, c), room = habitat(s);
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
  if (first && disastersDone()) discovered('Natural disasters', `${DATA.disasters.length} of ${DATA.disasters.length}`, null, 'Collection complete');
  announce(`${DISASTERS[id].name}!`, x, y, first ? 'disaster big' : 'disaster');
  buzz(first ? [60, 40, 60, 40, 120] : [30, 30, 30]);
}

// Fires, lava and floods spread and die down. Land life where they reach dies back. Smoke adds CO2;
// flood water leaves fertile silt (minerals).
function stepFires(dt) {
  const { hit, active } = Terrain.stepFires(dt), burnt = hit.fire + hit.lava, wet = hit.flood + hit.surge;
  for (const s of SPECIES) {
    if (s.domain === 'ocean' || !evolved(s.id)) continue;
    if (burnt > 0) state.species[s.id] *= 1 - Math.min(0.6, burnt * FIRE_KILL);
    if (wet > 0) state.species[s.id] *= 1 - Math.min(0.5, wet * FIRE_KILL) * (has('delta') ? 0.5 : 1);   // a fertile delta drowns less
  }
  state.co2 += burnt * FIRE_CO2;
  state.minerals += wet * FLOOD_MINERALS * (has('delta') ? 2 : 1);
  if (active) Scene.repaint();
}

// Reef life takes the hit of a storm surge or tsunami.
const hitReefs = share => SPECIES.forEach(s => (s.home || []).includes('reef') && evolved(s.id) && (state.species[s.id] *= 1 - share));

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
  setTimeout(() => {
    if (state.rainbowShield > 0) return;
    const k = zodiacComplete() ? 0.5 : 1;
    Terrain.spread('surge', spot.u, spot.v, (10 + Math.random() * 5) * k);
    hitReefs(0.25 * k);
  }, 4000);
  return true;
}

function quake() {
  Scene.shake(2.5);
  disaster('earthquake');
  const spot = Terrain.findSpot('surge', Scene.centre());
  if (spot) {
    setTimeout(() => {
      if (state.rainbowShield > 0) return;
      Terrain.spread('surge', spot.u, spot.v, 12 + Math.random() * 6);
      hitReefs(0.3);
      disaster('tsunami');
    }, 1800);
  }
  return true;
}

function drought() {
  state.drought = DROUGHT_S * (setDone('flowers') ? 0.5 : 1);   // pollinators bring rain-ready seeds back fast
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
  for (const s of SPECIES) if (evolved(s.id) && (s.domain !== 'ocean' || (s.home || []).includes('reef'))) state.species[s.id] *= 0.9;   // reefs are the shallow sea
  disaster('supernova');
  return true;
}

function solarStorm() {
  state.solarStorm = SOLAR_STORM_S;
  Scene.aurora(SOLAR_STORM_S);
  for (const s of SPECIES) if (s.domain !== 'ocean' && evolved(s.id)) state.species[s.id] *= setDone('meteorites') ? 0.95 : 0.85;   // meteoritic iron: a stronger core and field
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
  state.ages++;
  disaster('asteroid', x, y - 30);
  announce('An age ends', innerWidth / 2, innerHeight * 0.45);
  save();
}

/* ================= Tree status ================= */

const CHILDREN = {};
for (const s of SPECIES) if (s.parent) (CHILDREN[s.parent] ||= []).push(s);

// A species is blocked for good when its parent died out before it evolved, or its parent is blocked.
function isBlocked(s) {
  if (!s.parent || evolved(s.id) || isExtinct(s.id)) return false;
  return isExtinct(s.parent) || isBlocked(SPECIES_BY_ID[s.parent]);
}

// alive, extinct, available (can evolve now), waiting (possible later) or blocked.
function speciesStatus(s) {
  if (isExtinct(s.id)) return 'extinct';
  if (evolved(s.id)) return 'alive';
  if (isBlocked(s)) return 'blocked';
  if (evolved(s.parent) && parentReady(s) && opened(s) && seen(DOMAIN_OPENS[s.domain])) return 'available';
  return 'waiting';
}

function treeSummary() {
  const counts = { alive: 0, extinct: 0, available: 0, waiting: 0, blocked: 0 };
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
  for (const u of RESEARCH) if (u.auto && !has(u.id) && chainOpen(u)) owned.add(u.id);
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
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
}

const pct = v => `${Math.round(v * 100)}%`;
const fmtTemp = c => `${c.toFixed(1)}°C`;
