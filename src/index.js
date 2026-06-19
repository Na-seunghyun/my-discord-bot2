const UPSTREAM = "https://kingshot.jeab.dev";
const TOKEN_REFRESH_MARGIN_MS = 30000;
const UPSTREAM_RETRY_STATUSES = new Set([502, 503, 504]);
const INTEL_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const FEEDBACK_INDEX_KEY = "feedback:index";
const FEEDBACK_INDEX_LIMIT = 200;
const MAX_FEEDBACK_MESSAGE = 2000;
const MAX_FEEDBACK_CONTACT = 160;
const SUPABASE_MAX_CACHE_BYTES = 120000;

let cachedToken = "";
let cachedTokenExpires = 0;
let tokenPromise = null;
let intelSchemaReady = false;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const json = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const todayKey = () => new Date().toISOString().slice(0, 10);

async function incrementVisit(env) {
  if (!env.VISITS) return { enabled: false, total: 0, today: 0 };

  const today = todayKey();
  const totalKey = "visits:total";
  const todayCountKey = `visits:day:${today}`;
  const [totalRaw, todayRaw] = await Promise.all([
    env.VISITS.get(totalKey),
    env.VISITS.get(todayCountKey),
  ]);

  const total = (Number(totalRaw) || 0) + 1;
  const todayCount = (Number(todayRaw) || 0) + 1;

  await Promise.all([
    env.VISITS.put(totalKey, String(total)),
    env.VISITS.put(todayCountKey, String(todayCount)),
  ]);

  return { enabled: true, total, today: todayCount };
}

async function readStats(env) {
  if (!env.VISITS) return { enabled: false, total: 0, today: 0 };

  const today = todayKey();
  const [totalRaw, todayRaw] = await Promise.all([
    env.VISITS.get("visits:total"),
    env.VISITS.get(`visits:day:${today}`),
  ]);

  return {
    enabled: true,
    total: Number(totalRaw) || 0,
    today: Number(todayRaw) || 0,
  };
}

function feedbackStore(env) {
  return env.FEEDBACK || env.VISITS || null;
}

function cleanText(value, maxLength) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanMessage(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, MAX_FEEDBACK_MESSAGE);
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function apiPathFromRequest(request) {
  const incoming = new URL(request.url);
  return incoming.pathname.replace(/^\/kingshot\/?/, "");
}

function cacheKeyFromRequest(request) {
  const incoming = new URL(request.url);
  return `${incoming.pathname}${incoming.search}`;
}

function hasIntelDb(env) {
  return Boolean(env.INTEL_DB && typeof env.INTEL_DB.prepare === "function");
}

function supabaseConfig(env) {
  const url = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "");
  return { enabled: Boolean(url && key), url, key };
}

async function supabaseFetch(env, path, init = {}) {
  const cfg = supabaseConfig(env);
  if (!cfg.enabled) return null;

  const headers = new Headers(init.headers || {});
  headers.set("apikey", cfg.key);
  headers.set("authorization", `Bearer ${cfg.key}`);
  headers.set("accept", "application/json");
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");

  const response = await fetch(`${cfg.url}/rest/v1${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase ${response.status}: ${detail || response.statusText}`);
  }

  return response;
}

async function supabaseJson(env, path, init = {}) {
  const response = await supabaseFetch(env, path, init);
  if (!response) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function supabaseCount(env, table) {
  const response = await supabaseFetch(env, `/${table}?select=id&limit=1`, {
    headers: {
      prefer: "count=exact",
      range: "0-0",
    },
  });
  if (!response) return 0;
  const range = response.headers.get("content-range") || "";
  const total = Number(range.split("/")[1]);
  return Number.isFinite(total) ? total : 0;
}

async function ensureIntelSchema(env) {
  if (!hasIntelDb(env) || intelSchemaReady) return false;

  await env.INTEL_DB.batch([
    env.INTEL_DB.prepare(
      "CREATE TABLE IF NOT EXISTS intel_players (id TEXT PRIMARY KEY, username TEXT, username_lc TEXT, state INTEGER, alliance_name TEXT, alliance_abbr TEXT, power INTEGER, town_hall_level INTEGER, avatar_url TEXT, last_refreshed_at TEXT, updated_at INTEGER, summary_json TEXT)",
    ),
    env.INTEL_DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_intel_players_name ON intel_players(username_lc)",
    ),
    env.INTEL_DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_intel_players_state ON intel_players(state)",
    ),
    env.INTEL_DB.prepare(
      "CREATE TABLE IF NOT EXISTS intel_cache (cache_key TEXT PRIMARY KEY, api_path TEXT, response_json TEXT, updated_at INTEGER)",
    ),
    env.INTEL_DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_intel_cache_path ON intel_cache(api_path)",
    ),
  ]);

  intelSchemaReady = true;
  return true;
}

