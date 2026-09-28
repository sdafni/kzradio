// kzradio-api: reads public kzradio.net pages on the server and returns small
// replies that the KZRadio Picker web app may read. kzradio.net sends no CORS
// headers, so a page on another site cannot read it directly.
//
// Not an open proxy: it only builds a few fixed kzradio.net URLs from
// validated parameters, answers GET only, and allows CORS for our own site.

const SITE = "https://www.kzradio.net";
const USER_AGENT = "kzradio-picker/1.0 (+https://sdafni.github.io/kzradio/)";
const ALLOWED_ORIGINS = new Set(["https://sdafni.github.io", "http://localhost:8765"]);

const MINUTE = 60, HOUR = 3600, DAY = 86400;

const ROUTES = {
  // [{ id, name }] from the On Demand filter <select>.
  "/shows": { ttl: 12 * HOUR, key: () => "shows", produce: listShows },
  // { slug } for a filter term id; slug is null when the show has no episodes.
  "/slug": {
    ttl: 30 * DAY,
    key: q => validId(q.get("id")) && `slug:${q.get("id")}`,
    produce: q => lookupSlug(q.get("id")),
  },
  // The show's RSS feed page as is (404 after the last page).
  "/feed": {
    ttl: 15 * MINUTE,
    key: q => validSlug(q.get("slug")) && validPage(q.get("page")) && `feed:${q.get("slug")}:${q.get("page") || 1}`,
    produce: q => feedPage(q.get("slug"), Number(q.get("page") || 1)),
  },
  // { name, image, description } from the show page.
  "/show": {
    ttl: 7 * DAY,
    key: q => validSlug(q.get("slug")) && `show:${q.get("slug")}`,
    produce: q => showInfo(q.get("slug")),
  },
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request);
    if (request.method !== "GET") return reply({ status: 405, body: "GET only" }, cors);
    const route = ROUTES[url.pathname];
    if (!route) return reply({ status: 404, body: "not found" }, cors);
    const key = route.key(url.searchParams);
    if (!key) return reply({ status: 400, body: "bad parameters" }, cors);

    const hit = await env.CACHE.get(key, "json");
    if (hit) return reply(hit, cors, route.ttl, "hit");
    let result;
    try {
      result = await route.produce(url.searchParams);
    } catch (e) {
      result = e.status === 429
        ? { status: 503, type: "json", body: JSON.stringify({ error: "kzradio.net is limiting requests. Try again in a minute." }), retryAfter: 60 }
        : { status: 502, type: "json", body: JSON.stringify({ error: e.message }) };
    }
    if (result.status === 200 || result.status === 404) {
      const ttl = result.ttl || route.ttl;
      await env.CACHE.put(key, JSON.stringify(result), { expirationTtl: Math.max(60, ttl) });
    }
    return reply(result, cors, result.status === 200 ? result.ttl || route.ttl : 0, "miss");
  },
};

function reply({ status, type = "text", body, retryAfter }, cors, ttl = 0, cache = "") {
  const headers = new Headers(cors);
  headers.set("Content-Type", {
    json: "application/json; charset=utf-8",
    xml: "application/rss+xml; charset=utf-8",
    text: "text/plain; charset=utf-8",
  }[type]);
  // Browsers may keep a reply for a while too, capped so updates show up.
  headers.set("Cache-Control", ttl ? `public, max-age=${Math.min(ttl, HOUR)}` : "no-store");
  if (cache) headers.set("X-Cache", cache);
  if (retryAfter) headers.set("Retry-After", String(retryAfter));
  return new Response(body, { status, headers });
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const headers = { Vary: "Origin" };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

const validId = v => /^\d{1,9}$/.test(v || "");
const validSlug = v => /^[\w.%-]{1,200}$/.test(v || "");
const validPage = v => v == null || (/^\d{1,3}$/.test(v) && Number(v) >= 1);

// ---- kzradio.net ---------------------------------------------------------

async function kzFetch(path, init = {}) {
  const r = await fetch(SITE + path, { ...init, headers: { "User-Agent": USER_AGENT, ...init.headers } });
  if (r.status === 429) throw Object.assign(new Error("rate limited"), { status: 429 });
  return r;
}

// kzradio.net pages are ~300 KB; what we need is in the first ~60 KB.
async function readUntil(response, isDone) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text;
    text += decoder.decode(value, { stream: true });
    if (isDone(text)) {
      await reader.cancel();
      return text;
    }
  }
}

