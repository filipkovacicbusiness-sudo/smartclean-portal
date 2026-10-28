/* SmartClean Portal — service worker (PWA)
   STALNA IMENA DATOTEK: portal.css / portal.js se prepišeta na istem mestu.
   Koda (HTML/JS/CSS/JSON): network-first z obvezno osvežitvijo (cache:'no-cache'),
   zato so posodobitve vidne takoj, ko si na spletu — brez menjave imen datotek.
   Slike/pisave: cache-first (redko se menjajo). APK: vedno z mreže (3+ MB, ob novi
   različici bi sicer tablica dobila star paket iz predpomnilnika). */
var CACHE = 'sc-portal';
var PRECACHE = ['./boot.js', './portal.css', './portal.js', './start.js', './supabase.js', './config.js', './index.html',
  './pdfgen.js', './spremni-pdf.js'];   // lena modula za PDF — prednaloži, da PDF deluje tudi brez povezave
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
    // samo LASTNI stari predpomnilniki — aplikacija za spremne liste (/mobile, »pralnica-…«) je na isti
    // domeni; prej je portal izbrisal njen predpomnilnik in se na iPhonu brez povezave ni zagnala
    return Promise.all(ks.map(function (k) { if (k !== CACHE && k.indexOf('sc-portal') === 0) return caches.delete(k); }));
  }).then(function () {
    // stare kopije APK iz predpomnilnika (prej cache-first) odstrani
    return caches.open(CACHE).then(function (c) { return c.keys().then(function (zahteve) {
      return Promise.all(zahteve.filter(function (r) { return /\.apk(\?|$)/i.test(r.url); }).map(function (r) { return c.delete(r); }));
    }); });
  }).then(function () { return self.clients.claim(); }));
});
function jeMedij(p) { return /\.(png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf)$/i.test(p); }
self.addEventListener('fetch', function (e) {
  var req = e.request; if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   /* Supabase / zunanje pusti */
  /* config.js: z mreže (vedno svež), brez povezave iz predpomnilnika — sicer se portal brez povezave ne zažene */
  if (/\.apk$/i.test(url.pathname)) return;           /* APK vedno z mreže */
  if (jeMedij(url.pathname)) {
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) { var c = res.clone(); caches.open(CACHE).then(function (k) { k.put(req, c); }).catch(function () {}); return res; });
    }));
    return;
  }
  /* Koda/HTML: vedno preveri strežnik (no-cache) → sveža koda brez menjave imen. */
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then(function (res) {
      if (res.status >= 500) {   // strežnik ne odgovarja pravilno: shranjena kopija, če obstaja
        return caches.match(req).then(function (h) { return h || caches.match(req, { ignoreSearch: true }); }).then(function (h) { return h || res; });
      }
      if (!res.ok) return res;
      var c = res.clone();
      caches.open(CACHE).then(function (k) {   // ena kopija na datoteko: starejše različice (?v=…) iste poti ven
        return k.keys().then(function (zs) { zs.forEach(function (r) { var u = new URL(r.url); if (u.pathname === url.pathname && u.search !== url.search) k.delete(r); }); return k.put(req, c); });
      }).catch(function () {});
      return res;
    }).catch(function () {
      // brez povezave: točna kopija, sicer ista datoteka druge različice; stran (navigacija) → index.html, skripta nikoli ne dobi HTML
      return caches.match(req).then(function (h) { return h || caches.match(req, { ignoreSearch: true }); })
        .then(function (h) { return h || (req.mode === 'navigate' ? caches.match('./index.html', { ignoreSearch: true }) : Response.error()); });
    })
  );
});
