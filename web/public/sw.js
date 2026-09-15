/* Musica service worker: app shell + analysis engine offline. */
const VERSION = "musica-v9";
const PRECACHE = ["/", "/library", "/live", "/me", "/manifest.webmanifest",
  "/essentia/essentia-wasm.web.js?v=7", "/essentia/essentia-wasm.web.wasm?v=7", "/essentia/essentia.js-core.umd.min.js?v=7", "/workers/analysis.js?v=7", "/workers/mic-processor.js?v=2",
  "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // audio service, lrclib, thumbnails: network only

  // Hashed Next assets and icons: cache first
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(caches.open(VERSION).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  // Analysis engine (versioned by query string): cache first, refresh in background
  if (url.pathname.startsWith("/essentia/") || url.pathname.startsWith("/workers/")) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const cached = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => cached);
      return cached || net;
    }));
    return;
  }
  // Lyrics API: stale-while-revalidate
  if (url.pathname.startsWith("/api/lyrics")) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const cached = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => cached);
      return cached || net;
    }));
    return;
  }
  // Navigations: network first, fall back to cached shell
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((r) => { caches.open(VERSION).then((c) => c.put(req, r.clone())); return r; })
      .catch(async () => (await caches.match(req)) || (await caches.match("/")) || Response.error()));
  }
});