async function listShows() {
  const r = await kzFetch("/last-shows");
  if (!r.ok) throw new Error(`HTTP ${r.status} for /last-shows`);
  const html = await readUntil(r, t => {
    const i = t.indexOf('name="showsfilter"');
    return i >= 0 && t.indexOf("</select>", i) >= 0;
  });
  const start = html.indexOf('name="showsfilter"');
  if (start < 0) throw new Error("show list not found on /last-shows");
  const select = html.slice(start, html.indexOf("</select>", start));
  const shows = [];
  for (const m of select.matchAll(/<option[^>]*value="(\d+)"[^>]*>([\s\S]*?)<\/option>/g)) {
    const name = textOf(m[2]);
    if (name) shows.push({ id: m[1], name });
  }
  if (!shows.length) throw new Error("show list is empty");
  return json({ shows });
}

// Post the On Demand filter the way kzradio.net's own form does. Only these
// two fields: sending the other filters empty makes it return no results.
async function lookupSlug(id) {
  const card = /od-show-name">\s*<a href="[^"]*\/shows\/([^/"?#]+)/;
  const r = await kzFetch("/last-shows", {
    method: "POST",
    body: new URLSearchParams({ free_search: "", showsfilter: id }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} for the show filter`);
  const html = await readUntil(r, t => card.test(t) || t.includes("results no-results"));
  const slug = html.match(card)?.[1] || null;
  // A show can get its first episode later, so remember "none" only briefly.
  return { ...json({ slug }), ttl: slug ? undefined : DAY };
}

async function feedPage(slug, page) {
  // No trailing slash: "/feed/" answers with a 301 to "/feed".
  const r = await kzFetch(`/shows/${slug}/feed${page > 1 ? `?paged=${page}` : ""}`);
  if (r.status === 404) return { status: 404, type: "text", body: "no such page" };
  if (!r.ok) throw new Error(`HTTP ${r.status} for feed page ${page}`);
  return { status: 200, type: "xml", body: await r.text() };
}

async function showInfo(slug) {
  const r = await kzFetch(`/shows/${slug}/`);
  if (r.status === 404) return { status: 404, type: "json", body: JSON.stringify({ error: "no such show" }) };
  if (!r.ok) throw new Error(`HTTP ${r.status} for the show page`);
  const html = await r.text();
  const h1 = textOf(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] || "");
  const ogTitle = decodeEntities(html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] || "");
  // The show's own image; og:image is the station logo.
  const image = html.match(/"@type":"CollectionPage"[\s\S]*?"thumbnailUrl":"([^"]+)"/)?.[1]?.replace(/\\\//g, "/") || null;
  const descStart = html.indexOf("show-desc");
  const descP = descStart < 0 ? null : html.slice(descStart, descStart + 5000).match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1];
  return json({
    name: h1 || cleanShowName(ogTitle) || null,
    image,
    description: descP ? textOf(descP) || null : null,
  });
}

// ---- text helpers --------------------------------------------------------

function json(value) {
  return { status: 200, type: "json", body: JSON.stringify(value) };
}

function textOf(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== "#") return NAMED_ENTITIES[e.toLowerCase()] ?? m;
    const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

// Page and feed titles look like "ALT-TLV - KZradio רדיו הקצה".
function cleanShowName(name) {
  return name.replace(/\s*[-–|]\s*KZ ?radio.*$/i, "").trim();
}
