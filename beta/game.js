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
const SAVE_VERSION = 2;          // bump with a new step in MIGRATIONS when old saves need fixing
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
// Spinning the planet (swipe it) is the first thing after the Big Bang. At half spin the planet throws off
// the moon, whose tides then drag on the spin. At full spin the spin locks: days begin, the sun rises at 6 and
// sets at 18, and the Magnetic Field can be researched.
const SPIN_PER_SCREEN = 0.12;      // spin added by a swipe across the whole screen width
const MOON_SPIN = 0.5;
const TIDE_DRAG = 0.06;            // extra spin lost per second to the moon's tides, before the spin locks
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
  bands: () => has('rainbow'),
  glow: () => has('aurora'),
  grasses: () => has('richsoil'),
  flowers: () => has('superbloom'),
  fish: () => has('delta'),
  meteorites: () => has('meteors'),
  lights: () => has('biolum'),
  stars: () => true,
  comets: () => state.comets > 0,
  molecules: () => state.atoms.length >= 2,
  disasters: () => Object.keys(state.disasters).length > 0,
  signs: () => state.signs.length > 0,
  planets: () => state.planets.length > 0,
  index: () => SPECIES.some(known),
  world: () => true,
  stories: () => STORIES.some(storyOpen),
};

// The science book (data/book.yaml): one tab per subject, each a page of sections.
const SUBJECTS = DATA.book.subjects.map(c => c.groups ? { ...c, sections: c.groups.flatMap(g => g.sections) } : c);
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
const dnaGauge = domain => () => [logLevel(rates.dnaBy[domain], 1000), `${fmt(rates.dnaBy[domain])} DNA/s`];

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
  lightning: { gauge: () => (seen('life') ? [logLevel(state.strikes, 1000), `${fmt(state.strikes)} strikes`] : [state.soup / SOUP_FULL, `Soup ${pct(state.soup / SOUP_FULL)}`]) },
  storms: { climax: () => { stormBurst = 10; hurricane() || disaster('hurricane'); }, gauge: () => [clamp01(rates.lightning / 0.4), `${(rates.lightning * 60).toFixed(0)} strikes/min`] },
  bigbolt: { gauge: soupGauge },
  solarwind: { climax: () => solarStorm(), gauge: () => [clamp01((state.disasters.solarstorm || 0) / 5), `${state.disasters.solarstorm || 0} solar storms`] },
  starlight: { gauge: () => [1, 'Stars in the night sky'] },
  cometsight: { gauge: () => [clamp01(state.comets / 50), `${fmt(state.comets)} comets caught`] },
  wanderers: { gauge: () => [state.planets.length / Sky.PLANETS.length, `${state.planets.length} planets found`] },
  cometpaths: { gauge: () => [clamp01(state.comets / 50), `${fmt(state.comets)} comets caught`] },
  orbits: { gauge: () => [state.planets.length / Sky.PLANETS.length, `${state.planets.length} planets found`] },
  asteroids: { climax: () => asteroidImpact(), gauge: () => [state.ages ? 1 : 0, state.ages ? 'The impact ended an age' : 'Rocks on the move'] },
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
  supervolcano: { gauge: volcanoGauge, climax: () => erupt(-1, true) },
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
  wetlands: { climax: () => flood() || disaster('flood'), ch4: () => wetlandMethane(), gauge: () => [clamp01(Terrain.biomes().wetland * 10), `${pct(Terrain.biomes().wetland)} wetland · +${wetlandMethane().toFixed(2)} ppm CH₄/s`] },
  moonlight: { gauge: () => [1, 'The moon lights the night'] },
  circadian: { gauge: () => { const n = SPECIES.filter(sp => evolved(sp.id)).length; return [n / SPECIES.length, `${n} species keep time by day and night`]; } },
  seasons: { climax: () => iceAge(), gauge: () => [clamp01((state.disasters.iceage || 0) / 5), state.iceAge > 0 ? `Ice age: ${Math.ceil(state.iceAge)} s left` : `${state.disasters.iceage || 0} ice ages`] },
  predators: { gauge: () => { const n = SPECIES.filter(sp => evolved(sp.id)).length; return [n / SPECIES.length, `${n} species alive`]; } },
  waves: { gauge: () => [openOcean(), `${pct(openOcean())} open water · ${state.pressure.toFixed(2)} bar of wind`] },
  blooms: { climax: () => redTide(), gauge: () => [clamp01((state.disasters.redtide || 0) / 5), `${state.disasters.redtide || 0} red tides`] },
  eclipse: { gauge: () => [state.signs.length / 12, `${state.signs.length} star signs found`] },
  // Life switches its genes from RNA to DNA, a sturdier double strand.
  dna: { gauge: () => { const n = SPECIES.filter(known).length; return [n / SPECIES.length, `${n} of ${SPECIES.length} in the tree of life`]; } },
  aurora: { gauge: () => [state.glows.length / GLOWS.length, `${state.glows.length} of ${GLOWS.length} glowing gases`] },
  delta: { gauge: () => setGauge('fish') },
  superbloom: { gauge: () => (state.bloom > 0 ? [state.bloom / BLOOM_S, `In bloom: ${Math.ceil(state.bloom)} s`] : setGauge('flowers')) },
  richsoil: { gauge: () => setGauge('grasses') },
  biolum: { gauge: () => (glowTonight() ? [1, 'The sea glows tonight'] : setGauge('lights')) },
  meteors: { gauge: () => (state.meteorShower > 0 ? [1, 'A meteor shower is falling'] : setGauge('meteorites')) },
  roots: { climax: () => drought(), gauge: () => [1 - Terrain.biomes().desert, `${pct(Terrain.biomes().desert)} desert`] },
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

const RESEARCH = DATA.research.map(r => ({ ...r, ...(r.needs && { needs: r.needs.map(parseNeed) }), ...RESEARCH_CODE[r.id] }));
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

// Stories (data/stories.yaml): research chapters in a logical order, each ending in a climax that unlocks a disaster.
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
  ignite: { won: () => state.ignition >= 1 },
  spin: { won: () => state.moonBorn },
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
const DROUGHT_S = 60, SOLAR_STORM_S = 40, RED_TIDE_S = 45, ICE_AGE_S = 90;
const ICE_AGE_COOLING = 10;   // °C off the climate's target while an ice age lasts
const RED_TIDE_KILL = 0.015;    // share of each sea species (except the algae and microbes that bloom) lost per second
// When each disaster can strike on its own; how often (`every` seconds) is in data/disasters.yaml.
const DISASTER_WHEN = {
  supereruption: () => has('supervolcano') && volcanoes() > 0,
  flood: () => has('wetlands') && state.clouds > 0.4,
  hurricane: () => has('storms') && tempC() > 22 && openOcean() > 0.3,
  iceage: () => has('seasons') && state.iceAge <= 0 && tempC() < 30,
  earthquake: () => has('faults'),
  drought: () => has('roots') && tempC() > 20 && state.drought <= 0,
  solarstorm: () => has('solarwind') && state.solarStorm <= 0,
  redtide: () => has('blooms') && tempC() > 18 && openOcean() > 0.2 && state.redTide <= 0,
};
const DISASTER_ODDS = Object.fromEntries(DATA.disasters.filter(d => d.every).map(d => [d.id, { rate: 1 / d.every, when: DISASTER_WHEN[d.id] }]));

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
  redTide: 0,       // seconds left of a red tide
  iceAge: 0,        // seconds left of an ice age
  rainbowShield: 0, // seconds left of the calm a tapped rainbow brings
  games: {},        // per minigame, how many times it has been won
  bands: [],        // light beyond the rainbow found (data/bands.yaml), in the order found
  heatView: false,  // the planet shown in infrared (once every band is found)
  glows: [],        // glowing gases found in auroras (data/glows.yaml)
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
  over: null,       // reason text once the run has ended
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
const ozone = () => (has('ozonegas') ? clamp01(state.o2 / (allGlows() ? 1.5 : 2)) * (state.solarStorm > 0 && !state.auroraShield ? 0.4 : 1) : 0);
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

  // The spin runs down when the player stops swiping, faster the faster it turns, and faster still once the
  // moon's tides pull on it. Full spin locks it, and the clock starts.
  if (state.spinLocked) state.clock += 24 * dt / DAY_S;
  else state.spin = Math.max(0, state.spin - (0.04 + 0.12 * state.spin + (state.moonBorn ? TIDE_DRAG : 0)) * dt);

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

/* ================= Stories ================= */

// A story opens with its minigame's first win. A big splash names it the first time, and the Stories page
// lists every story: open ones with what has been done of them, the rest as blanks.
const storyOpen = st => gameWon(st.minigame) || st.chapters.some(has);
const storyItems = st => [...st.chapters.map(id => ({ id, name: RESEARCH_BY_ID[id].name, done: () => has(id) })),
  { id: st.disaster, name: DISASTERS[st.disaster].name, done: () => (state.disasters[st.disaster] || 0) > 0 },
  { id: st.ultra, name: RESEARCH_BY_ID[st.ultra].name, done: () => has(st.ultra) }];
const storyDone = st => storyItems(st).filter(it => it.done());
let splashQueue = [];

function storyTick() {
  if (state.quietStories) {
    state.storiesSeen = STORIES.filter(storyOpen).map(st => st.id);
    delete state.quietStories;
  }
  if (inCinema()) return;
  for (const st of STORIES) {
    if (state.storiesSeen.includes(st.id) || !storyOpen(st)) continue;
    state.storiesSeen.push(st.id);
    splashQueue.push(st);
  }
  if (splashQueue.length && $('#splash').classList.contains('hidden')) showSplash(splashQueue.shift());
}

