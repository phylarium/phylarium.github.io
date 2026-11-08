// Service worker: files that carry ?v=BUILD never change under their URL, so they come from the cache first;
// the page itself and the files that name the build are network-first, so a new version is found when online.
// Offline, or on a network that hangs, everything comes from the cache.
importScripts('version.js');
const CACHE = `phylarium-${CHANNEL}-${VERSION}-${BUILD}`;
// Old caches of this channel. The other channel shares the origin, so leave its caches alone.
const OWN = [`phylarium-${CHANNEL}-`];
// A request that has not answered in this long is served from the cache, if the cache has it.
const NETWORK_TIMEOUT_MS = 3000;
// A file that carries the build in its URL is the same file for ever: it is served from the cache when there.
const versioned = url => new URL(url).searchParams.has('v');
// Everything the game needs offline, written by tools/sw-assets.mjs from index.html, boot.js and posters/
// (`pnpm run sw-assets`; the pre-commit hook, CI and deploy.sh check it): never edit the list by hand.
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
  `sky.js${V}`,
  `scene.js${V}`,
  `puzzles.js${V}`,
  `title.js${V}`,
  `game.js${V}`,
  `play.js${V}`,
  `book.js${V}`,
  `tiles.js${V}`,
  `main.js${V}`,
  `data/book.yaml${V}`,
  `data/research.yaml${V}`,
  `data/species.yaml${V}`,
  `data/stories.yaml${V}`,
  `data/disasters.yaml${V}`,
  `data/atoms.yaml${V}`,
  `data/laws.yaml${V}`,
  `data/sky.yaml${V}`,
  `data/collections.yaml${V}`,
  `posters/air/aurora.png${V}`,
  `posters/air/base.png${V}`,
  `posters/air/clouds.png${V}`,
  `posters/air/layers.json${V}`,
  `posters/air/meteors.png${V}`,
  `posters/air/ozonegas.png${V}`,
  `posters/air/thawCH4.png${V}`,
  `posters/air/thawCO2.png${V}`,
  `posters/air/thawN2.png${V}`,
  `posters/air/uv.png${V}`,
  `posters/comets/base.png${V}`,
  `posters/comets/churyumov.png${V}`,
  `posters/comets/encke.png${V}`,
  `posters/comets/halebopp.png${V}`,
  `posters/comets/halley.png${V}`,
  `posters/comets/hyakutake.png${V}`,
  `posters/comets/layers.json${V}`,
  `posters/comets/neowise.png${V}`,
  `posters/comets/shoemaker.png${V}`,
  `posters/comets/tempel.png${V}`,
  `posters/comets/tuttle.png${V}`,
  `posters/comets/wild2.png${V}`,
  `posters/earth/base.png${V}`,
  `posters/earth/crust.png${V}`,
  `posters/earth/ironcore.png${V}`,
  `posters/earth/lava.png${V}`,
  `posters/earth/layers.json${V}`,
  `posters/earth/magnet.png${V}`,
  `posters/earth/mantle.png${V}`,
  `posters/earth/rotation.png${V}`,
  `posters/meadow/base.png${V}`,
  `posters/meadow/drought.png${V}`,
  `posters/meadow/forests.png${V}`,
  `posters/meadow/grass.png${V}`,
  `posters/meadow/layers.json${V}`,
  `posters/meadow/roots.png${V}`,
  `posters/meadow/soil.png${V}`,
  `posters/meadow/superbloom.png${V}`,
  `posters/moon/base.png${V}`,
  `posters/moon/firstquarter.png${V}`,
  `posters/moon/fullmoon.png${V}`,
  `posters/moon/lastquarter.png${V}`,
  `posters/moon/layers.json${V}`,
  `posters/moon/newmoon.png${V}`,
  `posters/moon/wancrescent.png${V}`,
  `posters/moon/wangibbous.png${V}`,
  `posters/moon/waxcrescent.png${V}`,
  `posters/moon/waxgibbous.png${V}`,
  `posters/moonlit/base.png${V}`,
  `posters/moonlit/circadian.png${V}`,
  `posters/moonlit/eclipse.png${V}`,
  `posters/moonlit/iceage.png${V}`,
  `posters/moonlit/layers.json${V}`,
  `posters/moonlit/moonlight.png${V}`,
  `posters/moonlit/moonphases.png${V}`,
  `posters/moonlit/seasons.png${V}`,
  `posters/moonlit/tilt.png${V}`,
  `posters/nightsky/base.png${V}`,
  `posters/nightsky/layers.json${V}`,
  `posters/nightsky/milkyway.png${V}`,
  `posters/nightsky/nebulae.png${V}`,
  `posters/nightsky/starcolors.png${V}`,
  `posters/nightsky/starlight.png${V}`,
  `posters/nightsky/starsight.png${V}`,
  `posters/nightsky/starsigns.png${V}`,
  `posters/nightsky/supernova.png${V}`,
  `posters/plates/base.png${V}`,
  `posters/plates/collision.png${V}`,
  `posters/plates/drift.png${V}`,
  `posters/plates/earthquake.png${V}`,
  `posters/plates/faults.png${V}`,
  `posters/plates/layers.json${V}`,
  `posters/plates/mountains.png${V}`,
  `posters/plates/plates.png${V}`,
  `posters/plates/shallows.png${V}`,
  `posters/plates/vents.png${V}`,
  `posters/space/asteroid.png${V}`,
  `posters/space/asteroids.png${V}`,
  `posters/space/base.png${V}`,
  `posters/space/cometpaths.png${V}`,
  `posters/space/cometsight.png${V}`,
  `posters/space/layers.json${V}`,
  `posters/space/meteors.png${V}`,
  `posters/space/orbits.png${V}`,
  `posters/spectrum/base.png${V}`,
  `posters/spectrum/blue.png${V}`,
  `posters/spectrum/gamma.png${V}`,
  `posters/spectrum/green.png${V}`,
  `posters/spectrum/infrared.png${V}`,
  `posters/spectrum/layers.json${V}`,
  `posters/spectrum/microwave.png${V}`,
  `posters/spectrum/orange.png${V}`,
  `posters/spectrum/radio.png${V}`,
  `posters/spectrum/red.png${V}`,
  `posters/spectrum/ultraviolet.png${V}`,
  `posters/spectrum/violet.png${V}`,
  `posters/spectrum/xray.png${V}`,
  `posters/spectrum/yellow.png${V}`,
  `posters/storms/base.png${V}`,
  `posters/storms/currents.png${V}`,
  `posters/storms/hail.png${V}`,
  `posters/storms/hurricane.png${V}`,
  `posters/storms/layers.json${V}`,
  `posters/storms/lightning.png${V}`,
  `posters/storms/storms.png${V}`,
  `posters/sun/aurora.png${V}`,
  `posters/sun/base.png${V}`,
  `posters/sun/ignition.png${V}`,
  `posters/sun/layers.json${V}`,
  `posters/sun/ozonegas.png${V}`,
  `posters/sun/solarstorm.png${V}`,
  `posters/sun/solarwind.png${V}`,
  `posters/sun/sun2.png${V}`,
  `posters/sun/uv.png${V}`,
  `posters/tides/base.png${V}`,
  `posters/tides/biolum.png${V}`,
  `posters/tides/blooms.png${V}`,
  `posters/tides/currents.png${V}`,
  `posters/tides/layers.json${V}`,
  `posters/tides/pools.png${V}`,
  `posters/tides/redtide.png${V}`,
  `posters/tides/tides.png${V}`,
  `posters/tides/waves.png${V}`,
  `posters/valley/base.png${V}`,
  `posters/valley/delta.png${V}`,
  `posters/valley/flood.png${V}`,
  `posters/valley/glaciers.png${V}`,
  `posters/valley/lakes.png${V}`,
  `posters/valley/layers.json${V}`,
  `posters/valley/rivers.png${V}`,
  `posters/valley/wetlands.png${V}`,
  `posters/volcanoes/base.png${V}`,
  `posters/volcanoes/eruption.png${V}`,
  `posters/volcanoes/lavafields.png${V}`,
  `posters/volcanoes/layers.json${V}`,
  `posters/volcanoes/richsoil.png${V}`,
  `posters/volcanoes/supereruption.png${V}`,
  `posters/volcanoes/supervolcano.png${V}`,
  `posters/volcanoes/volcano.png${V}`,
  `posters/volcanoes/volcgas.png${V}`,
  `posters/water/base.png${V}`,
  `posters/water/clouds.png${V}`,
  `posters/water/evap.png${V}`,
  `posters/water/glaciers.png${V}`,
  `posters/water/lakes.png${V}`,
  `posters/water/layers.json${V}`,
  `posters/water/rain.png${V}`,
  `posters/water/rainbow.png${V}`,
  `posters/water/rivers.png${V}`,
  `posters/water/snow.png${V}`,
  `posters/zodiac/aquarius.png${V}`,
  `posters/zodiac/aries.png${V}`,
  `posters/zodiac/base.png${V}`,
  `posters/zodiac/cancer.png${V}`,
  `posters/zodiac/capricorn.png${V}`,
  `posters/zodiac/gemini.png${V}`,
  `posters/zodiac/layers.json${V}`,
  `posters/zodiac/leo.png${V}`,
  `posters/zodiac/libra.png${V}`,
  `posters/zodiac/pisces.png${V}`,
  `posters/zodiac/sagittarius.png${V}`,
  `posters/zodiac/scorpio.png${V}`,
  `posters/zodiac/taurus.png${V}`,
  `posters/zodiac/virgo.png${V}`,
];

