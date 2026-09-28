# KZRadio Picker

A show and episode picker for [kzradio.net](https://www.kzradio.net/): search every show, browse its full episode archive, star favorites, pick a random episode, and read track listings.

App: https://sdafni.github.io/kzradio/ (install it from there on a phone)

## How it works

kzradio.net does not let other sites read its pages (no CORS headers), so there are two ways to run the picker:

- **The app** (`index.html`, installable on phones): runs on GitHub Pages and reads kzradio.net through `worker/`, a small Cloudflare Worker at https://kzradio-api.sdafni.workers.dev. The Worker reads the public pages on the server (where CORS does not apply), caches replies in Workers KV, and allows CORS only for this site. It is not an open proxy: it builds a few fixed kzradio.net URLs from validated parameters. Android gets a one-tap install button; iPhone shows the Share -> Add to Home Screen steps (Safari has no install API).
- **On kzradio.net itself** (`setup.html`): a userscript or bookmarklet loads `app.js` into kzradio.net, so it reads the site directly with no server in between.

The same `app.js` does both: on kzradio.net it reads the site directly, anywhere else it uses the Worker. Audio always plays straight from Podbean. `setup.html` also has a no-setup **Latest episodes** view from KZradio's Podbean feed (Podbean allows cross-origin reads).

## Data sources (all on kzradio.net)

| What | Where |
|---|---|
| List of shows (names as the site shows them) | `<select name="showsfilter">` on `/last-shows`; reading stops after it (~50 KB) |
| Show slug, looked up when you pick a show | `POST /last-shows` with `free_search=&showsfilter={id}`; the first episode card links to `/shows/{slug}` |
| Episodes and track listings | `/shows/{slug}/feed?paged=N` (404 after the last page) |
| Show image and description | `/shows/{slug}/` |

kzradio.net rate-limits bursts (HTTP 429 after about 50 fast requests), so the picker only requests what you open: one request for the show list, then a few per show you pick.

Data is kept in the browser's `localStorage` under `kzw.*` keys (the app and kzradio.net each keep their own). The show list refreshes daily; a show's episodes refresh when you open it after 12 hours.

## Files

    index.html        the app (installable PWA shell around app.js)
    app.js            the picker (UI in a shadow root)
    sw.js             network-first service worker (offline fallback only)
    setup.html        userscript/bookmarklet setup + Latest episodes view
    kzradio.user.js   userscript loader
    worker/           Cloudflare Worker: cd worker && npm install && npx wrangler deploy
    manifest.webmanifest, icon*.svg, icon*.png

## Local testing

    python3 -m http.server 8765

Open http://localhost:8765/ for the app (the Worker allows this origin) and /setup.html for the setup page. To test `app.js` on kzradio.net, the browser must load it over HTTPS (a page on kzradio.net cannot load `http://localhost` scripts), so test from a branch or inject the file's text into the page from the console.
