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
const SAVE_VERSION = 0;          // bump with a new step in MIGRATIONS when old saves need fixing
const OFFLINE_RATE = 0.5;          // fraction of production earned while away
const OFFLINE_CAP_S = 12 * 3600;   // max offline time counted
const KELVIN = 273.15;
const CORE_K = 35;                 // surface of a planet with no sun, warmed only by its core (spec: Climate scale)
const START_LAND = 0.3;            // share of the planet that is land at the start; volcanoes build more
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
  { id: 'thaw', happens: () => tempC() >= 0 },
  { id: 'ocean', happens: () => openOcean() >= 0.3 },
  { id: 'storms', happens: () => state.clouds >= STORM_CLOUDS && has('lightning') },
  { id: 'life', happens: () => state.soup >= SOUP_FULL },
  { id: 'cells', happens: () => pop('cell') >= 0.5 },
  { id: 'ozone', happens: () => ozone() >= OZONE_FOR_LAND },
  { id: 'flight', happens: () => evolved('flyer') },
];
const seen = id => state.happened.includes(id);

// Panel sections. Each one shows its research and species once unlocked.
// Story order: spin the planet (Core), the moon flies out, the spin locks (Land, the sun rises), light the sun,
// research the Magnetic Field, then the air can stay (Atmosphere).
const SECTIONS = {
  core: { name: 'Core', unlocked: () => true },
  land: { name: 'Crust', unlocked: () => state.spinLocked },
  moon: { name: 'Moon', unlocked: () => state.moonBorn },
  sun: { name: 'Sun', unlocked: () => state.spinLocked },
  atmosphere: { name: 'Atmosphere', unlocked: () => has('magnet') },
  noble: { name: 'Noble gases', unlocked: () => has('magnet') },
  ocean: { name: 'Ocean', unlocked: () => seen('thaw') },
  oceanlife: { name: 'Ocean life', unlocked: () => seen('life') },
  landlife: { name: 'Land life', unlocked: () => seen('ozone') },
  airlife: { name: 'Air life', unlocked: () => seen('flight') },
  life: { name: 'Tree of life', unlocked: () => seen('life') },
  elements: { name: 'Periodic table', unlocked: () => state.atoms.length > 0 },
  laws: { name: 'Laws of nature', unlocked: () => state.laws.length > 0 },
  stars: { name: 'Stars', unlocked: () => state.spinLocked },
  comets: { name: 'Comets', unlocked: () => state.comets > 0 },
  molecules: { name: 'Molecules', unlocked: () => state.atoms.length >= 2 },
  disasters: { name: 'Natural disasters', unlocked: () => Object.keys(state.disasters).length > 0 },
  signs: { name: 'Star signs', unlocked: () => state.signs.length > 0 },
  planets: { name: 'Planets', unlocked: () => state.planets.length > 0 },
  index: { name: 'Species', unlocked: () => SPECIES.some(known) },
  world: { name: 'Game', unlocked: () => true },
};

// The science book: one tab per subject, each a page of sections. Subjects with nothing unlocked stay blank.
// The tabs are colored squares in spectrum order, red to purple, then brown and pink.
const SUBJECTS = [
  { id: 'math', name: 'Math', color: '#ff5a4a', sections: [] },
  { id: 'physics', name: 'Physics', color: '#ffa03a', sections: ['laws'] },
  { id: 'astronomy', name: 'Astronomy', color: '#ffe04a', sections: ['sun', 'moon', 'stars', 'comets', 'signs', 'planets'] },
  { id: 'biology', name: 'Biology', color: '#6ee07a', sections: ['life', 'index', 'oceanlife', 'landlife', 'airlife'] },
  { id: 'oceanography', name: 'Oceanography', color: '#5a8aff', sections: ['ocean'] },
  { id: 'chemistry', name: 'Chemistry', color: '#b07aff', sections: ['elements', 'molecules', 'noble'] },
  { id: 'geology', name: 'Geology', color: '#b07a4a', sections: ['core', 'land', 'atmosphere', 'disasters'] },
  { id: 'sociology', name: 'Sociology', color: '#ff8ad8', sections: [] },
  // Not a subject: the game page (time played, reset, version), opened from the book's header.
  { id: 'game', name: 'Game', color: '#a09cc8', sections: ['world'], hidden: true },
];
const SUBJECT_BY_ID = Object.fromEntries(SUBJECTS.map(c => [c.id, c]));
const subjectOf = section => SUBJECTS.find(c => c.sections.includes(section));

const VOLCANO_CO2 = 12;      // ppm CO2/s from one volcano at full activity
const VOLCANO_DUST = 0.05;   // ash from one volcano
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
  matter: { label: ([sym, n]) => `${n} ${sym}`, met: ([sym, n]) => (state.matter[sym] || 0) >= n, progress: ([sym]) => state.matter[sym] || 0 },
  // A link to another branch of the tree: that research must be done first.
  done: { label: id => RESEARCH_BY_ID[id].name, met: id => has(id) },
};
const needMet = ([kind, v]) => (NEEDS[kind].met ? NEEDS[kind].met(v) : NEEDS[kind].now() >= v);

