const UPSTREAM = "https://kingshot.jeab.dev";
const TOKEN_REFRESH_MARGIN_MS = 30000;
const UPSTREAM_RETRY_STATUSES = new Set([502, 503, 504]);
const FEEDBACK_INDEX_KEY = "feedback:index";
const FEEDBACK_INDEX_LIMIT = 200;
const MAX_FEEDBACK_MESSAGE = 2000;
const MAX_FEEDBACK_CONTACT = 160;
const SUPABASE_MAX_CACHE_BYTES = 120000;
const VISIT_DAILY_COUNT_CAP = 400;
const UPSTREAM_TIMEOUT_MS = 15000;
const COLLECTOR_STATE_KEY = "intel:collector:state";
const COLLECTOR_DEFAULT_MIN_KINGDOM = 1;
const COLLECTOR_DEFAULT_MAX_KINGDOM = 2000;
const COLLECTOR_DEFAULT_KINGDOM_BATCH = 1;
const COLLECTOR_DEFAULT_DETAIL_LIMIT = 20;
const COLLECTOR_DEFAULT_STALE_HOURS = 72;
const COLLECTOR_DEFAULT_DELAY_MS = 1000;

let cachedToken = "";
let cachedTokenExpires = 0;
let tokenPromise = null;
let intelSchemaReady = false;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const todayKey = () => new Date().toISOString().slice(0, 10);

const json = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

function numberValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function incrementVisit(env) {
  if (!env.VISITS) return { enabled: false, total: 0, today: 0 };

  const today = todayKey();
  const totalKey = "visits:total";
  const todayCountKey = `visits:day:${today}`;
  const [totalRaw, todayRaw] = await Promise.all([
    env.VISITS.get(totalKey),
    env.VISITS.get(todayCountKey),
  ]);
  const total = numberValue(totalRaw);
  const todayCount = numberValue(todayRaw);

  if (todayCount >= VISIT_DAILY_COUNT_CAP) {
    return {
      enabled: true,
      total,
      today: todayCount,
      limited: true,
      dailyCountCap: VISIT_DAILY_COUNT_CAP,
    };
  }

  const nextTotal = total + 1;
  const nextToday = todayCount + 1;
  await Promise.all([
    env.VISITS.put(totalKey, String(nextTotal)),
    env.VISITS.put(todayCountKey, String(nextToday)),
  ]);

  return {
    enabled: true,
    total: nextTotal,
    today: nextToday,
    limited: false,
    dailyCountCap: VISIT_DAILY_COUNT_CAP,
  };
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
    total: numberValue(totalRaw),
    today: numberValue(todayRaw),
    dailyCountCap: VISIT_DAILY_COUNT_CAP,
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

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function meaningfulText(value, maxLength) {
  const text = cleanText(value, maxLength);
  if (!text || text === "-" || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") return "";
  if (/^<!doctype\s+html/i.test(text) || /^<html[\s>]/i.test(text)) return "";
  return text;
}

function isMeaningfulValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return Boolean(meaningfulText(value, 2000));
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0 && !isIntelErrorPayload(value);
  return false;
}

function mergeMeaningful(existing, incoming) {
  if (!isPlainObject(existing)) existing = {};
  if (!isPlainObject(incoming)) return { ...existing };
  const merged = { ...existing };
  Object.entries(incoming).forEach(([key, value]) => {
    if (!isMeaningfulValue(value)) return;
    if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = mergeMeaningful(merged[key], value);
    } else {
      merged[key] = value;
    }
  });
  return merged;
}

function firstText(source, keys, maxLength) {
  for (const key of keys) {
    const text = meaningfulText(source && source[key], maxLength);
    if (text) return text;
  }
  return "";
}

function firstNumber(source, keys) {
  for (const key of keys) {
    const n = numberOrNull(source && source[key]);
    if (n !== null) return n;
  }
  return null;
}

function playerIdFrom(value) {
  const id = firstText(value, ["id", "player_id", "playerId", "uid", "fid"], 80);
  return id ? String(id) : "";
}

function isIntelErrorPayload(payload) {
  if (!payload) return true;
  if (typeof payload === "string") return !meaningfulText(payload, 2000);
  if (Array.isArray(payload)) return false;
  if (!isPlainObject(payload)) return false;
  if (!Object.keys(payload).length) return true;
  if (payload.error || payload.upstreamStatus || payload.statusCode >= 400 || payload.status >= 400) return true;
  const text = JSON.stringify(payload).slice(0, 600).toLowerCase();
  return text.includes("<!doctype html") || text.includes("<title>error response</title>");
}

