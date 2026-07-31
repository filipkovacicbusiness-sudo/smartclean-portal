/* SmartClean Portal — service worker (PWA)
   STALNA IMENA DATOTEK: portal.css / portal.js se prepišeta na istem mestu.
   Koda (HTML/JS/CSS/JSON): network-first z obvezno osvežitvijo (cache:'no-cache'),
   zato so posodobitve vidne takoj, ko si na spletu — brez menjave imen datotek.
   Slike/pisave/APK: cache-first (redko se menjajo). */
var CACHE = 'sc-portal';
var PRECACHE = ['./portal.css', './portal.js', './start.js', './supabase.js', './index.html'];
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // ob namestitvi vzemi sveže kopije (brez HTTP predpomnilnika)
      return Promise.all(PRECACHE.map(function (u) {
        return fetch(u, { cache: 'no-cache' }).then(function (r) { return c.put(u, r); }).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
function jeMedij(p) { return /\.(png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf|apk)$/i.test(p); }
self.addEventListener('fetch', function (e) {
  var req = e.request; if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   /* Supabase / zunanje pusti */
  if (/\/config\.js$/.test(url.pathname)) return;     /* config vedno svež */
  if (jeMedij(url.pathname)) {
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) { var c = res.clone(); caches.open(CACHE).then(function (k) { k.put(req, c); }).catch(function () {}); return res; });
    }));
    return;
  }
  /* Koda/HTML: vedno preveri strežnik (no-cache) → sveža koda brez menjave imen. */
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then(function (res) {
      var c = res.clone(); caches.open(CACHE).then(function (k) { k.put(req, c); }).catch(function () {}); return res;
    }).catch(function () {
      return caches.match(req).then(function (h) { return h || caches.match('./index.html'); });
    })
  );
});
