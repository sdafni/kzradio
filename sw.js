// The old app installed a cache-first service worker, so phones kept showing
// the old cached page. The browser still checks this file for updates; this
// version deletes the old caches, removes itself, and reloads open pages.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: "window" })) {
      client.navigate(client.url);
    }
  })());
});