// The research tree. Each node shows only its name and what it needs until researched, then a gauge.
// A node appears once everything in `requires` is researched and its `after` event has happened. It can be researched
// once every condition in `needs` holds; the player chooses when. Research takes `days` game days, and only one
// node is researched at a time, so the player picks an order. `replaces` hides the earlier node of a chain.
//
// What a node does once researched is all on the node. A field is a number, or a function of the planet now:
//   sun, volcanoes, eruptionSize, lightning   the highest among researched nodes wins
//   minerals, ch4, cloudRate, albedo, iceShift   added up (per second, or share of sunlight, or °C)
//   cloudMult, rainMult, boltMult, weatherMult, dieOff, landMult   multiplied together
//   dnaMult      DNA multiplier per domain ({ ocean, ground, atmosphere } or { all })
//   tick(dt)     changes the planet every frame (gases build up, mountains rise)
// The features a node puts on the map are set in updateScene.
const RESEARCH = [
  // Sun: it brightens as it ages, as the real sun did (70% of today's light at birth).
  { id: 'sun1', icon: 'sunicon', tab: 'sun', after: 'sunlit', needs: [['sunAge', 0.5]], days: 1, name: 'Sunlight', sun: 0.78, gauge: sunGauge },
  { id: 'sun2', icon: 'sunicon', tab: 'sun', after: 'sunlit', requires: ['sun1'], replaces: 'sun1', needs: [['sunAge', 1.5]], days: 1, name: 'Brighter Sun', sun: 0.86, gauge: sunGauge },
  { id: 'sun3', icon: 'sunicon', tab: 'sun', after: 'sunlit', requires: ['sun2'], replaces: 'sun2', needs: [['sunAge', 3]], days: 1, name: 'Main Sequence', sun: 0.93, gauge: sunGauge },
  { id: 'sun4', icon: 'sunicon', tab: 'sun', after: 'sunlit', requires: ['sun3'], replaces: 'sun3', needs: [['sunAge', 4.5]], days: 1, name: 'Mature Sun', sun: 1, gauge: sunGauge },
  { id: 'uv', icon: 'sunicon', tab: 'sun', after: 'life', needs: [['species', 3], ['done', 'sun2']], days: 1, name: 'Ultraviolet', dnaMult: { all: 1.25 }, gauge: () => [logLevel(rates.dna, 1000), `${fmt(rates.dna)} DNA/s`] },
  // Atmosphere: each frozen gas can thaw at its real melting or boiling point.
  // Chemistry: molecules. Each needs enough of its atoms, brought down by comets, and opens the gas it makes.
  { id: 'mN2', icon: 'flask', tab: 'molecules', needs: [['matter', ['N', 2]]], days: 0.5, name: 'N₂', gauge: () => [1, 'Two nitrogen atoms: nitrogen gas'] },
  { id: 'mCH4', icon: 'flask', tab: 'molecules', needs: [['matter', ['C', 3]], ['matter', ['H', 3]]], days: 0.5, name: 'CH₄', gauge: () => [1, 'One carbon, four hydrogens: methane'] },
  { id: 'mH2O', icon: 'flask', tab: 'molecules', needs: [['matter', ['H', 4]], ['matter', ['O', 3]]], days: 0.5, name: 'H₂O', gauge: () => [1, 'Two hydrogens, one oxygen: water'] },
  { id: 'mCO2', icon: 'flask', tab: 'molecules', needs: [['matter', ['C', 6]], ['matter', ['O', 6]]], days: 1, name: 'CO₂', gauge: () => [1, 'One carbon, two oxygens: carbon dioxide'] },
  { id: 'mO2', icon: 'flask', tab: 'molecules', after: 'cells', requires: ['mH2O'], days: 1, name: 'O₂', gauge: () => [1, 'Two oxygens: the gas life breathes'] },
  { id: 'mO3', icon: 'flask', tab: 'molecules', after: 'cells', requires: ['mO2'], needs: [['oxygen', 0.3]], days: 1, name: 'O₃', gauge: () => [1, 'Three oxygens: ozone'] },
  { id: 'ozonegas', icon: 'cloud', tab: 'atmosphere', after: 'cells', requires: ['uv'], needs: [['done', 'mO3']], days: 2, name: 'Ozone Layer',
    gauge: () => [ozone(), `${pct(ozone())} · O₂ ${state.o2.toFixed(2)}%`] },
  { id: 'thawN2', icon: 'cloud', tab: 'atmosphere', needs: [['temp', -210], ['done', 'mN2']], days: 0.5, name: 'Nitrogen', tick: dt => (state.pressure = Math.min(1, state.pressure + 0.08 * dt)), gauge: () => [state.pressure, `${state.pressure.toFixed(2)} bar`] },
  { id: 'thawCH4', icon: 'cloud', tab: 'atmosphere', needs: [['temp', -161], ['done', 'mCH4']], days: 0.5, name: 'Methane', tick: dt => thaw('ch4', 2 * dt), gauge: () => [logLevel(state.ch4, 30), `${state.ch4.toFixed(1)} ppm · +${gasWarming('ch4').toFixed(0)}°C`] },
  { id: 'thawCO2', icon: 'cloud', tab: 'atmosphere', needs: [['temp', -78], ['done', 'mCO2']], days: 1, name: 'Carbon Dioxide', tick: dt => thaw('co2', 120 * dt), gauge: () => [logLevel(state.co2, 1e5), `${fmt(state.co2)} ppm · +${gasWarming('co2').toFixed(0)}°C`] },
  // Noble gases: they react with nothing, so they do nothing to the climate. Each can exist as gas above its
  // boiling point. Helium (uranium decay) and argon (potassium decay) come out with volcanic gas; radon seeps
  // from moving crust and decays within days; neon, krypton and xenon arrive with comets and just stay.
  // Helium escapes to space about as fast as decaying rock makes it; argon-40 builds up to about 0.93% of the
  // air; radon has a 3.8-day half-life.
  { id: 'helium', icon: 'cloud', tab: 'noble', needs: [['temp', -269], ['done', 'volcano']], days: 0.5, name: 'Helium', tick: dt => (state.he += (0.1 - state.he * 0.02) * dt), gauge: () => [clamp01(state.he / 6), `${state.he.toFixed(2)} ppm`] },
  { id: 'neon', icon: 'cloud', tab: 'noble', needs: [['temp', -246], ['comets', 1]], days: 0.5, name: 'Neon', gauge: () => [0.5, '18 ppm'] },
  { id: 'argon', icon: 'cloud', tab: 'noble', needs: [['temp', -186], ['done', 'volcano']], days: 0.5, name: 'Argon', tick: dt => (state.ar = Math.min(9340, state.ar + 0.5 * volcanoes() * dt)), gauge: () => [state.ar / 9340, `${fmt(state.ar)} ppm`] },
  { id: 'krypton', icon: 'cloud', tab: 'noble', needs: [['temp', -153], ['comets', 2]], days: 0.5, name: 'Krypton', gauge: () => [0.3, '1.1 ppm'] },
  { id: 'xenon', icon: 'cloud', tab: 'noble', needs: [['temp', -108], ['comets', 3]], days: 0.5, name: 'Xenon', gauge: () => [0.1, '0.09 ppm'] },
  { id: 'radon', icon: 'cloud', tab: 'noble', needs: [['temp', -62], ['done', 'plates']], days: 0.5, name: 'Radon', tick: dt => (state.rn += (1000 / DAY_S - state.rn * Math.LN2 / (3.8 * DAY_S)) * dt), gauge: () => [clamp01(state.rn / 6000), `${fmt(state.rn)} atoms/L`] },
  { id: 'clouds', icon: 'cloud', tab: 'atmosphere', after: 'thaw', requires: ['evap'], needs: [['water', 10], ['air', 0.5]], days: 2, name: 'Clouds', cloudRate: () => cloudFormation(), gauge: () => [state.clouds, `${pct(state.clouds)} cover`] },
  { id: 'evap', icon: 'cloud', tab: 'atmosphere', after: 'thaw', requires: ['currents'], needs: [['temp', 10], ['done', 'mH2O']], days: 2, name: 'Evaporation', cloudMult: 1.5, gauge: () => [clamp01(rates.clouds / 0.05), `+${(rates.clouds * 100).toFixed(1)}% cover/s`] },
  { id: 'rain', icon: 'cloud', tab: 'atmosphere', after: 'thaw', requires: ['clouds'], needs: [['clouds', 10]], days: 1, name: 'Rain', gauge: rainGauge },
  { id: 'downpour', icon: 'cloud', tab: 'atmosphere', after: 'thaw', requires: ['rain'], replaces: 'rain', needs: [['clouds', 25]], days: 2, name: 'Downpour', rainMult: 3, gauge: rainGauge },
  { id: 'lightning', icon: 'bolt', tab: 'atmosphere', after: 'thaw', requires: ['rain'], needs: [['clouds', 20]], days: 2, name: 'Lightning',
    gauge: () => (seen('life') ? [logLevel(state.strikes, 1000), `${fmt(state.strikes)} strikes`] : [state.soup / SOUP_FULL, `Soup ${pct(state.soup / SOUP_FULL)}`]) },
  { id: 'storms', icon: 'bolt', tab: 'atmosphere', after: 'storms', requires: ['lightning'], needs: [['strikes', 10]], days: 2, name: 'Thunderstorms', lightning: 0.4,
    climax: () => { disaster('thunderstorm'); stormBurst = 10; }, gauge: () => [clamp01(rates.lightning / 0.4), `${(rates.lightning * 60).toFixed(0)} strikes/min`] },
  { id: 'bigbolt', icon: 'bolt', tab: 'atmosphere', after: 'storms', requires: ['storms'], needs: [['strikes', 25]], days: 2, name: 'Bigger Bolts', boltMult: 2, gauge: soupGauge },
  // Core: the spinning iron inside. A steady spin makes it a dynamo.
  { id: 'solarwind', icon: 'sunicon', tab: 'sun', after: 'cells', requires: ['ozonegas'], needs: [['done', 'magnet']], days: 2, name: 'Solar Wind', climax: () => solarStorm(),
    gauge: () => [clamp01((state.disasters.solarstorm || 0) / 5), `${state.disasters.solarstorm || 0} solar storms`] },
  // Stars: the night sky shows nothing until the planet learns to look. Starlight lights the stars,
  // Star Signs lets their shapes be found, and Wandering Stars shows the planets moving among them.
  { id: 'starlight', icon: 'planet', tab: 'stars', needs: [['days', 2]], days: 1, name: 'Starlight' },
  { id: 'starsigns', icon: 'planet', tab: 'stars', requires: ['starlight'], needs: [['days', 6]], days: 2, name: 'Star Signs',
    gauge: () => [state.signs.length / 12, `${state.signs.length} star signs found`] },
  { id: 'wanderers', icon: 'planet', tab: 'stars', requires: ['starsigns'], needs: [['signs', 3]], days: 2, name: 'Wandering Stars',
    gauge: () => [state.planets.length / Sky.PLANETS.length, `${state.planets.length} planets found`] },
  // Visitors from space: the finale.
  { id: 'cometpaths', icon: 'planet', tab: 'comets', needs: [['comets', 5]], days: 2, name: 'Comet Paths', gauge: () => [clamp01(state.comets / 50), `${fmt(state.comets)} comets caught`] },
  { id: 'orbits', icon: 'planet', tab: 'comets', requires: ['cometpaths'], needs: [['planets', 3]], days: 3, name: 'Orbits', gauge: () => [state.planets.length / Sky.PLANETS.length, `${state.planets.length} planets found`] },
  { id: 'asteroids', icon: 'planet', tab: 'comets', after: 'flight', requires: ['orbits'], needs: [['species', 12]], days: 3, name: 'Asteroid Belt', climax: () => asteroidImpact(),
    gauge: () => [state.ages ? 1 : 0, state.ages ? 'The impact ended an age' : 'Rocks on the move'] },
  { id: 'magnet', icon: 'vent', tab: 'core', needs: [['spin', 100]], days: 1, name: 'Magnetic Field', gauge: () => [state.pressure, `${state.pressure.toFixed(2)} bar of air kept`] },
  // Land: the crust. Volcanoes build land, plates move it (water helps them slide), collisions pile up mountains.
  { id: 'volcano', icon: 'vent', tab: 'land', after: 'sunlit', days: 0.5, name: 'Volcanoes', volcanoes: 5, gauge: volcanoGauge },
  { id: 'lavafields', icon: 'vent', tab: 'land', after: 'sunlit', requires: ['volcano'], needs: [['eruptions', 2]], days: 1, name: 'Lava Fields', landMult: 2,
    gauge: () => [state.land / MAX_LAND, `${pct(state.land)} land`] },
  { id: 'supervolcano', icon: 'vent', tab: 'land', after: 'sunlit', requires: ['lavafields'], replaces: 'volcano', needs: [['eruptions', 5]], days: 2, name: 'Supervolcanoes', volcanoes: 15, eruptionSize: 2.5, gauge: volcanoGauge,
    climax: () => erupt(-1, true) },
  { id: 'plates', icon: 'mountain', tab: 'land', after: 'sunlit', requires: ['volcano'], needs: [['water', 5]], days: 3, name: 'Plate Tectonics', weatherMult: 1.5, gauge: () => [logLevel(rates.weathering, 100), `−${fmt(rates.weathering)} ppm CO₂/s`] },
  { id: 'collision', icon: 'mountain', tab: 'land', after: 'thaw', requires: ['plates'], needs: [['land', 35]], days: 4, name: 'Collision', tick: dt => (state.mountains = Math.min(1, state.mountains + 0.004 * (1 - state.mountains) * dt)), gauge: () => [state.mountains, `${pct(state.mountains)} mountains`] },
  // Snow piles up on the peaks into glaciers; their meltwater and the rain run down as rivers, which fill hollows into lakes.
  { id: 'faults', icon: 'mountain', tab: 'land', after: 'thaw', requires: ['collision'], needs: [['mountains', 30]], days: 3, name: 'Fault Lines', climax: () => quake(),
    gauge: () => [clamp01((state.disasters.earthquake || 0) / 5), `${state.disasters.earthquake || 0} earthquakes`] },
  { id: 'glaciers', icon: 'mountain', tab: 'land', after: 'thaw', requires: ['collision'], needs: [['mountains', 20], ['done', 'clouds']], days: 3, name: 'Mountain Glaciers', albedo: () => 0.02 * glacierIce(),
    gauge: () => [glacierIce(), `${pct(glacierIce())} snow on peaks`] },
  { id: 'rivers', icon: 'wave', tab: 'land', after: 'thaw', requires: ['glaciers'], needs: [['temp', 1], ['done', 'rain']], days: 3, name: 'Rivers', minerals: () => 2 * riverFlow(), weatherMult: () => 1 + 0.5 * riverFlow(),
    gauge: () => [riverFlow(), riverFlow() > 0 ? `${pct(riverFlow())} flow` : 'frozen'] },
  { id: 'lakes', icon: 'wave', tab: 'land', after: 'thaw', requires: ['rivers'], needs: [['mountains', 40]], days: 3, name: 'Lakes', dnaMult: { ground: 1.5 },
    gauge: () => [clamp01(Terrain.lakeCount() / 12), `${Terrain.lakeCount()} lakes`] },
  // Ocean
  { id: 'currents', icon: 'wave', tab: 'ocean', after: 'thaw', needs: [['water', 20], ['done', 'thawN2']], days: 2, name: 'Ocean Currents', iceShift: 4, gauge: () => [1 - state.ice, `${pct(state.ice)} ice`] },
  { id: 'vents', icon: 'vent', tab: 'ocean', after: 'thaw', needs: [['water', 10], ['done', 'plates']], days: 2, name: 'Hydrothermal Vents', minerals: 1, ch4: 0.025, gauge: () => [logLevel(state.minerals, 1e4), `${fmt(state.minerals)} minerals`] },
  // Moon: its tides need open water; its pull slowly lengthens the day.
  { id: 'tides', icon: 'wave', tab: 'moon', after: 'thaw', needs: [['water', 15]], days: 2, name: 'Tides', iceShift: 2, gauge: () => [openOcean() / (1 - state.land), `${pct(openOcean())} open water`] },
  { id: 'pools', icon: 'wave', tab: 'moon', after: 'thaw', requires: ['tides'], needs: [['water', 30], ['minerals', 50]], days: 2, name: 'Tidal Pools', boltMult: 2, gauge: soupGauge },
  { id: 'tilt', icon: 'wave', tab: 'moon', after: 'thaw', requires: ['pools'], climax: () => hurricane() || disaster('hurricane'), needs: [['days', 30]], days: 3, name: 'Stable Tilt', dieOff: 0.5,
    gauge: () => { const n = SPECIES.filter(sp => evolved(sp.id)).length; return [n / SPECIES.length, `${n} species alive`]; } },
  // Life
  { id: 'shallows', icon: 'wave', tab: 'oceanlife', after: 'cells', needs: [['species', 5], ['done', 'collision']], days: 2, name: 'Shallow Seas', dnaMult: { ocean: 2 },
    gauge: () => [Terrain.zones().reef, `${pct(Terrain.zones().reef)} reef${Terrain.zones().bleached > 0.005 ? ` · ${pct(Terrain.zones().bleached)} bleached` : ''}`] },
  { id: 'soil', icon: 'plant', tab: 'landlife', after: 'ozone', needs: [['plants', 1], ['done', 'rivers']], days: 2, name: 'Soil', dnaMult: { ground: 2 },
    gauge: () => [Terrain.biomes().green, `${pct(Terrain.biomes().green)} green · ${pct(Terrain.biomes().desert)} desert`] },
  // Biomes: where each can grow depends on the local climate, so they shift as the planet warms or cools.
  // Deserts spread in the heat and cut land life.
  { id: 'grass', icon: 'plant', tab: 'landlife', after: 'ozone', requires: ['soil'], needs: [['plants', 2]], days: 2, name: 'Grasslands', dnaMult: { ground: 1.5 },
    gauge: () => [Terrain.biomes().grass, `${pct(Terrain.biomes().grass)} grassland · ${pct(Terrain.biomes().desert)} desert`] },
  { id: 'forests', icon: 'tree', tab: 'landlife', after: 'ozone', requires: ['grass'], needs: [['plants', 3]], days: 3, name: 'Forests', dnaMult: { ground: 1.5 },
    gauge: () => [Terrain.biomes().forest, `${pct(Terrain.biomes().forest)} forest`] },
  { id: 'wetlands', icon: 'plant', tab: 'landlife', after: 'ozone', requires: ['soil'], climax: () => flood() || disaster('flood'), needs: [['done', 'lakes'], ['temp', 5]], days: 2, name: 'Wetlands', dnaMult: { ground: 1.5 }, ch4: () => wetlandMethane(),
    gauge: () => [clamp01(Terrain.biomes().wetland * 10), `${pct(Terrain.biomes().wetland)} wetland · +${wetlandMethane().toFixed(2)} ppm CH₄/s`] },
  // Deep roots reach water far down and hold the soil, so the desert edge pulls back.
  { id: 'roots', icon: 'plant', tab: 'landlife', after: 'ozone', requires: ['forests'], climax: () => drought(), needs: [['desert', 15], ['plants', 2]], days: 3, name: 'Deep Roots',
    gauge: () => [1 - Terrain.biomes().desert, `${pct(Terrain.biomes().desert)} desert`] },
];
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

