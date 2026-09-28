// Network first, cache only as the offline fallback: a new version shows up on
// the next load (the old version of this file served the cache first, so
// phones kept an old copy), and the installed app still opens offline.
const CACHE = "kzradio-app";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Only our own files; the Worker API, images and audio go straight out.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    } catch (err) {
      const cached = await caches.match(req)
        || (req.mode === "navigate" ? await caches.match("./") : undefined);
      if (cached) return cached;
      throw err;
    }
  })());
});
