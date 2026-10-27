/* SmartClean RFID — service worker (le /rfid/). Koda: vedno sveža z mreže (no-cache), brez povezave iz
   predpomnilnika; pisave cache-first. Klici na Supabase se nikoli ne predpomnijo. APK vedno z mreže. */
var CACHE = 'sc-rfid';
var JEDRO = ['./', './index.html', './rfid.js', './rfid.css', './tema.js', '../portal.css', '../supabase.js', '../config.js',
  '../fonts/archivo-latin-wght-normal.woff2', '../fonts/archivo-latin-ext-wght-normal.woff2', '../fonts/playfair-display-latin-700-normal.woff2'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(JEDRO.map(function (u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  var req = e.request; if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin || /\.apk$/i.test(url.pathname)) return;
  if (/\.(woff2?|png|svg|ico)$/i.test(url.pathname)) {
    e.respondWith(caches.match(req).then(function (h) { return h || fetch(req).then(function (r) { var c = r.clone(); caches.open(CACHE).then(function (k) { k.put(req, c); }); return r; }); }));
    return;
  }
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(function (r) {
    if (r.ok) { var c = r.clone(); caches.open(CACHE).then(function (k) { k.put(req, c); }).catch(function () {}); }
    else if (req.mode === 'navigate' && r.status >= 500) {   // strežnik ne odgovarja pravilno: shranjena aplikacija, ne stran z napako
      return caches.match('./index.html').then(function (h) { return h || r; });
    }
    return r;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (h) { return h || caches.match('./index.html'); });
  }));
});
