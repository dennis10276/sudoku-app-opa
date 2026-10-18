/* Offline support. Network first (so updates arrive right away), cache as fallback. */
const CACHE = 'sudoku-v23';
const FILES = ['./', 'index.html', 'style.css?v=23', 'game.js?v=23', 'tracking-config.js?v=23', 'tracking.js?v=23', 'core.js?v=23', 'puzzles.js?v=23', 'manifest.webmanifest',
  'qrcode.js?v=1', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('sudoku-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('.apk')) return;   // the Android app downloads straight
  // the page itself is always checked with the server (no browser cache), so a new version arrives right away
  const fresh = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req);
  e.respondWith(
    fresh.then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: false }).then(r => r || caches.match('index.html')))
  );
});
