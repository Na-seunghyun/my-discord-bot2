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
const OFFICIAL_GIFT_PLAYER_API = "https://kingshot-giftcode.centurygame.com/api/player";
const OFFICIAL_GIFT_REDEEM_API = "https://kingshot-giftcode.centurygame.com/api/gift_code";
const OFFICIAL_GIFT_ORIGIN = "https://ks-giftcode.centurygame.com";
const OFFICIAL_GIFT_SIGN_SALT = "mN4!pQs6JrYwV9";
const OFFICIAL_GIFT_TIMEOUT_MS = 10000;
const AUTO_REDEEM_DEFAULT_BATCH_SIZE = 12;
const AUTO_REDEEM_DEFAULT_DELAY_MS = 1200;
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

function md5Hex(input) {
  const bytes = new TextEncoder().encode(String(input));
  const words = [];
  for (let i = 0; i < bytes.length; i += 1) {
    words[i >> 2] = (words[i >> 2] || 0) | (bytes[i] << ((i % 4) * 8));
  }
  const bitLength = bytes.length * 8;
  words[bitLength >> 5] = (words[bitLength >> 5] || 0) | (0x80 << (bitLength % 32));
  words[(((bitLength + 64) >>> 9) << 4) + 14] = bitLength;

  const add = (a, b) => (a + b) | 0;
  const rol = (value, shift) => (value << shift) | (value >>> (32 - shift));
  const cmn = (q, a, b, x, s, t) => add(rol(add(add(a, q), add(x || 0, t)), s), b);
  const ff = (a, b, c, d, x, s, t) => cmn((b & c) | (~b & d), a, b, x, s, t);
  const gg = (a, b, c, d, x, s, t) => cmn((b & d) | (c & ~d), a, b, x, s, t);
  const hh = (a, b, c, d, x, s, t) => cmn(b ^ c ^ d, a, b, x, s, t);
  const ii = (a, b, c, d, x, s, t) => cmn(c ^ (b | ~d), a, b, x, s, t);

  let a = 1732584193;
  let b = -271733879;
  let c = -1732584194;
  let d = 271733878;

  for (let i = 0; i < words.length; i += 16) {
    const oldA = a;
    const oldB = b;
    const oldC = c;
    const oldD = d;

    a = ff(a, b, c, d, words[i], 7, -680876936);
    d = ff(d, a, b, c, words[i + 1], 12, -389564586);
    c = ff(c, d, a, b, words[i + 2], 17, 606105819);
    b = ff(b, c, d, a, words[i + 3], 22, -1044525330);
    a = ff(a, b, c, d, words[i + 4], 7, -176418897);
    d = ff(d, a, b, c, words[i + 5], 12, 1200080426);
    c = ff(c, d, a, b, words[i + 6], 17, -1473231341);
    b = ff(b, c, d, a, words[i + 7], 22, -45705983);
    a = ff(a, b, c, d, words[i + 8], 7, 1770035416);
    d = ff(d, a, b, c, words[i + 9], 12, -1958414417);
    c = ff(c, d, a, b, words[i + 10], 17, -42063);
    b = ff(b, c, d, a, words[i + 11], 22, -1990404162);
    a = ff(a, b, c, d, words[i + 12], 7, 1804603682);
    d = ff(d, a, b, c, words[i + 13], 12, -40341101);
    c = ff(c, d, a, b, words[i + 14], 17, -1502002290);
    b = ff(b, c, d, a, words[i + 15], 22, 1236535329);

    a = gg(a, b, c, d, words[i + 1], 5, -165796510);
    d = gg(d, a, b, c, words[i + 6], 9, -1069501632);
    c = gg(c, d, a, b, words[i + 11], 14, 643717713);
    b = gg(b, c, d, a, words[i], 20, -373897302);
    a = gg(a, b, c, d, words[i + 5], 5, -701558691);
    d = gg(d, a, b, c, words[i + 10], 9, 38016083);
    c = gg(c, d, a, b, words[i + 15], 14, -660478335);
    b = gg(b, c, d, a, words[i + 4], 20, -405537848);
    a = gg(a, b, c, d, words[i + 9], 5, 568446438);
    d = gg(d, a, b, c, words[i + 14], 9, -1019803690);
    c = gg(c, d, a, b, words[i + 3], 14, -187363961);
    b = gg(b, c, d, a, words[i + 8], 20, 1163531501);
    a = gg(a, b, c, d, words[i + 13], 5, -1444681467);
    d = gg(d, a, b, c, words[i + 2], 9, -51403784);
    c = gg(c, d, a, b, words[i + 7], 14, 1735328473);
    b = gg(b, c, d, a, words[i + 12], 20, -1926607734);

    a = hh(a, b, c, d, words[i + 5], 4, -378558);
    d = hh(d, a, b, c, words[i + 8], 11, -2022574463);
    c = hh(c, d, a, b, words[i + 11], 16, 1839030562);
    b = hh(b, c, d, a, words[i + 14], 23, -35309556);
    a = hh(a, b, c, d, words[i + 1], 4, -1530992060);
    d = hh(d, a, b, c, words[i + 4], 11, 1272893353);
    c = hh(c, d, a, b, words[i + 7], 16, -155497632);
    b = hh(b, c, d, a, words[i + 10], 23, -1094730640);
    a = hh(a, b, c, d, words[i + 13], 4, 681279174);
    d = hh(d, a, b, c, words[i], 11, -358537222);
    c = hh(c, d, a, b, words[i + 3], 16, -722521979);
    b = hh(b, c, d, a, words[i + 6], 23, 76029189);
    a = hh(a, b, c, d, words[i + 9], 4, -640364487);
    d = hh(d, a, b, c, words[i + 12], 11, -421815835);
    c = hh(c, d, a, b, words[i + 15], 16, 530742520);
    b = hh(b, c, d, a, words[i + 2], 23, -995338651);

    a = ii(a, b, c, d, words[i], 6, -198630844);
    d = ii(d, a, b, c, words[i + 7], 10, 1126891415);
    c = ii(c, d, a, b, words[i + 14], 15, -1416354905);
    b = ii(b, c, d, a, words[i + 5], 21, -57434055);
    a = ii(a, b, c, d, words[i + 12], 6, 1700485571);
    d = ii(d, a, b, c, words[i + 3], 10, -1894986606);
    c = ii(c, d, a, b, words[i + 10], 15, -1051523);
    b = ii(b, c, d, a, words[i + 1], 21, -2054922799);
    a = ii(a, b, c, d, words[i + 8], 6, 1873313359);
    d = ii(d, a, b, c, words[i + 15], 10, -30611744);
    c = ii(c, d, a, b, words[i + 6], 15, -1560198380);
    b = ii(b, c, d, a, words[i + 13], 21, 1309151649);
    a = ii(a, b, c, d, words[i + 4], 6, -145523070);
    d = ii(d, a, b, c, words[i + 11], 10, -1120210379);
    c = ii(c, d, a, b, words[i + 2], 15, 718787259);
    b = ii(b, c, d, a, words[i + 9], 21, -343485551);

    a = add(a, oldA);
    b = add(b, oldB);
    c = add(c, oldC);
    d = add(d, oldD);
  }

  const hex = [];
  [a, b, c, d].forEach((word) => {
    for (let i = 0; i < 4; i += 1) {
      hex.push(((word >>> (i * 8)) & 0xff).toString(16).padStart(2, "0"));
    }
  });
  return hex.join("");
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

function officialGiftSign(params) {
  const payload = Object.keys(params).sort().reduce((text, key) => {
    const value = isPlainObject(params[key]) || Array.isArray(params[key]) ? JSON.stringify(params[key]) : params[key];
    return `${text}${text ? "&" : ""}${key}=${value}`;
  }, "");
  return md5Hex(`${payload}${OFFICIAL_GIFT_SIGN_SALT}`);
}

function normalizeOfficialGiftProfile(payload) {
  const profile = payload && payload.code === 0 && isPlainObject(payload.data) ? payload.data : null;
  if (!profile || !profile.fid) return null;
  const id = String(profile.fid);
  return normalizePlayerSummary({
    id,
    fid: id,
    username: profile.nickname,
    nickname: profile.nickname,
    state: numberOrNull(profile.kid),
    kid: numberOrNull(profile.kid),
    town_hall_level: numberOrNull(profile.stove_lv),
    stove_lv: numberOrNull(profile.stove_lv),
    stove_lv_content: profile.stove_lv_content,
    avatar_url: profile.avatar_image,
    avatar_image: profile.avatar_image,
    source: "official-giftcode",
    last_refreshed_at: new Date().toISOString(),
  });
}

async function fetchOfficialGiftProfile(playerId) {
  const fid = meaningfulText(playerId, 40);
  if (!/^\d{3,12}$/.test(fid)) return null;
  const data = { fid, time: Date.now() };
  data.sign = officialGiftSign(data);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OFFICIAL_GIFT_TIMEOUT_MS);
  try {
    const response = await fetch(OFFICIAL_GIFT_PLAYER_API, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json, text/plain, */*",
        origin: OFFICIAL_GIFT_ORIGIN,
        referer: `${OFFICIAL_GIFT_ORIGIN}/`,
      },
      body: new URLSearchParams(data).toString(),
      signal: controller.signal,
      cf: { cacheTtl: 0 },
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    return normalizeOfficialGiftProfile(payload);
  } finally {
    clearTimeout(timer);
  }
}

async function saveOfficialProfile(env, profile) {
  if (!profile || !profile.id) return;
  await Promise.all([
    savePlayerSummariesD1(env, [profile]).catch(() => {}),
    savePlayerSummariesSupabase(env, [profile]).catch(() => {}),
  ]);
}

function normalizeGiftCode(value) {
  const code = meaningfulText(value, 80).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  return /^[A-Z0-9_-]{3,64}$/.test(code) ? code : "";
}

function timeMs(value, fallback = Date.now()) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSourceCodeRow(row, source = "jeab:codes") {
  if (!isPlainObject(row)) return null;
  const code = normalizeGiftCode(row.Code || row.code || row.gift_code || row.cdk);
  if (!code) return null;
  const isActive = row.IsActive === undefined && row.is_active === undefined
    ? null
    : Boolean(row.IsActive ?? row.is_active);
  const discoveredAt = timeMs(row.DiscoveredAt || row.discovered_at || row.discovered_at_ms);
  return {
    code,
    source,
    status: isActive === false ? "expired" : "active",
    isActive,
    discoveredAt,
    updatedAt: Date.now(),
    raw: {
      source,
      is_active: isActive,
      discovered_at: row.DiscoveredAt || row.discovered_at || "",
    },
  };
}

function normalizeRecentRedemptionRow(row) {
  if (!isPlainObject(row)) return null;
  const code = normalizeGiftCode(row.Code || row.code || row.gift_code || row.cdk);
  if (!code) return null;
  return {
    code,
    lastRedeemStatus: cleanText(row.Status || row.status, 80),
    lastRedeemedAt: timeMs(row.RedeemedAt || row.redeemed_at || row.redeemed_at_ms),
  };
}

function collectGiftCodesFromPayload(payload, out = new Set(), keyHint = "", depth = 0) {
  if (depth > 5 || payload == null) return out;
  if (typeof payload === "string") {
    const text = payload.toUpperCase();
    if (/CODE|CDK|GIFT|REDEEM/.test(keyHint.toUpperCase())) {
      const direct = normalizeGiftCode(text);
      if (direct) out.add(direct);
    }
    const matches = text.matchAll(/(?:GIFT\s*CODE|CODE|CDK|REDEEM)\s*[:：#-]?\s*`?([A-Z0-9_-]{3,64})`?/g);
    for (const match of matches) {
      const code = normalizeGiftCode(match[1]);
      if (code) out.add(code);
    }
    return out;
  }
  if (Array.isArray(payload)) {
    payload.forEach((item) => collectGiftCodesFromPayload(item, out, keyHint, depth + 1));
    return out;
  }
  if (!isPlainObject(payload)) return out;
  Object.entries(payload).forEach(([key, value]) => {
    const keyText = String(key || "");
    if (/^(code|gift_code|cdk)$/i.test(keyText)) {
      const code = normalizeGiftCode(value);
      if (code) out.add(code);
    }
    collectGiftCodesFromPayload(value, out, keyText || keyHint, depth + 1);
  });
  return out;
}

function autoRedeemConfig(env) {
  return {
    enabled: envBool(env.AUTO_REDEEM_ENABLED, true),
    batchSize: envNumber(env.AUTO_REDEEM_BATCH_SIZE, AUTO_REDEEM_DEFAULT_BATCH_SIZE, 1, 30),
    delayMs: envNumber(env.AUTO_REDEEM_DELAY_MS, AUTO_REDEEM_DEFAULT_DELAY_MS, 300, 8000),
  };
}

function requireSupabase(env) {
  if (!supabaseConfig(env).enabled) return { ok: false, response: json({ ok: false, error: "Supabase is not configured." }, 503) };
  return { ok: true };
}

async function hashManageToken(token) {
  const bytes = new TextEncoder().encode(String(token));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function newManageToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function extractPlayerIds(value, max = 100) {
  const raw = Array.isArray(value) ? value.join("\n") : String(value || "");
  const ids = raw.match(/\d{3,12}/g) || [];
  return [...new Set(ids.map(String))].slice(0, max);
}

async function countRedeemPlayers(env) {
  if (!supabaseConfig(env).enabled) return 0;
  const response = await supabaseFetch(env, "/redeem_players?enabled=eq.true&consent=eq.true&select=id&limit=1", {
    headers: { prefer: "count=exact", range: "0-0" },
  }).catch(() => null);
  if (!response) return 0;
  const range = response.headers.get("content-range") || "";
  const total = Number(range.split("/")[1]);
  return Number.isFinite(total) ? total : 0;
}

async function upsertRedeemPlayer(env, playerId, options = {}) {
  const profile = await fetchOfficialGiftProfile(playerId).catch(() => null);
  if (!profile) return { ok: false, status: "invalid", playerId };

  const now = Date.now();
  const existingRows = await supabaseJson(env, `/redeem_players?id=eq.${encodeURIComponent(profile.id)}&select=id,enabled,consent,manage_token_hash,created_at_ms&limit=1`).catch(() => []);
  const existing = existingRows && existingRows[0];
  await saveOfficialProfile(env, profile);

  if (existing && existing.enabled && existing.consent) {
    await supabaseJson(env, `/redeem_players?id=eq.${encodeURIComponent(profile.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        nickname: profile.username,
        state: profile.state,
        town_hall_level: profile.town_hall_level,
        avatar_url: profile.avatar_url,
        lang: cleanText(options.lang, 16),
        updated_at_ms: now,
        profile_json: profile,
      }),
    }).catch(() => {});
    return { ok: true, status: "duplicate", player: profile };
  }

  const manageToken = newManageToken();
  const tokenHash = await hashManageToken(manageToken);
  await supabaseJson(env, "/redeem_players?on_conflict=id", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{
      id: profile.id,
      nickname: profile.username,
      state: profile.state,
      town_hall_level: profile.town_hall_level,
      avatar_url: profile.avatar_url,
      lang: cleanText(options.lang, 16),
      enabled: true,
      consent: true,
      manage_token_hash: tokenHash,
      created_at_ms: existing && existing.created_at_ms ? existing.created_at_ms : now,
      updated_at_ms: now,
      profile_json: profile,
    }]),
  });
  return { ok: true, status: existing ? "reactivated" : "created", player: profile, manageToken };
}

async function registerRedeemPlayer(request, env) {
  const ready = requireSupabase(env);
  if (!ready.ok) return ready.response;
  const body = await request.json().catch(() => ({}));
  if (!body.consent) return json({ ok: false, error: "Consent is required before saving a player ID." }, 400);
  const playerId = meaningfulText(body.playerId || body.fid || body.id, 40);
  const result = await upsertRedeemPlayer(env, playerId, { lang: body.lang });
  if (!result.ok) return json({ ok: false, error: "Player ID could not be verified." }, 404);
  return json({ ok: true, ...result, registeredPlayers: await countRedeemPlayers(env) });
}

async function registerRedeemPlayersBulk(request, env) {
  const ready = requireSupabase(env);
  if (!ready.ok) return ready.response;
  const body = await request.json().catch(() => ({}));
  if (!body.consent) return json({ ok: false, error: "Consent is required before saving player IDs." }, 400);
  const ids = extractPlayerIds(body.ids || body.text || body.playerIds, 100);
  if (!ids.length) return json({ ok: false, error: "No valid player IDs were found." }, 400);

  const result = { ok: true, submitted: ids.length, created: 0, reactivated: 0, duplicate: 0, invalid: 0, players: [] };
  for (const id of ids) {
    const saved = await upsertRedeemPlayer(env, id, { lang: body.lang }).catch(() => ({ ok: false, status: "invalid", playerId: id }));
    if (!saved.ok) {
      result.invalid += 1;
      continue;
    }
    if (saved.status === "created") result.created += 1;
    else if (saved.status === "reactivated") result.reactivated += 1;
    else if (saved.status === "duplicate") result.duplicate += 1;
    result.players.push({
      id: saved.player.id,
      username: saved.player.username,
      state: saved.player.state,
      status: saved.status,
    });
    await delay(250);
  }
  result.registeredPlayers = await countRedeemPlayers(env);
  return json(result);
}

async function unregisterRedeemPlayer(request, env) {
  const ready = requireSupabase(env);
  if (!ready.ok) return ready.response;
  const body = await request.json().catch(() => ({}));
  const playerId = meaningfulText(body.playerId || body.fid || body.id, 40);
  const manageToken = meaningfulText(body.manageToken || body.token, 120);
  if (!playerId || !manageToken) return json({ ok: false, error: "Player ID and manage token are required." }, 400);
  const rows = await supabaseJson(env, `/redeem_players?id=eq.${encodeURIComponent(playerId)}&select=id,manage_token_hash&limit=1`);
  const row = rows && rows[0];
  if (!row || row.manage_token_hash !== await hashManageToken(manageToken)) return json({ ok: false, error: "Invalid manage token." }, 403);
  await supabaseJson(env, `/redeem_players?id=eq.${encodeURIComponent(playerId)}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled: false, consent: false, updated_at_ms: Date.now() }),
  });
  return json({ ok: true });
}

async function saveRedeemCode(env, code, source = "manual", raw = null) {
  const row = isPlainObject(code) ? code : {
    code: normalizeGiftCode(code),
    source,
    status: "active",
    isActive: true,
    discoveredAt: Date.now(),
    updatedAt: Date.now(),
    raw,
  };
  const giftCode = normalizeGiftCode(row.code);
  if (!giftCode || !supabaseConfig(env).enabled) return false;
  const now = Date.now();
  const sourceText = cleanText(row.source || source, 80) || "unknown";
  const isActive = row.isActive === null || row.isActive === undefined ? null : Boolean(row.isActive);
  const payload = {
    code: giftCode,
    source: sourceText,
    status: cleanText(row.status, 40) || "active",
    is_active: isActive,
    discovered_at_ms: numberValue(row.discoveredAt) || now,
    updated_at_ms: now,
    raw_json: row.raw ? { ...row.raw, saved_at_ms: now } : { source: sourceText, saved_at_ms: now },
  };
  const redeemStatus = cleanText(row.lastRedeemStatus, 80);
  if (redeemStatus) payload.last_redeem_status = redeemStatus;
  if (numberValue(row.lastRedeemedAt)) payload.last_redeemed_at_ms = numberValue(row.lastRedeemedAt);
  await supabaseJson(env, "/redeem_codes?on_conflict=code", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([payload]),
  });
  return true;
}

async function updateRedeemCodeUsage(env, usage) {
  if (!usage || !usage.code || !supabaseConfig(env).enabled) return false;
  const now = Date.now();
  const encoded = encodeURIComponent(usage.code);
  const existing = await supabaseJson(env, `/redeem_codes?code=eq.${encoded}&select=code&limit=1`).catch(() => []);
  if (existing && existing.length) {
    await supabaseJson(env, `/redeem_codes?code=eq.${encoded}`, {
      method: "PATCH",
      body: JSON.stringify({
        last_redeem_status: usage.lastRedeemStatus,
        last_redeemed_at_ms: usage.lastRedeemedAt,
        updated_at_ms: now,
      }),
    });
  } else {
    await saveRedeemCode(env, {
      code: usage.code,
      source: "jeab:redemptions/recent",
      status: "observed",
      isActive: null,
      discoveredAt: now,
      updatedAt: now,
      lastRedeemStatus: usage.lastRedeemStatus,
      lastRedeemedAt: usage.lastRedeemedAt,
      raw: {
        source: "jeab:redemptions/recent",
        last_redeem_status: usage.lastRedeemStatus,
        last_redeemed_at_ms: usage.lastRedeemedAt,
      },
    });
  }
  return true;
}

async function createRedeemJobsForCode(env, code) {
  const giftCode = normalizeGiftCode(code);
  if (!giftCode || !supabaseConfig(env).enabled) return 0;
  const players = await supabaseJson(env, "/redeem_players?enabled=eq.true&consent=eq.true&select=id&limit=1000").catch(() => []);
  if (!players || !players.length) return 0;
  const now = Date.now();
  const rows = players.map((player) => ({
    job_key: `${giftCode}:${player.id}`,
    player_id: String(player.id),
    gift_code: giftCode,
    status: "pending",
    attempts: 0,
    created_at_ms: now,
    updated_at_ms: now,
  }));
  await supabaseJson(env, "/redeem_jobs?on_conflict=job_key", {
    method: "POST",
    headers: { prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify(rows),
  }).catch(() => null);
  return rows.length;
}

async function discoverRedeemCodes(env) {
  const result = { ok: true, discovered: [], active: [], expired: [], usageUpdated: 0, jobsCreated: 0, errors: [] };
  try {
    const payload = await fetchUpstreamJson("codes");
    const rows = Array.isArray(payload) ? payload : [];
    for (const sourceRow of rows) {
      const row = normalizeSourceCodeRow(sourceRow, "jeab:codes");
      if (!row) continue;
      await saveRedeemCode(env, row).catch(() => {});
      result.discovered.push(row.code);
      if (row.status === "active") {
        result.active.push(row.code);
        result.jobsCreated += await createRedeemJobsForCode(env, row.code).catch(() => 0);
      } else {
        result.expired.push(row.code);
      }
    }
  } catch (error) {
    result.errors.push(`codes: ${cleanText(error.message, 120)}`);
  }

  try {
    const payload = await fetchUpstreamJson("redemptions/recent");
    const rows = Array.isArray(payload) ? payload : [];
    for (const sourceRow of rows) {
      const usage = normalizeRecentRedemptionRow(sourceRow);
      if (!usage) continue;
      if (await updateRedeemCodeUsage(env, usage).catch(() => false)) result.usageUpdated += 1;
    }
    if (!result.active.length) {
      const fallbackCodes = [...collectGiftCodesFromPayload(payload)].slice(0, 8);
      for (const code of fallbackCodes) {
        await saveRedeemCode(env, {
          code,
          source: "jeab:redemptions/recent",
          status: "observed",
          isActive: null,
          discoveredAt: Date.now(),
          updatedAt: Date.now(),
          raw: { source: "jeab:redemptions/recent", fallback: true },
        }).catch(() => {});
        result.discovered.push(code);
        result.jobsCreated += await createRedeemJobsForCode(env, code).catch(() => 0);
      }
    }
  } catch (error) {
    result.errors.push(`redemptions/recent: ${cleanText(error.message, 120)}`);
  }
  result.discovered = [...new Set(result.discovered)];
  result.active = [...new Set(result.active)];
  result.expired = [...new Set(result.expired)];
  return result;
}

async function addRedeemCode(request, env) {
  const ready = requireSupabase(env);
  if (!ready.ok) return ready.response;
  const admin = requireAdmin(request, env);
  if (!admin.ok) return admin.response;
  const body = await request.json().catch(() => ({}));
  const code = normalizeGiftCode(body.code || body.giftCode || body.cdk);
  if (!code) return json({ ok: false, error: "Valid gift code is required." }, 400);
  await saveRedeemCode(env, {
    code,
    source: "manual",
    status: "active",
    isActive: true,
    discoveredAt: Date.now(),
    updatedAt: Date.now(),
    raw: { source: "manual" },
  });
  const jobsCreated = await createRedeemJobsForCode(env, code);
  return json({ ok: true, code, jobsCreated });
}

async function listRedeemCodes(request, env) {
  const ready = requireSupabase(env);
  if (!ready.ok) return ready.response;
  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  const [codes, players] = await Promise.all([
    supabaseJson(env, `/redeem_codes?select=code,source,status,is_active,last_redeem_status,last_redeemed_at_ms,discovered_at_ms,updated_at_ms&order=discovered_at_ms.desc&limit=${limit}`).catch(() => []),
    countRedeemPlayers(env).catch(() => 0),
  ]);
  return json({ ok: true, codes: codes || [], registeredPlayers: players });
}

async function redeemStatus(env) {
  if (!supabaseConfig(env).enabled) return json({ ok: true, supabase: false, registeredPlayers: 0, activeCodes: 0 });
  const [players, codes] = await Promise.all([
    countRedeemPlayers(env).catch(() => 0),
    supabaseFetch(env, "/redeem_codes?status=eq.active&select=code&limit=1", {
      headers: { prefer: "count=exact", range: "0-0" },
    }).catch(() => null),
  ]);
  const range = codes ? codes.headers.get("content-range") || "" : "";
  const activeCodes = Number(range.split("/")[1]);
  return json({ ok: true, supabase: true, registeredPlayers: players, activeCodes: Number.isFinite(activeCodes) ? activeCodes : 0 });
}

async function runRedeemJobs(env, reason = "manual") {
  const cfg = autoRedeemConfig(env);
  const result = { ok: true, reason, enabled: cfg.enabled, processed: 0, success: 0, failed: 0, pending: 0, results: [] };
  if (!cfg.enabled) return { ...result, ok: false, skipped: "AUTO_REDEEM_ENABLED is off." };
  if (!supabaseConfig(env).enabled) return { ...result, ok: false, skipped: "Supabase is not configured." };
  const jobs = await supabaseJson(env, `/redeem_jobs?status=eq.pending&select=job_key,player_id,gift_code,attempts&order=created_at_ms.asc&limit=${cfg.batchSize}`).catch(() => []);
  result.pending = (jobs || []).length;
  for (const job of jobs || []) {
    await delay(cfg.delayMs);
    const now = Date.now();
    await supabaseJson(env, `/redeem_jobs?job_key=eq.${encodeURIComponent(job.job_key)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "running", attempts: numberValue(job.attempts) + 1, updated_at_ms: now }),
    }).catch(() => {});
    try {
      const redeem = await redeemOfficialGiftCode(job.player_id, job.gift_code);
      const doneAt = Date.now();
      const finalStatus = redeem.ok ? "success" : redeem.status;
      await supabaseJson(env, `/redeem_jobs?job_key=eq.${encodeURIComponent(job.job_key)}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: finalStatus,
          attempts: numberValue(job.attempts) + 1,
          last_error: redeem.ok ? "" : redeem.message,
          response_json: redeem.response || redeem,
          redeemed_at_ms: redeem.ok ? doneAt : null,
          updated_at_ms: doneAt,
        }),
      }).catch(() => {});
      if (redeem.player) await saveOfficialProfile(env, redeem.player);
      result.processed += 1;
      if (redeem.ok) result.success += 1;
      else result.failed += 1;
      result.results.push({ playerId: job.player_id, code: job.gift_code, status: finalStatus, message: redeem.message });
    } catch (error) {
      const doneAt = Date.now();
      await supabaseJson(env, `/redeem_jobs?job_key=eq.${encodeURIComponent(job.job_key)}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "failed",
          attempts: numberValue(job.attempts) + 1,
          last_error: cleanText(error.message, 240),
          updated_at_ms: doneAt,
        }),
      }).catch(() => {});
      result.processed += 1;
      result.failed += 1;
      result.results.push({ playerId: job.player_id, code: job.gift_code, status: "failed", message: cleanText(error.message, 160) });
    }
  }
  return result;
}

async function runAutoRedeemCycle(env, reason = "cron") {
  const discovery = await discoverRedeemCodes(env).catch((error) => ({ ok: false, discovered: [], errors: [cleanText(error.message, 120)] }));
  const jobs = await runRedeemJobs(env, reason).catch((error) => ({ ok: false, error: cleanText(error.message, 120) }));
  return { ok: Boolean(discovery.ok !== false && jobs.ok !== false), discovery, jobs };
}

function classifyRedeemPayload(payload) {
  const errCode = numberValue(payload && payload.err_code);
  const message = meaningfulText(payload && (payload.msg || payload.message), 240);
  if (payload && payload.code === 0) return { status: "success", ok: true, message: message || "success" };
  if (errCode === 40102) return { status: "captcha_required", ok: false, message: message || "captcha required" };
  if (errCode === 40014) return { status: "invalid_code", ok: false, message: message || "code not found" };
  if (errCode === 40009) return { status: "not_logged_in", ok: false, message: message || "not logged in" };
  if (/already|claimed|used/i.test(message)) return { status: "already_claimed", ok: false, message };
  if (/expired/i.test(message)) return { status: "expired", ok: false, message };
  return { status: "failed", ok: false, message: message || "redeem failed" };
}

async function redeemOfficialGiftCode(playerId, giftCode) {
  const fid = meaningfulText(playerId, 40);
  const cdk = meaningfulText(giftCode, 80).toUpperCase();
  if (!/^\d{3,12}$/.test(fid) || !/^[A-Z0-9_-]{3,64}$/.test(cdk)) {
    return { ok: false, status: "invalid_input", message: "Invalid player ID or gift code." };
  }

  const profile = await fetchOfficialGiftProfile(fid);
  if (!profile) return { ok: false, status: "player_not_found", message: "Player ID could not be verified." };

  const data = { fid, cdk, time: Date.now() };
  data.sign = officialGiftSign(data);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OFFICIAL_GIFT_TIMEOUT_MS);
  try {
    const response = await fetch(OFFICIAL_GIFT_REDEEM_API, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json, text/plain, */*",
        origin: OFFICIAL_GIFT_ORIGIN,
        referer: `${OFFICIAL_GIFT_ORIGIN}/`,
      },
      body: new URLSearchParams(data).toString(),
      signal: controller.signal,
      cf: { cacheTtl: 0 },
    });
    const payload = await response.json().catch(() => ({ code: 1, msg: `HTTP ${response.status}` }));
    const result = classifyRedeemPayload(payload);
    return { ...result, player: profile, response: payload };
  } finally {
    clearTimeout(timer);
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
    const local = (await searchIntelPlayersSupabase(env, request).catch(() => null)) || (await searchIntelPlayers(env, request).catch(() => null));
    if (local && Array.isArray(local.players) && local.players.length) return local;
    const q = cleanText(new URL(request.url).searchParams.get("q"), 40);
    const official = await fetchOfficialGiftProfile(q).catch(() => null);
    if (official) {
      await saveOfficialProfile(env, official);
      return { players: [official], total: 1, _cache: { source: "official-giftcode", updated_at: Date.now() } };
    }
    if (local) return local;
  }
  const playerMatch = apiPath.match(/^players\/([^/?#]+)\/?$/);
  if (playerMatch) {
    const playerId = decodeURIComponent(playerMatch[1]);
    const stored = await readStoredPlayer(env, playerId).catch(() => null);
    if (stored) return stored;
    const official = await fetchOfficialGiftProfile(playerId).catch(() => null);
    if (official) {
      await saveOfficialProfile(env, official);
      return { ...official, _cache: { source: "official-giftcode", updated_at: Date.now() } };
    }
  }
  return (await readIntelCacheSupabase(env, request).catch(() => null)) || (await readIntelCache(env, request).catch(() => null));
}

async function intelStatus(env) {
  const cfg = collectorConfig(env);
  const status = {
    d1: hasIntelDb(env),
    r2: Boolean(env.INTEL_BUCKET && typeof env.INTEL_BUCKET.put === "function"),
    supabase: supabaseConfig(env).enabled,
    officialGiftProfileSource: true,
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
          const official = await fetchOfficialGiftProfile(id).catch(() => null);
          if (official) {
            await saveOfficialProfile(env, official);
            result.refreshedDetails += 1;
          } else {
            result.errors.push(`player ${id}: ${error.status || ""} ${cleanText(error.message, 120)}`);
          }
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
    if (url.pathname === "/api/redeem/register" && request.method === "POST") return registerRedeemPlayer(request, env);
    if (url.pathname === "/api/redeem/register-bulk" && request.method === "POST") return registerRedeemPlayersBulk(request, env);
    if (url.pathname === "/api/redeem/unregister" && request.method === "POST") return unregisterRedeemPlayer(request, env);
    if (url.pathname === "/api/redeem/status" && request.method === "GET") return redeemStatus(env);
    if (url.pathname === "/api/redeem/codes" && request.method === "GET") return listRedeemCodes(request, env);
    if (url.pathname === "/api/redeem/code" && request.method === "POST") return addRedeemCode(request, env);
    if (url.pathname === "/api/redeem/discover" && request.method === "POST") {
      const ready = requireSupabase(env);
      if (!ready.ok) return ready.response;
      const admin = requireAdmin(request, env);
      if (!admin.ok) return admin.response;
      return json(await discoverRedeemCodes(env));
    }
    if (url.pathname === "/api/redeem/run" && request.method === "POST") {
      const ready = requireSupabase(env);
      if (!ready.ok) return ready.response;
      const admin = requireAdmin(request, env);
      if (!admin.ok) return admin.response;
      return json(await runAutoRedeemCycle(env, "manual"));
    }
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
    ctx.waitUntil(runAutoRedeemCycle(env, "cron").catch(() => null));
  },
};
