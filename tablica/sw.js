/* Pralnica — service worker (mobil) */
/* HTML = network-first (vedno sveža koda, offline pa iz predpomnilnika),
   statične datoteke (ikone, xlsx) = cache-first. */
const CACHE = "pralnica-tablica-v5";
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
  let path = "";
  try { path = new URL(req.url).pathname; } catch (_) {}
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

  // CACHE-FIRST za statične datoteke (z runtime predpomnjenjem)
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((resp) => {
      const copy = resp.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return resp;
    }).catch(() => caches.match("index.html")))
  );
});
