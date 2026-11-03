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
  ...['sky.js', 'scene.js', 'puzzles.js', 'game.js', 'play.js', 'book.js', 'main.js'].map(f => f + V),
  ...['book', 'research', 'species', 'stories', 'disasters', 'atoms', 'laws', 'sky', 'collections'].map(
    f => `data/${f}.yaml${V}`,
  ),
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
