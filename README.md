# KZRadio Picker

A show and episode picker for [kzradio.net](https://www.kzradio.net/): search every show, browse its full episode archive, star favorites, pick a random episode, and read track listings.

App: https://sdafni.github.io/kzradio/ (install it from there on a phone)

## How it works

The app (`index.html` + `app.js`) runs on GitHub Pages. kzradio.net does not let other sites read its pages (no CORS headers), so the app reads kzradio.net through `worker/`, a small Cloudflare Worker at https://kzradio-api.sdafni.workers.dev.

- The Worker reads the public pages on the server (where CORS does not apply), caches replies in Workers KV, and allows CORS only for this site.
- It is not an open proxy: it builds a few fixed kzradio.net URLs from validated parameters.
- Audio plays straight from Podbean, not through the Worker.

Android gets a one-tap install button; iPhone shows the Share -> Add to Home Screen steps (Safari has no install API).

## Data sources (all on kzradio.net, read by the Worker)

| What | Where |
|---|---|
| List of shows (names as the site shows them) | `<select name="showsfilter">` on `/last-shows`; reading stops after it (~50 KB) |
| Show slug, looked up when you pick a show | `POST /last-shows` with `free_search=&showsfilter={id}`; the first episode card links to `/shows/{slug}` |
| Episodes and track listings | `/shows/{slug}/feed?paged=N` (404 after the last page) |
| Show image and description | `/shows/{slug}/` |

kzradio.net rate-limits bursts (HTTP 429 after about 50 fast requests); the Worker's cache keeps most requests from reaching it.

Saved in the browser's `localStorage` under `kzw.*` keys: stars, the show list, and the current show, episode and playback position (Android closes a backgrounded app's page; on reopen the app comes back paused where it was). Episodes load fresh when you open a show and stay in memory while the app is open (reloaded after 12 hours). The show list refreshes daily.

## Files

    index.html        the app (installable PWA shell around app.js)
    app.js            the picker (UI in a shadow root)
    sw.js             network-first service worker (offline fallback only)
    worker/           Cloudflare Worker: cd worker && npm install && npx wrangler deploy
    manifest.webmanifest, icon*.svg, icon*.png

## Local testing

    python3 -m http.server 8765

Open http://localhost:8765/ (the Worker allows this origin).