// The tree of life for this slice. Habitat (domain) decides which event a species waits for (DOMAIN_OPENS).
// dna and o2 are per second at full population. temp is the global mean range (°C) the species can live in.
// home lists the climate zones a land species lives in (see Terrain.zones); its population can only fill
// as much as those zones allow, so spreading deserts or ice push it back. `plenty` is the share of its zones
// that holds a full population (default 60%); reef species need far less. `research` must be done before
// the species can evolve.
const SPECIES = [
  { id: 'cell', icon: 'cell', domain: 'ocean', name: 'First Cell', desc: 'A blob of chemistry that copies itself.', dna: 0.5, temp: [0, 80] },
  { id: 'cyano', icon: 'cell', domain: 'ocean', parent: 'cell', name: 'Cyanobacteria', desc: 'Turns sunlight into sugar. Oxygen is the waste.', cost: 10, dna: 1, o2: 0.0015, temp: [0, 70] },
  { id: 'algae', icon: 'algae', domain: 'ocean', parent: 'cyano', name: 'Green Algae', desc: 'Pond scum with ambition.', cost: 40, dna: 1.5, o2: 0.002, temp: [0, 45] },
  { id: 'sponge', icon: 'cell', domain: 'ocean', parent: 'cyano', name: 'Sponges', desc: 'The first animals. They mostly sit there.', cost: 60, dna: 2, temp: [2, 38] },
  { id: 'plankton', icon: 'algae', domain: 'ocean', parent: 'algae', name: 'Phytoplankton', desc: 'Tiny drifters that make most of the oxygen.', cost: 150, dna: 3, o2: 0.004, temp: [0, 40] },
  { id: 'worm', icon: 'worm', domain: 'ocean', parent: 'sponge', name: 'Worms', desc: 'A body with a front and a back. Revolutionary.', cost: 220, dna: 3, temp: [2, 38] },
  { id: 'jelly', icon: 'jelly', domain: 'ocean', parent: 'sponge', name: 'Jellyfish', desc: 'No brain, no problem.', cost: 300, dna: 4, temp: [2, 40] },
  { id: 'arthropod', icon: 'bug', domain: 'ocean', parent: 'worm', name: 'Arthropods', desc: 'Armor and legs. Lots of legs.', cost: 700, dna: 6, temp: [4, 36] },
  { id: 'chordate', icon: 'fish', domain: 'ocean', parent: 'worm', name: 'Chordates', desc: 'A rod down the back. The start of a spine.', cost: 800, dna: 6, temp: [4, 36] },
  { id: 'trilobite', icon: 'bug', domain: 'ocean', parent: 'arthropod', name: 'Trilobites', desc: 'Sea-floor crawlers. Future fossils.', cost: 1500, dna: 10, temp: [4, 34] },
  { id: 'fish', icon: 'fish', domain: 'ocean', parent: 'chordate', name: 'Fish', desc: 'Fins, gills and a backbone.', cost: 2000, dna: 12, temp: [4, 34] },
  { id: 'shark', icon: 'fish', domain: 'ocean', parent: 'fish', name: 'Sharks', desc: 'Older than trees. Still hungry.', cost: 5000, dna: 25, temp: [6, 36] },
  { id: 'lobefin', icon: 'fish', domain: 'ocean', parent: 'fish', name: 'Lobe-finned Fish', desc: 'Fins that look suspiciously like legs.', cost: 6000, dna: 25, temp: [6, 34] },
  { id: 'coral', icon: 'coral', domain: 'ocean', parent: 'jelly', research: 'shallows', name: 'Corals', desc: 'Tiny animals that build stone gardens.', cost: 3000, dna: 20, temp: [8, 30], home: ['reef'], plenty: 0.03 },
  { id: 'reeffish', icon: 'reeffish', domain: 'ocean', parent: 'fish', research: 'shallows', name: 'Reef Fish', desc: 'Bright colors, small territories.', cost: 8000, dna: 35, temp: [8, 32], home: ['reef'], plenty: 0.03 },
  { id: 'moss', icon: 'plant', domain: 'ground', parent: 'algae', name: 'Mosses', desc: 'The first plants on land. Green, soft, damp.', cost: 4000, dna: 15, o2: 0.004, green: 0.25, temp: [2, 34], home: ['wet', 'moist', 'cold'] },
  { id: 'fern', icon: 'plant', domain: 'ground', parent: 'moss', name: 'Ferns', desc: 'Plants with plumbing. They can grow tall.', cost: 10000, dna: 30, o2: 0.006, green: 0.3, temp: [6, 36], home: ['wet'] },
  { id: 'insect', icon: 'bug', domain: 'ground', parent: 'arthropod', name: 'Insects', desc: 'Six legs, endless numbers.', cost: 12000, dna: 40, temp: [8, 38], home: ['wet', 'moist'] },
  { id: 'conifer', icon: 'tree', domain: 'ground', parent: 'fern', name: 'Conifers', desc: 'The first real forests.', cost: 30000, dna: 80, o2: 0.01, green: 0.35, temp: [2, 32], home: ['wet', 'moist', 'cold'] },
  { id: 'amphibian', icon: 'frog', domain: 'ground', parent: 'lobefin', name: 'Amphibians', desc: 'Half fish, half frog, all damp.', cost: 35000, dna: 90, temp: [10, 34], home: ['fresh', 'wet'] },
  { id: 'reptile', icon: 'frog', domain: 'ground', parent: 'amphibian', name: 'Reptiles', desc: 'Eggs with shells. No more ponds needed.', cost: 100000, dna: 200, temp: [12, 38], home: ['moist', 'dry'] },
  { id: 'flyer', icon: 'fly', domain: 'atmosphere', parent: 'insect', name: 'Flying Insects', desc: 'The first wings on the planet.', cost: 60000, dna: 150, temp: [10, 38], home: ['wet', 'moist'] },
];
const MICROBES = new Set(['cell', 'cyano', 'plankton']);
const SPECIES_BY_ID = Object.fromEntries(SPECIES.map(s => [s.id, s]));
// What must have happened before a habitat's species can evolve. Flyers only need land; evolving one opens the sky.
const DOMAIN_OPENS = { ocean: 'cells', ground: 'ozone', atmosphere: 'ozone' };
// Flyers are listed with land life until the sky opens.