function showSplash(st) {
  $('#splash-title').textContent = st.name;
  $('#splash-count').textContent = `${storyDone(st).length} of ${storyItems(st).length}`;
  $('#splash').classList.remove('hidden');
  buzz([30, 30, 60]);
  clearTimeout(showSplash.timer);
  showSplash.timer = setTimeout(hideSplash, 3500);
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
    if (Scene.spotCount(g.spot) >= (won ? 1 : 2) || Math.random() >= dt / (g.every * (won ? PLAY_REPEAT : 1))) continue;
    if (g.spot === 'sunspot') Scene.sunspot();
    else Scene.spawnSpot(g.spot);
  }
}

const PLAY_OF = { crack: 'cracks', seed: 'seeds', ice: 'ice', sunspot: 'sunspots', moon: 'moon', river: 'river', plates: 'plates' };
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
  if (kind === 'band') return findBand(band, x, y);
  if (kind === 'flower') return collect('flowers', x, y) || dnaReward(x, y);
  if (kind === 'plankton') return collect('lights', x, y) || dnaReward(x, y);
  if (kind === 'meteorite') return collect('meteorites', x, y) || mineralReward(x, y);
  playHit(PLAY_OF[kind], x, y);
});

// Light beyond the rainbow (data/bands.yaml): once Rainbow is gained, a shimmer shows where nature gives off
// each band; tapping it finds the band. Radio shimmers at lightning strikes and infrared over eruptions (see
// lightningHit and erupt); the rest show now and then, about once per `every` seconds while `when` holds.
const BANDS = DATA.bands;
const BAND_BY_ID = Object.fromEntries(BANDS.map(b => [b.id, b]));
const bandHunt = id => has('rainbow') && !state.bands.includes(id);
const BAND_GLIMMER = {
  radio: {},
  infrared: {},
  microwave: { when: () => state.spinLocked && !sunUp(), every: 40, where: () => Scene.skyPoint() },
  ultraviolet: { when: () => sunUp(), every: 40, where: () => Scene.sunPoint() },
  xray: { when: () => state.solarStorm > 0, every: 8, where: () => Scene.sunPoint() },
  gamma: { when: () => state.spinLocked && !sunUp(), every: 300, where: () => Scene.skyPoint(), seconds: 5 },
};
const allBands = () => state.bands.length === BANDS.length;

function bandTick(dt) {
  if (!has('rainbow') || Scene.spotCount('band') > 0) return;
  for (const [id, g] of Object.entries(BAND_GLIMMER)) {
    if (!g.when || !bandHunt(id) || !g.when() || Math.random() >= dt / g.every) continue;
    Scene.glimmer(id, g.where(), g.seconds);
    return;
  }
}

function findBand(id, x, y) {
  if (state.bands.includes(id)) return;
  state.bands.push(id);
  announce(`${BAND_BY_ID[id].name} found`, x, y - 20, 'atom');
  buzz([20, 30, 40]);
  if (allBands()) announce('Beyond the rainbow: complete', innerWidth / 2, innerHeight * 0.4, 'disaster big');
  updateDots();
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
const collectable = (c, it) => c.id !== 'grasses' || Terrain.zones()[it.zone] > 0.01;

// Finds the next item of a collection; returns whether one was found.
function collect(id, x, y) {
  const c = COLLECTION_BY_ID[id];
  if (!has(c.opens)) return false;
  const list = (state.found[id] ||= []), item = c.items.find(it => !list.includes(it.id) && collectable(c, it));
  if (!item) return false;
  list.push(item.id);
  announce(`${item.name} found`, x, y - 20, 'atom');
  if (setDone(id)) announce(`${c.name}: complete`, innerWidth / 2, innerHeight * 0.4, 'disaster big');
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
    announce('Tree of life: complete', innerWidth / 2, innerHeight * 0.4, 'disaster big');
  }
}

function renderCollection(c, force) {
  const root = $(`#${c.section}`), list = state.found[c.id] || [], picked = root.dataset.picked || '';
  const key = list.join() + picked;
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  const pickedItem = c.items.find(it => it.id === picked);
  root.innerHTML = `<p class="note">${list.length} of ${c.items.length} found</p>
    <div class="law-grid">${c.items.map(it => list.includes(it.id)
      ? `<button class="law-card${it.id === picked ? ' picked' : ''}" data-id="${it.id}"><b style="color:${Hues.css(it.color)}">${it.sign}</b><span>${it.name}</span></button>`
      : '<button class="law-card unknown" disabled><b>?</b><span></span></button>').join('')}</div>
    <p class="atom-info">${pickedItem ? `<b>${pickedItem.name}</b><br>${pickedItem.how}` : 'Tap one.'}</p>`;
  root.querySelectorAll('.law-card[data-id]').forEach(b => b.addEventListener('click', () => {
    root.dataset.picked = b.dataset.id;
    renderCollection(c);
  }));
}

// Glowing gases (data/glows.yaml): once Aurora is gained, auroras also come on quiet nights, about once per
// AURORA_EVERY_S. Tapping one finds a gas that glows in it and is in the air; during a solar storm it also
// shields the ozone layer until the storm ends. The whole set thickens the ozone layer (see ozone).
const GLOWS = DATA.glows;
const GLOW_BY_ID = Object.fromEntries(GLOWS.map(g => [g.id, g]));
const AURORA_EVERY_S = 60;
const GLOW_IN_AIR = {
  oxygenGreen: () => state.o2 > 0.1,
  oxygenRed: () => state.o2 > 1 && state.solarStorm > 0,
  nitrogen: () => state.pressure > 0.3,
  neon: () => state.atoms.includes('Ne'),
  argon: () => state.atoms.includes('Ar'),
  krypton: () => state.atoms.includes('Kr'),
};
const allGlows = () => state.glows.length === GLOWS.length;

function auroraTick(dt) {
  if (has('aurora') && !Scene.auroraUp() && state.spinLocked && !sunUp() && Math.random() < dt / AURORA_EVERY_S) Scene.aurora(20);
}

Scene.onAuroraTap((x, y) => {
  if (!has('aurora')) return;
  if (state.solarStorm > 0 && !state.auroraShield) {
    state.auroraShield = true;
    floatText(x, y + 20, 'Shielded', 'rain');
  }
  const gas = GLOWS.find(g => !state.glows.includes(g.id) && GLOW_IN_AIR[g.id]());
  if (gas) {
    state.glows.push(gas.id);
    announce(`${gas.name} glows`, x, y - 10, 'atom');
    if (allGlows()) announce('Glowing gases: complete', innerWidth / 2, innerHeight * 0.4, 'disaster big');
    updateDots();
  }
  Scene.aurora(Math.min(3, SOLAR_STORM_S));
  buzz([20, 30, 20]);
});

function renderGlows(force) {
  const root = $('#glow'), key = state.glows.join() + pickedGlow;
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  root.innerHTML = `<p class="note">${state.glows.length} of ${GLOWS.length} found</p>
    <div class="law-grid">${GLOWS.map(g => state.glows.includes(g.id)
      ? `<button class="law-card${g.id === pickedGlow ? ' picked' : ''}" data-id="${g.id}"><b style="color:${Hues.css(g.color)}">${g.sign}</b><span>${g.name}</span></button>`
      : '<button class="law-card unknown" disabled><b>?</b><span></span></button>').join('')}</div>
    <p class="atom-info">${pickedGlow ? `<b>${GLOW_BY_ID[pickedGlow].name}</b><br>${GLOW_BY_ID[pickedGlow].how}` : 'Tap a gas.'}</p>`;
  root.querySelectorAll('.law-card[data-id]').forEach(b => b.addEventListener('click', () => {
    pickedGlow = b.dataset.id;
    renderGlows();
  }));
}
let pickedGlow = null;

// A card per band; bands not found yet are question marks. With all of them, the planet can be seen in infrared.
let pickedBand = null;
function renderBands(force) {
  const root = $('#bands'), key = state.bands.join() + pickedBand + state.heatView;
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  root.innerHTML = `<p class="note">${state.bands.length} of ${BANDS.length} found</p>
    <div class="law-grid">${BANDS.map(b => state.bands.includes(b.id)
      ? `<button class="law-card${b.id === pickedBand ? ' picked' : ''}" data-id="${b.id}"><b>${b.sign}</b><span>${b.name}</span></button>`
      : '<button class="law-card unknown" disabled><b>?</b><span></span></button>').join('')}</div>
    <p class="atom-info">${pickedBand ? `<b>${BAND_BY_ID[pickedBand].name}</b><br>${BAND_BY_ID[pickedBand].how}` : 'Tap a band.'}</p>
    ${allBands() ? `<button id="heat-view" class="view-toggle${state.heatView ? ' on' : ''}">Infrared</button>` : ''}`;
  root.querySelectorAll('.law-card[data-id]').forEach(b => b.addEventListener('click', () => {
    pickedBand = b.dataset.id;
    renderBands();
  }));
  root.querySelector('#heat-view')?.addEventListener('click', () => {
    state.heatView = !state.heatView;
    Scene.setHeatView(state.heatView);
    renderBands();
  });
}

