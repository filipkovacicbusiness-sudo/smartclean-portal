/* SmartClean Portal — service worker (PWA)
   HTML: network-first (da se posodobitve vedno prikažejo).
   Statične (verzionirane) datoteke: cache-first (varno, ker ime nosi verzijo). */
var CACHE = 'sc-portal-v18';
var SHELL = [
  './assets/portal.v18.css',
  './assets/portal.v18.js',
  './assets/start.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './vendor/supabase.js'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL).catch(function(){}); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
function jeHTML(req, url) {
  return req.mode === 'navigate' || /\.html$/.test(url.pathname) || url.pathname === '/' || url.pathname.endsWith('/');
}
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      /* nikoli Supabase / zunanje */
  if (/\/config\.js$/.test(url.pathname)) return;        /* config vedno svež */
  if (jeHTML(req, url)) {
    /* network-first: sveža stran, ob izpadu iz predpomnilnika */
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function(){});
        return res;
      }).catch(function () { return caches.match(req).then(function (h) { return h || caches.match('./index.html'); }); })
    );
    return;
  }
  /* statične: cache-first + tiho dopolni */
  e.respondWith(
    caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function(){});
        return res;
      });
    })
  );
});