// Stories: research chapters in a logical order. Each ends in a climax that unlocks a natural disaster.
// The research `requires` chains follow these orders; this list names them and their disasters.
const STORIES = [
  { id: 'fire', name: 'Fire from below', chapters: ['volcano', 'lavafields', 'supervolcano'], disaster: 'supereruption' },
  { id: 'youngsun', name: 'The young sun', chapters: ['sun1', 'sun2', 'magnet'] },
  { id: 'water', name: 'The water cycle', chapters: ['currents', 'evap', 'clouds', 'rain', 'lightning', 'storms'], disaster: 'thunderstorm' },
  { id: 'rivers', name: 'Rivers and ice', chapters: ['glaciers', 'rivers', 'lakes', 'wetlands'], disaster: 'flood' },
  { id: 'moon', name: 'Moon and seasons', chapters: ['tides', 'pools', 'tilt'], disaster: 'hurricane' },
  { id: 'ground', name: 'Moving ground', chapters: ['plates', 'collision', 'faults'], disaster: 'earthquake' },
  { id: 'green', name: 'Green land', chapters: ['soil', 'grass', 'forests', 'roots'], disaster: 'drought' },
  { id: 'angrysun', name: 'The angry sun', chapters: ['uv', 'ozonegas', 'solarwind'], disaster: 'solarstorm' },
  { id: 'space', name: 'Visitors from space', chapters: ['cometpaths', 'orbits', 'asteroids'], disaster: 'asteroid' },
];

