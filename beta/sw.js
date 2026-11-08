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
  `data/posters.yaml${V}`,
  `posters/air/argon.png${V}`,
  `posters/air/aurora.png${V}`,
  `posters/air/base.png${V}`,
  `posters/air/clouds.png${V}`,
  `posters/air/krypton.png${V}`,
  `posters/air/layers.json${V}`,
  `posters/air/meteors.png${V}`,
  `posters/air/neon.png${V}`,
  `posters/air/nitrogen.png${V}`,
  `posters/air/oxygenGreen.png${V}`,
  `posters/air/oxygenRed.png${V}`,
  `posters/air/ozonegas.png${V}`,
  `posters/air/thawCH4.png${V}`,
  `posters/air/thawCO2.png${V}`,
  `posters/air/thawN2.png${V}`,
  `posters/air/uv.png${V}`,
  `posters/cells/base.png${V}`,
  `posters/cells/dna.png${V}`,
  `posters/cells/firstcell.png${V}`,
  `posters/cells/layers.json${V}`,
  `posters/cells/multicell.png${V}`,
  `posters/cells/nucleus.png${V}`,
  `posters/cells/photosynthesis.png${V}`,
  `posters/cells/rna.png${V}`,
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
  `posters/core/base.png${V}`,
  `posters/core/crust.png${V}`,
  `posters/core/ironcore.png${V}`,
  `posters/core/lava.png${V}`,
  `posters/core/layers.json${V}`,
  `posters/core/magnet.png${V}`,
  `posters/core/mantle.png${V}`,
  `posters/core/rotation.png${V}`,
  `posters/ice/base.png${V}`,
  `posters/ice/column.png${V}`,
  `posters/ice/dendrite.png${V}`,
  `posters/ice/glaciers.png${V}`,
  `posters/ice/iceage.png${V}`,
  `posters/ice/layers.json${V}`,
  `posters/ice/needle.png${V}`,
  `posters/ice/plate.png${V}`,
  `posters/ice/rosette.png${V}`,
  `posters/ice/sectored.png${V}`,
  `posters/ice/snow.png${V}`,
  `posters/land/base.png${V}`,
  `posters/land/eggs.png${V}`,
  `posters/land/flowering.png${V}`,
  `posters/land/layers.json${V}`,
  `posters/land/lungs.png${V}`,
  `posters/land/seeds.png${V}`,
  `posters/land/wings.png${V}`,
  `posters/meadow/barley.png${V}`,
  `posters/meadow/base.png${V}`,
  `posters/meadow/drought.png${V}`,
  `posters/meadow/forests.png${V}`,
  `posters/meadow/grass.png${V}`,
  `posters/meadow/layers.json${V}`,
  `posters/meadow/lily.png${V}`,
  `posters/meadow/lupine.png${V}`,
  `posters/meadow/millet.png${V}`,
  `posters/meadow/poppy.png${V}`,
  `posters/meadow/primrose.png${V}`,
  `posters/meadow/rice.png${V}`,
  `posters/meadow/roots.png${V}`,
  `posters/meadow/soil.png${V}`,
  `posters/meadow/sunflower.png${V}`,
  `posters/meadow/superbloom.png${V}`,
  `posters/meadow/teosinte.png${V}`,
  `posters/meadow/wheat.png${V}`,
  `posters/molecules/base.png${V}`,
  `posters/molecules/layers.json${V}`,
  `posters/molecules/mCH4.png${V}`,
  `posters/molecules/mCO2.png${V}`,
  `posters/molecules/mH2.png${V}`,
  `posters/molecules/mH2O.png${V}`,
  `posters/molecules/mN2.png${V}`,
  `posters/molecules/mNH3.png${V}`,
  `posters/molecules/mO2.png${V}`,
  `posters/molecules/mO3.png${V}`,
  `posters/moon/base.png${V}`,
  `posters/moon/eclipse.png${V}`,
  `posters/moon/firstquarter.png${V}`,
  `posters/moon/fullmoon.png${V}`,
  `posters/moon/lastquarter.png${V}`,
  `posters/moon/layers.json${V}`,
  `posters/moon/moonlight.png${V}`,
  `posters/moon/moonphases.png${V}`,
  `posters/moon/newmoon.png${V}`,
  `posters/moon/tides.png${V}`,
  `posters/moon/wancrescent.png${V}`,
  `posters/moon/wangibbous.png${V}`,
  `posters/moon/waxcrescent.png${V}`,
  `posters/moon/waxgibbous.png${V}`,
  `posters/plates/base.png${V}`,
  `posters/plates/collision.png${V}`,
  `posters/plates/drift.png${V}`,
  `posters/plates/earthquake.png${V}`,
  `posters/plates/emerald.png${V}`,
  `posters/plates/faults.png${V}`,
  `posters/plates/garnet.png${V}`,
  `posters/plates/jade.png${V}`,
  `posters/plates/lapis.png${V}`,
  `posters/plates/layers.json${V}`,
  `posters/plates/mountains.png${V}`,
  `posters/plates/plates.png${V}`,
  `posters/plates/ruby.png${V}`,
  `posters/plates/sapphire.png${V}`,
  `posters/rivers/base.png${V}`,
  `posters/rivers/delta.png${V}`,
  `posters/rivers/flood.png${V}`,
  `posters/rivers/glaciers.png${V}`,
  `posters/rivers/lakes.png${V}`,
  `posters/rivers/layers.json${V}`,
  `posters/rivers/rivers.png${V}`,
  `posters/rivers/wetlands.png${V}`,
  `posters/sea/anglerfish.png${V}`,
  `posters/sea/base.png${V}`,
  `posters/sea/biolum.png${V}`,
  `posters/sea/blooms.png${V}`,
  `posters/sea/combjelly.png${V}`,
  `posters/sea/currents.png${V}`,
  `posters/sea/fireflysquid.png${V}`,
  `posters/sea/lanternfish.png${V}`,
  `posters/sea/layers.json${V}`,
  `posters/sea/pools.png${V}`,
  `posters/sea/redtide.png${V}`,
  `posters/sea/seasparkle.png${V}`,
  `posters/sea/shallows.png${V}`,
  `posters/sea/tides.png${V}`,
  `posters/sea/vents.png${V}`,
  `posters/sea/waves.png${V}`,
  `posters/sealife/antennae.png${V}`,
  `posters/sealife/backbone.png${V}`,
  `posters/sealife/base.png${V}`,
  `posters/sealife/eyes.png${V}`,
  `posters/sealife/jaws.png${V}`,
  `posters/sealife/layers.json${V}`,
  `posters/sealife/predators.png${V}`,
  `posters/sealife/shells.png${V}`,
  `posters/spectrum/base.png${V}`,
  `posters/spectrum/blue.png${V}`,
  `posters/spectrum/gamma.png${V}`,
  `posters/spectrum/green.png${V}`,
  `posters/spectrum/infrared.png${V}`,
  `posters/spectrum/layers.json${V}`,
  `posters/spectrum/microwave.png${V}`,
  `posters/spectrum/orange.png${V}`,
  `posters/spectrum/radio.png${V}`,
  `posters/spectrum/rainbow.png${V}`,
  `posters/spectrum/red.png${V}`,
  `posters/spectrum/starlight.png${V}`,
  `posters/spectrum/ultraviolet.png${V}`,
  `posters/spectrum/violet.png${V}`,
  `posters/spectrum/xray.png${V}`,
  `posters/spectrum/yellow.png${V}`,
  `posters/stars/base.png${V}`,
  `posters/stars/layers.json${V}`,
  `posters/stars/milkyway.png${V}`,
  `posters/stars/nebulae.png${V}`,
  `posters/stars/starcolors.png${V}`,
  `posters/stars/starlight.png${V}`,
  `posters/stars/starsight.png${V}`,
  `posters/stars/starsigns.png${V}`,
  `posters/stars/supernova.png${V}`,
  `posters/storms/base.png${V}`,
  `posters/storms/drought.png${V}`,
  `posters/storms/flood.png${V}`,
  `posters/storms/hail.png${V}`,
  `posters/storms/hurricane.png${V}`,
  `posters/storms/layers.json${V}`,
  `posters/storms/lightning.png${V}`,
  `posters/storms/storms.png${V}`,
  `posters/sun/aurora.png${V}`,
  `posters/sun/base.png${V}`,
  `posters/sun/ignition.png${V}`,
  `posters/sun/layers.json${V}`,
  `posters/sun/solarstorm.png${V}`,
  `posters/sun/solarwind.png${V}`,
  `posters/sun/sun2.png${V}`,
  `posters/sun/uv.png${V}`,
  `posters/visitors/asteroid.png${V}`,
  `posters/visitors/asteroids.png${V}`,
  `posters/visitors/base.png${V}`,
  `posters/visitors/carbonaceous.png${V}`,
  `posters/visitors/chondrite.png${V}`,
  `posters/visitors/cometpaths.png${V}`,
  `posters/visitors/cometsight.png${V}`,
  `posters/visitors/iridium.png${V}`,
  `posters/visitors/iron.png${V}`,
  `posters/visitors/layers.json${V}`,
  `posters/visitors/meteors.png${V}`,
  `posters/visitors/orbits.png${V}`,
  `posters/visitors/pallasite.png${V}`,
  `posters/volcanoes/amethyst.png${V}`,
  `posters/volcanoes/base.png${V}`,
  `posters/volcanoes/diamond.png${V}`,
  `posters/volcanoes/eruption.png${V}`,
  `posters/volcanoes/geode.png${V}`,
  `posters/volcanoes/lavafields.png${V}`,
  `posters/volcanoes/layers.json${V}`,
  `posters/volcanoes/obsidian.png${V}`,
  `posters/volcanoes/opal.png${V}`,
  `posters/volcanoes/peridot.png${V}`,
  `posters/volcanoes/richsoil.png${V}`,
  `posters/volcanoes/supereruption.png${V}`,
  `posters/volcanoes/supervolcano.png${V}`,
  `posters/volcanoes/volcano.png${V}`,
  `posters/volcanoes/volcgas.png${V}`,
  `posters/warm/base.png${V}`,
  `posters/warm/brain.png${V}`,
  `posters/warm/feathers.png${V}`,
  `posters/warm/fur.png${V}`,
  `posters/warm/layers.json${V}`,
  `posters/warm/upright.png${V}`,
  `posters/water/base.png${V}`,
  `posters/water/clouds.png${V}`,
  `posters/water/currents.png${V}`,
  `posters/water/evap.png${V}`,
  `posters/water/layers.json${V}`,
  `posters/water/rain.png${V}`,
  `posters/water/rainbow.png${V}`,
  `posters/water/snow.png${V}`,
  `posters/year/autumn.png${V}`,
  `posters/year/base.png${V}`,
  `posters/year/circadian.png${V}`,
  `posters/year/iceage.png${V}`,
  `posters/year/layers.json${V}`,
  `posters/year/rotation.png${V}`,
  `posters/year/spring.png${V}`,
  `posters/year/summer.png${V}`,
  `posters/year/tilt.png${V}`,
  `posters/year/winter.png${V}`,
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
