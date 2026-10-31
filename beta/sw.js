// Network-first service worker: always fresh when online, still playable offline.
importScripts('version.js');
const CACHE = `phylarium-${CHANNEL}-${VERSION}`;
// Old caches of this channel. The other channel shares the origin, so leave its caches alone.
const OWN = [`phylarium-${CHANNEL}-`];
const ASSETS = ['./', 'index.html', 'style.css', 'version.js', 'sprites.js', 'terrain.js', 'sky.js', 'scene.js', 'game.js', 'icon.svg', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys
      .filter(k => k !== CACHE && OWN.some(p => k.startsWith(p)))
      .map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Revalidate with the server instead of trusting the browser cache, so a deploy never mixes
  // new and old files (GitHub Pages lets browsers cache each file for 10 minutes).
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