function normalizePlayerSummary(player) {
  if (!player || !player.id) return null;
  const username = cleanText(player.username || player.name || player.nickname || player.id, 160);
  const item = {
    ...player,
    id: String(player.id),
    username,
    state: Number(player.state || player.kid || player.kingdom || 0) || null,
    alliance_name: cleanText(player.alliance_name || player.alliance || "", 160),
    alliance_abbr: cleanText(player.alliance_abbr || player.alliance_tag || "", 40),
    power: Number(player.power || 0) || null,
    town_hall_level: Number(player.town_hall_level || player.townhall || player.tc || 0) || null,
    avatar_url: cleanText(player.avatar_url || player.avatar || "", 500),
    last_refreshed_at: cleanText(player.last_refreshed_at || player.updated_at || "", 80),
  };
  return item;
}

async function savePlayerSummariesD1(env, players) {
  if (!hasIntelDb(env) || !Array.isArray(players) || !players.length) return;
  await ensureIntelSchema(env);
  const now = Date.now();
  const statements = players
    .map(normalizePlayerSummary)
    .filter(Boolean)
    .map((player) =>
      env.INTEL_DB.prepare(
        "INSERT OR REPLACE INTO intel_players (id, username, username_lc, state, alliance_name, alliance_abbr, power, town_hall_level, avatar_url, last_refreshed_at, updated_at, summary_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        player.id,
        player.username,
        player.username.toLowerCase(),
        player.state,
        player.alliance_name,
        player.alliance_abbr,
        player.power,
        player.town_hall_level,
        player.avatar_url,
        player.last_refreshed_at,
        now,
        JSON.stringify(player),
      ),
    );
  if (statements.length) await env.INTEL_DB.batch(statements);
}

async function savePlayerSummariesSupabase(env, players) {
  if (!supabaseConfig(env).enabled || !Array.isArray(players) || !players.length) return;
  const now = Date.now();
  const rows = players
    .map(normalizePlayerSummary)
    .filter(Boolean)
    .map((player) => ({
      id: player.id,
      username: player.username,
      username_lc: player.username.toLowerCase(),
      state: player.state,
      alliance_name: player.alliance_name,
      alliance_abbr: player.alliance_abbr,
      power: player.power,
      town_hall_level: player.town_hall_level,
      avatar_url: player.avatar_url,
      last_refreshed_at: player.last_refreshed_at,
      updated_at_ms: now,
      summary_json: player,
    }));
  if (!rows.length) return;

  await supabaseJson(env, "/intel_players?on_conflict=id", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(rows.slice(0, 100)),
  });
}

async function saveIntelCache(env, request, payload) {
  if (request.method !== "GET" || payload == null) return;

  const apiPath = apiPathFromRequest(request);
  const cacheKey = cacheKeyFromRequest(request);
  const responseJson = JSON.stringify(payload);
  const now = Date.now();

  if (hasIntelDb(env)) {
    await ensureIntelSchema(env);
    await env.INTEL_DB.prepare(
      "INSERT OR REPLACE INTO intel_cache (cache_key, api_path, response_json, updated_at) VALUES (?, ?, ?, ?)",
    ).bind(cacheKey, apiPath, responseJson, now).run();
  }

  const players = [];
  if (payload && payload.id) players.push(payload);
  if (payload && Array.isArray(payload.players)) players.push(...payload.players);
  if (payload && Array.isArray(payload.top_players)) players.push(...payload.top_players);

  await Promise.all([
    savePlayerSummariesD1(env, players).catch(() => {}),
    savePlayerSummariesSupabase(env, players).catch(() => {}),
    saveIntelCacheSupabase(env, cacheKey, apiPath, responseJson, now).catch(() => {}),
  ]);

  if (env.INTEL_BUCKET && typeof env.INTEL_BUCKET.put === "function") {
    await env.INTEL_BUCKET.put(`intel/${encodeURIComponent(cacheKey)}.json`, responseJson, {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      customMetadata: { apiPath, updatedAt: String(now) },
    }).catch(() => {});
  }
}

async function saveIntelCacheSupabase(env, cacheKey, apiPath, responseJson, now) {
  if (!supabaseConfig(env).enabled) return;
  if (responseJson.length > SUPABASE_MAX_CACHE_BYTES) return;

  await supabaseJson(env, "/intel_cache?on_conflict=cache_key", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{
      cache_key: cacheKey,
      api_path: apiPath,
      response_json: JSON.parse(responseJson),
      updated_at_ms: now,
      byte_size: responseJson.length,
    }]),
  });
}

