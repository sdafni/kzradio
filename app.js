// KZRadio picker. Runs on www.kzradio.net, loaded by kzradio.user.js or the
// bookmarklet from index.html. Same-origin, so it reads kzradio.net feeds
// directly (no CORS proxy). UI lives in a shadow root so kzradio.net styles
// and ours cannot leak into each other.
(() => {
"use strict";

if (window.kzw) { window.kzw.open(); return; }

const APP_BASE = new URL(".", document.currentScript?.src || location.href).href;
const BASE = "https://www.kzradio.net";
// On kzradio.net (userscript/bookmarklet) we read the site directly. Anywhere
// else (the installable app on GitHub Pages) kzradio.net cannot be read from
// the browser, so we go through our Worker, which reads it on the server.
const ON_KZRADIO = location.origin === BASE;
const API = "https://kzradio-api.sdafni.workers.dev";

const CSS = `
  :host {
    all: initial;
    display: block;
    --bg: #0e0f12;
    --panel: #16181d;
    --panel-2: #1e2229;
    --panel-3: #262b34;
    --text: #f1f1f1;
    --muted: #9aa0a6;
    --accent: #ffcc33;
    --accent-2: #ff8855;
    --star: #ffd24a;
    --border: #2a2f38;
    --danger: #ff7b7b;
    --ok: #7bd88f;
  }
  * { box-sizing: border-box; }
  .overlay {
    position: fixed; inset: 0;
    z-index: 2147483647;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--bg); color: var(--text);
    font: 16px/1.5 -apple-system, "Segoe UI", "Heebo", "Arial Hebrew", Arial, sans-serif;
    text-align: start;
    padding: 16px;
    padding-top: max(16px, env(safe-area-inset-top));
    padding-bottom: max(16px, env(safe-area-inset-bottom));
    -webkit-tap-highlight-color: transparent;
  }
  .overlay[hidden] { display: none; }
  /* The installable app: the picker is the page itself. */
  .overlay.app { position: static; overflow: visible; min-height: 100vh; }
  .overlay.app ~ .launcher, .overlay.app .close { display: none; }
  main { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }

  .launcher {
    position: fixed;
    bottom: calc(var(--launcher-bottom, 16px) + env(safe-area-inset-bottom));
    inset-inline-start: 16px;
    z-index: 2147483646;
    width: 52px; height: 52px;
    border-radius: 50%;
    border: none;
    background: var(--accent); color: #1a1a1a;
    font: 700 24px/1 -apple-system, "Segoe UI", Arial, sans-serif;
    box-shadow: 0 4px 16px rgba(0,0,0,.4);
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .launcher[hidden] { display: none; }

  header.app {
    display: flex; align-items: baseline; gap: 12px;
  }
  header.app h1 {
    font-size: 18px; margin: 0; flex: 1; font-weight: 700;
  }
  header.app .status { color: var(--muted); font-size: 12px; }
  header.app .status.err { color: var(--danger); }
  header.app .close {
    background: transparent; color: var(--muted);
    border: 1px solid var(--border); border-radius: 8px;
    font: inherit; font-size: 16px; line-height: 1;
    padding: 8px 12px; min-height: 36px;
    cursor: pointer; align-self: center;
  }
  header.app .close:hover { color: var(--text); border-color: var(--text); }

  /* === selector === */
  section.selector {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px;
    display: flex; flex-direction: column; gap: 10px;
  }
  section.selector header {
    display: flex; align-items: center; gap: 10px;
  }
  section.selector header h2 {
    font-size: 13px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 0; flex: 1;
    font-weight: 600;
  }
  section.selector header .filter-btn {
    background: transparent;
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 99px;
    padding: 6px 12px;
    font: inherit; font-size: 12px;
    min-height: 32px;
    cursor: pointer;
    white-space: nowrap;
  }
  section.selector header .filter-btn.on {
    background: var(--star); color: #1a1a1a; border-color: var(--star);
    font-weight: 600;
  }
  section.selector header .filter-btn:disabled {
    opacity: 0.4; cursor: not-allowed;
  }

  /* === combobox === */
  .combobox { position: relative; }
  .combobox input {
    background: var(--panel-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 38px 12px 12px;   /* padding-inline-end for the chevron */
    font: inherit;
    width: 100%;
    min-height: 44px;
  }
  .combobox input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .combobox input:disabled { opacity: 0.5; }
  .combobox .chev {
    position: absolute;
    inset-inline-end: 12px; top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    color: var(--muted); font-size: 12px;
  }
  .combobox .dropdown {
    position: absolute;
    top: calc(100% + 4px); inset-inline-start: 0; inset-inline-end: 0;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    max-height: 50vh;
    overflow-y: auto;
    z-index: 20;
    list-style: none; margin: 0; padding: 0;
    box-shadow: 0 8px 24px rgba(0,0,0,.35);
  }
  .combobox .dropdown li {
    padding: 8px 12px;
    cursor: pointer;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center; gap: 8px;
  }
  .combobox .dropdown li .avatar {
    width: 32px; height: 32px;
    border-radius: 6px;
    object-fit: cover;
    background: #000;
    flex-shrink: 0;
  }
  .combobox .dropdown li .avatar.ph {
    background: var(--panel-3);
  }
  .combobox .dropdown li:last-child { border-bottom: none; }
  .combobox .dropdown li.active,
  .combobox .dropdown li:hover { background: var(--panel-3); }
  .combobox .dropdown li.synthetic {
    background: var(--panel);
    color: var(--accent);
    font-weight: 600;
    border-bottom: 1px solid var(--border);
  }
  .combobox .dropdown li.synthetic:hover { background: var(--panel-3); }
  .combobox .dropdown li .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .combobox .dropdown li .meta { color: var(--muted); font-size: 12px; flex-shrink: 0; }
  .combobox .dropdown li .pill {
    font-size: 10px; padding: 1px 6px; border-radius: 99px;
    border: 1px solid var(--border); color: var(--muted); flex-shrink: 0;
  }
  .combobox .dropdown li mark {
    background: rgba(255,204,51,0.25); color: var(--text); padding: 0 2px; border-radius: 3px;
  }
  .combobox .dropdown li.empty { color: var(--muted); cursor: default; }
  .combobox .dropdown li.empty:hover { background: var(--panel-2); }

  /* info icon — small "i" badge that shows description via native tooltip
     in dropdowns (avoids overflow clipping) and a styled tooltip in panels. */
  .info-icon {
    position: relative;
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px;
    border-radius: 50%;
    background: var(--panel-3);
    color: var(--muted);
    font-size: 12px; font-weight: 700; font-style: italic;
    border: 1px solid var(--border);
    cursor: help;
    flex-shrink: 0;
    user-select: none;
    line-height: 1;
  }
  .info-icon:hover, .info-icon:focus { color: var(--accent); border-color: var(--accent); outline: none; }
  .info-icon .tip {
    position: absolute;
    top: calc(100% + 6px);
    inset-inline-end: 0;
    background: var(--panel-3);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 12px;
    line-height: 1.45;
    font-weight: 400; font-style: normal;
    width: max-content;
    max-width: min(320px, 80vw);
    white-space: normal;
    z-index: 100;
    display: none;
    box-shadow: 0 8px 24px rgba(0,0,0,.5);
    text-align: start;
    pointer-events: none;
  }
  .info-icon:hover .tip,
  .info-icon:focus .tip { display: block; }

  /* === selected === */
  .selected {
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px;
  }
  .selected.placeholder {
    color: var(--muted);
    text-align: center;
    padding: 16px;
  }
  .selected .row1 {
    display: flex; gap: 12px; align-items: flex-start;
  }
  .selected img {
    width: 64px; height: 64px;
    border-radius: 8px;
    object-fit: cover;
    background: #000; flex-shrink: 0;
  }
  .selected .meta { flex: 1; min-width: 0; }
  .selected .meta .title {
    font-weight: 600; font-size: 15px;
    display: flex; align-items: center; gap: 8px;
  }
  .selected .meta .title .title-text {
    overflow: hidden; text-overflow: ellipsis;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    min-width: 0; flex: 1;
  }
  .selected .meta .sub { color: var(--muted); font-size: 13px; margin-top: 4px; }
  .selected .meta .sub a { color: inherit; }
  .selected .actions {
    display: flex; gap: 8px; flex-wrap: wrap;
    margin-top: 12px;
  }
  .selected .actions button {
    background: var(--panel-3);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 9px 14px;
    font: inherit;
    cursor: pointer;
    min-height: 38px;
  }
  .selected .actions button.primary {
    background: var(--accent); color: #1a1a1a;
    border-color: var(--accent); font-weight: 600;
  }
  .selected .actions button.primary:hover { background: var(--accent-2); border-color: var(--accent-2); }
  .selected .actions button.star.on { color: var(--star); border-color: var(--star); }
  .selected .actions button.danger { color: var(--danger); border-color: var(--danger); }
  .selected .actions button:disabled { opacity: 0.45; cursor: not-allowed; }
  .selected .row1 .clear-x {
    flex-shrink: 0;
    background: transparent;
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px 8px;
    font: inherit; font-size: 14px; line-height: 1;
    cursor: pointer;
    align-self: flex-start;
  }
  .selected .row1 .clear-x:hover { color: var(--danger); border-color: var(--danger); }
  .selected audio { width: 100%; margin-top: 12px; }
  .selected .err { color: var(--danger); }
  .selected .ok { color: var(--ok); }

  .tracks {
    margin-top: 12px;
    border-top: 1px solid var(--border);
    padding-top: 10px;
  }
  .tracks summary {
    cursor: pointer;
    color: var(--muted);
    font-size: 13px;
    user-select: none;
    padding: 4px 0;
  }
  .tracks summary:hover { color: var(--accent); }
  .tracks ol {
    margin: 8px 0 0;
    padding-inline-start: 24px;
    font-size: 13px;
    color: var(--text);
  }
  .tracks li { padding: 2px 0; }
  .tracks li::marker { color: var(--muted); }

  .spinner {
    display: inline-block; width: 14px; height: 14px;
    border: 2px solid var(--border); border-top-color: var(--accent);
    border-radius: 50%; animation: spin 0.7s linear infinite;
    vertical-align: middle; margin-inline-end: 6px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

const MARKUP = `<main>
  <header class="app">
    <h1>KZRadio · On Demand</h1>
    <span class="status" id="status"></span>
    <button type="button" class="close" id="closeBtn" title="Back to kzradio.net" aria-label="Close">✕</button>
  </header>

  <!-- Element 1: Show selector -->
  <section class="selector" id="showSection">
    <header>
      <h2>תוכנית · Show</h2>
      <button type="button" class="filter-btn" id="showFavBtn" title="Show favorited shows only">★ favorites</button>
    </header>
    <div class="combobox" data-which="show">
      <input id="showInput" type="search" autocomplete="off"
             placeholder="חיפוש תוכניות / Search…  (or paste a kzradio show URL)" />
      <span class="chev">▾</span>
      <ul class="dropdown" id="showDropdown" hidden></ul>
    </div>
    <div class="selected" id="showSelected"></div>
  </section>

  <!-- Element 2: Episode selector -->
  <section class="selector" id="episodeSection">
    <header>
      <h2>פרק · Episode</h2>
      <button type="button" class="filter-btn" id="epFavBtn" title="Show starred episodes only" disabled>★ favorites</button>
    </header>
    <div class="combobox" data-which="ep">
      <input id="epInput" type="search" autocomplete="off"
             placeholder="חיפוש פרקים / Search…" disabled />
      <span class="chev">▾</span>
      <ul class="dropdown" id="epDropdown" hidden></ul>
    </div>
    <div class="selected" id="epSelected"></div>
  </section>
</main>`;

const host = document.createElement("div");
host.id = "kzw-host";
document.body.appendChild(host);
const root = host.attachShadow({ mode: "open" });
root.innerHTML = `<style>${CSS}</style>
  <button type="button" class="launcher" id="launcher" title="KZRadio picker" aria-label="Open KZRadio picker">&#9835;</button>
  <div class="overlay" id="overlay" dir="rtl" hidden>${MARKUP}</div>`;
const $ = id => root.getElementById(id);
if (!ON_KZRADIO) $("overlay").classList.add("app");
// Rendering waits for the first open: the userscript loads us on every
// kzradio.net page, and most visits never open the picker.
let started = false;


// =========================================================================
// constants & storage
// =========================================================================

// This is kzradio.net's localStorage, so our keys get a prefix the site won't use.
const STORE = {
  myShows:    "kzw.shows.v1",          // { [slug]: { name, image, description, episodeCount, lastFetched } }
  epPrefix:   "kzw.episodes.v1.",      // + slug -> [episode, ...]
  favEps:     "kzw.favorites.v1",      // { [permalink]: { title, showName, mp3, image, ts } }
  favShows:   "kzw.favShows.v1",       // { [slug]:  { name, ts } }
  catalog:    "kzw.catalog.v2",        // { fetchedAt, shows: [{ id, name, slug?, empty? }] }
};
const CATALOG_MAX_AGE_MS = 24 * 3600 * 1000;
const EPISODES_MAX_AGE_MS = 12 * 3600 * 1000;

const ls = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch { return fb; } },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { console.warn(e); state.storageFull = true; return false; }
  },
  remove(k)  { localStorage.removeItem(k); },
};

// =========================================================================
// app state (single source of truth, mutated via update())
// =========================================================================

const state = {
  catalog: ls.get(STORE.catalog, null)?.shows || null,  // null until loaded
  catalogFetchedAt: ls.get(STORE.catalog, null)?.fetchedAt || 0,
  catalogLoading: false,
  catalogError: null,
  storageFull: false,
  notice: null,
  lookingUp: null,       // name of the show whose slug is being looked up

  myShows: ls.get(STORE.myShows, {}),
  // episodes are lazy: state.episodes[slug] is the array; absence ≠ empty
  episodes: {},
  episodesLoading: {},   // { slug: true }
  episodesError: {},     // { slug: msg }

  favShows: ls.get(STORE.favShows, {}),
  favEps:   ls.get(STORE.favEps, {}),

  selectedShowSlug: null,
  selectedEpisodePermalink: null,

  showQuery: "",
  epQuery: "",
  showFavOnly: false,
  epFavOnly: false,

  // ephemeral UI
  showActive: -1,
  epActive: -1,
  showOpen: false,
  epOpen: false,
};

function update(patch, persist = {}) {
  Object.assign(state, patch);
  if (persist.myShows)  ls.set(STORE.myShows, state.myShows);
  if (persist.favShows) ls.set(STORE.favShows, state.favShows);
  if (persist.favEps)   ls.set(STORE.favEps, state.favEps);
  render();
}

// =========================================================================
// network (same-origin with kzradio.net)
// =========================================================================

function httpError(r, url) {
  const e = new Error(r.status === 429 || r.status === 503
    ? "kzradio.net is limiting requests. Try again in a minute."
    : `HTTP ${r.status} for ${new URL(url).pathname}`);
  e.status = r.status;
  return e;
}

const sleep = ms => new Promise(res => setTimeout(res, ms));

async function fetchText(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw httpError(r, url);
  return r.text();
}

// Read a response only until isDone(text) is true, then cancel the rest.
// kzradio.net pages are ~300 KB, but what we need is in the first ~60 KB.
async function fetchPrefix(url, isDone, init) {
  const r = await fetch(url, init);
  if (!r.ok) throw httpError(r, url);
  if (!r.body?.getReader) return r.text();
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text;
    text += decoder.decode(value, { stream: true });
    if (isDone(text)) {
      reader.cancel().catch(() => {});
      return text;
    }
  }
}

// =========================================================================
// parsers
// =========================================================================

function parseRss(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("RSS parse error");
  const channel = doc.querySelector("rss > channel") || doc.querySelector("channel");
  if (!channel) throw new Error("no <channel>");
  const channelTitle = channel.querySelector(":scope > title")?.textContent?.trim() || "";
  let channelImage = channel.querySelector(":scope > image > url")?.textContent?.trim() || "";
  if (!channelImage) {
    const it = channel.getElementsByTagNameNS("http://www.itunes.com/dtds/podcast-1.0.dtd", "image")[0];
    if (it) channelImage = it.getAttribute("href") || "";
  }
  // Channel description — may be CDATA-wrapped HTML; strip tags
  let channelDescription = channel.querySelector(":scope > description")?.textContent?.trim() || "";
  if (!channelDescription) {
    const itSum = channel.getElementsByTagNameNS("http://www.itunes.com/dtds/podcast-1.0.dtd", "summary")[0];
    if (itSum) channelDescription = (itSum.textContent || "").trim();
  }
  channelDescription = stripHtml(channelDescription);
  const items = [];
  for (const it of channel.querySelectorAll(":scope > item")) {
    const title = it.querySelector(":scope > title")?.textContent?.trim() || "";
    const link  = it.querySelector(":scope > link")?.textContent?.trim() || "";
    const guid  = it.querySelector(":scope > guid")?.textContent?.trim() || "";
    const pub   = it.querySelector(":scope > pubDate")?.textContent?.trim() || "";
    let date = "";
    if (pub) { const d = new Date(pub); if (!isNaN(d)) date = d.toISOString().slice(0, 10); }
    const enc = it.querySelector(":scope > enclosure[url]");
    const mp3 = enc?.getAttribute("url") || "";
    if (!mp3) continue;
    let image = channelImage;
    const itImg = it.getElementsByTagNameNS("http://www.itunes.com/dtds/podcast-1.0.dtd", "image")[0];
    if (itImg && itImg.getAttribute("href")) image = itImg.getAttribute("href");
    let id = null;
    const m = (link || guid).match(/\/shows\/[^/]+\/(\d+)/);
    if (m) id = parseInt(m[1], 10);
    const descHtml = it.querySelector(":scope > description")?.textContent || "";
    const tracks = parseTracks(descHtml);
    items.push({ id, title, date, permalink: link || guid, mp3, image, tracks });
  }
  return { channelTitle, channelImage, channelDescription, items };
}

// Episode <description> is the track listing -- usually "Artist - Title"
// lines separated either by <br/> tags or by raw newlines, sometimes both.
// Normalize: convert breaks to \n, strip remaining tags, split on \n.
function parseTracks(html) {
  if (!html) return [];
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|li|div)>/gi, "\n");
  return htmlToText(withBreaks).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}

function stripHtml(s) {
  return htmlToText(s).replace(/\s+/g, " ").trim();
}

// Feed HTML is untrusted. DOMParser builds an inert document: no scripts run
// and no <img onerror> fires, unlike innerHTML on an element of this page.
function htmlToText(html) {
  if (!html) return "";
  return new DOMParser().parseFromString(html, "text/html").body.textContent || "";
}

function parseShowPage(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  let image = null;
  let description = null;
  let name = null;

  // Show-specific image + name from JSON-LD
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent);
      const graph = data["@graph"] || (Array.isArray(data) ? data : [data]);
      for (const node of graph) {
        if (node["@type"] === "CollectionPage") {
          if (node.thumbnailUrl && !image) image = node.thumbnailUrl;
          if (node.name && !name) name = node.name;
        }
      }
    } catch {}
  }

  // Show description from <div class='show-desc'><p>
  const descEl = doc.querySelector(".show-desc p");
  if (descEl) {
    description = descEl.textContent.replace(/\s+/g, " ").trim() || null;
  }

  // Display name: <h1> carries the clean show title; fall back to JSON-LD
  // (handled above) then <title>/og:title, which append a " - KZradio ..." suffix.
  const h1 = doc.querySelector("h1")?.textContent;
  if (h1 && h1.trim()) name = h1;
  if (!name) {
    name = doc.querySelector('meta[property="og:title"]')?.getAttribute("content")
        || doc.querySelector("title")?.textContent
        || null;
  }
  return { name: cleanShowName(name), image, description };
}

// Page and feed titles look like "ALT-TLV - KZradio רדיו הקצה".
function cleanShowName(name) {
  if (!name) return null;
  return name.replace(/\s+/g, " ").trim().replace(/\s*[-–|]\s*KZ ?radio.*$/i, "").trim() || null;
}

// kzradio.net's On Demand filter: <select name="showsfilter"> with one
// <option value="{term id}">{show name}</option> per show.
function parseShowFilter(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const shows = [];
  for (const opt of doc.querySelectorAll('select[name="showsfilter"] option')) {
    const id = (opt.getAttribute("value") || "").trim();
    const name = opt.textContent.replace(/\s+/g, " ").trim();
    if (/^\d+$/.test(id) && name) shows.push({ id, name });
  }
  return shows;
}

function extractSlug(input) {
  const t = (input || "").trim();
  if (!t) return null;
  const m = t.match(/\/shows\/([^/?#\s]+)/);
  if (m) return m[1];
  if (/^[\w\-.]+$/.test(t)) return t;
  return null;
}

// =========================================================================
// data ops: catalog, show RSS
// =========================================================================

// Same four reads, from kzradio.net itself or from the Worker.
const direct = {
  async listShows() {
    const html = await fetchPrefix(`${BASE}/last-shows`, t => {
      const i = t.indexOf('name="showsfilter"');
      return i >= 0 && t.indexOf("</select>", i) >= 0;
    });
    return parseShowFilter(html);
  },
  // Post the On Demand filter the way kzradio.net's own form does (only these
  // two fields: adding the other empty filters returns no results), then read
  // the show link in the first episode card.
  async lookupSlug(id) {
    const card = /od-show-name">\s*<a href="[^"]*\/shows\/([^/"?#]+)/;
    const html = await fetchPrefix(`${BASE}/last-shows`,
      t => card.test(t) || t.includes("results no-results"),
      { method: "POST", body: new URLSearchParams({ free_search: "", showsfilter: id }) });
    return html.match(card)?.[1] || null;
  },
  // No trailing slash: "/feed/" answers with a 301 to "/feed".
  feedPage: (slug, page) =>
    fetch(`${BASE}/shows/${slug}/feed${page > 1 ? `?paged=${page}` : ""}`, { cache: "no-cache" }),
  async showInfo(slug) {
    return parseShowPage(await fetchText(`${BASE}/shows/${slug}/`));
  },
};

const viaWorker = {
  listShows: async () => (await fetchJson(`${API}/shows`)).shows,
  lookupSlug: async id => (await fetchJson(`${API}/slug?id=${encodeURIComponent(id)}`)).slug,
  feedPage: (slug, page) => fetch(`${API}/feed?slug=${encodeURIComponent(slug)}&page=${page}`),
  showInfo: slug => fetchJson(`${API}/show?slug=${encodeURIComponent(slug)}`),
};

const source = ON_KZRADIO ? direct : viaWorker;

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw httpError(r, url);
  return r.json();
}

// Show list with names as kzradio.net shows them, from one request.
// Slugs are looked up later, one show at a time, when the user picks it.
async function loadCatalog() {
  if (state.catalogLoading) return;
  update({ catalogLoading: true, catalogError: null });
  try {
    const found = await source.listShows();
    if (!found.length) throw new Error("show list not found on kzradio.net");
    const known = new Map((state.catalog || []).map(s => [s.id, s]));
    const shows = found.map(f => ({ ...known.get(f.id), id: f.id, name: f.name }));
    const fetchedAt = Date.now();
    ls.set(STORE.catalog, { fetchedAt, shows });
    update({ catalog: shows, catalogFetchedAt: fetchedAt, catalogLoading: false });
  } catch (e) {
    update({ catalogLoading: false, catalogError: e.message });
  }
}

async function pickShow(show) {
  if (show.slug) { selectShow(show.slug); return; }
  update({ showOpen: false, showQuery: "", lookingUp: show.name });
  let slug = null, notice = null;
  try {
    slug = await source.lookupSlug(show.id);
    if (!slug) notice = `No episodes found for "${show.name}"`;
  } catch (e) {
    notice = e.message;
  }
  // Old, empty entries in kzradio.net's list get hidden after the first try.
  const shows = state.catalog.map(s => s.id !== show.id ? s
    : slug ? { ...s, slug } : notice.startsWith("No episodes") ? { ...s, empty: true } : s);
  ls.set(STORE.catalog, { fetchedAt: state.catalogFetchedAt, shows });
  update({ catalog: shows, lookingUp: null, notice });
  if (notice) setTimeout(() => update({ notice: null }), 6000);
  if (slug) selectShow(slug);
}

async function fetchShow(slug) {
  if (!slug) return;
  if (state.episodesLoading[slug]) return;
  update({
    episodesLoading: { ...state.episodesLoading, [slug]: true },
    episodesError:   { ...state.episodesError,   [slug]: null },
  });
  try {
    const all = []; const seen = new Set();
    let channelTitle = "";
    for (let page = 1; page <= 200; page++) {
      const r = await source.feedPage(slug, page);
      // WordPress answers 404 for the page after the last one.
      if (r.status === 404 && page > 1) break;
      if (!r.ok) throw httpError(r, r.url);
      const parsed = parseRss(await r.text());
      if (!channelTitle) channelTitle = parsed.channelTitle;
      if (!parsed.items.length) break;
      let added = 0;
      for (const it of parsed.items) {
        const k = it.permalink || it.mp3;
        if (seen.has(k)) continue;
        seen.add(k); all.push(it); added++;
      }
      if (!added) break;
      // mid-flight progress refresh
      if (state.selectedShowSlug === slug) renderShowSelected();
    }
    if (!all.length) throw new Error("no episodes found in feed");

    // The feed's channel image and description are station-wide; the show
    // page has the show's own image and description.
    let showPage = {};
    try { showPage = await source.showInfo(slug); } catch {}

    ls.set(STORE.epPrefix + slug, all);
    const prev = state.myShows[slug];
    const catalogName = state.catalog?.find(s => s.slug === slug)?.name;
    const myShows = {
      ...state.myShows,
      [slug]: {
        name: showPage.name || catalogName || cleanShowName(channelTitle) || prev?.name || slug,
        image: showPage.image || prev?.image || null,
        description: showPage.description || prev?.description || null,
        episodeCount: all.length,
        lastFetched: Date.now(),
      },
    };
    update({
      myShows,
      episodes: { ...state.episodes, [slug]: all },
      episodesLoading: { ...state.episodesLoading, [slug]: false },
    }, { myShows: true });
  } catch (e) {
    update({
      episodesLoading: { ...state.episodesLoading, [slug]: false },
      episodesError:   { ...state.episodesError,   [slug]: e.message || String(e) },
    });
  }
}

function loadEpisodesFromCacheIfNeeded(slug) {
  if (!slug) return;
  if (state.episodes[slug]) return;
  const cached = ls.get(STORE.epPrefix + slug, null);
  if (cached) {
    state.episodes = { ...state.episodes, [slug]: cached };
  }
}

function removeShow(slug) {
  const my = { ...state.myShows }; delete my[slug];
  const eps = { ...state.episodes }; delete eps[slug];
  ls.remove(STORE.epPrefix + slug);
  const patch = { myShows: my, episodes: eps };
  if (state.selectedShowSlug === slug) {
    patch.selectedShowSlug = null;
    patch.selectedEpisodePermalink = null;
    patch.epQuery = "";
  }
  update(patch, { myShows: true });
}

// =========================================================================
// favorites
// =========================================================================

function toggleFavShow(slug) {
  const meta = state.myShows[slug] || state.catalog?.find(s => s.slug === slug);
  if (!meta) return;
  const f = { ...state.favShows };
  if (f[slug]) { delete f[slug]; }
  else { f[slug] = { name: meta.name, ts: Date.now() }; }
  update({ favShows: f }, { favShows: true });
}

function toggleFavEpisode(ep) {
  if (!ep) return;
  const f = { ...state.favEps };
  if (f[ep.permalink]) { delete f[ep.permalink]; }
  else {
    const showName = state.myShows[state.selectedShowSlug]?.name || "";
    f[ep.permalink] = {
      title: ep.title, mp3: ep.mp3, image: ep.image,
      showName, ts: Date.now(),
    };
  }
  update({ favEps: f }, { favEps: true });
}

// =========================================================================
// playback
// =========================================================================

let audioEl = null;
function playEpisode(ep, showMeta) {
  if (!ep || !ep.mp3) return;
  ensureAudio();
  audioEl.src = ep.mp3;
  audioEl.play().catch(err => {
    const sel = $("epSelected");
    sel.querySelector(".err-line")?.remove();
    const e = document.createElement("div");
    e.className = "err err-line";
    e.style.marginTop = "8px";
    e.innerHTML = `Playback error: ${escapeHtml(err.message)}. Try the original page: <a href="${safeUrl(ep.permalink)}" target="_blank" rel="noopener">${escapeHtml(ep.permalink)}</a>`;
    sel.appendChild(e);
  });
  setMediaSession(ep, showMeta);
}

function ensureAudio() {
  if (audioEl) return audioEl;
  audioEl = document.createElement("audio");
  audioEl.controls = true;
  audioEl.preload = "none";
  return audioEl;
}

function setMediaSession(ep, showMeta) {
  if (!("mediaSession" in navigator)) return;
  try {
    const img = ep.image || showMeta?.image;
    const artwork = img
      ? [{ src: img, sizes: "512x512", type: "image/jpeg" }]
      : [{ src: APP_BASE + "icon.svg", sizes: "any", type: "image/svg+xml" }];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: ep.title || "(untitled)",
      artist: showMeta?.name || "KZRadio",
      album: "KZRadio · On Demand",
      artwork,
    });
    navigator.mediaSession.setActionHandler("play",  () => audioEl?.play());
    navigator.mediaSession.setActionHandler("pause", () => audioEl?.pause());
    navigator.mediaSession.setActionHandler("seekbackward", () => {
      if (audioEl) audioEl.currentTime = Math.max(0, audioEl.currentTime - 15);
    });
    navigator.mediaSession.setActionHandler("seekforward", () => {
      if (audioEl) audioEl.currentTime = Math.min(audioEl.duration || 0, audioEl.currentTime + 30);
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => stepEpisode(-1));
    navigator.mediaSession.setActionHandler("nexttrack",     () => stepEpisode(+1));
  } catch {}
}

function stepEpisode(delta) {
  // Walk the same list the user is currently viewing (which may be the
  // current show's episodes OR the all-cached aggregate when no show
  // is selected).
  const eps = filteredEpisodes(state.selectedShowSlug);
  const idx = eps.findIndex(e => e.permalink === state.selectedEpisodePermalink);
  if (idx < 0) return;
  const next = eps[idx + delta];
  if (!next) return;
  selectEpisode(next.permalink, { play: true });
}

// =========================================================================
// selection / filtering helpers
// =========================================================================

function getCombinedShows() {
  // Catalog (kzradio.net's show list) plus shows the user opened by URL.
  // Keyed by slug when known, else by term id, so same-named shows stay distinct.
  const byKey = new Map();
  const bySlug = new Map();
  for (const s of state.catalog || []) {
    if (s.empty) continue;
    const entry = { id: s.id, slug: s.slug || null, name: s.name, image: null, description: null };
    byKey.set(s.slug || `id:${s.id}`, entry);
    if (s.slug) bySlug.set(s.slug, entry);
  }
  for (const [slug, meta] of Object.entries(state.myShows)) {
    const entry = bySlug.get(slug);
    if (entry) {
      entry.image = meta.image || null;
      entry.description = meta.description || null;
    } else {
      byKey.set(slug, { slug, name: meta.name, image: meta.image || null, description: meta.description || null });
    }
  }
  return Array.from(byKey.values());
}

function filteredShows() {
  let list = getCombinedShows();
  const q = state.showQuery.trim().toLowerCase();
  if (q) list = list.filter(s => (s.name || "").toLowerCase().includes(q) || (s.slug || "").toLowerCase().includes(q));
  if (state.showFavOnly) list = list.filter(s => state.favShows[s.slug]);
  list.sort((a, b) => (a.name || "").localeCompare(b.name || "", "he"));
  return list;
}

function filteredEpisodes(slug) {
  // When slug is null we're in "browse all" mode: aggregate every cached
  // episode across all shows. We tag each item with _slug so render code
  // and playback can recover its show context.
  let list;
  if (slug) {
    list = (state.episodes[slug] || []).map(e => ({ ...e, _slug: slug }));
  } else {
    list = [];
    for (const [s, eps] of Object.entries(state.episodes)) {
      if (!Array.isArray(eps)) continue;
      for (const e of eps) list.push({ ...e, _slug: s });
    }
  }
  const q = state.epQuery.trim().toLowerCase();
  if (q) list = list.filter(e => (e.title || "").toLowerCase().includes(q));
  if (state.epFavOnly) list = list.filter(e => !!state.favEps[e.permalink]);
  list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return list;
}

// All cached episodes for a slug (or across all shows when slug is null),
// ignoring the favorites filter and search query. Used for the "🎲 Random"
// buttons so picking random truly samples from everything — not just the
// currently-filtered subset.
function allEpisodes(slug) {
  if (slug) {
    return (state.episodes[slug] || []).map(e => ({ ...e, _slug: slug }));
  }
  const list = [];
  for (const [s, eps] of Object.entries(state.episodes)) {
    if (!Array.isArray(eps)) continue;
    for (const e of eps) list.push({ ...e, _slug: s });
  }
  return list;
}

function findEpisodeWithMeta(permalink) {
  // Prefer the selected show; otherwise scan everything cached.
  const tryIn = slug => {
    const eps = state.episodes[slug] || [];
    const ep = eps.find(e => e.permalink === permalink);
    if (ep) return { ep, slug, showMeta: state.myShows[slug] };
    return null;
  };
  if (state.selectedShowSlug) {
    const got = tryIn(state.selectedShowSlug);
    if (got) return got;
  }
  for (const slug of Object.keys(state.episodes)) {
    const got = tryIn(slug);
    if (got) return got;
  }
  return null;
}

function totalCachedEpisodes() {
  let n = 0;
  for (const v of Object.values(state.episodes)) n += Array.isArray(v) ? v.length : 0;
  return n;
}

function selectShow(slug, { keepEpisode = false } = {}) {
  const patch = {
    selectedShowSlug: slug,
    showOpen: false,
    showActive: -1,
    showQuery: "",
  };
  if (!keepEpisode) {
    patch.selectedEpisodePermalink = null;
    patch.epQuery = "";
  }
  update(patch);
  loadEpisodesFromCacheIfNeeded(slug);
  const lastFetched = state.myShows[slug]?.lastFetched || 0;
  const stale = Date.now() - lastFetched > EPISODES_MAX_AGE_MS;
  // Missing or old: fetch. The cached list stays visible while it loads.
  if (slug && (!state.episodes[slug] || stale) && !state.episodesLoading[slug]) {
    fetchShow(slug);
  } else {
    render();
  }
}

function selectEpisode(permalink, { play = false } = {}) {
  update({
    selectedEpisodePermalink: permalink,
    epOpen: false,
    epActive: -1,
  });
  if (play) {
    const found = findEpisodeWithMeta(permalink);
    if (found) playEpisode(found.ep, found.showMeta || { name: "" });
  }
}

// =========================================================================
// rendering
// =========================================================================


function render() {
  if (!started) return;
  renderStatus();
  renderShowDropdown();
  renderShowSelected();
  renderEpFilterButton();
  renderEpDropdown();
  renderEpSelected();
}

function renderStatus() {
  const el = $("status");
  el.classList.toggle("err", state.storageFull);
  if (state.storageFull) {
    el.textContent = "Storage full: new episodes are not saved for next time";
    return;
  }
  if (state.notice) { el.textContent = state.notice; return; }
  const myCount = Object.keys(state.myShows).length;
  const epTotal = Object.values(state.myShows).reduce((s, m) => s + (m.episodeCount || 0), 0);
  if (myCount === 0 && !state.catalog) el.textContent = "starting up…";
  else if (myCount === 0) el.textContent = `${state.catalog?.length || 0} shows`;
  else el.textContent = `${myCount} added · ${epTotal} episodes cached`;
}

// ---- show dropdown ----

function renderShowDropdown() {
  const ul = $("showDropdown");
  ul.innerHTML = "";
  ul.hidden = !state.showOpen;
  if (!state.showOpen) return;

  // synthetic option: try a typed slug/URL that doesn't match anything
  const q = state.showQuery.trim();
  const items = filteredShows();
  const slugFromInput = extractSlug(q);
  const slugInItems = items.some(i => i.slug === slugFromInput);
  if (slugFromInput && !slugInItems) {
    const li = document.createElement("li");
    li.className = "synthetic";
    li.innerHTML = `<span class="label">+ Try slug: <code>${escapeHtml(slugFromInput)}</code></span>
                    <span class="meta">fetch RSS</span>`;
    li.addEventListener("mousedown", e => e.preventDefault()); // avoid blur before click
    li.addEventListener("click", () => {
      selectShow(slugFromInput);
    });
    ul.appendChild(li);
  }

  // catalog loading / error inline
  if (!items.length) {
    const li = document.createElement("li");
    li.className = "empty";
    if (state.catalogLoading) {
      li.innerHTML = `<span class="spinner"></span><span>Loading shows from kzradio.net…</span>`;
    } else if (state.catalogError) {
      li.innerHTML = `<span class="err">${escapeHtml(state.catalogError)}</span>`;
    } else if (state.showFavOnly) {
      li.textContent = "No favorited shows.";
    } else if (q) {
      li.textContent = `No shows match "${q}".`;
    } else if (!state.catalog) {
      li.innerHTML = `<span class="spinner"></span><span>Loading shows…</span>`;
    } else {
      li.textContent = "No shows.";
    }
    ul.appendChild(li);
    return;
  }

  // bound the list to keep render snappy
  const max = 200;
  for (let i = 0; i < items.length && i < max; i++) {
    const s = items[i];
    const li = document.createElement("li");
    if (i === state.showActive) li.classList.add("active");
    const added = !!state.myShows[s.slug];
    const fav = !!state.favShows[s.slug];
    const epCount = state.myShows[s.slug]?.episodeCount;
    const img = s.image || state.myShows[s.slug]?.image;
    const desc = s.description || state.myShows[s.slug]?.description;
    li.innerHTML = `
      ${img
        ? `<img class="avatar" src="${escapeAttr(img)}" alt="" loading="lazy" />`
        : `<span class="avatar ph"></span>`}
      <span class="label">${fav ? "★ " : ""}${highlight(s.name, q)}</span>
      ${added ? `<span class="meta">${epCount ?? "—"} eps</span>` : `<span class="pill">+ add</span>`}
      ${desc ? `<span class="info-icon" title="${escapeAttr(desc)}" aria-label="Show description">i</span>` : ""}
    `;
    li.addEventListener("mousedown", e => e.preventDefault());
    // clicking the info icon should NOT select the show
    li.querySelector(".info-icon")?.addEventListener("click", e => e.stopPropagation());
    li.querySelector(".info-icon")?.addEventListener("mousedown", e => e.stopPropagation());
    li.addEventListener("click", () => pickShow(s));
    ul.appendChild(li);
  }
  if (items.length > max) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = `${items.length - max} more — keep typing to narrow.`;
    ul.appendChild(li);
  }
}

// ---- show selected ----

function renderShowSelected() {
  const div = $("showSelected");
  const slug = state.selectedShowSlug;

  if (!slug && state.lookingUp) {
    div.classList.add("placeholder");
    div.innerHTML = `<span class="spinner"></span> Finding ${escapeHtml(state.lookingUp)}…`;
    return;
  }
  if (!slug) {
    div.classList.add("placeholder");
    const cnt = getCombinedShows().length;
    div.innerHTML = cnt
      ? `Pick a show above (or paste a kzradio URL) — ${cnt} known.
         <div class="actions" style="justify-content:center; margin-top:10px;">
           <button id="randomShowBtn">🎲 Random show</button>
         </div>`
      : `<span class="spinner"></span> Loading the show list from kzradio.net…`;
    div.querySelector("#randomShowBtn")?.addEventListener("click", () => {
      const all = getCombinedShows();
      if (!all.length) return;
      const pick = all[Math.floor(Math.random() * all.length)];
      pickShow(pick);
    });
    return;
  }

  div.classList.remove("placeholder");
  const myMeta = state.myShows[slug];
  const catMeta = state.catalog?.find(s => s.slug === slug);
  const name  = myMeta?.name || catMeta?.name || slug;
  const image = myMeta?.image;
  const description = myMeta?.description;
  const fav = !!state.favShows[slug];

  // body: show details + status
  let sub = "";
  if (state.episodesLoading[slug]) {
    sub = `<span class="spinner"></span> Fetching episodes…`;
  } else if (state.episodesError[slug]) {
    sub = `<span class="err">${escapeHtml(state.episodesError[slug])}</span>`;
  } else if (myMeta) {
    sub = `${myMeta.episodeCount} episodes · last fetched ${formatRelative(myMeta.lastFetched)}
           · <a href="${BASE}/shows/${slug}/" target="_blank" rel="noopener">↗</a>`;
  } else {
    sub = `Not yet fetched — pick to load episodes
           · <a href="${BASE}/shows/${slug}/" target="_blank" rel="noopener">↗</a>`;
  }

  div.innerHTML = `
    <div class="row1">
      ${image ? `<img src="${escapeAttr(image)}" alt="" />` : ""}
      <div class="meta">
        <div class="title">
          <span class="title-text">${escapeHtml(name)}</span>
          ${description ? `<span class="info-icon" tabindex="0" aria-label="Show description" title="${escapeAttr(description)}">i<span class="tip">${escapeHtml(description)}</span></span>` : ""}
        </div>
        <div class="sub">${sub}</div>
      </div>
      <button class="clear-x" id="showClearBtn" title="Clear selection (browse all episodes)" aria-label="Clear show">✕</button>
    </div>
    <div class="actions">
      <button class="star ${fav ? "on" : ""}" id="showStarBtn">${fav ? "★ Starred" : "☆ Star"}</button>
      ${myMeta ? `<button id="showRefreshBtn" ${state.episodesLoading[slug] ? "disabled" : ""}>⟳ Refresh</button>` : ""}
      ${myMeta ? `<button class="danger" id="showRemoveBtn">✕ Remove</button>` : ""}
      ${myMeta && (myMeta.episodeCount || 0) > 0 ? `<button class="primary" id="randomEpBtn">🎲 Random episode</button>` : ""}
      ${state.episodesError[slug] ? `<button id="showRetryBtn">↻ Retry</button>` : ""}
    </div>
  `;
  div.querySelector("#showClearBtn")?.addEventListener("click", () => selectShow(null));
  div.querySelector("#showStarBtn")?.addEventListener("click", () => toggleFavShow(slug));
  div.querySelector("#showRefreshBtn")?.addEventListener("click", () => fetchShow(slug));
  div.querySelector("#showRetryBtn")?.addEventListener("click", () => fetchShow(slug));
  div.querySelector("#showRemoveBtn")?.addEventListener("click", () => {
    if (!confirm(`Remove "${name}" from My Shows? Stars are kept.`)) return;
    removeShow(slug);
  });
  div.querySelector("#randomEpBtn")?.addEventListener("click", () => {
    // Random must sample across ALL cached episodes for this show,
    // not the currently-filtered list (which may be favorites-only).
    const eps = allEpisodes(slug);
    if (!eps.length) return;
    const pick = eps[Math.floor(Math.random() * eps.length)];
    selectEpisode(pick.permalink, { play: true });
  });
}

// ---- episode dropdown ----

function renderEpFilterButton() {
  const slug = state.selectedShowSlug;
  const haveEps = slug
    ? (state.episodes[slug]?.length || 0) > 0
    : totalCachedEpisodes() > 0;
  $("epFavBtn").disabled = !haveEps;
  $("epFavBtn").classList.toggle("on", state.epFavOnly);
  $("epInput").disabled = !haveEps;
  if (!haveEps) $("epInput").value = "";
  // give a hint about the current scope
  $("epInput").placeholder = slug
    ? "חיפוש פרקים / Search…"
    : (haveEps ? `Search across ${totalCachedEpisodes()} cached episodes…` : "חיפוש פרקים / Search…");

  $("showFavBtn").classList.toggle("on", state.showFavOnly);
}

function renderEpDropdown() {
  const ul = $("epDropdown");
  ul.innerHTML = "";
  ul.hidden = !state.epOpen;
  if (!state.epOpen) return;

  const slug = state.selectedShowSlug;

  // No show selected: aggregate-all mode
  if (!slug) {
    if (totalCachedEpisodes() === 0) {
      const li = document.createElement("li"); li.className = "empty";
      li.textContent = "No episodes cached yet — pick a show to fetch some.";
      ul.appendChild(li); return;
    }
  } else {
    if (state.episodesLoading[slug] && !state.episodes[slug]) {
      const li = document.createElement("li"); li.className = "empty";
      li.innerHTML = `<span class="spinner"></span><span>Loading episodes…</span>`;
      ul.appendChild(li); return;
    }
    if (state.episodesError[slug]) {
      const li = document.createElement("li"); li.className = "empty";
      li.innerHTML = `<span class="err">${escapeHtml(state.episodesError[slug])}</span>`;
      ul.appendChild(li); return;
    }
  }

  const items = filteredEpisodes(slug);
  if (!items.length) {
    const li = document.createElement("li"); li.className = "empty";
    if (state.epFavOnly) li.textContent = slug ? "No starred episodes for this show." : "No starred episodes.";
    else li.textContent = "No episodes match.";
    ul.appendChild(li); return;
  }

  const max = 300;
  const q = state.epQuery.trim();
  const showAcross = !slug;
  for (let i = 0; i < items.length && i < max; i++) {
    const ep = items[i];
    const li = document.createElement("li");
    if (i === state.epActive) li.classList.add("active");
    const fav = !!state.favEps[ep.permalink];
    const datePrefix = ep.date ? `${ep.date} · ` : "";
    const showMeta = state.myShows[ep._slug];
    const showName = showAcross ? (showMeta?.name || ep._slug) : "";
    const img = ep.image || showMeta?.image;
    const desc = showMeta?.description;
    li.innerHTML = `
      ${img
        ? `<img class="avatar" src="${escapeAttr(img)}" alt="" loading="lazy" />`
        : `<span class="avatar ph"></span>`}
      <span class="label">${fav ? "★ " : ""}${highlight(datePrefix + (ep.title || "(untitled)"), q)}</span>
      ${showAcross ? `<span class="meta">${escapeHtml(showName)}</span>` : ""}
      ${desc ? `<span class="info-icon" title="${escapeAttr(desc)}" aria-label="Show description">i</span>` : ""}
    `;
    li.addEventListener("mousedown", e => e.preventDefault());
    li.querySelector(".info-icon")?.addEventListener("click", e => e.stopPropagation());
    li.querySelector(".info-icon")?.addEventListener("mousedown", e => e.stopPropagation());
    li.addEventListener("click", () => selectEpisode(ep.permalink));
    ul.appendChild(li);
  }
  if (items.length > max) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = `${items.length - max} more — keep typing.`;
    ul.appendChild(li);
  }
}

// ---- episode selected ----

function renderEpSelected() {
  const div = $("epSelected");
  const slug = state.selectedShowSlug;
  const permalink = state.selectedEpisodePermalink;
  const totalCached = totalCachedEpisodes();

  // Loading a specific show
  if (slug && state.episodesLoading[slug] && !state.episodes[slug]) {
    div.classList.add("placeholder");
    div.innerHTML = `<span class="spinner"></span> Loading episodes for this show…`;
    return;
  }

  // No episode picked
  if (!permalink) {
    div.classList.add("placeholder");
    if (slug) {
      const eps = state.episodes[slug] || [];
      div.innerHTML = eps.length
        ? `Pick an episode above. <div class="actions" style="justify-content:center;margin-top:10px;">
             <button id="randomEpBtn2" class="primary">🎲 Random</button>
           </div>`
        : `No episodes available.`;
    } else if (totalCached > 0) {
      div.innerHTML = `Browse all <strong>${totalCached}</strong> cached episodes above, or
        <div class="actions" style="justify-content:center;margin-top:10px;">
          <button id="randomEpBtn2" class="primary">🎲 Random across all</button>
        </div>`;
    } else {
      div.innerHTML = `No episodes cached. Pick a show first.`;
    }
    div.querySelector("#randomEpBtn2")?.addEventListener("click", () => {
      // Use all cached episodes (not the filtered subset) so toggling the
      // favorites filter doesn't make "random" pick only from favorites.
      const list = allEpisodes(slug);
      if (!list.length) return;
      const pick = list[Math.floor(Math.random() * list.length)];
      selectEpisode(pick.permalink, { play: true });
    });
    return;
  }

  // An episode is selected — find it, possibly across shows
  const found = findEpisodeWithMeta(permalink);
  if (!found) {
    div.classList.add("placeholder");
    div.innerHTML = `Episode not found in cache.`;
    return;
  }
  div.classList.remove("placeholder");
  const { ep, slug: epSlug, showMeta } = found;
  const fav = !!state.favEps[ep.permalink];
  const img = ep.image || showMeta?.image;
  // when in browse-all mode (no current show), make the show name a link
  // back into that show
  const showLabel = showMeta?.name || epSlug;
  const showLink = !slug
    ? `<a href="#" id="jumpToShowLink">${escapeHtml(showLabel)}</a>`
    : escapeHtml(showLabel);

  const epShowDesc = showMeta?.description;
  div.innerHTML = `
    <div class="row1">
      ${img ? `<img src="${escapeAttr(img)}" alt="" />` : ""}
      <div class="meta">
        <div class="title">
          <span class="title-text">${escapeHtml(ep.title || "(untitled)")}</span>
          ${epShowDesc ? `<span class="info-icon" tabindex="0" aria-label="Show description" title="${escapeAttr(epShowDesc)}">i<span class="tip">${escapeHtml(epShowDesc)}</span></span>` : ""}
        </div>
        <div class="sub">${escapeHtml(ep.date || "")}${ep.date ? " · " : ""}${showLink}
          · <a href="${safeUrl(ep.permalink)}" target="_blank" rel="noopener">↗</a>
        </div>
      </div>
    </div>
    <div class="actions">
      <button class="primary" id="playBtn">▶ Play</button>
      <button class="star ${fav ? "on" : ""}" id="epStarBtn">${fav ? "★ Starred" : "☆ Star"}</button>
      <button id="prevBtn">‹ Prev</button>
      <button id="nextBtn">Next ›</button>
    </div>
    <div id="audioMount"></div>
    ${ep.tracks?.length ? `
      <details class="tracks" ${ep.tracks.length <= 30 ? "open" : ""}>
        <summary>Track listing (${ep.tracks.length})</summary>
        <ol>${ep.tracks.map(t => `<li>${escapeHtml(t)}</li>`).join("")}</ol>
      </details>` : ""}
  `;
  div.querySelector("#playBtn").addEventListener("click", () => playEpisode(ep, showMeta));
  div.querySelector("#epStarBtn").addEventListener("click", () => toggleFavEpisode(ep));
  div.querySelector("#prevBtn").addEventListener("click", () => stepEpisode(-1));
  div.querySelector("#nextBtn").addEventListener("click", () => stepEpisode(+1));
  div.querySelector("#jumpToShowLink")?.addEventListener("click", e => {
    e.preventDefault();
    selectShow(epSlug, { keepEpisode: true });
  });
  ensureAudio();
  div.querySelector("#audioMount").appendChild(audioEl);
}

// =========================================================================
// helpers
// =========================================================================

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
function safeUrl(u) {
  return /^https?:\/\//i.test(u || "") ? escapeAttr(u) : "#";
}
function highlight(text, q) {
  if (!q) return escapeHtml(text);
  const t = String(text);
  const idx = t.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return escapeHtml(t);
  return `${escapeHtml(t.slice(0, idx))}<mark>${escapeHtml(t.slice(idx, idx+q.length))}</mark>${escapeHtml(t.slice(idx+q.length))}`;
}
function formatRelative(ms) {
  if (!ms) return "never";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

// =========================================================================
// event wiring (input + dropdown behavior)
// =========================================================================

function wireCombobox(which) {
  const input = $(`${which}Input`);
  const ul    = $(`${which}Dropdown`);

  input.addEventListener("focus", () => {
    if (which === "show") update({ showOpen: true });
    else update({ epOpen: true });
  });
  input.addEventListener("blur", () => {
    // small delay so list clicks still register
    setTimeout(() => {
      if (which === "show") update({ showOpen: false });
      else update({ epOpen: false });
    }, 150);
  });
  input.addEventListener("input", () => {
    if (which === "show") {
      update({ showQuery: input.value, showOpen: true, showActive: -1 });
    } else {
      update({ epQuery: input.value, epOpen: true, epActive: -1 });
    }
  });
  input.addEventListener("keydown", e => {
    const list = which === "show" ? filteredShows() : filteredEpisodes(state.selectedShowSlug);
    const max = list.length - 1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const cur = which === "show" ? state.showActive : state.epActive;
      const next = Math.min(max, cur + 1);
      if (which === "show") update({ showActive: next, showOpen: true });
      else update({ epActive: next, epOpen: true });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const cur = which === "show" ? state.showActive : state.epActive;
      const next = Math.max(0, cur - 1);
      if (which === "show") update({ showActive: next });
      else update({ epActive: next });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const idx = which === "show" ? state.showActive : state.epActive;
      if (which === "show") {
        // if no active idx, try synthetic-slug fall-through
        if (idx < 0) {
          const slug = extractSlug(input.value);
          if (slug) selectShow(slug);
        } else if (list[idx]) {
          pickShow(list[idx]);
        }
      } else {
        if (idx >= 0 && list[idx]) selectEpisode(list[idx].permalink);
      }
    } else if (e.key === "Escape") {
      input.blur();
    }
  });
}

// =========================================================================
// overlay, favorites import, boot
// =========================================================================

// Favorites saved on the old GitHub Pages app live in that origin's storage.
// index.html sends them here as #kzw-import=<base64url JSON>.
function importFavoritesFromHash() {
  const m = location.hash.match(/^#kzw-import=([\w-]+)$/);
  if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  try {
    const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    const favEps = { ...(data.favEps || {}), ...state.favEps };
    const favShows = { ...(data.favShows || {}), ...state.favShows };
    const added = Object.keys(favEps).length - Object.keys(state.favEps).length
                + Object.keys(favShows).length - Object.keys(state.favShows).length;
    update({ favEps, favShows, notice: `Imported ${added} favorites` }, { favEps: true, favShows: true });
  } catch (e) {
    update({ notice: `Favorites import failed: ${e.message}` });
  }
  setTimeout(() => update({ notice: null }), 6000);
}

// The old version of the app kept stars under these keys on this same site.
function importOldAppFavorites() {
  const old = { favEps: ls.get("kzradio.favorites.v1", null), favShows: ls.get("kzradio.favShows.v1", null) };
  if (!old.favEps && !old.favShows) return;
  update({
    favEps: { ...old.favEps, ...state.favEps },
    favShows: { ...old.favShows, ...state.favShows },
  }, { favEps: true, favShows: true });
  ls.remove("kzradio.favorites.v1");
  ls.remove("kzradio.favShows.v1");
}

function start() {
  started = true;
  ls.remove("kzw.catalog.v1");
  if (!ON_KZRADIO) importOldAppFavorites();
  $("showFavBtn").addEventListener("click", () => update({ showFavOnly: !state.showFavOnly }));
  $("epFavBtn").addEventListener("click",   () => update({ epFavOnly:   !state.epFavOnly }));
  wireCombobox("show");
  wireCombobox("ep");
  for (const slug of Object.keys(state.myShows)) {
    const cached = ls.get(STORE.epPrefix + slug, null);
    if (cached) state.episodes[slug] = cached;
  }
  render();
  importFavoritesFromHash();
}

function open() {
  if (!started) start();
  $("overlay").hidden = false;
  $("launcher").hidden = true;
  if (ON_KZRADIO) document.documentElement.style.overflow = "hidden";
  // Refresh the show list daily; slugs already found are kept by term id.
  if (!state.catalog || Date.now() - state.catalogFetchedAt > CATALOG_MAX_AGE_MS) {
    loadCatalog();
  }
}

function close() {
  $("overlay").hidden = true;
  $("launcher").hidden = false;
  document.documentElement.style.overflow = "";
}

// kzradio.net has a fixed player bar at the bottom; keep the button above it.
function placeLauncher() {
  const bar = document.querySelector(".floating-bar")?.getBoundingClientRect();
  const barHeight = bar && bar.height && bar.bottom >= innerHeight - 1 ? bar.height : 0;
  host.style.setProperty("--launcher-bottom", `${Math.round(barHeight) + 16}px`);
}
placeLauncher();
addEventListener("resize", placeLauncher);

$("launcher").addEventListener("click", open);
$("closeBtn").addEventListener("click", close);
window.kzw = { open, close };
if (!ON_KZRADIO || window.kzwOpenOnLoad || location.hash.startsWith("#kzw-import=")) open();
})();