// Ultra puzzles (research.yaml `puzzle`): solving one gains the ultra at once. Wrong moves just don't stick.
const PUZZLES = { spectrum: spectrumPuzzle, fieldlines: fieldPuzzle, reaction: reactionPuzzle, orbits: orbitPuzzle,
  lightbay: bayPuzzle, basepair: basePuzzle, soillayers: soilPuzzle, sediments: sedimentPuzzle, pollinate: pollinatePuzzle, radiant: radiantPuzzle };

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
    announce(`${item.name}!`, innerWidth / 2, innerHeight * 0.4, 'disaster big');
    renderCategory(true);
  }, 1400);
}

// Aurora: turn the tiles so a field line runs from where the solar wind comes in (left) to the pole (top).
// Tap a tile to turn it a quarter. The line lights green as far as it reaches.
const FIELD_N = 5, FIELD_IN = [2, 0], FIELD_OUT = [0, 2];
const turnTile = m => ((m << 1) | (m >> 3)) & 15;   // N=1 E=2 S=4 W=8, turned clockwise
const STEP = { 1: [-1, 0, 4], 2: [0, 1, 8], 4: [1, 0, 1], 8: [0, -1, 2] };   // direction bit: row, column, bit back

function fieldPath() {
  // A random walk from the entry to the exit that never crosses itself.
  const seen = new Set(), path = [];
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
  const tiles = [], path = fieldPath();
  for (let i = 0; i < FIELD_N * FIELD_N; i++) tiles.push(Math.random() < 0.5 ? 5 : 3);   // straight or corner
  path.forEach(([r, c], k) => {
    const dirTo = ([r2, c2]) => +Object.keys(STEP).find(d => STEP[d][0] === r2 - r && STEP[d][1] === c2 - c);
    const back = k === 0 ? 8 : dirTo(path[k - 1]), out = k === path.length - 1 ? 1 : dirTo(path[k + 1]);
    tiles[r * FIELD_N + c] = back | out;
  });
  for (let i = 0; i < tiles.length; i++) for (let k = Math.floor(Math.random() * 4); k > 0; k--) tiles[i] = turnTile(tiles[i]);
  // Follow the line from the entry; returns the lit cells and whether it reaches the pole.
  const trace = () => {
    const lit = new Set();
    let [r, c] = FIELD_IN, from = 8;
    while (r >= 0 && c >= 0 && r < FIELD_N && c < FIELD_N && tiles[r * FIELD_N + c] & from && !lit.has(r * FIELD_N + c)) {
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
      t.innerHTML = `<svg viewBox="0 0 10 10"><path d="${[1, 2, 4, 8].filter(d => tiles[i] & d).map(d => seg[d]).join(' ')}"/></svg>`;
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
  root.querySelectorAll('.field-tile').forEach((t, i) => t.addEventListener('click', () => {
    if (root.dataset.done) return;
    tiles[i] = turnTile(tiles[i]);
    draw();
  }));
  draw();
}

// Eclipse: the moon's orbit is tilted, so it crosses the planet's path round the sun at only two points, the
// nodes (the white marks). A solar eclipse needs the moon on a node, right between planet and sun. Tap the planet
// to move it along its year (12 steps), and the moon to move it round the planet (8 steps).
function orbitPuzzle(root, solved) {
  const node = Math.random() < 0.5 ? 0 : 90;   // direction of the node line, in degrees
  let planet = 30 * Math.floor(Math.random() * 12), moon = 45 * Math.floor(Math.random() * 8);
  const at = (cx, cy, r, deg) => [cx + r * Math.cos(deg * Math.PI / 180), cy + r * Math.sin(deg * Math.PI / 180)];
  const lined = () => {
    const toSun = (planet + 180) % 360;
    return moon === toSun && toSun % 180 === node;
  };
  const draw = () => {
    const [px, py] = at(150, 150, 105, planet), [mx, my] = at(px, py, 30, moon), done = lined();
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

// Bioluminescence: the bay flashes a pattern of glowing plankton; tap them back in the same order. A wrong tap
// just plays the pattern again.
function bayPuzzle(root, solved) {
  const spots = [[60, 70], [140, 50], [230, 75], [90, 140], [180, 130], [250, 160]];
  const seq = Array.from({ length: 4 }, () => Math.floor(Math.random() * spots.length));
  let step = 0, busy = true;
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
  dots.forEach((d, i) => d.addEventListener('click', () => {
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
  }));
  play();
}

// DNA: finish the second strand. A pairs with T, C with G; a wrong base doesn't stick.
const BASE_PAIR = { A: 'T', T: 'A', C: 'G', G: 'C' };
const BASE_COLOR = { A: '#ff5a4a', T: '#ffd23f', C: '#5a8aff', G: '#6ee07a' };
function basePuzzle(root, solved) {
  const strand = Array.from({ length: 8 }, () => 'ATCG'[Math.floor(Math.random() * 4)]), done = [];
  const cell = (b, cls = '') => `<span class="base ${cls}" style="${b ? `background:${BASE_COLOR[b]}` : ''}">${b || ''}</span>`;
  const draw = () => {
    root.querySelector('.strands').innerHTML = `<div class="strand">${strand.map(b => cell(b)).join('')}</div>
      <div class="rungs">${strand.map((_, i) => `<i class="${i < done.length ? 'on' : ''}"></i>`).join('')}</div>
      <div class="strand">${strand.map((_, i) => cell(done[i], i === done.length ? 'next' : '')).join('')}</div>`;
  };
  root.innerHTML = `<div class="strands"></div><div class="tray">${'ATCG'.split('').map(b => `<button class="tile" data-b="${b}" style="color:${BASE_COLOR[b]}">${b}</button>`).join('')}</div>`;
  root.querySelectorAll('.tile').forEach(t => t.addEventListener('click', () => {
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
  }));
  draw();
}

// Put things in their order, one slot at a time from the top; a tile that doesn't come next won't stick.
function orderPuzzle(root, solved, items, top, bottom) {
  const placed = [];
  const tray = items.map((_, i) => i).sort(() => Math.random() - 0.5);
  const draw = () => {
    root.querySelector('.stack').innerHTML = `<p class="end">${top}</p>${items.map((it, i) =>
      `<div class="layer${i < placed.length ? ' on' : ''}" style="${i < placed.length ? `background:${Hues.css(it.color)}` : ''}">${i < placed.length ? it.name : ''}</div>`).join('')}<p class="end">${bottom}</p>`;
    root.querySelectorAll('.tray .tile').forEach(t => t.classList.toggle('used', placed.includes(+t.dataset.i)));
  };
  root.innerHTML = `<div class="stack"></div><div class="tray">${tray.map(i => `<button class="tile" data-i="${i}" style="border-color:${Hues.css(items[i].color)}">${items[i].name}</button>`).join('')}</div>`;
  root.querySelectorAll('.tray .tile').forEach(t => t.addEventListener('click', () => {
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
  }));
  draw();
}

// Rich Soil: the layers of a soil, from the surface down.
function soilPuzzle(root, solved) {
  orderPuzzle(root, solved, [
    { name: 'Humus', color: '#3a2a1a' }, { name: 'Topsoil', color: '#6a4a2a' }, { name: 'Subsoil', color: '#9a7a4a' }, { name: 'Bedrock', color: '#6a6a72' },
  ], 'surface', 'deep');
}

// Fertile Delta: a river drops its load as it slows, the coarsest first.
function sedimentPuzzle(root, solved) {
  orderPuzzle(root, solved, [
    { name: 'Boulders', color: '#6a6a72' }, { name: 'Gravel', color: '#8a8478' }, { name: 'Sand', color: '#d8b870' }, { name: 'Silt', color: '#a88a5a' }, { name: 'Clay', color: '#c87a5a' },
  ], 'mountain', 'sea');
}

// Superbloom: match each flower to the animal that pollinates it. Tap a flower, then its pollinator.
function pollinatePuzzle(root, solved) {
  const flowers = COLLECTION_BY_ID.flowers.items, pollinators = flowers.map(f => f.sign).sort(() => Math.random() - 0.5);
  const matched = new Set();
  let pick = null;
  root.innerHTML = `<div class="pairs"><div class="col">${flowers.map(f => `<button class="tile flower" data-f="${f.id}" style="border-color:${Hues.css(f.color)}">${f.name}</button>`).join('')}</div>
    <div class="col">${pollinators.map(p => `<button class="tile pollinator" data-p="${p}">${p}</button>`).join('')}</div></div>`;
  const paint = () => {
    root.querySelectorAll('.flower').forEach(b => {
      b.classList.toggle('picked', b.dataset.f === pick);
      b.classList.toggle('on', matched.has(b.dataset.f));
    });
    root.querySelectorAll('.pollinator').forEach(b => b.classList.toggle('on', flowers.some(f => matched.has(f.id) && f.sign === b.dataset.p)));
  };
  root.querySelectorAll('.flower').forEach(b => b.addEventListener('click', () => {
    if (!matched.has(b.dataset.f)) pick = b.dataset.f;
    paint();
  }));
  root.querySelectorAll('.pollinator').forEach(b => b.addEventListener('click', () => {
    if (!pick || root.dataset.done) return;
    if (flowers.find(f => f.id === pick).sign !== b.dataset.p) {
      b.classList.add('wrong');
      setTimeout(() => b.classList.remove('wrong'), 500);
      return;
    }
    matched.add(pick);
    pick = null;
    paint();
    if (matched.size === flowers.length) {
      root.dataset.done = '1';
      solved();
    }
  }));
}

// Meteor Shower: the trails of a shower all point back to one spot in the sky, the radiant. Tap it.
function radiantPuzzle(root, solved) {
  const grid = [50, 100, 150, 200, 250], rx = grid[1 + Math.floor(Math.random() * 3)], ry = grid[1 + Math.floor(Math.random() * 3)];
  const trails = Array.from({ length: 6 }, (_, k) => {
    const a = (k / 6) * Math.PI * 2 + Math.random() * 0.6, d1 = 45 + Math.random() * 25, d2 = d1 + 25 + Math.random() * 20;
    return [rx + Math.cos(a) * d1, ry + Math.sin(a) * d1, rx + Math.cos(a) * d2, ry + Math.sin(a) * d2];
  });
  const svg = extra => `${trails.map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="trail"/><circle cx="${x2}" cy="${y2}" r="2" class="head"/>`).join('')}
    ${extra}${grid.flatMap(x => grid.map(y => `<circle cx="${x}" cy="${y}" r="5" class="dot" data-x="${x}" data-y="${y}"/>`)).join('')}`;
  root.innerHTML = `<svg class="sky-puzzle" viewBox="0 0 300 300">${svg('')}</svg>`;
  root.querySelector('svg').addEventListener('click', e => {
    const d = e.target.dataset;
    if (!d?.x || root.dataset.done) return;
    if (+d.x !== rx || +d.y !== ry) {
      e.target.classList.add('wrong');
      setTimeout(() => e.target.classList.remove('wrong'), 500);
      return;
    }
    root.dataset.done = '1';
    root.querySelector('svg').innerHTML = svg(trails.map(([, , x2, y2]) => `<line x1="${rx}" y1="${ry}" x2="${x2}" y2="${y2}" class="back"/>`).join(''));
    solved();
  });
}

// Molecules, played like Wordle: fill the slots from the tray of atoms found and molecules known, then try.
// Order does not matter in a reaction, so each tile is marked by amount: green, in the reaction in the right
// amount; yellow, in it but in the wrong amount; grey, not in it (it greys out in the tray too). Three tries
// per molecule per game day; the rows of today's tries stay when the puzzle is closed and opened again.
const REACTION_TRIES = 3;
const REACTION_ATOMS = new Set(RESEARCH.flatMap(u => u.reaction || []).filter(t => !RESEARCH_BY_ID[t]));
const gameDay = () => Math.floor((state.time || 0) / DAY_S);
const tokenName = t => (RESEARCH_BY_ID[t] ? RESEARCH_BY_ID[t].name : t);
function judge(guess, need) {
  const count = (list, t) => list.filter(x => x === t).length;
  return guess.map(t => (!need.includes(t) ? 'grey' : count(guess, t) === count(need, t) ? 'green' : 'yellow'));
}
function reactionPuzzle(root, solved, item) {
  const need = item.reaction, slots = need.map(() => null);
  const log = (state.tries[item.id] ||= { day: gameDay(), rows: [] });
  if (log.day !== gameDay()) Object.assign(log, { day: gameDay(), rows: [] });
  // The tray: found atoms that take part in reactions, and every molecule known.
  const tray = [...state.atoms.filter(a => REACTION_ATOMS.has(a)), ...RESEARCH.filter(u => u.tab === 'molecules' && has(u.id)).map(u => u.id)];
  const slotRow = (tokens, marks = []) => tokens.map((t, k) => `<span class="slot ${marks[k] || ''}${t ? ' filled' : ''}" data-k="${k}">${t ? tokenName(t) : ''}</span>${k < tokens.length - 1 ? '<b>+</b>' : ''}`).join('');
  const draw = () => {
    const out = log.rows.length >= REACTION_TRIES && !root.dataset.done;
    const grey = new Set(log.rows.flatMap(r => r.filter(t => !need.includes(t))));
    const best = t => (log.rows.some(r => r.includes(t) && judge(r, need)[r.indexOf(t)] === 'green') ? 'green' : log.rows.some(r => r.includes(t) && need.includes(t)) ? 'yellow' : '');
    root.innerHTML = `${log.rows.map(r => `<div class="reaction past">${slotRow(r, judge(r, need))}<b>→</b><span class="product">${item.name}</span></div>`).join('')}
      ${out ? '<p class="note tries-out">Try again tomorrow.</p>' : `<div class="reaction now">${slotRow(slots)}<b>→</b><span class="product">${item.makes > 1 ? item.makes + ' ' : ''}${item.name}</span></div>`}
      <p class="tries">${Array.from({ length: REACTION_TRIES }, (_, k) => `<i class="${k < log.rows.length ? 'used' : ''}"></i>`).join('')}</p>
      <div class="tray">${tray.map(t => `<button class="tile ${grey.has(t) ? 'grey' : best(t)}" data-t="${t}"${out || grey.has(t) ? ' disabled' : ''}>${tokenName(t)}</button>`).join('')}</div>`;
    root.querySelectorAll('.now .slot').forEach(b => b.addEventListener('click', () => {
      slots[+b.dataset.k] = null;
      draw();
    }));
    root.querySelectorAll('.tray .tile').forEach(b => b.addEventListener('click', () => {
      const k = slots.indexOf(null);
      if (k < 0 || root.dataset.done || out) return;
      slots[k] = b.dataset.t;
      if (!slots.includes(null)) return attempt();
      draw();
    }));
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
  let pick = null;
  const order = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
  root.innerHTML = `<svg class="bow" viewBox="0 0 120 66">${SPECTRUM.map((_, k) => {
    const r = 50 - k * 7;
    return `<path data-band="${k}" d="M ${60 - r} 63 A ${r} ${r} 0 0 1 ${60 + r} 63"/>`;
  }).join('')}</svg>
    <div class="swatches">${order.map(i => `<button class="swatch" data-c="${i}" style="background:${SPECTRUM[i]}" aria-label="color"></button>`).join('')}</div>`;
  const bands = [...root.querySelectorAll('path')], swatches = [...root.querySelectorAll('.swatch')];
  const paint = () => {
    bands.forEach((b, k) => (b.style.stroke = placed[k] === null ? '' : SPECTRUM[placed[k]]));
    swatches.forEach(w => {
      w.classList.toggle('used', placed.includes(+w.dataset.c));
      w.classList.toggle('picked', pick === +w.dataset.c);
    });
  };
  swatches.forEach(w => w.addEventListener('click', () => {
    pick = pick === +w.dataset.c ? null : +w.dataset.c;
    paint();
  }));
  bands.forEach((b, k) => b.addEventListener('click', () => {
    if (pick === null) placed[k] = null;
    else {
      placed[k] = pick;
      pick = null;
    }
    paint();
    if (placed.includes(null)) return;
    if (placed.every((c, i) => c === i)) {
      root.querySelector('.bow').classList.add('solved');
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
  }));
}

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
    if (!d.when() || Math.random() >= d.rate * dt) continue;
    const happened = { supereruption: () => (erupt(-1, true), true), flood, hurricane, earthquake: quake, drought, solarstorm: solarStorm, redtide: redTide, iceage: iceAge }[id]();
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

/* ================= Tree status and game over ================= */

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

// The run ends when nothing is alive, or when every species still to evolve is blocked.
function checkGameOver() {
  if (state.over || !seen('life')) return;
  const t = treeSummary();
  if (t.alive === 0) gameOver('Life is gone. Every species on the planet is extinct.');
  else if (t.available + t.waiting === 0 && t.blocked > 0) gameOver('Every branch of the tree of life is blocked. Nothing new can ever evolve.');
}

function gameOver(reason) {
  state.over = reason;
  save();
  showGameOver();
}

function showGameOver() {
  const t = treeSummary();
  $('#gameover-reason').textContent = state.over;
  $('#gameover-stats').innerHTML = [
    ['Species evolved', `${t.alive + t.extinct} / ${SPECIES.length}`],
    ['Extinct', `${t.extinct}`],
    ['Blocked', `${t.blocked}`],
    ['Temperature', fmtTemp(tempC())],
    ['Time played', fmtTime((Date.now() - state.start) / 1000)],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('#gameover').classList.remove('hidden');
}

// The next event happens once the planet gets there.
function checkEvents() {
  // Gases appear in the air by themselves once their molecule is known (`auto` in research.yaml).
  for (const u of RESEARCH) if (u.auto && !has(u.id) && chainOpen(u)) owned.add(u.id);
  const next = EVENTS[state.happened.length];
  if (!next || !next.happens()) return;
  state.happened.push(next.id);
  if (next.id === 'life') state.species.cell = 0.02;
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

/* ================= DOM ================= */

const $ = sel => document.querySelector(sel);
const el = {
  temp: $('#temp'), tempSub: $('#temp-sub'), hudLine: $('#hud-line'),
  fx: $('#fx'),
};

const spriteImg = id => `<img class="sprite" src="${Sprites.icon(id)}" alt="">`;

// Each tab is rebuilt only when its list of visible entries changes; otherwise only text updates.
const tabKeys = {};

function tabEntries(tab) {
  const entries = [];
  for (const u of RESEARCH) if (u.tab === tab && has(u.id) && !superseded(u)) entries.push({ kind: 'researched', item: u });
  for (const u of RESEARCH) if (u.tab === tab && !has(u.id) && !u.auto && researchVisible(u)) entries.push({ kind: 'research', item: u });
  // A gas not yet known shows as a blank: "?" and an empty gauge.
  for (const u of RESEARCH) if (u.tab === tab && u.auto && !has(u.id)) entries.push({ kind: 'mystery', item: u });
  // One blank card when more research waits in this section: there is always a next step.
  const ahead = RESEARCH.find(u => u.tab === tab && !u.auto && !u.hidden && !has(u.id) && !researchVisible(u));
  if (ahead) entries.push({ kind: 'mystery', item: ahead, next: true });
  return entries;
}

function meterHtml(label, cls) {
  return `<div class="meter-row"><span>${label}</span><b class="${cls}-v"></b></div><div class="meter"><i class="${cls}"></i></div>`;
}

function headHtml(tab) {
  if (tab === 'sun') {
    return `${!seen('sunlit') ? meterHtml('Ignition', 'm-ignite') : meterHtml('Sun brightness', 'm-sun')}<p class="note m-fusion"></p><p class="note m-taps"></p>`;
  }
  if (tab === 'moon') return '<p class="note m-moon-note"></p>';
  if (tab === 'comets') return '<p class="note m-comets"></p>';
  if (tab === 'atmosphere') {
    return `${state.eruptions ? meterHtml('Aerosols', 'm-aerosol') : ''}
      <p class="note m-air"></p><p class="note m-climate"></p>`;
  }
  if (tab === 'core') return `${meterHtml('Spin', 'm-day')}<p class="note m-core"></p>`;
  if (tab === 'land') {
    return `${has('volcano') ? meterHtml('Volcanic activity', 'm-volc') : ''}
      <p class="note m-land"></p>`;
  }
  if (tab === 'ocean') {
    return `
      ${meterHtml('Open ocean', 'm-open')}
      <p class="note m-ice"></p>
      ${seen('storms') ? meterHtml('Primordial soup', 'm-soup') : ''}
      ${seen('ocean') ? '<p class="note m-minerals"></p>' : ''}`;
  }
  return '';
}

function renderTab(tab, force = false) {
  const root = $(`#${tab}`);
  if (!root || tab === 'world' || tab === 'life') return;
  const entries = tabEntries(tab);
  const key = `${state.happened.length}|${has('volcano')}|${state.eruptions > 0}|${state.spinLocked}|${entries.map(e => e.kind + e.item.id + pop(e.item.id)).join()}`.replace(/0\.\d+/g, 'a');
  if (force || tabKeys[tab] !== key) {
    tabKeys[tab] = key;
    root.innerHTML = `<div class="domain-head">${headHtml(tab)}</div><ul class="list"></ul>`;
    const list = root.querySelector('.list');
    for (const e of entries) {
      const li = document.createElement('li');
      li.className = 'item';
      li.innerHTML = `
        <div class="icon">${spriteImg(e.item.icon)}</div>
        <div class="info"><div class="name"></div><div class="desc"></div><div class="meta"></div></div>
        <div class="side"><div class="count"></div><div class="cost"></div></div>`;
      if (e.kind === 'researched') li.querySelector('.meta').innerHTML = '<div class="meter"><i></i></div><span></span>';
      else if (e.kind === 'mystery') {
        li.className = 'item mystery';
        li.querySelector('.icon').innerHTML = '';
        li.querySelector('.name').textContent = '?';
        li.querySelector('.meta').innerHTML = '<div class="meter"><i></i></div>';
      } else li.addEventListener('click', () => choose(e));
      e.li = li;
      list.appendChild(li);
    }
    root._entries = entries;
  }
  updateTab(tab, root);
}

function setMeter(root, cls, value, text) {
  const bar = root.querySelector(`.${cls}`);
  if (!bar) return;
  bar.style.width = pct(clamp01(value));
  root.querySelector(`.${cls}-v`).textContent = text ?? pct(value);
}

const parentReady = s => pop(s.parent) >= 0.5;
const opened = s => !s.research || has(s.research);

function updateTab(tab, root) {
  const note = (cls, text) => {
    const n = root.querySelector(`.${cls}`);
    if (n) n.textContent = text;
  };
  if (tab === 'sun') {
    setMeter(root, 'm-ignite', state.ignition);
    setMeter(root, 'm-sun', sunBrightness(), `${pct(sunBrightness())} of today`);
    note('m-fusion', componentDone('sun') ? 'The sun is complete and rests in the background.' : '');
    note('m-taps', `${fmt(state.clicks)} taps on the sun`);
  }
  if (tab === 'comets') {
    const brought = Object.keys(COMET_ATOMS).filter(a => state.matter[a]).map(a => `${a} ${state.matter[a]}`).join(' · ');
    note('m-comets', `${fmt(state.comets)} comets caught${brought ? ` · atoms brought: ${brought}` : ''}`);
  }
  if (tab === 'moon') {
    note('m-moon-note', componentDone('moon') ? 'The moon is complete and rests in the background.' : '');
  }
  if (tab === 'atmosphere') {
    const frozen = [state.ch4Ice > 0 && 'methane', state.co2Ice > 0 && 'CO₂', !has('thawN2') && 'nitrogen'].filter(Boolean);
    const cool = aerosolCooling();
    setMeter(root, 'm-aerosol', state.aerosols, cool > 0.05 ? `−${cool.toFixed(1)}°C` : 'clear');
    const levels = [!has('thawCO2') && `CO₂ ${fmt(state.co2)} ppm`, !has('thawCH4') && `methane ${state.ch4.toFixed(1)} ppm`].filter(Boolean);
    // Gases already researched show their own gauges below, so they are left out here.
    const air = [!has('thawN2') && `Air ${state.pressure.toFixed(2)} bar`, ...levels, `greenhouse +${rates.climate.greenhouse.toFixed(0)}°C`].filter(Boolean);
    note('m-air', air.join(' · ') + (frozen.length ? ` · still frozen: ${frozen.join(', ')}` : ''));
    note('m-climate', `Heading toward ${fmtTemp(rates.climate.target - KELVIN)} · reflects ${pct(rates.climate.albedo)} of sunlight` +
      (state.strikes ? ` · ${fmt(state.strikes)} lightning strikes` : ''));
  }
  if (tab === 'core') {
    setMeter(root, 'm-day', state.spin, state.spinLocked ? 'Locked' : pct(state.spin));
    note('m-core', '');
  }
  if (tab === 'land') {
    setMeter(root, 'm-volc', state.volcanoActivity);
    const b = Terrain.biomes();
    note('m-land', `Land ${pct(state.land)} of the planet · mountains ${pct(state.mountains)}` +
      (b.green + b.desert > 0 ? ` · desert ${pct(b.desert)} of land` : '') + (state.eruptions ? ` · ${fmt(state.eruptions)} eruptions` : ''));
  }
  if (tab === 'ocean') {
    setMeter(root, 'm-open', openOcean() / 0.3, pct(openOcean()));
    note('m-ice', `Ice covers ${pct(iceCover())} of the planet`);
    setMeter(root, 'm-soup', state.soup / SOUP_FULL);
    const minerals = root.querySelector('.m-minerals');
    if (minerals) minerals.textContent = `Minerals: ${fmt(state.minerals)}, lightning makes x${soupMult().toFixed(2)} soup`;
  }
  for (const e of root._entries || []) {
    const { item, li } = e, q = s => li.querySelector(s);
    if (e.kind === 'researched') {
      const [level, text] = item.gauge ? item.gauge() : [1, ''];
      li.className = `item researched${item.ultra ? ' ultra' : ''}`;
      q('.name').textContent = item.name;
      q('.meta i').style.width = pct(clamp01(level));
      q('.meta span').textContent = text;
      q('.cost').textContent = '';
    } else if (e.kind === 'research') {
      li.className = 'item' + ((item.puzzle ? puzzleReady(item) : canResearch(item)) ? ' affordable' : '') + (item.ultra ? ' ultra' : '');
      const active = state.researching?.id === item.id, days = item.days || 1;
      q('.name').textContent = `${active ? 'Researching' : 'Research'} ${item.name}`;
      if (active) {
        q('.meta').innerHTML = `<div class="meter"><i style="width:${pct(state.researching.done)}"></i></div>`;
        q('.cost').textContent = pct(state.researching.done);
      } else {
        // What it needs: met conditions get a tick, unmet ones show where the planet is now.
        q('.meta').textContent = (item.needs || []).map(n => {
          const k = NEEDS[n[0]];
          if (needMet(n)) return `✓ ${k.label(n[1])}`;
        if (k.progress) return `${k.label(n[1])} (now ${k.progress(n[1])})`;
        return k.now ? `${k.label(n[1])} (now ${k.show(k.now())})` : k.label(n[1]);
        }).join(' · ');
        q('.cost').textContent = item.puzzle ? '' : `${days} ${days === 1 ? 'day' : 'days'}`;
      }
    }
  }
}

/* ================= Researching and evolving ================= */

function choose(e) {
  const { item } = e;
  if (e.kind === 'researched') return;
  if (e.kind === 'research') {
    if (item.puzzle) {
      if (puzzleReady(item)) openPuzzle(item);
      return;
    }
    if (!canResearch(item)) return;
    state.researching = { id: item.id, done: 0 };
  } else {
    if (evolved(item.id) || isExtinct(item.id) || state.dna < item.cost || !parentReady(item) || !opened(item)) return;
    state.dna -= item.cost;
    state.species[item.id] = 0.05;
  }
  buzz(10);
  recalc();
  renderCategory();
}

/* ================= Colors ================= */

// The world starts in black and white shapes. Starlight brings the shades of grey, and each color researched in
// Science › Physics › Spectrum fades into the scene, the book and its icons (Hues, in sprites.js).
const COLOR_RESEARCH = { red: 'colorRed', orange: 'colorOrange', yellow: 'colorYellow', green: 'colorGreen', blue: 'colorBlue', violet: 'colorViolet' };
const COLOR_FADE_S = 3;
const UI_COLORS = ['--panel', '--panel-2', '--line', '--text', '--muted', '--accent', '--good', '--bad'];
const uiBase = Object.fromEntries(UI_COLORS.map(v => [v, getComputedStyle(document.documentElement).getPropertyValue(v).trim()]));
let colorsShown = null, paintedKey = null;

function updateColors(dt) {
  const target = Object.fromEntries(Object.entries(COLOR_RESEARCH).map(([name, id]) => [name, has(id) ? 1 : 0]));
  colorsShown ??= { ...target };
  for (const name in target) {
    const gap = target[name] - colorsShown[name];
    colorsShown[name] = Math.abs(gap) <= dt / COLOR_FADE_S ? target[name] : colorsShown[name] + Math.sign(gap) * dt / COLOR_FADE_S;
  }
  Hues.set(colorsShown, target, !has('starlight'));
  document.body.classList.toggle('colors-unseen', !Hues.full());
  if (Hues.key() !== paintedKey) {
    paintedKey = Hues.key();
    paintPage();
  }
}

// Repaint everything outside the scene in the colors found.
function paintPage() {
  UI_COLORS.forEach(v => uiBase[v] && document.documentElement.style.setProperty(v, Hues.css(uiBase[v])));
  $('#book-btn .sprite').src = Sprites.icon('book');
  buildTabs();
  document.querySelectorAll('.group-title').forEach(h => (h.style.color = Hues.css(h.dataset.color)));
  if (bookOpen) {
    $('#book-title').style.color = Hues.css(SUBJECT_BY_ID[currentCat].text || SUBJECT_BY_ID[currentCat].color);
    renderCategory(true);
  }
  updateDots();
}

// Worlds from before colors had to be found get Starlight and every color their planet already shows.
function grantSeenColors() {
  if (!state.grantColors) return;
  delete state.grantColors;
  if (!state.banged) return;
  owned.add('starlight');
  for (let pass = 0; pass < 2; pass++) {
    for (const id of Object.values(COLOR_RESEARCH)) {
      const u = RESEARCH_BY_ID[id];
      if (researchVisible(u) && (u.needs || []).every(needMet)) owned.add(id);
    }
  }
}

/* ================= The science book ================= */

let currentCat = 'space';
let bookOpen = false;

const visibleSections = cat => SUBJECT_BY_ID[cat].sections.filter(sec => SECTIONS[sec].unlocked());

// Build one page per subject, with a titled block per section, and the subject tabs down the right edge.
function buildPanels() {
  const world = $('#world');
  for (const c of SUBJECTS) {
    const div = document.createElement('div');
    div.id = `cat-${c.id}`;
    div.className = 'tab';
    const sections = list => list.map(sec => `
      <section class="section" data-section="${sec}">
        <h3 class="section-title">${SECTIONS[sec].name}</h3>
        ${sec === 'world' ? '' : `<div id="${sec}"></div>`}
      </section>`).join('');
    div.innerHTML = `${c.groups ? c.groups.map(g => `
      <div class="group"><h2 class="group-title" data-color="${c.color}" style="color:${Hues.css(c.color)}">${g.name}</h2>${sections(g.sections)}</div>`).join('')
      : sections(c.sections)}
      <p class="blank-page">Empty pages.</p>`;
    if (c.sections.includes('world')) div.querySelector('[data-section="world"]').appendChild(world);
    $('#panel').appendChild(div);
  }
  $('#book-btn').insertAdjacentHTML('afterbegin', spriteImg('book'));
  buildTabs();
}

// The subject tabs, in the colors found so far.
function buildTabs() {
  $('#book-tabs').innerHTML = SUBJECTS.filter(c => !c.hidden).map(c => `<button class="book-tab${bookOpen && c.id === currentCat ? ' active' : ''}" data-cat="${c.id}" style="--tab:${Hues.css(c.color)}" aria-label="${c.name}" title="${c.name}">
    ${spriteImg('subject' + c.name)}<i class="dot hidden"></i></button>`).join('');
  $('#book-tabs').querySelectorAll('.book-tab').forEach(t => t.addEventListener('click', () => openCategory(t.dataset.cat)));
}

// How much a subject holds. When it grows past what the player has seen, its tab and the book get a dot.
function subjectSize(cat) {
  return visibleSections(cat).reduce((n, sec) => n + (
    sec === 'elements' ? state.atoms.length
    : sec === 'laws' ? state.laws.length
    : sec === 'bands' ? state.bands.length
    : sec === 'glow' ? state.glows.length
    : COLLECTION_BY_SECTION[sec] ? (state.found[COLLECTION_BY_SECTION[sec].id] || []).length
    : sec === 'signs' ? state.signs.length
    : sec === 'planets' ? state.planets.length
    : sec === 'index' || sec === 'life' ? SPECIES.filter(known).length
    : sec === 'world' ? 0
    : sec === 'stories' ? STORIES.filter(storyOpen).length + STORIES.reduce((n, st) => n + storyDone(st).length, 0)
    : sec === 'disasters' ? Object.keys(state.disasters).length
    : tabEntries(sec).length), 0);
}

function updateDots() {
  let any = false;
  for (const c of SUBJECTS.filter(s => !s.hidden)) {
    const size = subjectSize(c.id);
    if (bookOpen && c.id === currentCat) state.bookSeen[c.id] = size;
    const fresh = size > (state.bookSeen[c.id] || 0);
    any ||= fresh;
    $(`.book-tab[data-cat="${c.id}"] .dot`).classList.toggle('hidden', !fresh);
  }
  $('#book-btn .dot').classList.toggle('hidden', !any);
}

// The light update skips the world stats and the tree of life, which have their own slower timers.
function renderCategory(force = false, light = false) {
  if (!bookOpen) return;
  const root = $(`#cat-${currentCat}`), visible = visibleSections(currentCat);
  root.querySelectorAll('.section').forEach(n => n.classList.toggle('hidden', !visible.includes(n.dataset.section)));
  root.querySelectorAll('.group').forEach(g => g.classList.toggle('hidden', !g.querySelector('.section:not(.hidden)')));
  root.querySelector('.blank-page').classList.toggle('hidden', visible.length > 0);
  for (const sec of visible) {
    if (sec === 'world' || sec === 'life') {
      if (light) continue;
      if (sec === 'world') renderWorld();
      else renderLife();
    } else if (sec === 'elements') renderElements(force);
    else if (sec === 'laws') renderLaws(force);
    else if (sec === 'bands') renderBands(force);
    else if (sec === 'glow') renderGlows(force);
    else if (sec === 'stories') renderStories(force);
    else if (COLLECTION_BY_SECTION[sec]) renderCollection(COLLECTION_BY_SECTION[sec], force);
    else if (sec === 'signs') renderSigns(force);
    else if (sec === 'disasters') renderDisasters();
    else if (sec === 'planets') renderPlanets(force);
    else if (sec === 'index') renderIndex(force);
    else renderTab(sec, force);
  }
}

function openCategory(cat) {
  currentCat = cat;
  document.querySelectorAll('#panel > .tab').forEach(n => n.classList.toggle('active', n.id === `cat-${cat}`));
  document.querySelectorAll('.book-tab').forEach(n => n.classList.toggle('active', n.dataset.cat === cat));
  $('#book-title').textContent = SUBJECT_BY_ID[cat].name;
  $('#book-title').style.color = Hues.css(SUBJECT_BY_ID[cat].text || SUBJECT_BY_ID[cat].color);
  $('#panel').scrollTop = 0;
  renderCategory(true);
  updateDots();
}

// The book covers the whole screen, so taps meant for the book never reach the planet.
// The back button or gesture closes it.
function openBook(cat = currentCat) {
  if (!bookOpen) history.pushState({ book: true }, '');
  bookOpen = true;
  $('#book').classList.remove('hidden');
  $('#book-btn').classList.add('hidden');
  openCategory(cat);
}

function hideBook() {
  bookOpen = false;
  $('#book').classList.add('hidden');
  $('#book-btn').classList.remove('hidden');
}

function closeBook() {
  if (history.state?.book) history.back();
  else hideBook();
}

// Open the book at the page that holds a section and bring the section into view.
function openTab(section) {
  openBook(subjectOf(section).id);
  if (visibleSections(currentCat).length > 1) $(`[data-section="${section}"]`).scrollIntoView({ block: 'start' });
}

$('#book-btn').addEventListener('click', () => openBook());
$('#book-close').addEventListener('click', closeBook);
$('#puzzle-close').addEventListener('click', closePuzzle);
$('#splash').addEventListener('click', hideSplash);
$('#research-bar').addEventListener('click', () => {
  const u = RESEARCH_BY_ID[$('#research-bar').dataset.id];
  if (u) openTab(u.tab);
});
window.addEventListener('popstate', hideBook);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && bookOpen) closeBook();
});

