/* SmartClean Portal — service worker (PWA)
   Koda (HTML/JS/CSS/JSON): network-first → posodobitve so vidne takoj, ko si na spletu.
   Slike/pisave/APK: cache-first (redko se menjajo). */
var CACHE = 'sc-portal-v25';
var PRECACHE = ['./portal.v25.css','./portal.v25.js','./start.js','./supabase.js','./index.html'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(PRECACHE).catch(function(){}); }).then(function () { return self.skipWaiting(); }));
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
      return hit || fetch(req).then(function (res) { var c = res.clone(); caches.open(CACHE).then(function (k) { k.put(req, c); }).catch(function(){}); return res; });
    }));
    return;
  }
  e.respondWith(
    fetch(req).then(function (res) { var c = res.clone(); caches.open(CACHE).then(function (k) { k.put(req, c); }).catch(function(){}); return res; })
      .catch(function () { return caches.match(req).then(function (h) { return h || caches.match('./index.html'); }); })
  );
});
