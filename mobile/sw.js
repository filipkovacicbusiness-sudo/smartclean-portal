/* SmartClean — service worker (SmartClean mobile). ZGRAJENO z aplikacija/zgradi.py — ne urejaj ročno. */
/* HTML = network-first (vedno sveža koda, brez povezave iz predpomnilnika),
   lastne statične datoteke = cache-first. Klici na Supabase se NIKOLI ne predpomnijo. */
const CACHE = "pralnica-mobil-v10-0";
const CORE = ["index.html", "manifest.json", "icon-192.png", "icon-512.png", "supabase.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const req = e.request;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;   // Supabase: vedno z mreže
  const path = url.pathname;
  const isHTML = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html") || path.endsWith("/") || path.endsWith("index.html");
  if (isHTML) {
    e.respondWith(fetch(req).then((resp) => {
      const copy = resp.clone();
      caches.open(CACHE).then((c) => c.put("index.html", copy)).catch(() => {});
      return resp;
    }).catch(() => caches.match("index.html")));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((resp) => {
    const copy = resp.clone();
    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
    return resp;
  })));
});
