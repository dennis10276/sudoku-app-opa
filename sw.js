/* Offline support. Network first (so updates arrive right away), cache as fallback. */
const CACHE = 'sudoku-v18';
const FILES = ['./', 'index.html', 'style.css?v=18', 'game.js?v=18', 'tracking-config.js?v=18', 'tracking.js?v=18', 'core.js?v=18', 'puzzles.js?v=18', 'manifest.webmanifest',
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
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: false }).then(r => r || caches.match('index.html')))
  );
});
