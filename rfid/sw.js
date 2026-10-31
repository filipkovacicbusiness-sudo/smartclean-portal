/* SmartClean RFID — service worker (le /rfid/). Koda: vedno sveža z mreže (no-cache), brez povezave ali ob
   napaki strežnika (5xx) iz predpomnilnika; pisave cache-first. Klici na Supabase se nikoli ne predpomnijo.
   APK vedno z mreže. Preverjanje različice (spremembe.json) in naslovi z ?… se ne shranjujejo: vsak bi bil
   nov zapis, brez povezave pa bi aplikacija dobila najstarejšo različico in se po nepotrebnem naložila znova. */
var CACHE = 'sc-rfid';
var JEDRO = ['./', './index.html', './rfid.js', './rfid.css', './tema.js', '../portal.css', '../supabase.js', '../config.js', '../pdfgen.js', '../spremni-pdf.js',
  '../fonts/archivo-latin-wght-normal.woff2', '../fonts/archivo-latin-ext-wght-normal.woff2', '../fonts/playfair-display-latin-700-normal.woff2'];
function brezShrambe(url) { return !!url.search || /\/spremembe\.json$/.test(url.pathname); }
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(JEDRO.map(function (u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.keys().then(function (zahteve) {   // zapisi starejših različic (vsako preverjanje različice posebej)
      return Promise.all(zahteve.filter(function (r) { return brezShrambe(new URL(r.url)); }).map(function (r) { return c.delete(r); }));
    });
  }).catch(function () {}).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request; if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin || /\.apk$/i.test(url.pathname)) return;
  if (/\/spremembe\.json$/.test(url.pathname)) return;   // različica le z mreže: brez povezave ni odgovora (ne star)
  if (/\.(woff2?|png|svg|ico)$/i.test(url.pathname)) {
    e.respondWith(caches.match(req).then(function (h) { return h || fetch(req).then(function (r) { if (r.ok) { var c = r.clone(); caches.open(CACHE).then(function (k) { k.put(req, c); }).catch(function () {}); } return r; }); }));
    return;
  }
  var nav = req.mode === 'navigate';
  var shranjena = function () {   // shranjena kopija; za stran aplikacija, za ostalo nič (index.html kot skript bi bil napaka)
    return caches.match(req, { ignoreSearch: true }).then(function (h) { return h || (nav ? caches.match('./index.html') : null); });
  };
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(function (r) {
    if (r.ok) { if (!brezShrambe(url)) { var c = r.clone(); caches.open(CACHE).then(function (k) { k.put(req, c); }).catch(function () {}); } return r; }
    if (r.status >= 500) return shranjena().then(function (h) { return h || r; });   // strežnik ne odgovarja pravilno: shranjena kopija, ne napaka
    return r;
  }).catch(function () {
    return shranjena().then(function (h) { return h || Response.error(); });
  }));
});
