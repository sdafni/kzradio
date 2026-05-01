/* KZRadio app-shell service worker.
 *
 * Strategy:
 *   - Cache the static app shell (HTML/JS/CSS/icons/manifest) on install so
 *     the page loads when offline.
 *   - Stale-while-revalidate for data.json: serve last-known-good immediately,
 *     refresh in background when online. Keeps load instant on flaky mobile.
 *   - Bypass the SW entirely for mp3 / audio: streams should always go to the
 *     network; we don't want to fill phone storage with cached audio.
 */

const VERSION = "kzradio-v2";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-maskable.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Don't touch audio: always network, no caching.
  const isAudio =
    /\.(mp3|m4a|aac|ogg|opus|wav)(\?.*)?$/i.test(url.pathname) ||
    (req.destination === "audio");
  if (isAudio) return;

  // Same-origin only — leave 3rd-party (kzradio.net images, podbean, CORS proxies) alone.
  if (url.origin !== self.location.origin) return;

  // Stale-while-revalidate for data.json (used as one-time bootstrap if present)
  if (url.pathname.endsWith("/data.json")) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Cache-first for shell assets
  event.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh.ok) {
      const cache = await caches.open(VERSION);
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (e) {
    // last-ditch: try the index for navigation requests
    if (req.mode === "navigate") {
      const fallback = await caches.match("./index.html");
      if (fallback) return fallback;
    }
    throw e;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || fetchPromise;
}