async function readIntelCache(env, request) {
  if (!hasIntelDb(env) || request.method !== "GET") return null;
  await ensureIntelSchema(env);

  const cacheKey = cacheKeyFromRequest(request);
  const row = await env.INTEL_DB.prepare(
    "SELECT response_json, updated_at FROM intel_cache WHERE cache_key = ?",
  ).bind(cacheKey).first();
  if (!row || !row.response_json) return null;

  const data = parseJsonObject(row.response_json);
  data._cache = { source: "local", updated_at: Number(row.updated_at || 0) };
  return data;
}

async function readIntelCacheSupabase(env, request) {
  if (!supabaseConfig(env).enabled || request.method !== "GET") return null;
  const cacheKey = encodeURIComponent(cacheKeyFromRequest(request));
  const rows = await supabaseJson(
    env,
    `/intel_cache?cache_key=eq.${cacheKey}&select=response_json,updated_at_ms&limit=1`,
  );
  const row = rows && rows[0];
  if (!row || !row.response_json) return null;
  const data = row.response_json;
  data._cache = { source: "supabase", updated_at: Number(row.updated_at_ms || 0) };
  return data;
}

async function searchIntelPlayers(env, request) {
  if (!hasIntelDb(env) || request.method !== "GET") return null;
  const url = new URL(request.url);
  const q = cleanText(url.searchParams.get("q"), 80).toLowerCase();
  if (!q) return { players: [], total: 0, _cache: { source: "local-search", updated_at: 0 } };

  await ensureIntelSchema(env);
  const limit = Math.min(80, Math.max(1, Number(url.searchParams.get("limit")) || 80));
  const rows = await env.INTEL_DB.prepare(
    "SELECT summary_json, updated_at FROM intel_players WHERE id = ? OR username_lc LIKE ? ORDER BY updated_at DESC LIMIT ?",
  ).bind(q, `%${q}%`, limit).all();

  const players = (rows.results || [])
    .map((row) => parseJsonObject(row.summary_json))
    .filter((player) => player && player.id);
  const updatedAt = Math.max(0, ...(rows.results || []).map((row) => Number(row.updated_at || 0)));
  return { players, total: players.length, _cache: { source: "local-search", updated_at: updatedAt } };
}

async function searchIntelPlayersSupabase(env, request) {
  if (!supabaseConfig(env).enabled || request.method !== "GET") return null;
  const url = new URL(request.url);
  const q = cleanText(url.searchParams.get("q"), 80).toLowerCase();
  if (!q) return { players: [], total: 0, _cache: { source: "supabase-search", updated_at: 0 } };

  const limit = Math.min(80, Math.max(1, Number(url.searchParams.get("limit")) || 80));
  const query = encodeURIComponent(`*${q}*`);
  const id = encodeURIComponent(q);
  const rows = await supabaseJson(
    env,
    `/intel_players?or=(id.eq.${id},username_lc.ilike.${query})&select=summary_json,updated_at_ms&order=updated_at_ms.desc&limit=${limit}`,
  );
  const players = (rows || []).map((row) => row.summary_json).filter((player) => player && player.id);
  const updatedAt = Math.max(0, ...(rows || []).map((row) => Number(row.updated_at_ms || 0)));
  return { players, total: players.length, _cache: { source: "supabase-search", updated_at: updatedAt } };
}

async function fallbackIntelResponse(env, request) {
  const apiPath = apiPathFromRequest(request);
  if (/^players\/search\/?$/.test(apiPath)) {
    return (
      (await searchIntelPlayersSupabase(env, request).catch(() => null)) ||
      (await searchIntelPlayers(env, request).catch(() => null))
    );
  }
  return (
    (await readIntelCacheSupabase(env, request).catch(() => null)) ||
    (await readIntelCache(env, request).catch(() => null))
  );
}

async function intelStatus(env) {
  const supabase = supabaseConfig(env);
  const status = {
    d1: hasIntelDb(env),
    r2: Boolean(env.INTEL_BUCKET && typeof env.INTEL_BUCKET.put === "function"),
    supabase: supabase.enabled,
    players: 0,
    cachedResponses: 0,
    supabasePlayers: 0,
    supabaseCachedResponses: 0,
  };

  if (status.d1) {
    await ensureIntelSchema(env);
    const [players, cached] = await Promise.all([
      env.INTEL_DB.prepare("SELECT COUNT(*) AS count FROM intel_players").first(),
      env.INTEL_DB.prepare("SELECT COUNT(*) AS count FROM intel_cache").first(),
    ]);
    status.players = Number(players && players.count) || 0;
    status.cachedResponses = Number(cached && cached.count) || 0;
  }

  if (status.supabase) {
    const [players, cached] = await Promise.all([
      supabaseCount(env, "intel_players").catch(() => 0),
      supabaseCount(env, "intel_cache").catch(() => 0),
    ]);
    status.supabasePlayers = players;
    status.supabaseCachedResponses = cached;
  }

  return status;
}

function clientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    ""
  ).split(",")[0].trim();
}

async function submitFeedback(request, env) {
  const store = feedbackStore(env);
  if (!store) {
    return json({ ok: false, enabled: false, error: "Feedback storage is not configured." }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const message = cleanMessage(body.message);
  if (message.length < 5) {
    return json({ ok: false, error: "Message is too short." }, 400);
  }

  const type = ["bug", "update", "translation", "other"].includes(body.type)
    ? body.type
    : "other";
  const page = cleanText(body.page, 80);
  const contact = cleanText(body.contact, MAX_FEEDBACK_CONTACT);
  const lang = cleanText(body.lang, 16);
  const id = `${Date.now()}-${crypto.randomUUID()}`;
  const item = {
    id,
    type,
    page,
    message,
    contact,
    lang,
    url: cleanText(body.url, 500),
    userAgent: cleanText(request.headers.get("user-agent"), 240),
    ip: clientIp(request),
    createdAt: new Date().toISOString(),
    status: "open",
  };

  const indexRaw = await store.get(FEEDBACK_INDEX_KEY);
  const index = parseJsonArray(indexRaw);
  index.unshift(id);
  const nextIndex = index.slice(0, FEEDBACK_INDEX_LIMIT);

  await Promise.all([
    store.put(`feedback:item:${id}`, JSON.stringify(item)),
    store.put(FEEDBACK_INDEX_KEY, JSON.stringify(nextIndex)),
  ]);

  return json({ ok: true, enabled: true, id });
}

async function listFeedback(request, env) {
  const store = feedbackStore(env);
  if (!store) {
    return json({ ok: false, enabled: false, error: "Feedback storage is not configured." }, 503);
  }

  if (!env.ADMIN_TOKEN) {
    return json({ ok: false, error: "ADMIN_TOKEN is not configured." }, 403);
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token") || request.headers.get("x-admin-token") || "";
  if (token !== env.ADMIN_TOKEN) {
    return json({ ok: false, error: "Invalid admin token." }, 403);
  }

  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const indexRaw = await store.get(FEEDBACK_INDEX_KEY);
  const ids = parseJsonArray(indexRaw);
  const items = await Promise.all(
    ids.slice(0, limit).map(async (id) => {
      const raw = await store.get(`feedback:item:${id}`);
      return raw ? JSON.parse(raw) : null;
    }),
  );

  return json({ ok: true, enabled: true, items: items.filter(Boolean) });
}

function requireAdmin(request, env) {
  if (!env.ADMIN_TOKEN) return { ok: false, response: json({ ok: false, error: "ADMIN_TOKEN is not configured." }, 403) };
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || request.headers.get("x-admin-token") || "";
  if (token !== env.ADMIN_TOKEN) return { ok: false, response: json({ ok: false, error: "Invalid admin token." }, 403) };
  return { ok: true };
}

async function cleanupIntel(request, env) {
  const admin = requireAdmin(request, env);
  if (!admin.ok) return admin.response;

  const url = new URL(request.url);
  const days = Math.min(180, Math.max(7, Number(url.searchParams.get("days")) || 45));
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const result = {
    ok: true,
    days,
    cutoff,
    d1Deleted: 0,
    supabaseDeleted: 0,
  };

  if (hasIntelDb(env)) {
    await ensureIntelSchema(env);
    const deleted = await env.INTEL_DB.prepare("DELETE FROM intel_cache WHERE updated_at < ?").bind(cutoff).run();
    result.d1Deleted = Number(deleted.meta && deleted.meta.changes) || 0;
  }

  if (supabaseConfig(env).enabled) {
    const response = await supabaseFetch(env, `/intel_cache?updated_at_ms=lt.${cutoff}`, {
      method: "DELETE",
      headers: { prefer: "return=minimal" },
    }).catch(() => null);
    result.supabaseDeleted = response ? 1 : 0;
  }

  return json(result);
}

async function getToken(force = false) {
  if (!force && cachedToken && cachedTokenExpires - TOKEN_REFRESH_MARGIN_MS > Date.now()) {
    return cachedToken;
  }

  if (!force && tokenPromise) return tokenPromise;

  tokenPromise = fetch(`${UPSTREAM}/api/session`, {
    headers: { accept: "application/json" },
    cf: { cacheTtl: 0 },
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`session ${response.status}`);
      const data = await response.json();
      cachedToken = data.token || "";
      cachedTokenExpires = Number(data.expires_at || 0) * 1000;
      if (!cachedToken) throw new Error("session token missing");
      return cachedToken;
    })
    .finally(() => {
      tokenPromise = null;
    });

  return tokenPromise;
}

function corsHeaders(origin) {
  return {
    "access-control-allow-origin": origin || "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, X-API-Token",
    "access-control-max-age": "86400",
  };
}

function jsonError(message, status, origin) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      ...corsHeaders(origin),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function upstreamError(message, status, origin) {
  return new Response(JSON.stringify({ error: message || `Upstream ${status}`, upstreamStatus: status }), {
    status,
    headers: {
      ...corsHeaders(origin),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function buildUpstreamUrl(request) {
  const incoming = new URL(request.url);
  const apiPath = incoming.pathname.replace(/^\/kingshot\/?/, "");
  const safePath = apiPath
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(decodeURIComponent(part)))
    .join("/");

  const upstream = new URL(`/api/${safePath}`, UPSTREAM);
  incoming.searchParams.forEach((value, key) => {
    upstream.searchParams.append(key, value);
  });
  return upstream;
}

async function proxyKingshot(request, env) {
  const origin = request.headers.get("origin") || "";

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (!["GET", "POST"].includes(request.method)) {
    return jsonError("Only GET and POST requests are allowed.", 405, origin);
  }

  const upstream = buildUpstreamUrl(request);
  const bodyText = request.method === "POST" ? await request.text() : undefined;
  const contentType = request.headers.get("content-type") || "application/json";

  async function forward(forceToken = false) {
    const token = await getToken(forceToken);
    return fetch(upstream.toString(), {
      method: request.method,
      headers: {
        accept: "application/json,text/plain,*/*",
        "accept-language": request.headers.get("accept-language") || "en-US,en;q=0.9,ko;q=0.8",
        ...(request.method === "POST" ? { "content-type": contentType } : {}),
        origin: UPSTREAM,
        referer: `${UPSTREAM}/`,
        "x-api-token": token,
      },
      body: bodyText,
      cf: { cacheTtl: 0 },
    });
  }

  try {
    let response = await forward(false);
    if (response.status === 401) response = await forward(true);
    if (UPSTREAM_RETRY_STATUSES.has(response.status)) {
      await delay(350);
      response = await forward(true);
    }

    if (!response.ok) {
      const cached = await fallbackIntelResponse(env, request);
      if (cached) return json(cached);
      const message = await response.text().catch(() => "");
      return upstreamError(message, response.status, origin);
    }

    const headers = new Headers(corsHeaders(origin));
    headers.set("content-type", response.headers.get("content-type") || "application/json; charset=utf-8");
    headers.set("cache-control", "no-store");

    const text = await response.text();
    if ((headers.get("content-type") || "").includes("json")) {
      try {
        const data = JSON.parse(text);
        await saveIntelCache(env, request, data).catch(() => {});
      } catch {}
    }

    return new Response(text, {
      status: response.status,
      headers,
    });
  } catch (error) {
    const cached = await fallbackIntelResponse(env, request);
    if (cached) return json(cached);
    return jsonError(error.message || "Proxy request failed.", 502, origin);
  }
}

function assetRequest(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/kingshot" || url.pathname.startsWith("/kingshot/")) {
      return proxyKingshot(request, env);
    }

    if (url.pathname === "/api/visit" && request.method === "POST") {
      return json(await incrementVisit(env));
    }

    if (url.pathname === "/api/stats" && request.method === "GET") {
      return json(await readStats(env));
    }

    if (url.pathname === "/api/intel/status" && request.method === "GET") {
      return json(await intelStatus(env));
    }

    if (url.pathname === "/api/intel/cleanup" && request.method === "POST") {
      return cleanupIntel(request, env);
    }

    if (url.pathname === "/api/feedback" && request.method === "POST") {
      return submitFeedback(request, env);
    }

    if (url.pathname === "/api/feedback" && request.method === "GET") {
      return listFeedback(request, env);
    }

    if (!env.ASSETS) {
      return new Response("Static asset binding is not available.", {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname === "/") {
      return env.ASSETS.fetch(assetRequest(request, "/site/index.html"));
    }

    return env.ASSETS.fetch(assetRequest(request, `/site${url.pathname}`));
  },
};
