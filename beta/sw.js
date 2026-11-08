// Network-first service worker: always fresh when online, still playable offline or on a network that hangs.
importScripts('version.js');
const CACHE = `phylarium-${CHANNEL}-${VERSION}-${BUILD}`;
// Old caches of this channel. The other channel shares the origin, so leave its caches alone.
const OWN = [`phylarium-${CHANNEL}-`];
// A request that has not answered in this long is served from the cache, if the cache has it.
const NETWORK_TIMEOUT_MS = 3000;
// Everything the game needs offline. The smoke test checks this list against index.html and boot.js, so a new
// file can't be left out. Files boot.js loads carry ?v=BUILD, as boot.js asks for them.
const V = `?v=${BUILD}`;
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icon.svg',
  'icon-180.png',
  'style.css',
  'version.js',
  'sprites.js',
  'terrain.js',
  'lib/js-yaml.min.js',
  'boot.js',
  ...['sky.js', 'scene.js', 'puzzles.js', 'title.js', 'game.js', 'play.js', 'book.js', 'tiles.js', 'main.js'].map(
    f => f + V,
  ),
  ...['book', 'research', 'species', 'stories', 'disasters', 'atoms', 'laws', 'sky', 'collections'].map(
    f => `data/${f}.yaml${V}`,
  ),
  // Poster art (posters/<art>/): check-data checks that every file there is listed.
  ...Object.entries({
    air: [
      'aurora.png',
      'base.png',
      'clouds.png',
      'layers.json',
      'meteors.png',
      'ozonegas.png',
      'thawCH4.png',
      'thawCO2.png',
      'thawN2.png',
      'uv.png',
    ],
    comets: [
      'base.png',
      'churyumov.png',
      'encke.png',
      'halebopp.png',
      'halley.png',
      'hyakutake.png',
      'layers.json',
      'neowise.png',
      'shoemaker.png',
      'tempel.png',
      'tuttle.png',
      'wild2.png',
    ],
    earth: [
      'base.png',
      'crust.png',
      'ironcore.png',
      'lava.png',
      'layers.json',
      'magnet.png',
      'mantle.png',
      'rotation.png',
    ],
    moon: [
      'base.png',
      'firstquarter.png',
      'fullmoon.png',
      'lastquarter.png',
      'layers.json',
      'newmoon.png',
      'wancrescent.png',
      'wangibbous.png',
      'waxcrescent.png',
      'waxgibbous.png',
    ],
    plates: [
      'base.png',
      'collision.png',
      'drift.png',
      'earthquake.png',
      'faults.png',
      'layers.json',
      'mountains.png',
      'plates.png',
      'shallows.png',
      'vents.png',
    ],
    spectrum: [
      'base.png',
      'blue.png',
      'gamma.png',
      'green.png',
      'infrared.png',
      'layers.json',
      'microwave.png',
      'orange.png',
      'radio.png',
      'red.png',
      'ultraviolet.png',
      'violet.png',
      'xray.png',
      'yellow.png',
    ],
    storms: ['base.png', 'currents.png', 'hail.png', 'hurricane.png', 'layers.json', 'lightning.png', 'storms.png'],
    tides: [
      'base.png',
      'biolum.png',
      'blooms.png',
      'currents.png',
      'layers.json',
      'pools.png',
      'redtide.png',
      'tides.png',
      'waves.png',
    ],
    volcanoes: [
      'base.png',
      'eruption.png',
      'lavafields.png',
      'layers.json',
      'richsoil.png',
      'supereruption.png',
      'supervolcano.png',
      'volcano.png',
      'volcgas.png',
    ],
    water: [
      'base.png',
      'clouds.png',
      'evap.png',
      'glaciers.png',
      'lakes.png',
      'layers.json',
      'rain.png',
      'rainbow.png',
      'rivers.png',
      'snow.png',
    ],
    zodiac: [
      'aquarius.png',
      'aries.png',
      'base.png',
      'cancer.png',
      'capricorn.png',
      'gemini.png',
      'layers.json',
      'leo.png',
      'libra.png',
      'pisces.png',
      'sagittarius.png',
      'scorpio.png',
      'taurus.png',
      'virgo.png',
    ],
    meadow: [
      'base.png',
      'drought.png',
      'forests.png',
      'grass.png',
      'layers.json',
      'roots.png',
      'soil.png',
      'superbloom.png',
    ],
    moonlit: [
      'base.png',
      'circadian.png',
      'eclipse.png',
      'iceage.png',
      'layers.json',
      'moonlight.png',
      'moonphases.png',
      'seasons.png',
      'tilt.png',
    ],
    nightsky: [
      'base.png',
      'layers.json',
      'milkyway.png',
      'nebulae.png',
      'starcolors.png',
      'starlight.png',
      'starsight.png',
      'starsigns.png',
      'supernova.png',
    ],
    space: [
      'asteroid.png',
      'asteroids.png',
      'base.png',
      'cometpaths.png',
      'cometsight.png',
      'layers.json',
      'meteors.png',
      'orbits.png',
    ],
    sun: [
      'aurora.png',
      'base.png',
      'ignition.png',
      'layers.json',
      'ozonegas.png',
      'solarstorm.png',
      'solarwind.png',
      'sun2.png',
      'uv.png',
    ],
    valley: [
      'base.png',
      'delta.png',
      'flood.png',
      'glaciers.png',
      'lakes.png',
      'layers.json',
      'rivers.png',
      'wetlands.png',
    ],
  }).flatMap(([art, list]) => list.map(f => `posters/${art}/${f}${V}`)),
];

self.addEventListener('install', e => {
  // cache: 'reload' skips the browser's HTTP cache (GitHub Pages lets it keep files for 10 minutes), so the new
  // cache never holds files from the deploy before.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', e =>
  e.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE && OWN.some(p => k.startsWith(p))).map(k => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  ),
);

// From this version's cache only. A page (a world opens as ./?world=<id>) falls back to the start page.
function fromCache(req) {
  const page = req.mode === 'navigate';
  return caches
    .open(CACHE)
    .then(c => c.match(req, { ignoreSearch: page }).then(r => r || (page ? c.match('./') : undefined)));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Other sites (analytics) go straight to the network: nothing of theirs is cached or delayed.
  if (new URL(req.url).origin !== self.location.origin) return;
  // Revalidate with the server instead of trusting the browser cache, so a deploy never mixes
  // new and old files.
  const net = fetch(req, { cache: 'no-cache' });
  // Keep good answers for offline. The clone is taken before the page reads the body.
  e.waitUntil(net.then(res => res.ok && caches.open(CACHE).then(c => c.put(req, res.clone()))).catch(() => {}));
  e.respondWith(
    new Promise(resolve => {
      let done = false;
      const answer = res => {
        if (res && !done) {
          done = true;
          resolve(res);
        }
        return !!res;
      };
      // Slow network: serve the cached copy if there is one, and keep waiting for the network if not.
      const timer = setTimeout(
        () =>
          fromCache(req)
            .then(answer)
            .catch(() => {}),
        NETWORK_TIMEOUT_MS,
      );
      net.then(
        res => {
          clearTimeout(timer);
          answer(res);
        },
        () => {
          clearTimeout(timer);
          fromCache(req).then(
            r => answer(r || Response.error()),
            () => answer(Response.error()),
          );
        },
      );
    }),
  );
});