// Natural disasters. Thunderstorms set dry plants on fire once there are plants to burn.
const DISASTERS = {
  supereruption: { name: 'Supereruption', how: 'A supervolcano blows. Lava buries the land around it, ash darkens the sky and cools the planet, life nearby dies, and the lava leaves new land behind.' },
  flood: { name: 'Flood', how: 'Rivers and lakes burst their banks. Land life there drowns, and the water leaves fertile silt behind.' },
  hurricane: { name: 'Hurricane', how: 'A spinning storm born over a warm sea hits the coast. The surge floods the shore, and reefs are smashed.' },
  earthquake: { name: 'Earthquake', how: 'Plates that stuck slip at once and the ground shakes. Under the sea, it sends out a tsunami.' },
  tsunami: { name: 'Tsunami', how: 'A wave from an undersea quake floods the coast. Reefs and coastal life are hit.' },
  drought: { name: 'Drought', how: 'No rain for a long time. The desert spreads, wet land dries out, and fires catch more easily.' },
  solarstorm: { name: 'Solar storm', how: 'The sun throws out a burst of particles. Auroras light the night, the ozone layer thins for a while, and UV burns surface life.' },
  asteroid: { name: 'Asteroid impact', how: 'A rock from space hits the planet. Fire, a winter of dust, and most life dies. An age ends and a new one begins.' },
  thunderstorm: { name: 'Thunderstorm', how: 'Storm clouds throw lightning. Where it hits dry plants, a wildfire can start.' },
  wildfire: { name: 'Wildfire', how: 'Fire races over the plants. Land life there dies back, the smoke adds CO₂, and the burnt ground grows back as grass first.' },
};
const WILDFIRE_CHANCE = 0.35;   // a bolt into plants starts a fire this often
const FIRE_KILL = 4;            // land species lose this many times the share of land that just caught fire
const FIRE_CO2 = 3000;          // ppm CO2 from burning all the land's plants at once
const FLOOD_MINERALS = 5000;    // minerals from silt when floods cover all the land's plants
const DISASTER_GAP_S = 60;      // at least this long between two natural disasters striking on their own
const DROUGHT_S = 60, SOLAR_STORM_S = 40;
// How often each unlocked disaster strikes on its own (per second), when its conditions hold.
const DISASTER_ODDS = {
  supereruption: { rate: 1 / 400, when: () => has('supervolcano') && volcanoes() > 0 },
  flood: { rate: 1 / 400, when: () => has('wetlands') && state.clouds > 0.4 },
  hurricane: { rate: 1 / 400, when: () => has('tilt') && tempC() > 22 && openOcean() > 0.3 },
  earthquake: { rate: 1 / 500, when: () => has('faults') },
  drought: { rate: 1 / 400, when: () => has('roots') && tempC() > 20 && state.drought <= 0 },
  solarstorm: { rate: 1 / 500, when: () => has('solarwind') && state.solarStorm <= 0 },
};

