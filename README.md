# KZRadio – On Demand picker

A self-contained web app on top of the on-demand catalog at [kzradio.net](https://www.kzradio.net/). No backend, no Python, no build step — just static files. Works as a Progressive Web App on iOS and Android (Add to Home Screen).

What it does:

1. Add a show by pasting its URL (or just typing the slug, e.g. `lost_days`).
2. Pick an episode from a dropdown of all episodes for that show.
3. Roll a random episode (within a show, or across all shows you've added).
4. Star episodes you like; favorites persist in your browser.

## How it works

Each show on kzradio.net has a podcast RSS feed at `/shows/{slug}/feed/` (you can see the RSS button on any show's page). The app fetches that feed on demand, parses it in the browser with `DOMParser`, and stores the result in `localStorage`. Audio plays directly from the Podbean URLs in each `<enclosure>`.

kzradio.net doesn't send CORS headers, so cross-origin `fetch()` from your app's origin (e.g. `username.github.io`) is blocked. The app routes through a public CORS proxy chain: it tries [corsproxy.io](https://corsproxy.io) first, falls back to [allorigins.win](https://allorigins.win) and [codetabs.com](https://api.codetabs.com), and gives up if all three are down.

mp3 audio plays directly — Podbean *does* send permissive CORS headers, so the proxy is only used for HTML/RSS.

## Files

    index.html             # the entire app (single self-contained file)
    sw.js                  # service worker (offline app shell)
    manifest.webmanifest   # PWA manifest
    icon.svg, icon-maskable.svg

If you previously ran the (now-retired) Python scraper, your `data.json` is detected on first launch and offered as a one-time bootstrap so you don't have to re-add every show. After that, everything lives in `localStorage`.

## Run / deploy

The app is static. Open it via a local server:

```bash
cd ~/Documents/Claude/Projects/kzradio
python3 -m http.server 8000   # any static server works; this just happens to be one-liner
# open http://localhost:8000/
```

Or deploy anywhere static — GitHub Pages, Netlify drag-and-drop, Cloudflare Pages, Vercel. Once your URL is up, on your phone use **Share → Add to Home Screen** (iOS Safari) or **⋮ → Install app** (Android Chrome). After that it launches fullscreen, the service worker caches the app shell, and the lock-screen player shows the show name + episode title via the Media Session API.

## Adding shows

In the **Add show** field, paste any of:

- a full show URL: `https://www.kzradio.net/shows/lost_days/`
- an episode URL: `https://www.kzradio.net/shows/lost_days/41044`
- the bare slug: `lost_days`

The app extracts the slug, fetches `/shows/{slug}/feed/`, paginates with `?paged=N` until empty, parses, and saves. WordPress caps each feed page at 10 items by default, so a show with 350 episodes triggers ~35 small fetches the first time. Subsequent loads are instant.

The **Refresh** button on the picker re-fetches a single show. **Remove** drops the show + its cached episodes (favorites are kept).

## Browse all shows

Expand **Browse all shows on kzradio.net** and click **Load shows**. The app fetches `/last-shows`, parses the show-filter dropdown to get every show name, then walks paginated `/last-shows/page/N/` to map names → slugs (slugs like `lost_days` aren't derivable from the Hebrew name). The list caches indefinitely; **⟳ Refresh list** re-fetches.

## Favorites

Stars live in `localStorage` (key `kzradio.favorites.v1`), per-browser-per-device. To move them between phone and desktop:

- **★ panel → 📋 Copy favorites** copies a JSON blob to the clipboard.
- On the other device, **★ panel → 📥 Import…** reveals a textarea — paste, click Apply. Imported entries merge with anything already there.

## Notes / gotchas

- **CORS proxies are public services and may rate-limit.** If a fetch fails repeatedly, the typical cause is the proxy being slow or down — wait a minute and try again, or check the developer console for which proxy returned an error. To swap in your own proxy, edit the `PROXIES` array near the top of the script in `index.html`.
- **Audio cross-origin.** Podbean URLs work in `<audio>` cross-origin. If a track ever refuses to play, the error message in the picker links to the original episode page on kzradio.net.
- **Storage.** localStorage is capped at ~5–10 MB per origin. Even a 700-episode show is well under 1 MB of metadata, so you can comfortably track dozens of shows.
- **Episode IDs / permalinks** are stable WordPress IDs (`/shows/{slug}/{post_id}`). Favorites are keyed on the permalink, so they survive re-fetches.
- **Hebrew RTL layout** is enabled at the document level (`dir="rtl"`).
