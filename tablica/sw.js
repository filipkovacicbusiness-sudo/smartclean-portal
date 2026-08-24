/* Pralnica — service worker (mobil) */
/* HTML = network-first (vedno sveža koda, offline pa iz predpomnilnika),
   lastne statične datoteke (ikone, xlsx, supabase.js) = cache-first.
   POMEMBNO: klici na Supabase (API + realtime) se NIKOLI ne predpomnijo —
   drugače aplikacija streže star odgovor in podatki niso sveži. */
const CACHE = "pralnica-tablica-v8-4";
const CORE = [
  "index.html",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "xlsx.full.min.js",
  "supabase.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const req = e.request;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Karkoli NI na naši domeni (Supabase REST/realtime, zunanje pisave ...) →
  // ne diramo: vedno sveže z mreže, brez predpomnjenja.
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isHTML = req.mode === "navigate"
    || (req.headers.get("accept") || "").includes("text/html")
    || path.endsWith("/") || path.endsWith("index.html");

  if (isHTML) {
    // NETWORK-FIRST: vzemi svežo kodo; ob napaki (offline) iz predpomnilnika
    e.respondWith(
      fetch(req).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put("index.html", copy)).catch(() => {});
        return resp;
      }).catch(() => caches.match("index.html"))
    );
    return;
  }

  // CACHE-FIRST samo za LASTNE statične datoteke
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((resp) => {
      const copy = resp.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return resp;
    }).catch(() => caches.match("index.html")))
  );
});