// All 118 elements in order of atomic number, for the periodic table.
const ELEMENT_SYMBOLS = ('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr ' +
  'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu ' +
  'Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr ' +
  'Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' ');

// The atoms the player can discover, and what on the planet reveals each one. Found atoms stay found.
// Atoms without `found` only arrive with comets (see COMET_ATOMS).
const ATOMS = {
  H: { name: 'Hydrogen', found: () => state.ignition > 0, how: 'The sun is a ball of hydrogen. Each tap squeezes its core hotter.' },
  He: { name: 'Helium', found: () => state.ignition >= 1, how: 'Ignition: the sun fuses hydrogen into helium.' },
  C: { name: 'Carbon', how: 'Crashed in with a comet, as frozen carbon monoxide and dust.' },
  N: { name: 'Nitrogen', how: 'Crashed in with a comet, as frozen ammonia.' },
  O: { name: 'Oxygen', how: 'Crashed in with a comet, as water ice.' },
  Ne: { name: 'Neon', found: () => has('neon'), how: 'A noble gas in the air.' },
  Na: { name: 'Sodium', found: () => seen('ocean'), how: 'The sea is salty: sodium chloride.' },
  Mg: { name: 'Magnesium', found: () => evolved('cyano') || isExtinct('cyano'), how: 'Chlorophyll has magnesium at its heart.' },
  Al: { name: 'Aluminium', found: () => has('plates'), how: 'Light crust rock floats on the mantle.' },
  Si: { name: 'Silicon', found: () => has('volcano'), how: 'Lava is molten silicate rock.' },
  P: { name: 'Phosphorus', found: () => seen('life'), how: 'Every cell copies itself on a phosphate backbone.' },
  S: { name: 'Sulfur', found: () => state.eruptions > 0, how: 'Eruptions throw sulfur high into the air.' },
  Cl: { name: 'Chlorine', found: () => seen('ocean'), how: 'The sea is salty: sodium chloride.' },
  Ar: { name: 'Argon', found: () => has('argon'), how: 'A noble gas, made as potassium in the rocks decays.' },
  K: { name: 'Potassium', found: () => has('soil'), how: 'Soil feeds plants potassium.' },
  Ca: { name: 'Calcium', found: () => evolved('coral') || isExtinct('coral'), how: 'Corals build with calcium carbonate.' },
  Fe: { name: 'Iron', found: () => has('magnet'), how: 'The spinning core is iron. It makes the magnetic field.' },
  Ni: { name: 'Nickel', found: () => has('magnet'), how: 'Mixed into the iron core.' },
  Cu: { name: 'Copper', found: () => evolved('arthropod') || isExtinct('arthropod'), how: 'Arthropod blood is blue with copper.' },
  Kr: { name: 'Krypton', found: () => has('krypton'), how: 'A noble gas in the air.' },
  Xe: { name: 'Xenon', found: () => has('xenon'), how: 'A noble gas in the air.' },
  Rn: { name: 'Radon', found: () => has('radon'), how: 'A radioactive noble gas seeping from the rocks.' },
  U: { name: 'Uranium', found: () => has('radon'), how: 'Radon comes from uranium decaying in the rocks.' },
};

// What comets carry. `chance` is how likely one comet brings the atom: real comets are mostly water ice
// (hydrogen, oxygen), then carbon monoxide and dioxide, and a little ammonia (nitrogen). Each atom colors the tail
// and changes the planet when the comet crashes.
const COMET_ATOMS = {
  H: { chance: 0.8, color: '#ffffff', hit: () => {} },
  O: { chance: 0.7, color: '#ff5a4a', hit: () => {} },
  C: { chance: 0.45, color: '#b0b0b0', hit: () => (has('thawCO2') ? (state.co2 += 60) : (state.co2Ice += 60)) },
  N: { chance: 0.3, color: '#5a8aff', hit: () => has('thawN2') && (state.pressure = Math.min(1, state.pressure + 0.02)) },
};
const COMET_DUST = 0.12;   // aerosols from one impact: a short cooling

// Laws of nature, found the first time the player sees them at work on the planet, like atoms.
// `sign` is the short symbol on the law's card.
const LAWS = {
  heat: { name: 'Heat', sign: 'Q', found: () => state.ignition > 0, how: 'Squeezing the sun\'s core makes it hotter.' },
  fusion: { name: 'Fusion', sign: 'E=mc²', found: () => state.ignition >= 1, how: 'Hot enough, hydrogen nuclei fuse into helium and a little mass turns into a lot of energy.' },
  light: { name: 'Light', sign: 'c', found: () => state.ignition >= 1, how: 'The lit sun shines. Its light crosses space and warms the planet.' },
  inertia: { name: 'Inertia', sign: 'L', found: () => state.spinLocked, how: 'A spinning planet keeps spinning: nothing out in space slows it down.' },
  gravity: { name: 'Gravity', sign: 'g', found: () => state.comets > 0, how: 'A comet falls into the planet. Mass pulls on mass.' },
  melting: { name: 'Melting', sign: '0°C', found: () => seen('thaw'), how: 'Warm enough, ice turns into water.' },
  magnetism: { name: 'Magnetism', sign: 'B', found: () => has('magnet'), how: 'The spinning iron core makes a magnetic field that shields the air.' },
  pressure: { name: 'Pressure', sign: 'P', found: () => has('thawN2'), how: 'Gas pushes on everything around it. Nitrogen gave the planet air.' },
  greenhouse: { name: 'Greenhouse effect', sign: 'IR', found: () => has('thawCH4') || has('thawCO2'), how: 'Some gases let sunlight in but hold the heat back.' },
  electricity: { name: 'Electricity', sign: 'e⁻', found: () => state.strikes > 0, how: 'Lightning: charge built up in a storm cloud jumps to the ground.' },
  radioactivity: { name: 'Radioactivity', sign: 'α', found: () => has('helium') || has('radon'), how: 'Atoms in the rocks fall apart by themselves, giving off helium and radon.' },
  tides: { name: 'Tides', sign: '~', found: () => has('tides'), how: 'The moon\'s gravity pulls the oceans into a bulge that follows it around.' },
};

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
  disasters: {},    // how many times each natural disaster has happened
  drought: 0,       // seconds left of a drought
  solarStorm: 0,    // seconds left of a solar storm
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
const MIGRATIONS = [];

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
const researchVisible = u => (!u.after || seen(u.after)) && (u.requires || []).every(has);

// A researched node is hidden once the next node of its chain is researched.
const superseded = u => RESEARCH.some(r => r.replaces === u.id && has(r.id));

const canResearch = u => !has(u.id) && !state.researching && researchVisible(u) && (u.needs || []).every(needMet);

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
const ozone = () => (has('ozonegas') ? clamp01(state.o2 / 2) * (state.solarStorm > 0 ? 0.4 : 1) : 0);
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
  return { target: bare + greenhouse, albedo, dust, greenhouse, sunK: bare };
}