function looksLikePlayer(value) {
  if (!isPlainObject(value) || isIntelErrorPayload(value)) return false;
  const id = playerIdFrom(value);
  if (!id) return false;
  return Boolean(
    firstText(value, ["username", "name", "nickname"], 160) ||
    firstNumber(value, ["state", "kid", "kingdom"]) !== null ||
    firstNumber(value, ["power", "town_hall_level", "townhall", "tc", "life_tree_level"]) !== null ||
    firstText(value, ["alliance_name", "alliance", "alliance_abbr", "alliance_tag", "avatar_url", "avatar"], 500) ||
    Array.isArray(value.heroes),
  );
}

function collectPlayersFromPayload(payload, out = [], seen = new Set(), depth = 0) {
  if (depth > 4 || payload == null || isIntelErrorPayload(payload)) return out;
  if (Array.isArray(payload)) {
    payload.forEach((item) => collectPlayersFromPayload(item, out, seen, depth + 1));
    return out;
  }
  if (!isPlainObject(payload)) return out;
  if (looksLikePlayer(payload)) {
    const id = playerIdFrom(payload);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(payload);
    }
  }
  ["player", "profile", "data", "result", "players", "top_players", "results", "items"].forEach((key) => {
    if (payload[key] !== undefined) collectPlayersFromPayload(payload[key], out, seen, depth + 1);
  });
  return out;
}

function normalizePlayerSummary(player, existingSummary = {}) {
  if (!isPlainObject(player) || isIntelErrorPayload(player)) return null;
  const id = playerIdFrom(player);
  if (!id || !looksLikePlayer(player)) return null;
  const merged = mergeMeaningful(existingSummary, player);
  merged.id = id;
  const username = firstText(merged, ["username", "name", "nickname"], 160) || id;
  merged.username = username;
  merged.state = firstNumber(merged, ["state", "kid", "kingdom"]);
  merged.alliance_name = firstText(merged, ["alliance_name", "alliance"], 160);
  merged.alliance_abbr = firstText(merged, ["alliance_abbr", "alliance_tag"], 40);
  merged.power = firstNumber(merged, ["power"]);
  merged.town_hall_level = firstNumber(merged, ["town_hall_level", "townhall", "tc"]);
  merged.avatar_url = firstText(merged, ["avatar_url", "avatar"], 500);
  merged.last_refreshed_at = firstText(merged, ["last_refreshed_at", "updated_at", "recorded_at"], 80);
  return merged;
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
  const response = await fetch(`${cfg.url}/rest/v1${path}`, { ...init, headers });
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
    headers: { prefer: "count=exact", range: "0-0" },
  });
  if (!response) return 0;
  const range = response.headers.get("content-range") || "";
  const total = Number(range.split("/")[1]);
  return Number.isFinite(total) ? total : 0;
}

async function ensureIntelSchema(env) {
  if (!hasIntelDb(env) || intelSchemaReady) return false;
  await env.INTEL_DB.batch([
    env.INTEL_DB.prepare("CREATE TABLE IF NOT EXISTS intel_players (id TEXT PRIMARY KEY, username TEXT, username_lc TEXT, state INTEGER, alliance_name TEXT, alliance_abbr TEXT, power INTEGER, town_hall_level INTEGER, avatar_url TEXT, last_refreshed_at TEXT, updated_at INTEGER, summary_json TEXT)"),
    env.INTEL_DB.prepare("CREATE INDEX IF NOT EXISTS idx_intel_players_name ON intel_players(username_lc)"),
    env.INTEL_DB.prepare("CREATE INDEX IF NOT EXISTS idx_intel_players_state ON intel_players(state)"),
    env.INTEL_DB.prepare("CREATE TABLE IF NOT EXISTS intel_cache (cache_key TEXT PRIMARY KEY, api_path TEXT, response_json TEXT, updated_at INTEGER)"),
    env.INTEL_DB.prepare("CREATE INDEX IF NOT EXISTS idx_intel_cache_path ON intel_cache(api_path)"),
  ]);
  intelSchemaReady = true;
  return true;
}