$('#book-game').addEventListener('click', () => openCategory('game'));

/* ================= Astronomy: star signs and planets ================= */

// The zodiac game: one star sign shows each night. The more signs found, the rarer a new one gets:
// the first shows on most nights, the last on one night in 200. Ophiuchus, the hidden 13th, waits until
// all 12 are found and is rarer still. Other nights show a sign already found, or none before the first.
const SIGN_FIRST = 0.6, SIGN_LAST = 0.005, SIGN_HIDDEN = 0.002;

// A number in [0, 1) fixed for this world, night and purpose, so a reload shows the same sky.
function nightRandom(night, salt) {
  let h = (state.seed ^ Math.imul(night, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

// A night runs from 18:00 to 06:00 and is numbered by the day it ends on. Tonight's sign is picked once.
// Eclipse opens the zodiac (worlds that researched the old Star Signs keep it). With all twelve signs found
// the seasons can be foretold, and hurricanes hit half as hard.
const zodiacOpen = () => has('eclipse') || has('starsigns');
const zodiacComplete = () => Sky.SIGNS.filter(s => !s.hidden).every(s => state.signs.includes(s.id));

function updateTonight() {
  if (!state.spinLocked) return;
  const night = Math.floor((state.clock + 6) / 24);
  if (state.tonight?.night === night) return;
  const main = Sky.SIGNS.filter(s => !s.hidden), left = main.filter(s => !state.signs.includes(s.id));
  const pool = left.length ? left : Sky.SIGNS.filter(s => s.hidden && !state.signs.includes(s.id));
  const found = main.length - left.length;
  const chance = left.length ? SIGN_FIRST * (SIGN_LAST / SIGN_FIRST) ** (found / (main.length - 1)) : SIGN_HIDDEN;
  const known = Sky.SIGNS.filter(s => state.signs.includes(s.id));
  let sign = null;
  if (pool.length && nightRandom(night, 1) < chance) sign = pool[Math.floor(nightRandom(night, 2) * pool.length)].id;
  else if (known.length) sign = known[Math.floor(nightRandom(night, 3) * known.length)].id;
  state.tonight = { night, sign };
}

// Tapping a star of a sign, or a planet, in the night sky finds it. Tapping a found one names it.
Scene.onSkyTap((kind, id, x, y) => {
  const list = kind === 'sign' ? state.signs : state.planets;
  const item = (kind === 'sign' ? Sky.SIGNS : Sky.PLANETS).find(o => o.id === id);
  if (list.includes(id)) {
    floatText(x, y - 12, item.name, 'critter good');
    return;
  }
  list.push(id);
  Scene.setSky(state.signs, state.planets);
  announce(`${item.name} discovered`, x, y - 12);
  buzz([20, 30, 20]);
  if (kind === 'sign' && !item.hidden && zodiacComplete()) announce('Zodiac: complete', innerWidth / 2, innerHeight * 0.4, 'disaster big');
});

// A small picture of a star sign: its stars and dotted lines, for the book.
const signPictures = {};
function signPicture(s) {
  if (signPictures[s.id]) return signPictures[s.id];
  const c = document.createElement('canvas');
  c.width = Sky.SIGN_W + 3;
  c.height = Sky.SIGN_H + 3;
  const g = c.getContext('2d');
  g.fillStyle = '#6a8aff';
  for (const [a, b] of s.lines) {
    const [x0, y0] = s.stars[a], [x1, y1] = s.stars[b], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let k = 1; k < n; k += 2) g.fillRect(1 + Math.round(x0 + (x1 - x0) * k / n), 1 + Math.round(y0 + (y1 - y0) * k / n), 1, 1);
  }
  g.fillStyle = '#fff8d0';
  for (const [x, y] of s.stars) g.fillRect(x, y + 1, 3, 1), g.fillRect(x + 1, y, 1, 3);
  return (signPictures[s.id] = c.toDataURL());
}

// A card per sign; the hidden 13th only shows once found.
function renderSigns(force) {
  const root = $('#signs'), key = state.signs.join();
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  const signs = Sky.SIGNS.filter(s => !s.hidden || state.signs.includes(s.id));
  const main = Sky.SIGNS.filter(s => !s.hidden);
  root.innerHTML = `<p class="note">${state.signs.filter(id => main.some(s => s.id === id)).length} of ${main.length} star signs found</p>
    <div class="law-grid">${signs.map(s => state.signs.includes(s.id)
      ? `<div class="law-card sign-card"><img src="${signPicture(s)}" alt=""><span>${s.name}</span></div>`
      : '<div class="law-card unknown"><b>?</b><span></span></div>').join('')}</div>`;
}

// The natural disasters seen so far, how often, and what they do.
function renderDisasters() {
  const root = $('#disasters'), key = JSON.stringify(state.disasters);
  if (root.dataset.key === key) return;
  root.dataset.key = key;
  root.innerHTML = Object.entries(state.disasters).map(([id, n]) =>
    `<p class="note"><b class="disaster-name">${DISASTERS[id].name}</b> · ${n} ${n === 1 ? 'time' : 'times'}<br>${DISASTERS[id].how}</p>`).join('');
}

function renderPlanets(force) {
  const root = $('#planets'), key = state.planets.join() + Hues.key();
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  root.innerHTML = `<p class="note">${state.planets.length} of ${Sky.PLANETS.length} planets found</p>
    <div class="law-grid">${Sky.PLANETS.map(p => state.planets.includes(p.id)
      ? `<div class="law-card"><i class="planet-dot" style="background:${Hues.css(p.color)}"></i><span>${p.name}</span></div>`
      : '<div class="law-card unknown"><b>?</b><span></span></div>').join('')}</div>`;
}

/* ================= Chemistry: the periodic table ================= */

let pickedAtom = null;

// Things found together announce themselves one after another.
let nextFoundAt = 0;

function announce(text, x = innerWidth / 2, y = innerHeight * 0.62, cls = 'atom') {
  const now = performance.now(), at = Math.max(now, nextFoundAt);
  nextFoundAt = at + 700;
  setTimeout(() => floatText(x, y, text, cls), at - now);
}

function discover(sym, x, y) {
  if (state.atoms.includes(sym)) return;
  state.atoms.push(sym);
  announce(`${ATOMS[sym].name} found`, x, y);
}

function findAtoms() {
  for (const [sym, a] of Object.entries(ATOMS)) if (a.found?.()) discover(sym);
  for (const [id, law] of Object.entries(LAWS)) {
    if (state.laws.includes(id) || !law.found()) continue;
    state.laws.push(id);
    announce(`${law.name} discovered`);
  }
}

/* ================= Physics: laws of nature ================= */

let pickedLaw = null;

// A card per law; laws not found yet are question marks.
function renderLaws(force) {
  const root = $('#laws'), key = state.laws.join() + pickedLaw;
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  const ids = Object.keys(LAWS);
  root.innerHTML = `<p class="note">${state.laws.length} of ${ids.length} laws found</p>
    <div class="law-grid">${ids.map(id => state.laws.includes(id)
      ? `<button class="law-card${id === pickedLaw ? ' picked' : ''}" data-id="${id}"><b>${LAWS[id].sign}</b><span>${LAWS[id].name}</span></button>`
      : '<button class="law-card unknown" disabled><b>?</b><span></span></button>').join('')}</div>
    <p class="atom-info">${pickedLaw ? `<b>${LAWS[pickedLaw].name}</b><br>${LAWS[pickedLaw].how}` : 'Tap a law.'}</p>`;
  root.querySelectorAll('.law-card[data-id]').forEach(b => b.addEventListener('click', () => {
    pickedLaw = b.dataset.id;
    renderLaws();
  }));
}

// Found atoms show their symbol; the rest show only their atomic number, waiting to be found.
function renderElements(force) {
  const root = $('#elements'), key = state.atoms.join() + pickedAtom + (state.matter[pickedAtom] || 0);
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  const cells = ELEMENT_SYMBOLS.map((sym, k) => {
    const [row, col] = elementCell(k + 1), found = state.atoms.includes(sym);
    return `<button class="atom${found ? ' found' : ''}${sym === pickedAtom ? ' picked' : ''}" style="grid-area:${row}/${col}"
      ${found ? `data-sym="${sym}"` : 'disabled'}>${found ? sym : k + 1}</button>`;
  }).join('');
  const a = ATOMS[pickedAtom];
  root.innerHTML = `<p class="note">${state.atoms.length} of ${ELEMENT_SYMBOLS.length} atoms found</p>
    <div class="ptable">${cells}</div>
    <p class="atom-info">${a ? `<b>${pickedAtom}</b> ${a.name} · ${ELEMENT_SYMBOLS.indexOf(pickedAtom) + 1}<br>${a.how}${state.matter[pickedAtom] ? `<br>Brought by comets: ${state.matter[pickedAtom]}` : ''}` : 'Tap an atom.'}</p>`;
  root.querySelectorAll('.atom.found').forEach(b => b.addEventListener('click', () => {
    pickedAtom = b.dataset.sym;
    renderElements();
  }));
}

/* ================= Biology: the species index ================= */

let pickedSpecies = null;
const known = s => evolved(s.id) || isExtinct(s.id);

function renderIndex(force) {
  const root = $('#index'), found = SPECIES.filter(known);
  const key = found.map(s => s.id + isExtinct(s.id)).join() + pickedSpecies;
  if (force || root.dataset.key !== key) {
    root.dataset.key = key;
    root.innerHTML = `<p class="note">${found.length} species found · <span class="dna"></span></p>
      <div class="species-grid">${found.map(s => `
        <button class="species-card${isExtinct(s.id) ? ' extinct' : ''}${s.id === pickedSpecies ? ' picked' : ''}" data-id="${s.id}">
          ${spriteImg(s.icon)}<span>${s.name}</span>
        </button>`).join('')}</div>
      <div class="species-info"></div>`;
    root.querySelectorAll('.species-card').forEach(b => b.addEventListener('click', () => {
      pickedSpecies = b.dataset.id;
      renderIndex();
    }));
  }
  const c = tempC(), window = `life window ${LIFE_WINDOW[0]} to ${LIFE_WINDOW[1]}°C`;
  root.querySelector('.dna').textContent = `${c < LIFE_WINDOW[0] ? `too cold, ${window}` : c > LIFE_WINDOW[1] ? `too hot, ${window}` : window}`;
  const s = SPECIES_BY_ID[pickedSpecies], info = root.querySelector('.species-info');
  if (!s) {
    info.innerHTML = '<p class="note">Tap a species.</p>';
    return;
  }
  const rows = [
    ['Status', isExtinct(s.id) ? 'Extinct' : lifeState(s)],
    ...(isExtinct(s.id) ? [] : [['Population', pct(pop(s.id))]]),
    ['Lives at', `${s.temp[0]} to ${s.temp[1]}°C`],
    ['Home', (s.home || ['sea']).join(', ')],
    ...(s.parent ? [['Evolved from', SPECIES_BY_ID[s.parent].name]] : []),
    ...(s.o2 ? [['Makes', 'oxygen']] : []),
  ];
  info.innerHTML = `<div class="species-head">${spriteImg(s.icon)}<div><b>${s.name}</b><p>${s.desc}</p></div></div>
    <dl class="stats">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

/* ================= Life tab: the tree of life ================= */

const STATUS_TEXT = { alive: 'Alive', extinct: 'Extinct', available: 'Evolve', waiting: 'Later', blocked: 'Blocked' };

// Why a species cannot evolve yet, in a few words.
function waitReason(s) {
  if (!evolved(s.parent)) return `after ${SPECIES_BY_ID[s.parent].name}`;
  if (!seen(DOMAIN_OPENS[s.domain]) || !opened(s)) return '???';
  if (!parentReady(s)) return `${SPECIES_BY_ID[s.parent].name} at 50%`;
  return `${fmt(s.cost)} DNA`;
}

function lifeNode(s) {
  const status = speciesStatus(s), p = pop(s.id);
  // Only species next to the known tree show their name; deeper ones stay a mystery.
  const known = status !== 'waiting' || evolved(s.parent) || isExtinct(s.parent);
  const blockedBy = status === 'blocked' ? [...ancestors(s)].find(a => isExtinct(a.id)) : null;
  let detail = '';
  if (status === 'alive') {
    const dying = fitness(s, tempC()) < 0 || p > habitat(s) + 0.01;
    detail = `<span class="bar"><i style="width:${pct(p)}"></i></span>${dying ? '<em class="warn">dying</em>' : pct(p)}`;
  } else if (status === 'available') detail = `${fmt(s.cost)} DNA`;
  else if (status === 'waiting') detail = known ? waitReason(s) : '';
  else if (status === 'blocked') {
    const below = countDescendants(s);
    detail = `no ${blockedBy.name}${below ? ` · +${below}` : ''}`;
  }
  else if (status === 'extinct') detail = `${s.temp[0]}–${s.temp[1]}°C`;
  const affordable = status === 'available' && state.dna >= s.cost ? ' affordable' : '';
  // A blocked branch collapses into its first species; everything below it is blocked too.
  const kids = status === 'blocked' ? [] : CHILDREN[s.id] || [];
  return `<li>
    <div class="node ${status}${affordable}" data-id="${s.id}">
      <span class="node-icon">${known ? spriteImg(s.icon) : '<span class="q">?</span>'}</span>
      <span class="node-name">${known ? s.name : '???'}</span>
      <span class="node-detail">${detail}</span>
      <span class="node-status">${STATUS_TEXT[status]}</span>
    </div>
    ${kids.length ? `<ul>${kids.map(lifeNode).join('')}</ul>` : ''}
  </li>`;
}

function countDescendants(s) {
  return (CHILDREN[s.id] || []).reduce((n, k) => n + 1 + countDescendants(k), 0);
}

function* ancestors(s) {
  for (let a = SPECIES_BY_ID[s.parent]; a; a = SPECIES_BY_ID[a.parent]) yield a;
}

function renderLife() {
  const root = $('#life'), t = treeSummary();
  const scroll = $('#panel').scrollTop;
  root.innerHTML = `
    <p class="note">${fmt(state.dna)} DNA (+${fmt(rates.dna)}/s)</p>
    <div class="tree-summary">
      <span class="alive">${t.alive} alive</span>
      <span class="available">${t.available} ready</span>
      <span class="waiting">${t.waiting} later</span>
      <span class="blocked">${t.blocked} blocked</span>
      <span class="extinct">${t.extinct} extinct</span>
    </div>
    <ul class="tree">${lifeNode(SPECIES[0])}</ul>`;
  $('#panel').scrollTop = scroll;
  root.querySelectorAll('.node.available').forEach(n => n.addEventListener('click', () => {
    choose({ kind: 'species', item: SPECIES_BY_ID[n.dataset.id] });
    renderLife();
  }));
}

/* ================= World tab ================= */

function renderWorld() {
  $('#stats').innerHTML = `<dt>Time played</dt><dd>${fmtTime((Date.now() - state.start) / 1000)}</dd>`;
}

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

// Swiping the planet spins it. At half spin the planet throws off a blob of molten rock: the moon.
// At full spin the spin locks for good and days begin.
Scene.onSpin(amount => {
  if (state.spinLocked || state.over) return;
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
  if (bandHunt('radio') && Scene.spotCount('band') === 0 && Math.random() < 0.4) Scene.glimmer('radio', { x, y: y - 20 }, 4);
  // Once thunderstorms are known, a bolt into dry plants can start a wildfire.
  if (zone === 'ground' && hit?.u >= 0 && has('storms') && !(state.rainbowShield > 0) && Math.random() < WILDFIRE_CHANCE * (state.drought > 0 ? 2 : 1) && Terrain.ignite(hit.u, hit.v, 5 + Math.random() * 5)) {
    disaster('wildfire', x, y);
  }
  // The soup of life forms where lightning strikes tidal pools: warm, shallow, rich water that dries and wets.
  if (zone === 'ocean' && seen('storms') && !seen('life') && !(has('pools') && has('rna'))) {
    // Lightning on the open sea alone makes no soup; it takes tidal pools and RNA, the first genes.
  } else if (zone === 'ocean' && seen('storms') && !seen('life')) {
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
  $('#gameover').classList.add('hidden');
  recalc();
  if (bookOpen) closeBook();
}

$('#gameover-restart').addEventListener('click', newGame);

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
  Scene.setHeatView(state.heatView && allBands());
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
  } else if (!state.over) simulate(dt);
  state.lastTick = Date.now();
  Scene.setCinema(!state.banged ? 'pre' : movieP !== null ? 'warp' : null, !state.banged ? state.bang : movieP, warpSpeed);
  document.body.classList.toggle('cinema', inCinema());
  Scene.setDay(state.spinLocked, state.clock % 24, state.clock / 24);
  Scene.setStars(has('starlight'), zodiacOpen(), has('wanderers'));
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
    checkGameOver();
    updateScene(c);
    stepFires(0.2);
    if (!state.over) {
      disasterTick(0.2, now);
      playTick(0.2);
      bandTick(0.2);
      auroraTick(0.2);
      eclipseTick(0.2);
      collectTick(0.2);
      storyTick();
    }
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
    ref(!st.disaster || DISASTERS[st.disaster], `story ${st.id}: unknown disaster ${st.disaster}`);
    ref(!st.ultra || RESEARCH_BY_ID[st.ultra]?.ultra, `story ${st.id}: ultra ${st.ultra} is not an ultra research`);
    ref(!st.minigame || MINIGAMES[st.minigame], `story ${st.id}: unknown minigame ${st.minigame}`);
  }
  for (const c of SUBJECTS) c.sections.forEach(sec => ref(SECTIONS[sec], `subject ${c.id}: unknown section ${sec}`));
  Object.keys(SECTIONS).forEach(sec => ref(SECTION_UNLOCKED[sec], `section ${sec}: no SECTION_UNLOCKED`));
  Object.values(DISASTER_ODDS).forEach((d, i) => ref(d.when, `disaster ${Object.keys(DISASTER_ODDS)[i]}: no DISASTER_WHEN`));
  Object.keys(LAWS).forEach(id => ref(LAWS[id].found, `law ${id}: no LAW_FOUND`));
  BANDS.forEach(b => ref(BAND_GLIMMER[b.id], `band ${b.id}: no BAND_GLIMMER`));
  GLOWS.forEach(g => ref(GLOW_IN_AIR[g.id], `glow ${g.id}: no GLOW_IN_AIR`));
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
updateColors(0);
updateScene(tempC());   // the scene works out the climate zones that habitats depend on
applyOffline();
updateScene(tempC());
updateDots();
Scene.setSky(state.signs, state.planets);
if (state.over) showGameOver();
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
    navigator.serviceWorker.register('sw.js').then(reg => {
      setInterval(() => !document.hidden && reg.update(), 30 * 60 * 1000);
    }).catch(() => {});
  } else {
    navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
    window.caches?.keys().then(keys => keys.forEach(k => caches.delete(k)));
  }
}
