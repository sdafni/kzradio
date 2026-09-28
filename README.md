# KZRadio Picker

A show and episode picker for [kzradio.net](https://www.kzradio.net/): search every show, browse its full episode archive, star favorites, pick a random episode, and read track listings.

Install page: https://sdafni.github.io/kzradio/

## How it works

kzradio.net does not allow other sites to read its pages (no CORS headers). Instead of going through a proxy, the picker **runs on kzradio.net itself**, so it reads the site's own feeds directly. Nothing is stored on any server; audio plays straight from Podbean.

- **Userscript** (`kzradio.user.js`): a userscript manager (Violentmonkey, Tampermonkey, or the Userscripts app on iOS) adds a button to every kzradio.net page.
- **Bookmarklet**: a bookmark that opens the picker on kzradio.net. No extension needed.

Both only load `app.js` from GitHub Pages, so app updates need no reinstall.

The install page also has a **Latest episodes** view that needs no setup: the last ~600 episodes across all shows, from KZradio's Podbean feed (Podbean allows cross-origin reads).

## Data sources (all on kzradio.net)

| What | Where |
|---|---|
| List of shows (names as the site shows them) | `<select name="showsfilter">` on `/last-shows`; reading stops after it (~50 KB) |
| Show slug, looked up when you pick a show | `POST /last-shows` with `free_search=&showsfilter={id}`; the first episode card links to `/shows/{slug}` |
| Episodes and track listings | `/shows/{slug}/feed?paged=N` (404 after the last page) |
| Show image and description | `/shows/{slug}/` |

kzradio.net rate-limits bursts (HTTP 429 after about 50 fast requests), so the picker only requests what you open: one request for the show list, then a few per show you pick.

Data is kept in kzradio.net's `localStorage` under `kzw.*` keys. The show list refreshes daily; a show's episodes refresh when you open it after 12 hours.

## Files

    app.js            the picker (runs on kzradio.net, UI in a shadow root)
    kzradio.user.js   userscript loader
    index.html        install page + Latest episodes view
    sw.js             removes the service worker of the old version
    manifest.webmanifest, icon.svg, icon-maskable.svg

## Local testing

    python3 -m http.server 8765

Open http://localhost:8765/ for the install page. To test `app.js` on kzradio.net, the browser must load it over HTTPS (a page on kzradio.net cannot load `http://localhost` scripts), so test from a branch or inject the file's text into the page from the console.