function recalc() {
  const r = {
    co2: 0, ch4: total('ch4'), minerals: total('minerals'), dna: 0, o2: 0, clouds: total('cloudRate') * mult('cloudMult'), green: 0, life: 0,
    dnaBy: { ocean: 0, ground: 0, atmosphere: 0 }, weathering: rates.weathering || 0,
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
  for (const u of withField('tick')) u.tick(dt);

  // Volcanoes slowly build new land.
  state.land = Math.min(MAX_LAND, state.land + 0.00004 * volcanoes() * mult('landMult') * (1 - state.land / MAX_LAND) * dt);

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
  state.co2 = Math.max(0, state.co2 + (rates.co2 - weathering - photosynthesis) * dt);
  state.ch4 = Math.max(0, state.ch4 + (rates.ch4 - state.ch4 * 0.03 * clamp01(state.o2)) * dt);

  // Temperature follows its target with a lag. Ice sheets grow and melt more slowly still.
  const lag = THERMAL_LAG_S + OCEAN_LAG_S * (1 - state.ice);
  state.tempK += (rates.climate.target - state.tempK) * Math.min(1, dt / lag);
  const iceGoal = iceTarget();
  state.ice += (iceGoal - state.ice) * Math.min(1, dt * (iceGoal > state.ice ? 0.005 : 0.012));

  state.minerals += rates.minerals * dt;
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
    if (wet > 0) state.species[s.id] *= 1 - Math.min(0.5, wet * FIRE_KILL);
  }
  state.co2 += burnt * FIRE_CO2;
  state.minerals += wet * FLOOD_MINERALS;
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
    Terrain.spread('surge', spot.u, spot.v, 10 + Math.random() * 5);
    hitReefs(0.25);
  }, 4000);
  return true;
}

function quake() {
  Scene.shake(2.5);
  disaster('earthquake');
  const spot = Terrain.findSpot('surge', Scene.centre());
  if (spot) {
    setTimeout(() => {
      Terrain.spread('surge', spot.u, spot.v, 12 + Math.random() * 6);
      hitReefs(0.3);
      disaster('tsunami');
    }, 1800);
  }
  return true;
}

function drought() {
  state.drought = DROUGHT_S;
  disaster('drought');
  return true;
}

// UV gets through the thinned ozone and burns surface life.
function solarStorm() {
  state.solarStorm = SOLAR_STORM_S;
  Scene.aurora(SOLAR_STORM_S);
  for (const s of SPECIES) if (s.domain !== 'ocean' && evolved(s.id)) state.species[s.id] *= 0.85;
  disaster('solarstorm');
  return true;
}

// The finale: an asteroid crashes in. Lava and a winter of dust, and most of every species dies;
// small ones die out. The age ends.
function asteroidImpact() {
  Scene.asteroid();
  return true;
}

Scene.onAsteroidHit((x, y) => {
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
});