// When each cache was made, kept in the cache itself, so the newest of the old ones can be told apart.
const STAMP = '__made';

self.addEventListener('install', e => {
  // cache: 'reload' skips the browser's HTTP cache (GitHub Pages lets it keep files for 10 minutes), so the new
  // cache never holds files from the deploy before.
  e.waitUntil(
    caches
      .open(CACHE)
      .then(c =>
        c
          .addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))
          .then(() => c.put(STAMP, new Response(String(Date.now())))),
      ),
  );
  self.skipWaiting();
});

// The new worker takes over at once (main.js then offers a reload rather than swapping the game under the
// player). A page still running the old build keeps asking for its files under the old ?v=, and finds them
// lazily (poster art, data) only in the old cache: so the newest old cache of this channel is kept, and only
// the ones before it are deleted. A page that stays on an old build for two updates has had the update prompt
// in view since the first.
const made = name =>
  caches
    .open(name)
    .then(c => c.match(STAMP))
    .then(r => (r ? r.text() : '0'))
    .then(Number)
    .catch(() => 0);
self.addEventListener('activate', e =>
  e.waitUntil(
    caches
      .keys()
      .then(async keys => {
        const old = keys.filter(k => k !== CACHE && OWN.some(p => k.startsWith(p)));
        const stamps = await Promise.all(old.map(made));
        const newest = old[stamps.indexOf(Math.max(...stamps))];
        return Promise.all(old.filter(k => k !== newest).map(k => caches.delete(k)));
      })
      .then(() => self.clients.claim()),
  ),
);

// A versioned file from any cache of this channel (an old page finds its own build's files); anything else from
// this version's cache only. A page (a world opens as ./?world=<id>) falls back to the start page.
function fromCache(req) {
  if (versioned(req.url)) return caches.match(req);
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
  // A versioned file: the cache answers at once; the network only when the cache has no copy (a file the install
  // did not list, or a build this cache never held), and that copy is kept.
  if (versioned(req.url)) {
    e.respondWith(
      fromCache(req).then(
        hit =>
          hit ||
          fetch(req).then(res => {
            if (res.ok) e.waitUntil(caches.open(CACHE).then(c => c.put(req, res.clone())));
            return res;
          }),
      ),
    );
    return;
  }
  // The page and the files that name the build: revalidate with the server instead of trusting the browser
  // cache, so a new version is found and a deploy never mixes new and old files.
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
