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
  `data/chapters.yaml${V}`,
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