async function savePlayerSummariesD1(env, players) {
  if (!hasIntelDb(env) || !Array.isArray(players) || !players.length) return;
  await ensureIntelSchema(env);
  const now = Date.now();
  const incoming = players.map((player) => ({ raw: player, id: playerIdFrom(player) })).filter((item) => item.id);
  if (!incoming.length) return;
  const uniqueIds = [...new Set(incoming.map((item) => item.id))].slice(0, 100);
  const placeholders = uniqueIds.map(() => "?").join(",");
  const existing = placeholders
    ? await env.INTEL_DB.prepare(`SELECT id, summary_json FROM intel_players WHERE id IN (${placeholders})`).bind(...uniqueIds).all().catch(() => ({ results: [] }))
    : { results: [] };
  const existingMap = new Map((existing.results || []).map((row) => [String(row.id), parseJsonObject(row.summary_json)]));
  const statements = incoming.map(({ raw, id }) => normalizePlayerSummary(raw, existingMap.get(id))).filter(Boolean).map((player) =>
    env.INTEL_DB.prepare("INSERT INTO intel_players (id, username, username_lc, state, alliance_name, alliance_abbr, power, town_hall_level, avatar_url, last_refreshed_at, updated_at, summary_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET username = excluded.username, username_lc = excluded.username_lc, state = COALESCE(excluded.state, intel_players.state), alliance_name = COALESCE(NULLIF(excluded.alliance_name, ''), intel_players.alliance_name), alliance_abbr = COALESCE(NULLIF(excluded.alliance_abbr, ''), intel_players.alliance_abbr), power = COALESCE(excluded.power, intel_players.power), town_hall_level = COALESCE(excluded.town_hall_level, intel_players.town_hall_level), avatar_url = COALESCE(NULLIF(excluded.avatar_url, ''), intel_players.avatar_url), last_refreshed_at = COALESCE(NULLIF(excluded.last_refreshed_at, ''), intel_players.last_refreshed_at), updated_at = excluded.updated_at, summary_json = excluded.summary_json").bind(
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
  const incoming = players.map((player) => ({ raw: player, id: playerIdFrom(player) })).filter((item) => item.id).slice(0, 100);
  if (!incoming.length) return;
  const ids = [...new Set(incoming.map((item) => item.id))];
  const encodedIds = encodeURIComponent(`(${ids.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(",")})`);
  const existingRows = await supabaseJson(env, `/intel_players?id=in.${encodedIds}&select=id,summary_json`).catch(() => []);
  const existingMap = new Map((existingRows || []).map((row) => [String(row.id), row.summary_json || {}]));
  const rows = incoming.map(({ raw, id }) => normalizePlayerSummary(raw, existingMap.get(id))).filter(Boolean).map((player) => ({
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

async function saveIntelCacheSupabase(env, cacheKey, apiPath, responseJson, now) {
  if (!supabaseConfig(env).enabled || responseJson.length > SUPABASE_MAX_CACHE_BYTES) return;
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

async function saveIntelCache(env, request, payload) {
  if (payload == null || isIntelErrorPayload(payload)) return;
  const apiPath = apiPathFromRequest(request);
  const cacheKey = cacheKeyFromRequest(request);
  const responseJson = JSON.stringify(payload);
  const now = Date.now();
  const players = collectPlayersFromPayload(payload);

  await Promise.all([
    savePlayerSummariesD1(env, players).catch(() => {}),
    savePlayerSummariesSupabase(env, players).catch(() => {}),
    request.method === "GET" ? saveIntelCacheSupabase(env, cacheKey, apiPath, responseJson, now).catch(() => {}) : null,
  ]);

  if (request.method !== "GET") return;

  if (hasIntelDb(env)) {
    await ensureIntelSchema(env);
    await env.INTEL_DB.prepare("INSERT OR REPLACE INTO intel_cache (cache_key, api_path, response_json, updated_at) VALUES (?, ?, ?, ?)").bind(cacheKey, apiPath, responseJson, now).run().catch(() => {});
  }

  if (env.INTEL_BUCKET && typeof env.INTEL_BUCKET.put === "function") {
    await env.INTEL_BUCKET.put(`intel/${encodeURIComponent(cacheKey)}.json`, responseJson, {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      customMetadata: { apiPath, updatedAt: String(now) },
    }).catch(() => {});
  }
}

async function readIntelCache(env, request) {
  if (!hasIntelDb(env) || request.method !== "GET") return null;
  await ensureIntelSchema(env);
  const row = await env.INTEL_DB.prepare("SELECT response_json, updated_at FROM intel_cache WHERE cache_key = ?").bind(cacheKeyFromRequest(request)).first();
  if (!row || !row.response_json) return null;
  const data = parseJsonObject(row.response_json);
  data._cache = { source: "local", updated_at: numberValue(row.updated_at) };
  return data;
}

async function readIntelCacheSupabase(env, request) {
  if (!supabaseConfig(env).enabled || request.method !== "GET") return null;
  const cacheKey = encodeURIComponent(cacheKeyFromRequest(request));
  const rows = await supabaseJson(env, `/intel_cache?cache_key=eq.${cacheKey}&select=response_json,updated_at_ms&limit=1`);
  const row = rows && rows[0];
  if (!row || !row.response_json) return null;
  const data = row.response_json;
  data._cache = { source: "supabase", updated_at: numberValue(row.updated_at_ms) };
  return data;
}

async function readStoredPlayer(env, id) {
  const playerId = meaningfulText(id, 80);
  if (!playerId) return null;
  const encoded = encodeURIComponent(playerId);
  if (supabaseConfig(env).enabled) {
    const rows = await supabaseJson(env, `/intel_players?id=eq.${encoded}&select=summary_json,updated_at_ms&limit=1`).catch(() => null);
    const row = rows && rows[0];
    if (row && row.summary_json && row.summary_json.id) {
      return { ...row.summary_json, _cache: { source: "supabase-player", updated_at: numberValue(row.updated_at_ms) } };
    }
  }
  if (hasIntelDb(env)) {
    await ensureIntelSchema(env);
    const row = await env.INTEL_DB.prepare("SELECT summary_json, updated_at FROM intel_players WHERE id = ?").bind(playerId).first().catch(() => null);
    const data = row && row.summary_json ? parseJsonObject(row.summary_json) : null;
    if (data && data.id) return { ...data, _cache: { source: "local-player", updated_at: numberValue(row.updated_at) } };
  }
  return null;
}

async function searchIntelPlayers(env, request) {
  if (!hasIntelDb(env) || request.method !== "GET") return null;
  const url = new URL(request.url);
  const q = cleanText(url.searchParams.get("q"), 80).toLowerCase();
  if (!q) return { players: [], total: 0, _cache: { source: "local-search", updated_at: 0 } };
  await ensureIntelSchema(env);
  const limit = Math.min(80, Math.max(1, Number(url.searchParams.get("limit")) || 80));
  const rows = await env.INTEL_DB.prepare("SELECT summary_json, updated_at FROM intel_players WHERE id = ? OR username_lc LIKE ? ORDER BY updated_at DESC LIMIT ?").bind(q, `%${q}%`, limit).all();
  const players = (rows.results || []).map((row) => parseJsonObject(row.summary_json)).filter((player) => player && player.id);
  const updatedAt = Math.max(0, ...(rows.results || []).map((row) => numberValue(row.updated_at)));
  return { players, total: players.length, _cache: { source: "local-search", updated_at: updatedAt } };
}

async function searchIntelPlayersSupabase(env, request) {
  if (!supabaseConfig(env).enabled || request.method !== "GET") return null;
  const url = new URL(request.url);
  const q = cleanText(url.searchParams.get("q"), 80).toLowerCase();
  if (!q) return { players: [], total: 0, _cache: { source: "supabase-search", updated_at: 0 } };
  const limit = Math.min(80, Math.max(1, Number(url.searchParams.get("limit")) || 80));
  const rows = await supabaseJson(env, `/intel_players?or=(id.eq.${encodeURIComponent(q)},username_lc.ilike.${encodeURIComponent(`*${q}*`)})&select=summary_json,updated_at_ms&order=updated_at_ms.desc&limit=${limit}`);
  const players = (rows || []).map((row) => row.summary_json).filter((player) => player && player.id);
  const updatedAt = Math.max(0, ...(rows || []).map((row) => numberValue(row.updated_at_ms)));
  return { players, total: players.length, _cache: { source: "supabase-search", updated_at: updatedAt } };
}

async function fallbackIntelResponse(env, request) {
  const apiPath = apiPathFromRequest(request);
  if (/^players\/search\/?$/.test(apiPath)) {
    return (await searchIntelPlayersSupabase(env, request).catch(() => null)) || (await searchIntelPlayers(env, request).catch(() => null));
  }
  const playerMatch = apiPath.match(/^players\/([^/?#]+)\/?$/);
  if (playerMatch) {
    const stored = await readStoredPlayer(env, decodeURIComponent(playerMatch[1])).catch(() => null);
    if (stored) return stored;
  }
  return (await readIntelCacheSupabase(env, request).catch(() => null)) || (await readIntelCache(env, request).catch(() => null));
}

async function intelStatus(env) {
  const cfg = collectorConfig(env);
  const status = {
    d1: hasIntelDb(env),
    r2: Boolean(env.INTEL_BUCKET && typeof env.INTEL_BUCKET.put === "function"),
    supabase: supabaseConfig(env).enabled,
    players: 0,
    cachedResponses: 0,
    supabasePlayers: 0,
    supabaseCachedResponses: 0,
    collector: {
      enabled: cfg.enabled,
      minKingdom: cfg.minKingdom,
      maxKingdom: cfg.maxKingdom,
      kingdomBatch: cfg.kingdomBatch,
      detailLimit: cfg.detailLimit,
      staleHours: Math.round(cfg.staleMs / 60 / 60 / 1000),
    },
  };
  if (status.d1) {
    await ensureIntelSchema(env);
    const [players, cached] = await Promise.all([
      env.INTEL_DB.prepare("SELECT COUNT(*) AS count FROM intel_players").first(),
      env.INTEL_DB.prepare("SELECT COUNT(*) AS count FROM intel_cache").first(),
    ]);
    status.players = numberValue(players && players.count);
    status.cachedResponses = numberValue(cached && cached.count);
  }
  if (status.supabase) {
    const [players, cached] = await Promise.all([
      supabaseCount(env, "intel_players").catch(() => 0),
      supabaseCount(env, "intel_cache").catch(() => 0),
    ]);
    status.supabasePlayers = players;
    status.supabaseCachedResponses = cached;
  }
  const collectorState = await readCollectorState(env, cfg).catch(() => null);
  if (collectorState) {
    status.collector.nextKingdom = collectorState.nextKingdom;
    status.collector.runs = numberValue(collectorState.runs);
    status.collector.lastRunAt = collectorState.lastRunAt || "";
    status.collector.lastResult = collectorState.lastResult || null;
  }
  return status;
}

function clientIp(request) {
  return (request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
}

async function submitFeedback(request, env) {
  const store = feedbackStore(env);
  if (!store) return json({ ok: false, enabled: false, error: "Feedback storage is not configured." }, 503);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }
  const message = cleanMessage(body.message);
  if (message.length < 5) return json({ ok: false, error: "Message is too short." }, 400);
  const type = ["bug", "update", "translation", "other"].includes(body.type) ? body.type : "other";
  const id = `${Date.now()}-${crypto.randomUUID()}`;
  const item = {
    id,
    type,
    page: cleanText(body.page, 80),
    message,
    contact: cleanText(body.contact, MAX_FEEDBACK_CONTACT),
    lang: cleanText(body.lang, 16),
    url: cleanText(body.url, 500),
    userAgent: cleanText(request.headers.get("user-agent"), 240),
    ip: clientIp(request),
    createdAt: new Date().toISOString(),
    status: "open",
  };
  const index = parseJsonArray(await store.get(FEEDBACK_INDEX_KEY));
  index.unshift(id);
  await Promise.all([
    store.put(`feedback:item:${id}`, JSON.stringify(item)),
    store.put(FEEDBACK_INDEX_KEY, JSON.stringify(index.slice(0, FEEDBACK_INDEX_LIMIT))),
  ]);
  return json({ ok: true, enabled: true, id });
}

async function listFeedback(request, env) {
  const store = feedbackStore(env);
  if (!store) return json({ ok: false, enabled: false, error: "Feedback storage is not configured." }, 503);
  const admin = requireAdmin(request, env);
  if (!admin.ok) return admin.response;
  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const ids = parseJsonArray(await store.get(FEEDBACK_INDEX_KEY));
  const items = await Promise.all(ids.slice(0, limit).map(async (id) => {
    const raw = await store.get(`feedback:item:${id}`);
    return raw ? JSON.parse(raw) : null;
  }));
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
  const result = { ok: true, days, cutoff, d1Deleted: 0, supabaseDeleted: 0 };
  if (hasIntelDb(env)) {
    await ensureIntelSchema(env);
    const deleted = await env.INTEL_DB.prepare("DELETE FROM intel_cache WHERE updated_at < ?").bind(cutoff).run();
    result.d1Deleted = numberValue(deleted.meta && deleted.meta.changes);
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
  if (!force && cachedToken && cachedTokenExpires - TOKEN_REFRESH_MARGIN_MS > Date.now()) return cachedToken;
  if (!force && tokenPromise) return tokenPromise;
  tokenPromise = fetch(`${UPSTREAM}/api/session`, {
    headers: { accept: "application/json" },
    cf: { cacheTtl: 0 },
  }).then(async (response) => {
    if (!response.ok) throw new Error(`session ${response.status}`);
    const data = await response.json();
    cachedToken = data.token || "";
    cachedTokenExpires = numberValue(data.expires_at) * 1000;
    if (!cachedToken) throw new Error("session token missing");
    return cachedToken;
  }).finally(() => {
    tokenPromise = null;
  });
  return tokenPromise;
}

function collectorStore(env) {
  return env.FEEDBACK || env.VISITS || null;
}

function envBool(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  return !["0", "false", "off", "no"].includes(String(value).trim().toLowerCase());
}

function envNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function collectorConfig(env) {
  const minKingdom = envNumber(env.INTEL_COLLECT_MIN_KINGDOM, COLLECTOR_DEFAULT_MIN_KINGDOM, 1, 9999);
  const maxKingdom = envNumber(env.INTEL_COLLECT_MAX_KINGDOM, COLLECTOR_DEFAULT_MAX_KINGDOM, minKingdom, 9999);
  return {
    enabled: envBool(env.INTEL_COLLECT_ENABLED, true),
    minKingdom,
    maxKingdom,
    kingdomBatch: envNumber(env.INTEL_COLLECT_KINGDOM_BATCH, COLLECTOR_DEFAULT_KINGDOM_BATCH, 1, 3),
    detailLimit: envNumber(env.INTEL_COLLECT_PLAYER_DETAILS, COLLECTOR_DEFAULT_DETAIL_LIMIT, 0, 25),
    staleMs: envNumber(env.INTEL_COLLECT_STALE_HOURS, COLLECTOR_DEFAULT_STALE_HOURS, 1, 720) * 60 * 60 * 1000,
    delayMs: envNumber(env.INTEL_COLLECT_DELAY_MS, COLLECTOR_DEFAULT_DELAY_MS, 100, 5000),
  };
}

function collectorRequest(apiPath) {
  const cleanPath = String(apiPath || "").replace(/^\/+/, "");
  return new Request(`https://collector.local/kingshot/${cleanPath}`, { method: "GET" });
}

async function readCollectorState(env, cfg) {
  const store = collectorStore(env);
  if (store) {
    const raw = await store.get(COLLECTOR_STATE_KEY).catch(() => null);
    const state = parseJsonObject(raw);
    if (state && state.nextKingdom) return state;
  }
  if (supabaseConfig(env).enabled) {
    const rows = await supabaseJson(env, `/intel_cache?cache_key=eq.${encodeURIComponent(COLLECTOR_STATE_KEY)}&select=response_json&limit=1`).catch(() => null);
    const state = rows && rows[0] && rows[0].response_json;
    if (state && state.nextKingdom) return state;
  }
  return { nextKingdom: cfg.minKingdom, runs: 0, savedPlayers: 0, errors: [] };
}

async function writeCollectorState(env, state) {
  const compact = {
    ...state,
    errors: (state.errors || []).slice(-8),
    updatedAt: new Date().toISOString(),
  };
  const store = collectorStore(env);
  if (store) await store.put(COLLECTOR_STATE_KEY, JSON.stringify(compact)).catch(() => {});
  if (supabaseConfig(env).enabled) {
    const now = Date.now();
    await supabaseJson(env, "/intel_cache?on_conflict=cache_key", {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates" },
      body: JSON.stringify([{
        cache_key: COLLECTOR_STATE_KEY,
        api_path: "collector/state",
        response_json: compact,
        updated_at_ms: now,
        byte_size: JSON.stringify(compact).length,
      }]),
    }).catch(() => {});
  }
}

function nextKingdom(current, cfg) {
  const n = Number(current) || cfg.minKingdom;
  return n >= cfg.maxKingdom ? cfg.minKingdom : n + 1;
}

function upstreamApiUrl(apiPath) {
  const [pathPart, queryPart = ""] = String(apiPath || "").split("?");
  const safePath = pathPart.split("/").filter(Boolean).map((part) => encodeURIComponent(decodeURIComponent(part))).join("/");
  const url = new URL(`/api/${safePath}`, UPSTREAM);
  if (queryPart) {
    const params = new URLSearchParams(queryPart);
    params.forEach((value, key) => url.searchParams.append(key, value));
  }
  return url;
}

async function fetchUpstreamJson(apiPath, options = {}) {
  const token = await getToken(Boolean(options.forceToken));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(upstreamApiUrl(apiPath).toString(), {
      method: options.method || "GET",
      headers: {
        accept: "application/json,text/plain,*/*",
        "accept-language": options.acceptLanguage || "en-US,en;q=0.9,ko;q=0.8",
        ...(options.bodyText ? { "content-type": options.contentType || "application/json" } : {}),
        origin: UPSTREAM,
        referer: `${UPSTREAM}/`,
        "x-api-token": token,
      },
      body: options.bodyText,
      signal: controller.signal,
      cf: { cacheTtl: 0 },
    });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(text || `Upstream ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const payload = JSON.parse(text);
    if (isIntelErrorPayload(payload)) throw new Error("invalid upstream payload");
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function recentlyStoredPlayerIds(env, ids, staleMs) {
  const uniqueIds = [...new Set(ids.map(String).filter(Boolean))].slice(0, 80);
  if (!uniqueIds.length) return new Set();
  const cutoff = Date.now() - staleMs;
  const recent = new Set();
  if (supabaseConfig(env).enabled) {
    const encodedIds = encodeURIComponent(`(${uniqueIds.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(",")})`);
    const rows = await supabaseJson(env, `/intel_players?id=in.${encodedIds}&select=id,updated_at_ms`).catch(() => []);
    (rows || []).forEach((row) => {
      if (numberValue(row.updated_at_ms) >= cutoff) recent.add(String(row.id));
    });
  }
  if (hasIntelDb(env)) {
    await ensureIntelSchema(env);
    const placeholders = uniqueIds.map(() => "?").join(",");
    const rows = placeholders
      ? await env.INTEL_DB.prepare(`SELECT id, updated_at FROM intel_players WHERE id IN (${placeholders})`).bind(...uniqueIds).all().catch(() => ({ results: [] }))
      : { results: [] };
    (rows.results || []).forEach((row) => {
      if (numberValue(row.updated_at) >= cutoff) recent.add(String(row.id));
    });
  }
  return recent;
}

async function runIntelCollector(env, reason = "manual") {
  const cfg = collectorConfig(env);
  const result = {
    ok: true,
    reason,
    enabled: cfg.enabled,
    checkedKingdoms: [],
    savedPlayers: 0,
    refreshedDetails: 0,
    errors: [],
  };
  if (!cfg.enabled) return { ...result, ok: false, skipped: "INTEL_COLLECT_ENABLED is off." };
  if (!supabaseConfig(env).enabled && !hasIntelDb(env)) return { ...result, ok: false, skipped: "No Intel storage is configured." };

  const state = await readCollectorState(env, cfg);
  let cursor = Number(state.nextKingdom) || cfg.minKingdom;

  for (let batch = 0; batch < cfg.kingdomBatch; batch += 1) {
    const kid = cursor;
    result.checkedKingdoms.push(kid);
    try {
      const kingdomPayload = await fetchUpstreamJson(`kingdoms/${kid}`);
      const players = collectPlayersFromPayload(kingdomPayload);
      const candidateIds = players.map(playerIdFrom).filter(Boolean).slice(0, Math.max(cfg.detailLimit * 4, cfg.detailLimit));
      const recent = await recentlyStoredPlayerIds(env, candidateIds, cfg.staleMs).catch(() => new Set());
      const detailIds = candidateIds.filter((id) => !recent.has(id)).slice(0, cfg.detailLimit);

      await saveIntelCache(env, collectorRequest(`kingdoms/${kid}`), kingdomPayload);
      result.savedPlayers += players.length;

      for (const id of detailIds) {
        await delay(cfg.delayMs);
        try {
          const detail = await fetchUpstreamJson(`players/${encodeURIComponent(id)}`);
          await saveIntelCache(env, collectorRequest(`players/${encodeURIComponent(id)}`), detail);
          result.refreshedDetails += 1;
          await delay(cfg.delayMs);
          const loadout = await fetchUpstreamJson(`players/${encodeURIComponent(id)}/loadout?cached=1`).catch(() => null);
          if (loadout && !isIntelErrorPayload(loadout)) {
            await saveIntelCache(env, collectorRequest(`players/${encodeURIComponent(id)}/loadout?cached=1`), loadout);
          }
        } catch (error) {
          result.errors.push(`player ${id}: ${error.status || ""} ${cleanText(error.message, 120)}`);
        }
      }
    } catch (error) {
      result.errors.push(`K${kid}: ${error.status || ""} ${cleanText(error.message, 120)}`);
    }
    cursor = nextKingdom(cursor, cfg);
  }

  const nextState = {
    nextKingdom: cursor,
    runs: numberValue(state.runs) + 1,
    lastRunAt: new Date().toISOString(),
    lastReason: reason,
    lastResult: {
      checkedKingdoms: result.checkedKingdoms,
      savedPlayers: result.savedPlayers,
      refreshedDetails: result.refreshedDetails,
      errors: result.errors.slice(-5),
    },
    errors: [...(state.errors || []), ...result.errors].slice(-8),
  };
  await writeCollectorState(env, nextState);
  result.nextKingdom = cursor;
  return result;
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
    headers: { ...corsHeaders(origin), "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function upstreamError(message, status, origin) {
  return new Response(JSON.stringify({ error: message || `Upstream ${status}`, upstreamStatus: status }), {
    status,
    headers: { ...corsHeaders(origin), "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function buildUpstreamUrl(request) {
  const incoming = new URL(request.url);
  const apiPath = incoming.pathname.replace(/^\/kingshot\/?/, "");
  const safePath = apiPath.split("/").filter(Boolean).map((part) => encodeURIComponent(decodeURIComponent(part))).join("/");
  const upstream = new URL(`/api/${safePath}`, UPSTREAM);
  incoming.searchParams.forEach((value, key) => upstream.searchParams.append(key, value));
  return upstream;
}

async function proxyKingshot(request, env) {
  const origin = request.headers.get("origin") || "";
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (!["GET", "POST"].includes(request.method)) return jsonError("Only GET and POST requests are allowed.", 405, origin);

  const upstream = buildUpstreamUrl(request);
  const bodyText = request.method === "POST" ? await request.text() : undefined;
  const contentType = request.headers.get("content-type") || "application/json";

  async function forward(forceToken = false) {
    const token = await getToken(forceToken);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      return await fetch(upstream.toString(), {
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
        signal: controller.signal,
        cf: { cacheTtl: 0 },
      });
    } finally {
      clearTimeout(timer);
    }
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
      return upstreamError(await response.text().catch(() => ""), response.status, origin);
    }
    const headers = new Headers(corsHeaders(origin));
    headers.set("content-type", response.headers.get("content-type") || "application/json; charset=utf-8");
    headers.set("cache-control", "no-store");
    const text = await response.text();
    if ((headers.get("content-type") || "").includes("json")) {
      try {
        await saveIntelCache(env, request, JSON.parse(text)).catch(() => {});
      } catch {}
    }
    return new Response(text, { status: response.status, headers });
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

async function transformedTroopCalculator(request, env) {
  const response = await env.ASSETS.fetch(assetRequest(request, "/site/troop_training_ui.html"));
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("text/html")) return response;

  const html = await response.text();
  const cleanup = `
<script>
(() => {
  const lang = new URL(location.href).searchParams.get('lang') || localStorage.getItem('siteLang') || localStorage.getItem('lang') || 'ko';
  if (/tool=fort-sanc|calculator=fort-sanc|#fort-sanc/.test(location.href)) {
    location.replace('./fort_sanc.html?lang=' + encodeURIComponent(lang));
    return;
  }
  function removeFortSancEntry() {
    document.querySelectorAll('button, a, [data-calculator], [data-id]').forEach((node) => {
      const text = (node.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const id = String(node.dataset.calculator || node.dataset.id || node.id || '').toLowerCase();
      if (id === 'fort-sanc' || text.includes('fort / sanc') || text.includes('fort/sanc')) {
        const card = node.closest('li, .card, .calc-card, .nav-item') || node;
        card.remove();
      }
    });
  }
  removeFortSancEntry();
  new MutationObserver(removeFortSancEntry).observe(document.documentElement, { childList: true, subtree: true });
})();
</script>`;

  return new Response(html.replace("</body>", `${cleanup}</body>`), {
    status: response.status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/kingshot" || url.pathname.startsWith("/kingshot/")) return proxyKingshot(request, env);
    if (url.pathname === "/api/visit" && request.method === "POST") return json(await incrementVisit(env));
    if (url.pathname === "/api/stats" && request.method === "GET") return json(await readStats(env));
    if (url.pathname === "/api/intel/status" && request.method === "GET") return json(await intelStatus(env));
    if (url.pathname === "/api/intel/collect" && request.method === "POST") {
      const admin = requireAdmin(request, env);
      if (!admin.ok) return admin.response;
      return json(await runIntelCollector(env, "manual"));
    }
    if (url.pathname === "/api/intel/cleanup" && request.method === "POST") return cleanupIntel(request, env);
    if (url.pathname === "/api/feedback" && request.method === "POST") return submitFeedback(request, env);
    if (url.pathname === "/api/feedback" && request.method === "GET") return listFeedback(request, env);

    if (!env.ASSETS) {
      return new Response("Static asset binding is not available.", {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    if (url.pathname === "/") return env.ASSETS.fetch(assetRequest(request, "/site/index.html"));
    if (url.pathname === "/troop_training_ui.html") return transformedTroopCalculator(request, env);
    return env.ASSETS.fetch(assetRequest(request, `/site${url.pathname}`));
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runIntelCollector(env, "cron").catch(() => null));
  },
};