// Unlocked disasters strike again now and then on their own, never two close together.
let lastDisaster = -1e9;
function disasterTick(dt, now) {
  state.drought = Math.max(0, state.drought - dt);
  state.solarStorm = Math.max(0, state.solarStorm - dt);
  if (now - lastDisaster < DISASTER_GAP_S * 1000) return;
  for (const [id, d] of Object.entries(DISASTER_ODDS)) {
    if (!d.when() || Math.random() >= d.rate * dt) continue;
    const happened = { supereruption: () => (erupt(-1, true), true), flood, hurricane, earthquake: quake, drought, solarstorm: solarStorm }[id]();
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
  for (const u of RESEARCH) if (u.tab === tab && !has(u.id) && researchVisible(u)) entries.push({ kind: 'research', item: u });
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
    return `${has('volcano') ? `<div class="meter-row"><span>Volcanic activity</span><b class="m-volc-v"></b></div>
        <input class="slider" id="volcano-activity" type="range" min="0" max="100" step="5">` : ''}
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
      else li.addEventListener('click', () => choose(e));
      e.li = li;
      list.appendChild(li);
    }
    root._entries = entries;
    const slider = root.querySelector('#volcano-activity');
    if (slider) {
      slider.value = Math.round(state.volcanoActivity * 100);
      slider.addEventListener('input', () => {
        state.volcanoActivity = slider.value / 100;
        recalc();
      });
    }
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
    const v = root.querySelector('.m-volc-v');
    if (v) v.textContent = pct(state.volcanoActivity);
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
      const [level, text] = item.gauge();
      li.className = 'item researched';
      q('.name').textContent = item.name;
      q('.meta i').style.width = pct(clamp01(level));
      q('.meta span').textContent = text;
      q('.cost').textContent = '';
    } else if (e.kind === 'research') {
        li.className = 'item' + (canResearch(item) ? ' affordable' : '');
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
        q('.cost').textContent = `${days} ${days === 1 ? 'day' : 'days'}`;
      }
    }
  }
}

/* ================= Researching and evolving ================= */

function choose(e) {
  const { item } = e;
  if (e.kind === 'researched') return;
  if (e.kind === 'research') {
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

/* ================= The science book ================= */

let currentCat = 'physics';
let bookOpen = false;

const visibleSections = cat => SUBJECT_BY_ID[cat].sections.filter(sec => SECTIONS[sec].unlocked());

// Build one page per subject, with a titled block per section, and the subject tabs down the right edge.
function buildPanels() {
  const world = $('#world');
  for (const c of SUBJECTS) {
    const div = document.createElement('div');
    div.id = `cat-${c.id}`;
    div.className = 'tab';
    div.innerHTML = `${c.sections.map(sec => `
      <section class="section" data-section="${sec}">
        <h3 class="section-title">${SECTIONS[sec].name}</h3>
        ${sec === 'world' ? '' : `<div id="${sec}"></div>`}
      </section>`).join('')}
      <p class="blank-page">Empty pages.</p>`;
    if (c.sections.includes('world')) div.querySelector('[data-section="world"]').appendChild(world);
    $('#panel').appendChild(div);
  }
  $('#book-btn').insertAdjacentHTML('afterbegin', spriteImg('book'));
  $('#book-tabs').innerHTML = SUBJECTS.filter(c => !c.hidden).map(c => `<button class="book-tab" data-cat="${c.id}" style="--tab:${c.color}" aria-label="${c.name}" title="${c.name}">
    ${spriteImg('subject' + c.name)}<i class="dot hidden"></i></button>`).join('');
  $('#book-tabs').querySelectorAll('.book-tab').forEach(t => t.addEventListener('click', () => openCategory(t.dataset.cat)));
}

// How much a subject holds. When it grows past what the player has seen, its tab and the book get a dot.
function subjectSize(cat) {
  return visibleSections(cat).reduce((n, sec) => n + (
    sec === 'elements' ? state.atoms.length
    : sec === 'laws' ? state.laws.length
    : sec === 'signs' ? state.signs.length
    : sec === 'planets' ? state.planets.length
    : sec === 'index' || sec === 'life' ? SPECIES.filter(known).length
    : sec === 'world' ? 0
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
  root.querySelector('.blank-page').classList.toggle('hidden', visible.length > 0);
  for (const sec of visible) {
    if (sec === 'world' || sec === 'life') {
      if (light) continue;
      if (sec === 'world') renderWorld();
      else renderLife();
    } else if (sec === 'elements') renderElements(force);
    else if (sec === 'laws') renderLaws(force);
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
  $('#book-title').style.color = SUBJECT_BY_ID[cat].color;
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
window.addEventListener('popstate', hideBook);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && bookOpen) closeBook();
});

// The big temperature at the top opens the planet stats.
// The temperature at the top opens the climate: the atmosphere page once there is one.
$('#hud').addEventListener('click', () => (SECTIONS.atmosphere.unlocked() ? openTab('atmosphere') : openBook()));
$('#book-game').addEventListener('click', () => openCategory('game'));

/* ================= Astronomy: star signs and planets ================= */

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
  const root = $('#planets'), key = state.planets.join();
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  root.innerHTML = `<p class="note">${state.planets.length} of ${Sky.PLANETS.length} planets found</p>
    <div class="law-grid">${Sky.PLANETS.map(p => state.planets.includes(p.id)
      ? `<div class="law-card"><i class="planet-dot" style="background:${p.color}"></i><span>${p.name}</span></div>`
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
  // Once thunderstorms are known, a bolt into dry plants can start a wildfire.
  if (zone === 'ground' && hit?.u >= 0 && has('storms') && Math.random() < WILDFIRE_CHANCE * (state.drought > 0 ? 2 : 1) && Terrain.ignite(hit.u, hit.v, 5 + Math.random() * 5)) {
    disaster('wildfire', x, y);
  }
  if (zone === 'ocean' && seen('storms') && !seen('life')) {
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
  const add = mult('rainMult');
  state.minerals += add;
  state.clouds = Math.max(0, state.clouds - 0.004);
  floatText(x, y, `+${fmt(add)} minerals`, 'rain');
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
const needsMatter = () => RESEARCH.some(u => !has(u.id) && researchVisible(u) && (u.needs || []).some(n => n[0] === 'matter' && !needMet(n)));

function scheduleComet() {
  const missing = needsMatter();
  setTimeout(() => {
    if (!document.hidden && seen('sunlit')) {
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
    document.documentElement.style.setProperty('--temp-color', '#ffe08a');
    return;
  }
  // On screen: only the date and the temperature. Everything else is in the science book.
  el.temp.textContent = fmtTemp(c);
  el.tempSub.textContent = '';
  el.hudLine.textContent = dateText();
  document.documentElement.style.setProperty('--temp-color', tempColor(c));
}

function updateScene(c) {
  // The scene's colors were tuned for big swings; a warm-but-livable planet should still look blue.
  Scene.setClimate(c < 14 ? c - 14 : (c - 14) * 0.4);
  Scene.setIce(iceCover());
  // The unlit sun glows brighter as ignition builds, though it gives no heat yet.
  Scene.setAtmosphere(state.pressure, methaneHaze(), Math.max(sunBrightness(), SUN_IGNITED * state.ignition ** 3));
  Scene.setOpening(1);
  Scene.setSunBackground(componentDone('sun'));
  Scene.setMoon(state.moonBorn, 1, componentDone('moon'));
  Scene.setSpin(state.spin);
  Scene.setVolcanoes(has('supervolcano') ? 4 : has('volcano') ? 2 : 0);
  Scene.setLand(state.land, state.mountains, state.aerosols);
  Scene.setFeatures({
    peaks: has('collision') ? Math.max(1, Math.round(state.mountains * 8)) : 0,
    snow: glacierIce() > 0.05, rivers: has('rivers'), lakes: has('lakes'), frozen: tempC() < 0,
    temp: Math.round(tempC()), rain: has('rain') ? Math.round(state.clouds * 20) / 20 : 0,
    grass: has('grass'), forests: has('forests'), wetlands: has('wetlands'), reefs: has('shallows'), roots: has('roots'),
    drought: state.drought > 0,
  });
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
  Scene.setStars(has('starlight'), has('starsigns'), has('wanderers'));

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
    if (!state.over) disasterTick(0.2, now);
    findAtoms();
    renderCategory(false, true);
    updateDots();
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

  Scene.draw(now, dt);
  requestAnimationFrame(frame);
}

/* ================= Boot ================= */

load();
Scene.init();
buildPanels();
recalc();
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
