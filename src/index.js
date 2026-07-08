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
const AUTO_REDEEM_DEFAULT_BATCH_SIZE = 40;
const AUTO_REDEEM_DEFAULT_CLOUDFLARE_BATCH_SIZE = 6;
const AUTO_REDEEM_DEFAULT_DELAY_MS = 700;
const AUTO_REDEEM_DEFAULT_MAX_ATTEMPTS = 4;
const AUTO_REDEEM_RUNNER_STALE_MS = 25 * 60 * 1000;
const PUBLIC_GIFT_CODE_SOURCES = [
  { source: "kingshot.net", url: "https://kingshot.net/gift-codes" },
  { source: "kingshot.net/redeem", url: "https://kingshot.net/gift-codes/redeem" },
  { source: "ks-rewards", url: "https://ks-rewards.com/" },
  { source: "ksredeem", url: "https://ksredeem.com/" },
];
const GIFT_CODE_DENYLIST = new Set([
  "ABOUT", "ACTIVE", "AUTOMATIC", "BROWSE", "BUTTON", "CLAIM", "CODES", "CODE", "COMMUNITY",
  "DATABASE", "DISCORD", "EXPIRED", "FEEDBACK", "GIFT", "GIFTCODE", "HOME", "IMAGE", "KINGS",
  "KINGSHOT", "LOADING", "LOGIN", "PLAYER", "PLAYERS", "PROFILE", "REDEEM", "REDEMPTION",
  "REGISTER", "REWARDS", "SERVER", "STATUS", "TOOLS", "UNKNOWN", "WAITING",
  "AUTO-REDEEM", "AUTO_REDEEM", "GIFT-CODE", "GIFT-CODES", "GIFT_CODE", "GIFT_CODES",
  "KSREDEEM", "KINGSREDEEM", "REDEEMER",
  "CALCULATOR", "CALCULATORS", "CHANGE", "LANGUAGE", "TOGGLE", "QUICK", "THEME", "MASTER",
  "HISTORY", "TRACKER", "BULK", "NOTICE", "SIGN", "SHARE", "LINK", "VIEW", "MORE", "BLOG",
  "CONTACT", "CONTRIBUTORS", "ANNOUNCEMENTS", "RESOURCES", "POPULAR", "GUIDES", "GUIDE",
  "DATABASES", "PLANNER", "SIMULATOR", "TEMPLATES", "CALENDAR", "MAP", "TRANSFER", "KINGDOM",
  "KINGDOMS", "RANKING", "RANKINGS", "COMPARE", "COMPARISON", "SCOUT", "SCOUTING", "DIRECTORY",
  "AMBASSADOR", "NETWORK", "COLONIES", "RECRUIT", "RECRUITING", "RESULTS", "MATCHUPS",
  "HISTORY", "CALCULATE", "COUNTDOWN", "EXPLORATION", "EXPLORER", "ANALYTICS", "ANALYSIS",
  "PERFORMANCE", "DATABASED", "TREES", "KVK", "TOTAL", "SPECIFIED", "YET", "MADE", "RIGHTS", "RESERVED",
]);
const COLLECTOR_STATE_KEY = "intel:collector:state";
const COLLECTOR_DEFAULT_MIN_KINGDOM = 1;
const COLLECTOR_DEFAULT_MAX_KINGDOM = 2000;
const COLLECTOR_DEFAULT_KINGDOM_BATCH = 1;
const COLLECTOR_DEFAULT_DETAIL_LIMIT = 20;
const COLLECTOR_DEFAULT_STALE_HOURS = 72;
const COLLECTOR_DEFAULT_DELAY_MS = 1000;
const REGISTERED_INTEL_DEFAULT_LIMIT = 10;
const REGISTERED_INTEL_DEFAULT_STALE_HOURS = 24;

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
  const code = meaningfulText(value, 80).replace(/[^A-Za-z0-9_-]/g, "");
  return /^[A-Za-z0-9_-]{3,64}$/.test(code) ? code : "";
}

function isLikelyGiftCodeValue(value) {
  const code = normalizeGiftCode(value);
  const upperCode = code.toUpperCase();
  if (!code || code.length < 5 || code.length > 32) return false;
  if (GIFT_CODE_DENYLIST.has(upperCode)) return false;
  if (/^\d+$/.test(code)) return false;
  if (!/[A-Za-z]/.test(code)) return false;
  if (/^(HTTP|HTTPS|WWW|MAIL|EMAIL|INPUT|IMAGE|LOGIN|BUTTON|PROFILE|PLAYER|REGISTER|DISCORD|GITHUB)/i.test(code)) return false;
  if (/^[A-Za-z]{1,4}$/.test(code)) return false;
  return true;
}

function timeMs(value, fallback = Date.now()) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSourceCodeRow(row, source = "jeab:codes") {
  if (!isPlainObject(row)) return null;
  const code = normalizeGiftCode(row.Code || row.code || row.gift_code || row.cdk);
  if (!isLikelyGiftCodeValue(code)) return null;
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
  if (!isLikelyGiftCodeValue(code)) return null;
  return {
    code,
    lastRedeemStatus: cleanText(row.Status || row.status, 80),
    lastRedeemedAt: timeMs(row.RedeemedAt || row.redeemed_at || row.redeemed_at_ms),
  };
}

function collectGiftCodesFromPayload(payload, out = new Set(), keyHint = "", depth = 0) {
  if (depth > 5 || payload == null) return out;
  if (typeof payload === "string") {
    const text = String(payload || "");
    if (/CODE|CDK|GIFT|REDEEM/.test(keyHint.toUpperCase())) {
      const direct = normalizeGiftCode(text);
      if (isLikelyGiftCodeValue(direct)) out.add(direct);
    }
    const matches = text.matchAll(/(?:GIFT\s*CODE|CODE|CDK|REDEEM)\s*[:：#-]?\s*`?([A-Z0-9_-]{3,64})`?/g);
    for (const match of matches) {
      const code = normalizeGiftCode(match[1]);
      if (isLikelyGiftCodeValue(code)) out.add(code);
    }
    const mixedCaseMatches = text.matchAll(/(?:GIFT\s*CODE|CODE|CDK|REDEEM)\s*[:=\-]?\s*`?([A-Za-z0-9_-]{3,64})`?/gi);
    for (const match of mixedCaseMatches) {
      const code = normalizeGiftCode(match[1]);
      if (isLikelyGiftCodeValue(code)) out.add(code);
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
      if (isLikelyGiftCodeValue(code)) out.add(code);
    }
    collectGiftCodesFromPayload(value, out, keyText || keyHint, depth + 1);
  });
  return out;
}

function autoRedeemConfig(env) {
  return {
    enabled: envBool(env.AUTO_REDEEM_ENABLED, true),
    batchSize: envNumber(env.AUTO_REDEEM_BATCH_SIZE, AUTO_REDEEM_DEFAULT_BATCH_SIZE, 1, 80),
    cloudflareBatchSize: envNumber(env.AUTO_REDEEM_CLOUDFLARE_BATCH_SIZE, AUTO_REDEEM_DEFAULT_CLOUDFLARE_BATCH_SIZE, 1, 12),
    delayMs: envNumber(env.AUTO_REDEEM_DELAY_MS, AUTO_REDEEM_DEFAULT_DELAY_MS, 300, 8000),
    maxAttempts: envNumber(env.AUTO_REDEEM_MAX_ATTEMPTS, AUTO_REDEEM_DEFAULT_MAX_ATTEMPTS, 1, 8),
    deferServerBusyAttempts: envNumber(env.AUTO_REDEEM_DEFER_SERVER_BUSY_ATTEMPTS, 6, 2, 30),
    deferredCooldownMs: envNumber(env.AUTO_REDEEM_DEFERRED_COOLDOWN_MINUTES, 60, 5, 1440) * 60 * 1000,
    browserReviewEnabled: envBool(env.AUTO_REDEEM_BROWSER_REVIEW_ENABLED, true),
    runningStaleMs: envNumber(env.AUTO_REDEEM_RUNNING_STALE_MINUTES, 12, 5, 90) * 60 * 1000,
    workerRedeemEnabled: envBool(env.AUTO_REDEEM_WORKER_REDEEM_ENABLED, false),
    verifyPlayerBeforeRedeem: envBool(env.AUTO_REDEEM_VERIFY_PLAYER, false),
    daemonDiscover: envBool(env.AUTO_REDEEM_DAEMON_DISCOVER, false),
    upstreamCodesEnabled: envBool(env.AUTO_REDEEM_UPSTREAM_CODES_ENABLED, false),
  };
}

function isRetryableRedeemStatus(status) {
  return new Set(["failed", "timeout", "network_error", "server_error", "rate_limited", "server_busy"]).has(String(status || ""));
}

function isAlwaysPendingRedeemStatus(status) {
  return new Set(["timeout", "network_error", "server_error", "rate_limited", "server_busy"]).has(String(status || ""));
}

function isDeferredCandidateStatus(status) {
  return new Set(["server_busy", "rate_limited"]).has(String(status || ""));
}

function isBrowserReviewCandidateStatus(status) {
  return String(status || "") === "server_busy";
}

async function recoverStaleRedeemJobs(env, cfg) {
  if (!supabaseConfig(env).enabled) return { recovered: 0, failed: 0, deferredRecovered: 0 };
  const now = Date.now();
  const maxAttempts = Math.max(1, numberValue(cfg && cfg.maxAttempts) || AUTO_REDEEM_DEFAULT_MAX_ATTEMPTS);
  const staleMs = Math.max(5 * 60 * 1000, numberValue(cfg && cfg.runningStaleMs) || 12 * 60 * 1000);
  const cutoff = now - staleMs;
  const deferredCutoff = now - Math.max(5 * 60 * 1000, numberValue(cfg && cfg.deferredCooldownMs) || 60 * 60 * 1000);
  const deferredRows = await supabaseJson(env, `/redeem_jobs?status=eq.deferred&updated_at_ms=lt.${deferredCutoff}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      status: "pending",
      updated_at_ms: now,
      last_error: "Deferred cooldown complete; queued for retry.",
    }),
  }).catch(() => []);
  const recoveredRows = await supabaseJson(env, `/redeem_jobs?status=eq.running&updated_at_ms=lt.${cutoff}&attempts=lt.${maxAttempts}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      status: "pending",
      updated_at_ms: now,
      last_error: "Recovered stale running job for retry.",
    }),
  }).catch(() => []);
  const failedRows = await supabaseJson(env, `/redeem_jobs?status=eq.running&updated_at_ms=lt.${cutoff}&attempts=gte.${maxAttempts}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      status: "failed",
      updated_at_ms: now,
      last_error: "Failed stale running job after max attempts.",
    }),
  }).catch(() => []);
  return {
    recovered: Array.isArray(recoveredRows) ? recoveredRows.length : 0,
    failed: Array.isArray(failedRows) ? failedRows.length : 0,
    deferredRecovered: Array.isArray(deferredRows) ? deferredRows.length : 0,
  };
}

function isDaemonRequest(request) {
  const ua = request.headers.get("user-agent") || "";
  const runner = request.headers.get("x-auto-redeem-runner") || "";
  return /NashshAutoRedeem|auto.?redeem.?daemon|putty/i.test(`${ua} ${runner}`);
}

function publicDaemonStatus(row, staleMs = 12 * 60 * 1000, fallbackSource = "putty") {
  const value = (row && (row.value_json || row.response_json)) || {};
  const lastSeenAtMs = numberValue(value.lastSeenAtMs || (row && row.updated_at_ms));
  const ageMs = lastSeenAtMs ? Math.max(0, Date.now() - lastSeenAtMs) : 0;
  const stale = !lastSeenAtMs || ageMs > staleMs;
  const error = meaningfulText(value.error || (value.discoveryErrors || [])[0], 180);
  const state = stale ? "offline" : value.ok === false ? "error" : error ? "warning" : "online";
  return {
    state,
    ok: value.ok !== false && !stale,
    stale,
    source: cleanText(value.source || fallbackSource, 40),
    lastSeenAtMs,
    ageMs,
    jobsProcessed: numberValue(value.jobsProcessed),
    success: numberValue(value.success),
    failed: numberValue(value.failed),
    retrying: numberValue(value.retrying),
    active: numberValue(value.active),
    discovered: numberValue(value.discovered),
    error,
  };
}

function redeemHeartbeatFromResult(source, result, error = null, startedAtMs = Date.now()) {
  const now = Date.now();
  const discovery = (result && result.discovery) || {};
  const jobs = (result && result.jobs) || {};
  const errors = [
    ...((discovery && discovery.errors) || []),
    error && error.message,
    result && result.error,
    jobs && jobs.error,
  ].filter(Boolean).map((item) => cleanText(item, 180)).slice(0, 4);
  return {
    source,
    ok: !error && result && result.ok !== false,
    lastSeenAtMs: now,
    startedAtMs,
    durationMs: now - startedAtMs,
    active: Array.isArray(discovery.active) ? discovery.active.length : 0,
    discovered: Array.isArray(discovery.discovered) ? discovery.discovered.length : 0,
    jobsProcessed: numberValue(jobs.processed),
    success: numberValue(jobs.success),
    failed: numberValue(jobs.failed),
    retrying: numberValue(jobs.retrying),
    discoveryErrors: errors,
  };
}

async function saveRedeemRunnerStatus(env, key, heartbeat) {
  if (!supabaseConfig(env).enabled || !key || !heartbeat) return false;
  await supabaseJson(env, "/intel_cache?on_conflict=cache_key", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{
      cache_key: key,
      api_path: `redeem/runner/${cleanText(heartbeat.source, 40) || "unknown"}`,
      response_json: heartbeat,
      updated_at_ms: numberValue(heartbeat.lastSeenAtMs) || Date.now(),
      byte_size: JSON.stringify(heartbeat).length,
    }]),
  });
  return true;
}

async function readRedeemRunnerStatus(env, key, fallbackSource) {
  if (!supabaseConfig(env).enabled) return null;
  const rows = await supabaseJson(env, `/intel_cache?cache_key=eq.${encodeURIComponent(key)}&select=cache_key,response_json,updated_at_ms&limit=1`).catch(() => []);
  if (!rows || !rows[0]) return null;
  return publicDaemonStatus(rows[0], AUTO_REDEEM_RUNNER_STALE_MS, fallbackSource);
}

async function readRedeemAutomationStatus(env) {
  if (!supabaseConfig(env).enabled) return null;
  const [cloudflare, putty, legacyDaemon] = await Promise.all([
    readRedeemRunnerStatus(env, "redeem_engine_cloudflare", "cloudflare-cron").catch(() => null),
    readRedeemRunnerStatus(env, "redeem_engine_putty", "putty").catch(() => null),
    readRedeemDaemonStatus(env).catch(() => null),
  ]);
  const candidates = [cloudflare, putty, legacyDaemon].filter(Boolean);
  const puttyCandidate = putty || legacyDaemon || null;
  const activePutty = puttyCandidate && (puttyCandidate.state === "online" || puttyCandidate.state === "warning") ? puttyCandidate : null;
  const activeAny = candidates.find((item) => item.state === "online" || item.state === "warning") || null;
  const newestAny = [...candidates].sort((a, b) => numberValue(b.lastSeenAtMs) - numberValue(a.lastSeenAtMs))[0] || null;
  const primary = activePutty || activeAny || puttyCandidate || newestAny || null;
  const stable = Boolean(candidates.find((item) => item.state === "online"));
  const warning = Boolean(candidates.find((item) => item.state === "warning" || item.state === "error"));
  const lastSeenAtMs = Math.max(0, ...candidates.map((item) => numberValue(item.lastSeenAtMs)));
  return {
    state: stable ? "stable" : warning ? "warning" : "offline",
    ok: stable,
    lastSeenAtMs,
    primary,
    cloudflare,
    putty: putty || legacyDaemon,
    jobsProcessed: primary ? primary.jobsProcessed : 0,
    success: primary ? primary.success : 0,
    failed: primary ? primary.failed : 0,
    retrying: primary ? primary.retrying : 0,
    error: primary ? primary.error : "",
  };
}

async function readRedeemDaemonStatus(env) {
  if (!supabaseConfig(env).enabled) return null;
  const rows = await supabaseJson(env, "/redeem_meta?key=eq.auto_redeem_daemon&select=key,value_json,updated_at_ms&limit=1").catch(() => []);
  if (rows && rows[0]) return publicDaemonStatus(rows[0]);
  const fallbackRows = await supabaseJson(env, "/intel_cache?cache_key=eq.redeem_daemon_status&select=cache_key,response_json,updated_at_ms&limit=1").catch(() => []);
  if (fallbackRows && fallbackRows[0]) return publicDaemonStatus(fallbackRows[0]);
  return null;
}

async function saveRedeemDaemonStatus(env, request, result, error = null, startedAtMs = Date.now(), force = false) {
  const writeStatus = { skipped: false, metaOk: false, cacheOk: false, runnerOk: false, errors: [] };
  if (!supabaseConfig(env).enabled) return { ...writeStatus, skipped: true, errors: ["Supabase is not configured."] };
  if (!force && !isDaemonRequest(request)) return { ...writeStatus, skipped: true, errors: ["Not a daemon request."] };
  const now = Date.now();
  const heartbeat = redeemHeartbeatFromResult("putty", result, error, startedAtMs);
  await supabaseJson(env, "/redeem_meta?on_conflict=key", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{
      key: "auto_redeem_daemon",
      value_json: heartbeat,
      updated_at_ms: now,
    }]),
  }).then(() => { writeStatus.metaOk = true; }).catch((writeError) => {
    writeStatus.errors.push(`redeem_meta: ${cleanText(writeError.message, 180)}`);
  });
  await supabaseJson(env, "/intel_cache?on_conflict=cache_key", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{
      cache_key: "redeem_daemon_status",
      api_path: "redeem/daemon/status",
      response_json: heartbeat,
      updated_at_ms: now,
      byte_size: JSON.stringify(heartbeat).length,
    }]),
  }).then(() => { writeStatus.cacheOk = true; }).catch((writeError) => {
    writeStatus.errors.push(`intel_cache: ${cleanText(writeError.message, 180)}`);
  });
  await saveRedeemRunnerStatus(env, "redeem_engine_putty", heartbeat)
    .then(() => { writeStatus.runnerOk = true; })
    .catch((writeError) => {
      writeStatus.errors.push(`runner: ${cleanText(writeError.message, 180)}`);
    });
  return { ...writeStatus, heartbeat };
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

function extractPlayerIds(value, max = 250) {
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

async function refreshRedeemPlayerProfile(env, profile) {
  if (!supabaseConfig(env).enabled || !profile || !profile.id) return false;
  await supabaseJson(env, `/redeem_players?id=eq.${encodeURIComponent(profile.id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      nickname: profile.username,
      state: profile.state,
      town_hall_level: profile.town_hall_level,
      avatar_url: profile.avatar_url,
      updated_at_ms: Date.now(),
      profile_json: profile,
    }),
  });
  return true;
}

async function registerRedeemPlayer(request, env) {
  const ready = requireSupabase(env);
  if (!ready.ok) return ready.response;
  const body = await request.json().catch(() => ({}));
  if (!body.consent) return json({ ok: false, error: "Consent is required before saving a player ID." }, 400);
  const playerId = meaningfulText(body.playerId || body.fid || body.id, 40);
  const result = await upsertRedeemPlayer(env, playerId, { lang: body.lang });
  if (!result.ok) return json({ ok: false, error: "Player ID could not be verified." }, 404);
  const jobsCreated = await createRedeemJobsForPlayer(env, result.player && result.player.id).catch(() => 0);
  return json({ ok: true, ...result, jobsCreated, registeredPlayers: await countRedeemPlayers(env) });
}

async function registerRedeemPlayersBulk(request, env) {
  const ready = requireSupabase(env);
  if (!ready.ok) return ready.response;
  const body = await request.json().catch(() => ({}));
  if (!body.consent) return json({ ok: false, error: "Consent is required before saving player IDs." }, 400);
  const ids = extractPlayerIds(body.ids || body.text || body.playerIds, 250);
  if (!ids.length) return json({ ok: false, error: "No valid player IDs were found." }, 400);

  const result = { ok: true, submitted: ids.length, created: 0, reactivated: 0, duplicate: 0, invalid: 0, jobsCreated: 0, players: [] };
  for (const id of ids) {
    const saved = await upsertRedeemPlayer(env, id, { lang: body.lang }).catch(() => ({ ok: false, status: "invalid", playerId: id }));
    if (!saved.ok) {
      result.invalid += 1;
      continue;
    }
    if (saved.status === "created") result.created += 1;
    else if (saved.status === "reactivated") result.reactivated += 1;
    else if (saved.status === "duplicate") result.duplicate += 1;
    const jobsCreated = await createRedeemJobsForPlayer(env, saved.player.id).catch(() => 0);
    result.jobsCreated += jobsCreated;
    result.players.push({
      id: saved.player.id,
      username: saved.player.username,
      state: saved.player.state,
      status: saved.status,
      jobsCreated,
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

function redeemCodeExpiredByOfficialUse(row) {
  if (!row) return false;
  const status = cleanText(row.status, 40).toLowerCase();
  const last = cleanText(row.last_redeem_status, 80).toLowerCase();
  return status === "expired" || row.is_active === false || last === "expired";
}

function normalizeRedeemCodeSaveResult(payload) {
  return {
    ok: true,
    code: payload.code,
    status: payload.status,
    isActive: payload.is_active,
  };
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
  if (!isLikelyGiftCodeValue(giftCode)) return false;
  if (sourceText.startsWith("public:") && !/\d/.test(giftCode)) return false;
  const isActive = row.isActive === null || row.isActive === undefined ? null : Boolean(row.isActive);
  const incomingStatus = cleanText(row.status, 40) || "active";
  const payload = {
    code: giftCode,
    source: sourceText,
    status: incomingStatus,
    is_active: isActive,
    discovered_at_ms: numberValue(row.discoveredAt) || now,
    updated_at_ms: now,
    raw_json: row.raw ? { ...row.raw, saved_at_ms: now } : { source: sourceText, saved_at_ms: now },
  };
  const redeemStatus = cleanText(row.lastRedeemStatus, 80);
  if (redeemStatus) payload.last_redeem_status = redeemStatus;
  if (numberValue(row.lastRedeemedAt)) payload.last_redeemed_at_ms = numberValue(row.lastRedeemedAt);
  if (redeemStatus.toLowerCase() === "expired") {
    payload.status = "expired";
    payload.is_active = false;
  } else if (payload.status === "active") {
    const existing = await supabaseJson(
      env,
      `/redeem_codes?code=eq.${encodeURIComponent(giftCode)}&select=status,is_active,last_redeem_status&limit=1`,
    ).catch(() => []);
    if (redeemCodeExpiredByOfficialUse(existing && existing[0])) {
      payload.status = "expired";
      payload.is_active = false;
      payload.last_redeem_status = payload.last_redeem_status || "expired";
      payload.raw_json = {
        ...payload.raw_json,
        expired_lock: "Preserved official redeem expired result.",
      };
    }
  }
  await supabaseJson(env, "/redeem_codes?on_conflict=code", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([payload]),
  });
  return normalizeRedeemCodeSaveResult(payload);
}

async function updateRedeemCodeUsage(env, usage) {
  if (!usage || !usage.code || !supabaseConfig(env).enabled) return false;
  const now = Date.now();
  const encoded = encodeURIComponent(usage.code);
  const lastRedeemStatus = cleanText(usage.lastRedeemStatus, 80);
  const expired = lastRedeemStatus.toLowerCase() === "expired";
  const existing = await supabaseJson(env, `/redeem_codes?code=eq.${encoded}&select=code&limit=1`).catch(() => []);
  if (existing && existing.length) {
    const patch = {
      last_redeem_status: lastRedeemStatus,
      last_redeemed_at_ms: usage.lastRedeemedAt,
      updated_at_ms: now,
    };
    if (expired) {
      patch.status = "expired";
      patch.is_active = false;
    }
    await supabaseJson(env, `/redeem_codes?code=eq.${encoded}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  } else {
    await saveRedeemCode(env, {
      code: usage.code,
      source: "jeab:redemptions/recent",
      status: expired ? "expired" : "observed",
      isActive: expired ? false : null,
      discoveredAt: now,
      updatedAt: now,
      lastRedeemStatus,
      lastRedeemedAt: usage.lastRedeemedAt,
      raw: {
        source: "jeab:redemptions/recent",
        last_redeem_status: lastRedeemStatus,
        last_redeemed_at_ms: usage.lastRedeemedAt,
      },
    });
  }
  return true;
}

async function updateRedeemCodeFromAttempt(env, giftCode, classified, atMs = Date.now()) {
  const code = normalizeGiftCode(giftCode);
  const status = cleanText(classified && classified.status, 80);
  if (!code || !status || !supabaseConfig(env).enabled) return false;
  const patch = {
    last_redeem_status: status,
    last_redeemed_at_ms: atMs,
    updated_at_ms: atMs,
  };
  if (status === "expired") {
    patch.status = "expired";
    patch.is_active = false;
  }
  await supabaseJson(env, `/redeem_codes?code=eq.${encodeURIComponent(code)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  }).catch(() => {});
  return true;
}

function redeemCodeReadyForAutoRedeem(row) {
  const status = cleanText((row && row.status) || "", 40).toLowerCase();
  if (status !== "active") return false;
  if (row && row.is_active === false) return false;
  return redeemCodeAllowedForPublicUseStrict(row);
}

async function listActiveRedeemPlayerIds(env, maxPlayers = 10000) {
  const out = [];
  const seen = new Set();
  const pageSize = 1000;
  for (let offset = 0; offset < maxPlayers; offset += pageSize) {
    const limit = Math.min(pageSize, maxPlayers - offset);
    const rows = await supabaseJson(
      env,
      `/redeem_players?enabled=eq.true&consent=eq.true&select=id&order=created_at_ms.asc&limit=${limit}&offset=${offset}`
    ).catch(() => []);
    if (!rows || !rows.length) break;
    for (const row of rows) {
      const id = String(row && row.id || "");
      if (!/^\d{3,12}$/.test(id) || seen.has(id)) continue;
      seen.add(id);
      out.push({ id });
    }
    if (rows.length < limit) break;
  }
  return out;
}

async function listActiveRedeemCodes(env, maxCodes = 200) {
  const rows = await supabaseJson(
    env,
    `/redeem_codes?status=eq.active&select=code,source,status,is_active,discovered_at_ms&order=discovered_at_ms.desc&limit=${maxCodes}`
  ).catch(() => []);
  return (rows || []).filter(redeemCodeReadyForAutoRedeem);
}

async function insertRedeemJobRows(env, rows) {
  const safeRows = (rows || []).filter((row) => row && row.job_key && row.player_id && row.gift_code);
  const chunkSize = 400;
  for (let i = 0; i < safeRows.length; i += chunkSize) {
    await supabaseJson(env, "/redeem_jobs?on_conflict=job_key", {
      method: "POST",
      headers: { prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify(safeRows.slice(i, i + chunkSize)),
    }).catch(() => null);
  }
  return safeRows.length;
}

async function createRedeemJobsForCode(env, code) {
  const giftCode = normalizeGiftCode(code);
  if (!giftCode || !supabaseConfig(env).enabled) return 0;
  const sourceRows = await supabaseJson(env, `/redeem_codes?code=eq.${encodeURIComponent(giftCode)}&select=code,source,status,is_active&limit=1`).catch(() => []);
  if (sourceRows && sourceRows.length && !redeemCodeReadyForAutoRedeem(sourceRows[0])) return 0;
  const players = await listActiveRedeemPlayerIds(env);
  if (!players.length) return 0;
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
  await insertRedeemJobRows(env, rows);
  return rows.length;
}

async function createRedeemJobsForPlayer(env, playerId) {
  const id = meaningfulText(playerId, 40);
  if (!/^\d{3,12}$/.test(id) || !supabaseConfig(env).enabled) return 0;
  const codes = await listActiveRedeemCodes(env);
  if (!codes.length) return 0;
  const now = Date.now();
  const rows = codes
    .map((row) => normalizeGiftCode(row && row.code))
    .filter(Boolean)
    .map((giftCode) => ({
      job_key: `${giftCode}:${id}`,
      player_id: id,
      gift_code: giftCode,
      status: "pending",
      attempts: 0,
      created_at_ms: now,
      updated_at_ms: now,
    }));
  if (!rows.length) return 0;
  await insertRedeemJobRows(env, rows);
  return rows.length;
}

function plainTextFromHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code) || 32))
    .replace(/\s+/g, " ")
    .trim();
}

function giftCodeCandidateAllowed(candidate, context) {
  const code = normalizeGiftCode(candidate);
  const upperCode = code.toUpperCase();
  if (!code || code.length < 5 || code.length > 32) return false;
  if (GIFT_CODE_DENYLIST.has(upperCode)) return false;
  if (/^\d+$/.test(code)) return false;
  if (!/[A-Za-z]/.test(code)) return false;
  if (!/\d/.test(code)) return false;
  if (!/CODE|CDK|GIFT|REDEEM|ACTIVE|EXPIRED|NEW|REWARD|PROMO/i.test(context)) return false;
  if (/^(HTTP|HTTPS|WWW|MAIL|EMAIL|INPUT|IMAGE|LOGIN|BUTTON|PROFILE|PLAYER|REGISTER)/i.test(code)) return false;
  return true;
}

function redeemCodeAllowedForPublicUse(row) {
  const code = normalizeGiftCode(row && row.code);
  if (!code || GIFT_CODE_DENYLIST.has(code.toUpperCase())) return false;
  const source = String((row && row.source) || "");
  if (source.startsWith("public:")) return giftCodeCandidateAllowed(code, `GIFT CODE ${code}`);
  return true;
}

function collectGiftCodesFromPublicText(text, source, url) {
  const plain = plainTextFromHtml(text);
  const rows = [];
  const seen = new Set();
  const matches = plain.matchAll(/\b[A-Za-z0-9][A-Za-z0-9_-]{4,31}\b/g);
  for (const match of matches) {
    const raw = match[0];
    const start = Math.max(0, match.index - 100);
    const end = Math.min(plain.length, match.index + raw.length + 100);
    const context = plain.slice(start, end);
    const upperContext = context.toUpperCase();
    const code = normalizeGiftCode(raw);
    if (!giftCodeCandidateAllowed(code, upperContext) || seen.has(code)) continue;
    seen.add(code);
    const expired = /EXPIRED|ENDED|INVALID|NOT\s+ACTIVE|만료|期限切れ|หมดอายุ/i.test(context);
    rows.push({
      code,
      source: `public:${source}`,
      status: expired ? "expired" : "active",
      isActive: expired ? false : true,
      discoveredAt: Date.now(),
      updatedAt: Date.now(),
      raw: { source: `public:${source}`, url, context: cleanText(context, 220) },
    });
  }
  return rows;
}

function decodeHtmlTextStrict(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code) || 32));
}

function textLinesFromHtmlStrict(html) {
  return decodeHtmlTextStrict(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/(div|p|li|h[1-6]|section|article|header|footer|main|aside|button|a|span)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .split(/\n+/)
    .map((line) => cleanText(line, 120))
    .filter(Boolean);
}

function giftCodeCandidateAllowedStrict(candidate, context = "") {
  const code = normalizeGiftCode(candidate);
  if (!isLikelyGiftCodeValue(code)) return false;
  return /COPY\s+CODE|GIFT\s*CODE|CDK|REDEEM|ACTIVE|EXPIRED|REWARD|PROMO/i.test(String(context || ""));
}

function redeemCodeAllowedForPublicUseStrict(row) {
  const code = normalizeGiftCode(row && row.code);
  if (!isLikelyGiftCodeValue(code)) return false;
  const status = cleanText((row && row.status) || "", 40).toLowerCase();
  if (status === "invalid_code" || status === "invalid" || status === "bad_candidate") return false;
  const source = String((row && row.source) || "");
  if ((source.startsWith("public:") || source.startsWith("trusted-public:")) && !/\d/.test(code)) return false;
  return true;
}

function collectKingshotNetGiftCodes(text, source, url) {
  const lines = textLinesFromHtmlStrict(text);
  const seen = new Set();
  const rows = [];
  const activeStart = lines.findIndex((line) => /^ACTIVE\s+GIFT\s+CODES$/i.test(line));
  const expiredStart = lines.findIndex((line) => /^EXPIRED\s+GIFT\s+CODES$/i.test(line));
  const howToStart = lines.findIndex((line) => /^HOW\s+TO\s+REDEEM\s+GIFT\s+CODES$/i.test(line));
  const sections = [];
  if (activeStart >= 0) sections.push({ status: "active", start: activeStart + 1, end: expiredStart > activeStart ? expiredStart : lines.length });
  if (expiredStart >= 0) sections.push({ status: "expired", start: expiredStart + 1, end: howToStart > expiredStart ? howToStart : lines.length });

  const ignored = (line) => /^(ACTIVE|EXPIRED|COPY CODE|COPY|SIGN IN TO REDEEM|SIGN IN|SHARE LINK|VIEW IMAGE|EXPIRES:?|LAST CHECKED:?|NOT SPECIFIED YET)$/i.test(line)
    || /^EXPIRES:/i.test(line)
    || /^[-:?™\d\s]+$/.test(line);

  const push = (candidate, status, context) => {
    const code = normalizeGiftCode(candidate);
    if (!isLikelyGiftCodeValue(code) || seen.has(code)) return;
    seen.add(code);
    rows.push({
      code,
      source: `trusted-public:${source}`,
      status,
      isActive: status === "active",
      discoveredAt: Date.now(),
      updatedAt: Date.now(),
      raw: { source: `trusted-public:${source}`, url, context: cleanText(context, 220) },
    });
  };

  for (const section of sections) {
    for (let i = section.start; i < section.end; i += 1) {
      if (!/^(ACTIVE|EXPIRED)$/i.test(lines[i])) continue;
      const localStatus = /^EXPIRED$/i.test(lines[i]) ? "expired" : section.status;
      for (let j = i + 1; j < Math.min(section.end, i + 8); j += 1) {
        const candidate = lines[j];
        if (ignored(candidate)) continue;
        const context = lines.slice(i, Math.min(section.end, j + 6)).join(" ");
        if (!/COPY\s+CODE|SIGN\s+IN\s+TO\s+REDEEM|SHARE\s+LINK|EXPIRES:/i.test(context)) continue;
        push(candidate, localStatus, context);
        break;
      }
    }
  }
  return rows;
}

function collectGiftCodesFromPublicTextStrict(text, source, url) {
  if (/^kingshot\.net$/i.test(source)) {
    const rows = collectKingshotNetGiftCodes(text, source, url);
    if (rows.length) return rows;
  }
  const lines = textLinesFromHtmlStrict(text);
  const seen = new Set();
  const rows = [];
  const ignoredLine = (line) => /^(ACTIVE|EXPIRED|COPY CODE|COPY|SIGN IN|SIGN IN TO REDEEM|SHARE LINK|VIEW IMAGE|EXPIRES:?|LAST CHECKED:?|NO CODES YET\.?|GIFT CODES?|RECENT REDEMPTIONS?)$/i.test(line)
    || /^EXPIRES:/i.test(line)
    || /^[-:•●\d\s]+$/.test(line);
  const push = (candidate, status, context) => {
    const code = normalizeGiftCode(candidate);
    if (!giftCodeCandidateAllowedStrict(code, context) || seen.has(code)) return;
    seen.add(code);
    rows.push({
      code,
      source: `public:${source}`,
      status,
      isActive: status === "expired" ? false : true,
      discoveredAt: Date.now(),
      updatedAt: Date.now(),
      raw: { source: `public:${source}`, url, context: cleanText(context, 220) },
    });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!/COPY\s+CODE/i.test(line)) continue;
    let candidate = "";
    let status = "active";
    const contextLines = [];
    for (let j = i - 1; j >= Math.max(0, i - 8); j -= 1) {
      const prev = lines[j];
      contextLines.unshift(prev);
      if (/^EXPIRED$/i.test(prev)) status = "expired";
      if (/^ACTIVE$/i.test(prev)) status = "active";
      if (!candidate && !ignoredLine(prev) && isLikelyGiftCodeValue(prev)) candidate = prev;
    }
    if (candidate) push(candidate, status, [...contextLines, line].join(" "));
  }

  for (let i = 0; i < lines.length; i += 1) {
    if (!/^(ACTIVE|EXPIRED)$/i.test(lines[i])) continue;
    const status = /^EXPIRED$/i.test(lines[i]) ? "expired" : "active";
    for (let j = i + 1; j <= Math.min(lines.length - 1, i + 6); j += 1) {
      const candidate = lines[j];
      if (ignoredLine(candidate)) continue;
      const context = lines.slice(i, Math.min(lines.length, j + 7)).join(" ");
      if (!/COPY\s+CODE/i.test(context)) continue;
      push(candidate, status, context);
      break;
    }
  }

  const plain = plainTextFromHtml(text);
  const explicit = plain.matchAll(/\b(?:GIFT\s*CODE|PROMO\s*CODE|REDEEM\s*CODE|CDK)\s*[:：#=]\s*([A-Z0-9_-]{5,32})\b/g);
  for (const match of explicit) {
    const start = Math.max(0, match.index - 80);
    const end = Math.min(plain.length, match.index + match[0].length + 80);
    const context = plain.slice(start, end);
    push(match[1], /EXPIRED|ENDED|INVALID|NOT\s+ACTIVE/i.test(context) ? "expired" : "active", context);
  }
  const explicitMixedCase = plain.matchAll(/\b(?:GIFT\s*CODE|PROMO\s*CODE|REDEEM\s*CODE|CDK)\s*[:=\-]\s*([A-Za-z0-9_-]{5,32})\b/gi);
  for (const match of explicitMixedCase) {
    const start = Math.max(0, match.index - 80);
    const end = Math.min(plain.length, match.index + match[0].length + 80);
    const context = plain.slice(start, end);
    push(match[1], /EXPIRED|ENDED|INVALID|NOT\s+ACTIVE/i.test(context) ? "expired" : "active", context);
  }

  return rows;
}

async function fetchPublicGiftCodePage(source) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(source.url, {
      headers: {
        accept: "text/html,application/xhtml+xml,text/plain,*/*",
        "accept-language": "en-US,en;q=0.9,ko;q=0.8",
        "user-agent": "Mozilla/5.0 NashshGiftCodeScout/1.0",
      },
      signal: controller.signal,
      cf: { cacheTtl: 0 },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function discoverRedeemCodesFromPublicPages(env) {
  const result = { discovered: [], active: [], expired: [], jobsCreated: 0, errors: [] };
  for (const source of PUBLIC_GIFT_CODE_SOURCES) {
    try {
      const text = await fetchPublicGiftCodePage(source);
      const rows = collectGiftCodesFromPublicTextStrict(text, source.source, source.url).slice(0, 20);
      for (const row of rows) {
        const saved = await saveRedeemCode(env, row).catch(() => false);
        if (!saved) continue;
        const savedStatus = isPlainObject(saved) ? saved.status : row.status;
        result.discovered.push(row.code);
        if (savedStatus === "active") {
          result.active.push(row.code);
          result.jobsCreated += await createRedeemJobsForCode(env, row.code).catch(() => 0);
        } else {
          result.expired.push(row.code);
        }
      }
    } catch (error) {
      result.errors.push(`${source.source}: ${cleanText(error.message, 120)}`);
    }
  }
  result.discovered = [...new Set(result.discovered)];
  result.active = [...new Set(result.active)];
  result.expired = [...new Set(result.expired)];
  return result;
}

async function discoverRedeemCodes(env) {
  const result = { ok: true, discovered: [], active: [], expired: [], usageUpdated: 0, jobsCreated: 0, errors: [] };
  const cfg = autoRedeemConfig(env);
  if (cfg.upstreamCodesEnabled) {
    try {
      const payload = await fetchUpstreamJson("codes");
      const rows = Array.isArray(payload) ? payload : [];
      for (const sourceRow of rows) {
        const row = normalizeSourceCodeRow(sourceRow, "jeab:codes");
        if (!row) continue;
        const saved = await saveRedeemCode(env, row).catch(() => false);
        if (!saved) continue;
        const savedStatus = isPlainObject(saved) ? saved.status : row.status;
        result.discovered.push(row.code);
        if (savedStatus === "active") {
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
          const saved = await saveRedeemCode(env, {
            code,
            source: "jeab:redemptions/recent",
            status: "observed",
            isActive: null,
            discoveredAt: Date.now(),
            updatedAt: Date.now(),
            raw: { source: "jeab:redemptions/recent", fallback: true },
          }).catch(() => {});
          const savedStatus = isPlainObject(saved) ? saved.status : "observed";
          result.discovered.push(code);
          if (savedStatus !== "expired") result.jobsCreated += await createRedeemJobsForCode(env, code).catch(() => 0);
        }
      }
    } catch (error) {
      result.errors.push(`redemptions/recent: ${cleanText(error.message, 120)}`);
    }
  }

  const publicDiscovery = await discoverRedeemCodesFromPublicPages(env).catch((error) => ({
    discovered: [],
    active: [],
    expired: [],
    jobsCreated: 0,
    errors: [cleanText(error.message, 120)],
  }));
  result.discovered.push(...(publicDiscovery.discovered || []));
  result.active.push(...(publicDiscovery.active || []));
  result.expired.push(...(publicDiscovery.expired || []));
  result.jobsCreated += numberValue(publicDiscovery.jobsCreated);
  result.errors.push(...(publicDiscovery.errors || []).map((item) => `public: ${cleanText(item, 120)}`));

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
  if (!isLikelyGiftCodeValue(code)) return json({ ok: false, error: "Valid gift code is required." }, 400);
  const saved = await saveRedeemCode(env, {
    code,
    source: "manual",
    status: "active",
    isActive: true,
    discoveredAt: Date.now(),
    updatedAt: Date.now(),
    raw: { source: "manual" },
  });
  const savedStatus = isPlainObject(saved) ? saved.status : "active";
  const jobsCreated = savedStatus === "active" ? await createRedeemJobsForCode(env, code) : 0;
  return json({ ok: true, code, status: savedStatus, jobsCreated });
}

async function listRedeemCodes(request, env) {
  const ready = requireSupabase(env);
  if (!ready.ok) return ready.response;
  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  const scanLimit = Math.max(100, limit * 5);
  const [codes, players] = await Promise.all([
    supabaseJson(env, `/redeem_codes?select=code,source,status,is_active,last_redeem_status,last_redeemed_at_ms,discovered_at_ms,updated_at_ms&order=discovered_at_ms.desc&limit=${scanLimit}`).catch(() => []),
    countRedeemPlayers(env).catch(() => 0),
  ]);
  const visible = (codes || []).filter(redeemCodeAllowedForPublicUseStrict).sort((a, b) => {
    const aActive = a && a.status === "active" && a.is_active !== false ? 1 : 0;
    const bActive = b && b.status === "active" && b.is_active !== false ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    return numberValue(b && b.discovered_at_ms) - numberValue(a && a.discovered_at_ms);
  });
  return json({ ok: true, codes: visible.slice(0, limit), registeredPlayers: players });
}

async function redeemStatus(env) {
  if (!supabaseConfig(env).enabled) return json({ ok: true, supabase: false, registeredPlayers: 0, activeCodes: 0, queue: null, daemon: null, automation: null });
  const [players, codes, queue, daemon, automation] = await Promise.all([
    countRedeemPlayers(env).catch(() => 0),
    supabaseJson(env, "/redeem_codes?status=eq.active&select=code,source,status,is_active&limit=200").catch(() => []),
    redeemQueueSummary(env).catch(() => null),
    readRedeemDaemonStatus(env).catch(() => null),
    readRedeemAutomationStatus(env).catch(() => null),
  ]);
  const activeCodes = (codes || []).filter(redeemCodeAllowedForPublicUseStrict).length;
  return json({ ok: true, supabase: true, registeredPlayers: players, activeCodes, queue, daemon, automation });
}

async function countSupabaseRows(env, path) {
  const response = await supabaseFetch(env, path, {
    headers: { prefer: "count=exact", range: "0-0" },
  }).catch(() => null);
  if (!response) return 0;
  const range = response.headers.get("content-range") || "";
  const total = Number(range.split("/")[1]);
  return Number.isFinite(total) ? total : 0;
}

async function redeemQueueSummary(env) {
  const cfg = autoRedeemConfig(env);
  const staleCutoff = Date.now() - cfg.runningStaleMs;
  const [pending, retryPending, running, staleRunning, deferred, browserReview, success, failedTerminal] = await Promise.all([
    countSupabaseRows(env, "/redeem_jobs?status=eq.pending&select=job_key&limit=1").catch(() => 0),
    countSupabaseRows(env, "/redeem_jobs?status=eq.pending&attempts=gt.0&select=job_key&limit=1").catch(() => 0),
    countSupabaseRows(env, "/redeem_jobs?status=eq.running&select=job_key&limit=1").catch(() => 0),
    countSupabaseRows(env, `/redeem_jobs?status=eq.running&updated_at_ms=lt.${staleCutoff}&select=job_key&limit=1`).catch(() => 0),
    countSupabaseRows(env, "/redeem_jobs?status=eq.deferred&select=job_key&limit=1").catch(() => 0),
    countSupabaseRows(env, "/redeem_jobs?status=eq.browser_review&select=job_key&limit=1").catch(() => 0),
    countSupabaseRows(env, "/redeem_jobs?status=eq.success&select=job_key&limit=1").catch(() => 0),
    countSupabaseRows(env, "/redeem_jobs?status=in.(failed,invalid_code,expired,already_claimed,time_window_closed,player_not_found,not_logged_in,captcha_required,claim_limit_reached,deferred,official_blocked)&select=job_key&limit=1").catch(() => 0),
  ]);
  return {
    pending,
    retryPending,
    running,
    staleRunning,
    deferred,
    browserReview,
    success,
    failedTerminal,
    waitingTotal: pending + running + deferred + browserReview,
    runningStaleMinutes: Math.round(cfg.runningStaleMs / 60000),
    batchSize: cfg.batchSize,
    claimMode: cfg.batchSize > 40 ? "fast-rpc" : "standard",
    deferredCooldownMinutes: Math.round((cfg.deferredCooldownMs || 0) / 60000),
  };
}

function publicRedeemPlayer(row) {
  const profile = isPlainObject(row && row.profile_json) ? row.profile_json : {};
  return {
    id: String((row && row.id) || profile.id || ""),
    nickname: cleanText((row && row.nickname) || profile.username || profile.nickname, 80),
    state: numberOrNull((row && row.state) || profile.state || profile.kid),
    town_hall_level: numberOrNull((row && row.town_hall_level) || profile.town_hall_level || profile.stove_lv),
    avatar_url: cleanText((row && row.avatar_url) || profile.avatar_url || profile.avatar_image, 500),
    created_at_ms: numberValue(row && row.created_at_ms),
    updated_at_ms: numberValue(row && row.updated_at_ms),
  };
}

function publicRedeemJob(row, playerMap = new Map()) {
  const playerId = String((row && row.player_id) || "");
  const player = playerMap.get(playerId) || {};
  return {
    player_id: playerId,
    nickname: cleanText(player.nickname, 80),
    state: numberOrNull(player.state),
    town_hall_level: numberOrNull(player.town_hall_level),
    avatar_url: cleanText(player.avatar_url, 500),
    gift_code: normalizeGiftCode(row && row.gift_code),
    status: cleanText(row && row.status, 40),
    redeemed_at_ms: numberValue(row && row.redeemed_at_ms),
    updated_at_ms: numberValue(row && row.updated_at_ms),
  };
}

function publicRedeemJobStatus(row) {
  return {
    gift_code: normalizeGiftCode(row && row.gift_code),
    status: cleanText(row && row.status, 40),
    attempts: numberValue(row && row.attempts),
    last_error: meaningfulText(row && row.last_error, 160),
    redeemed_at_ms: numberValue(row && row.redeemed_at_ms),
    updated_at_ms: numberValue(row && row.updated_at_ms),
  };
}

async function redeemActivity(request, env) {
  const ready = requireSupabase(env);
  if (!ready.ok) return ready.response;
  const url = new URL(request.url);
  const playerLimit = Math.min(12, Math.max(3, Number(url.searchParams.get("players")) || 6));
  const successLimit = Math.min(50, Math.max(5, Number(url.searchParams.get("success")) || 50));

  const [recentPlayersRaw, recentSuccessRaw, pendingJobs, successJobs, activeCodes, registeredPlayers, queue, daemon, automation] = await Promise.all([
    supabaseJson(env, `/redeem_players?enabled=eq.true&consent=eq.true&select=id,nickname,state,town_hall_level,avatar_url,created_at_ms,updated_at_ms,profile_json&order=created_at_ms.desc&limit=${playerLimit}`).catch(() => []),
    supabaseJson(env, `/redeem_jobs?status=eq.success&select=player_id,gift_code,status,redeemed_at_ms,updated_at_ms&order=redeemed_at_ms.desc&limit=${successLimit}`).catch(() => []),
    countSupabaseRows(env, "/redeem_jobs?status=in.(pending,running)&select=job_key&limit=1").catch(() => 0),
    countSupabaseRows(env, "/redeem_jobs?status=eq.success&select=job_key&limit=1").catch(() => 0),
    countSupabaseRows(env, "/redeem_codes?status=eq.active&select=code&limit=1").catch(() => 0),
    countRedeemPlayers(env).catch(() => 0),
    redeemQueueSummary(env).catch(() => null),
    readRedeemDaemonStatus(env).catch(() => null),
    readRedeemAutomationStatus(env).catch(() => null),
  ]);

  const recentPlayers = (recentPlayersRaw || []).map(publicRedeemPlayer);
  const successIds = [...new Set((recentSuccessRaw || []).map((row) => String(row.player_id || "")).filter(Boolean))];
  let successProfiles = [];
  if (successIds.length) {
    successProfiles = await supabaseJson(
      env,
      `/redeem_players?id=in.(${successIds.map(encodeURIComponent).join(",")})&select=id,nickname,state,town_hall_level,avatar_url,profile_json`
    ).catch(() => []);
  }
  const playerMap = new Map((successProfiles || []).map((row) => {
    const player = publicRedeemPlayer(row);
    return [player.id, player];
  }));

  return json({
    ok: true,
    registeredPlayers,
    activeCodes,
    pendingJobs,
    successJobs,
    queue,
    daemon,
    automation,
    recentPlayers,
    recentSuccess: (recentSuccessRaw || []).map((row) => publicRedeemJob(row, playerMap)),
  });
}

async function redeemKingdomRegistry(request, env) {
  const ready = requireSupabase(env);
  if (!ready.ok) return ready.response;
  const url = new URL(request.url);
  const limit = Math.min(3000, Math.max(50, Number(url.searchParams.get("limit")) || 1500));
  const rows = await supabaseJson(
    env,
    `/redeem_players?enabled=eq.true&consent=eq.true&select=id,nickname,state,town_hall_level,avatar_url,created_at_ms,updated_at_ms,profile_json&order=state.asc.nullslast,created_at_ms.desc&limit=${limit}`
  ).catch(() => []);
  const playerIds = (rows || []).map((row) => String(row.id || "")).filter(Boolean);
  const playerIdSet = new Set(playerIds);
  const recentJobByPlayer = new Map();
  if (playerIds.length) {
    const recentJobs = await supabaseJson(
      env,
      "/redeem_jobs?select=player_id,gift_code,status,attempts,last_error,redeemed_at_ms,updated_at_ms&order=updated_at_ms.desc&limit=8000"
    ).catch(() => []);
    for (const job of recentJobs || []) {
      const playerId = String(job.player_id || "");
      if (!playerIdSet.has(playerId) || recentJobByPlayer.has(playerId)) continue;
      recentJobByPlayer.set(playerId, publicRedeemJobStatus(job));
    }
  }
  const groups = new Map();
  for (const row of rows || []) {
    const player = {
      ...publicRedeemPlayer(row),
      recent_redeem: recentJobByPlayer.get(String(row.id || "")) || null,
    };
    const key = player.state === null || player.state === undefined ? "unknown" : String(player.state);
    if (!groups.has(key)) {
      groups.set(key, {
        state: player.state,
        label: key === "unknown" ? "Unknown" : `K${key}`,
        count: 0,
        players: [],
        latestUpdatedAtMs: 0,
      });
    }
    const group = groups.get(key);
    group.count += 1;
    group.players.push(player);
    group.latestUpdatedAtMs = Math.max(group.latestUpdatedAtMs, numberValue(player.updated_at_ms || player.created_at_ms));
  }
  const kingdoms = [...groups.values()].sort((a, b) => {
    if (a.state === null || a.state === undefined) return 1;
    if (b.state === null || b.state === undefined) return -1;
    return Number(a.state) - Number(b.state);
  });
  return json({
    ok: true,
    limit,
    total: (rows || []).length,
    kingdomCount: kingdoms.length,
    kingdoms,
  });
}

async function runRedeemJobs(env, reason = "manual") {
  const cfg = autoRedeemConfig(env);
  const result = { ok: true, reason, enabled: cfg.enabled, processed: 0, success: 0, failed: 0, retrying: 0, pending: 0, recovered: 0, staleFailed: 0, results: [] };
  if (!cfg.enabled) return { ...result, ok: false, skipped: "AUTO_REDEEM_ENABLED is off." };
  if (!supabaseConfig(env).enabled) return { ...result, ok: false, skipped: "Supabase is not configured." };
  const batchLimit = reason === "cloudflare-cron" ? Math.min(cfg.batchSize, cfg.cloudflareBatchSize) : cfg.batchSize;
  const recovered = await recoverStaleRedeemJobs(env, cfg).catch(() => ({ recovered: 0, failed: 0 }));
  result.recovered = recovered.recovered || 0;
  result.staleFailed = recovered.failed || 0;
  const jobs = await supabaseJson(env, `/redeem_jobs?status=eq.pending&select=job_key,player_id,gift_code,attempts&order=created_at_ms.asc&limit=${batchLimit}`).catch(() => []);
  result.pending = (jobs || []).length;
  for (const job of jobs || []) {
    await delay(cfg.delayMs);
    const now = Date.now();
    const attemptNumber = numberValue(job.attempts) + 1;
    await supabaseJson(env, `/redeem_jobs?job_key=eq.${encodeURIComponent(job.job_key)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "running", attempts: attemptNumber, updated_at_ms: now }),
    }).catch(() => {});
    try {
      const redeem = await redeemOfficialGiftCode(job.player_id, job.gift_code, { verifyPlayer: cfg.verifyPlayerBeforeRedeem });
      const doneAt = Date.now();
      const retrying = !redeem.ok && isRetryableRedeemStatus(redeem.status) && attemptNumber < cfg.maxAttempts;
      const finalStatus = retrying ? "pending" : redeem.ok ? "success" : redeem.status;
      await updateRedeemCodeFromAttempt(env, job.gift_code, { status: redeem.status, ok: redeem.ok }, doneAt).catch(() => {});
      await supabaseJson(env, `/redeem_jobs?job_key=eq.${encodeURIComponent(job.job_key)}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: finalStatus,
          attempts: attemptNumber,
          last_error: redeem.ok ? "" : redeem.message,
          response_json: redeem.response || redeem,
          redeemed_at_ms: redeem.ok ? doneAt : null,
          updated_at_ms: doneAt,
        }),
      }).catch(() => {});
      if (redeem.player) await saveOfficialProfile(env, redeem.player);
      result.processed += 1;
      if (redeem.ok) result.success += 1;
      else if (retrying) result.retrying += 1;
      else result.failed += 1;
      result.results.push({ playerId: job.player_id, code: job.gift_code, status: finalStatus, message: redeem.message });
    } catch (error) {
      const doneAt = Date.now();
      const retrying = attemptNumber < cfg.maxAttempts;
      await supabaseJson(env, `/redeem_jobs?job_key=eq.${encodeURIComponent(job.job_key)}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: retrying ? "pending" : "failed",
          attempts: attemptNumber,
          last_error: cleanText(error.message, 240),
          updated_at_ms: doneAt,
        }),
      }).catch(() => {});
      result.processed += 1;
      if (retrying) result.retrying += 1;
      else result.failed += 1;
      result.results.push({ playerId: job.player_id, code: job.gift_code, status: retrying ? "pending" : "failed", message: cleanText(error.message, 160) });
    }
  }
  return result;
}

async function claimRedeemJobs(request, env) {
  const ready = requireSupabase(env);
  if (!ready.ok) return ready.response;
  const admin = requireAdmin(request, env);
  if (!admin.ok) return admin.response;

  const cfg = autoRedeemConfig(env);
  if (!cfg.enabled) return json({ ok: false, skipped: "AUTO_REDEEM_ENABLED is off.", jobs: [] });

  const url = new URL(request.url);
  const body = await request.json().catch(() => ({}));
  const requestedLimit = Number(body.limit || url.searchParams.get("limit"));
  const limit = Math.min(cfg.batchSize, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : cfg.batchSize));
  const recovered = await recoverStaleRedeemJobs(env, cfg).catch(() => ({ recovered: 0, failed: 0, deferredRecovered: 0 }));

  const runnerName = cleanText(request.headers.get("x-auto-redeem-runner") || "putty-daemon", 80);
  const reviewOnly = Boolean(body.reviewOnly || body.review_only || url.searchParams.get("review") === "browser" || /browser.?review/i.test(runnerName));
  const claimStatus = reviewOnly ? "browser_review" : "pending";
  const rpcClaimed = reviewOnly ? null : await supabaseJson(env, "/rpc/claim_redeem_jobs", {
    method: "POST",
    body: JSON.stringify({
      p_limit: limit,
      p_runner: runnerName,
    }),
  }).catch(() => null);
  if (Array.isArray(rpcClaimed)) {
    const claimed = rpcClaimed.map((job) => ({
      jobKey: String(job.job_key || ""),
      playerId: String(job.player_id || ""),
      giftCode: String(job.gift_code || ""),
      attempts: numberValue(job.attempts),
    })).filter((job) => job.jobKey && job.playerId && job.giftCode);
    return json({ ok: true, claimed: claimed.length, jobs: claimed, recovered, claimMode: "rpc" });
  }

  const fallbackLimit = Math.min(limit, 40);
  const jobs = await supabaseJson(env, `/redeem_jobs?status=eq.${claimStatus}&select=job_key,player_id,gift_code,attempts&order=updated_at_ms.asc&limit=${fallbackLimit}`).catch(() => []);
  const claimed = [];
  for (const job of jobs || []) {
    const attemptNumber = numberValue(job.attempts) + 1;
    const claimedAt = Date.now();
    const updated = await supabaseJson(env, `/redeem_jobs?job_key=eq.${encodeURIComponent(job.job_key)}&status=eq.${claimStatus}`, {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        status: "running",
        attempts: attemptNumber,
        updated_at_ms: claimedAt,
        last_error: `Claimed by ${runnerName}.`,
      }),
    }).catch(() => []);
    if (updated && updated.length) {
      claimed.push({
        jobKey: job.job_key,
        playerId: String(job.player_id || ""),
        giftCode: String(job.gift_code || ""),
        attempts: attemptNumber,
      });
    }
  }

  return json({ ok: true, claimed: claimed.length, jobs: claimed, recovered, claimMode: reviewOnly ? "browser-review" : "legacy" });
}

function classifyDaemonRedeemResult(row) {
  const statusHint = cleanText(row && (row.status || row.resultStatus), 80).toLowerCase();
  const message = meaningfulText(row && (row.message || row.error || row.last_error), 240);
  const lower = message.toLowerCase();
  const ok = Boolean(row && (row.ok || row.success));

  if (statusHint === "rate_limited" || /too\s+many|too\s+frequent|frequently|rate\s*limit/i.test(message)) {
    return { status: "rate_limited", ok: false, message: message || "rate limited" };
  }
  if (statusHint === "server_busy" || /recharge[_\s-]*money|server\s+busy|try\s+again\s+later/i.test(message)) {
    return { status: "server_busy", ok: false, message: message || "server busy" };
  }
  if (statusHint === "claim_limit_reached" || /claim\s+limit\s+reached|unable\s+to\s+claim/i.test(message)) {
    return { status: "claim_limit_reached", ok: false, message: message || "claim limit reached" };
  }
  if (statusHint === "already_claimed" || /same\s+type\s+exchange|same\s+gift\s+code|only\s+be\s+redeemed\s+once|already|claimed|used|received/i.test(message)) {
    return { status: "already_claimed", ok: false, message: message || "already claimed" };
  }
  if (statusHint === "invalid_code" || /gift\s*code\s*not\s*found|case-sensitive|invalid\s+gift|invalid\s+code|cdk\s*error/i.test(message)) {
    return { status: "invalid_code", ok: false, message: message || "invalid code" };
  }
  if (statusHint === "expired" || /expired|ended|no\s+longer\s+valid/i.test(message)) {
    return { status: "expired", ok: false, message: message || "expired" };
  }
  if (statusHint === "time_window_closed" || /time\s*error|redemption\s*time|exchange\s*time|time\s*limit|not\s+open|not\s+started|not\s+available/i.test(message)) {
    return { status: "time_window_closed", ok: false, message: message || "time window closed" };
  }
  if (statusHint === "captcha_required" || /captcha|verification|verify/i.test(message)) {
    return { status: "captcha_required", ok: false, message: message || "captcha required" };
  }
  if (statusHint === "player_not_found" || /player\s+not\s+found|invalid\s+player|double\s+check\s+player|problem\s+with\s+logging\s+in/i.test(message)) {
    return { status: "player_not_found", ok: false, message: message || "player not found" };
  }
  if (ok || statusHint === "success" || /redeemed,?\s*please\s*claim|claim\s+the\s+rewards\s+in\s+your\s+mail/i.test(message)) {
    return { status: "success", ok: true, message: message || "success" };
  }
  if (statusHint === "timeout" || statusHint === "network_error" || /timeout|timed\s*out|network|no\s+confirmation\s+modal/i.test(lower)) {
    return { status: statusHint === "network_error" ? "network_error" : "timeout", ok: false, message: message || "timeout" };
  }
  return { status: statusHint || "failed", ok: false, message: message || "redeem failed" };
}

async function saveDaemonObservedPlayer(env, row) {
  const id = meaningfulText(row && (row.playerId || row.player_id), 40);
  const response = isPlainObject(row && row.response) ? row.response : {};
  const nick = meaningfulText(
    (row && (row.playerNick || row.player_nick)) || response.player_nick || response.playerNick,
    160,
  );
  if (!/^\d{3,12}$/.test(id) || !nick) return false;

  const profile = normalizePlayerSummary({
    id,
    fid: id,
    username: nick,
    nickname: nick,
    source: "official-redeem-browser",
    last_refreshed_at: new Date().toISOString(),
  });
  if (!profile) return false;

  await saveOfficialProfile(env, profile).catch(() => {});
  if (supabaseConfig(env).enabled) {
    await supabaseJson(env, `/redeem_players?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        nickname: nick,
        updated_at_ms: Date.now(),
      }),
    }).catch(() => {});
  }
  return true;
}

async function reportRedeemJobs(request, env) {
  const ready = requireSupabase(env);
  if (!ready.ok) return ready.response;
  const admin = requireAdmin(request, env);
  if (!admin.ok) return admin.response;

  const cfg = autoRedeemConfig(env);
  const body = await request.json().catch(() => ({}));
  const rows = Array.isArray(body.results) ? body.results.slice(0, 100) : [];
  const summary = { ok: true, processed: 0, saved: 0, saveFailed: 0, success: 0, failed: 0, retrying: 0, deferred: 0, reviewing: 0, results: [] };
  const now = Date.now();
  const jobPayloads = [];
  const codePayloadByCode = new Map();

  for (const row of rows) {
    const playerId = cleanText(row.playerId || row.player_id, 40);
    const giftCode = normalizeGiftCode(row.giftCode || row.gift_code);
    const fallbackJobKey = giftCode && playerId ? `${giftCode}:${playerId}` : "";
    const jobKey = meaningfulText(row.jobKey || row.job_key || fallbackJobKey, 180);
    if (!jobKey) continue;
    const classified = classifyDaemonRedeemResult(row);
    const attemptNumber = numberValue(row.attempts);
    const incomingResponse = isPlainObject(row.response) ? row.response : {};
    const sourceText = cleanText(`${incomingResponse.source || ""} ${row.source || ""} ${request.headers.get("x-auto-redeem-runner") || ""}`, 180).toLowerCase();
    const isBrowserReview = /browser.?review/.test(sourceText);
    const shouldBrowserReview = cfg.browserReviewEnabled
      && !isBrowserReview
      && !classified.ok
      && isBrowserReviewCandidateStatus(classified.status)
      && attemptNumber > cfg.deferServerBusyAttempts;
    const shouldDefer = !classified.ok
      && !shouldBrowserReview
      && !isBrowserReview
      && isDeferredCandidateStatus(classified.status)
      && attemptNumber >= cfg.deferServerBusyAttempts;
    const browserConfirmedBlocked = isBrowserReview && !classified.ok && isBrowserReviewCandidateStatus(classified.status);
    const alwaysPending = !classified.ok && isAlwaysPendingRedeemStatus(classified.status);
    const retrying = !classified.ok && (
      (!shouldBrowserReview && !shouldDefer && !browserConfirmedBlocked && alwaysPending) ||
      (isRetryableRedeemStatus(classified.status) && attemptNumber > 0 && attemptNumber < cfg.maxAttempts)
    );
    const finalStatus = browserConfirmedBlocked ? "official_blocked" : shouldBrowserReview ? "browser_review" : shouldDefer ? "deferred" : retrying ? "pending" : classified.ok ? "success" : classified.status;
    const responseJson = isPlainObject(row.response) ? row.response : {
      source: "putty-browser-daemon",
      status: classified.status,
      message: classified.message,
      player_nick: cleanText(row.playerNick || row.player_nick, 120),
    };

    jobPayloads.push({
      job_key: fallbackJobKey || jobKey,
      player_id: playerId,
      gift_code: giftCode,
      attempts: attemptNumber,
      status: finalStatus,
      last_error: browserConfirmedBlocked
        ? `${classified.message || "official redeem blocked"}; confirmed by browser review.`
        : shouldBrowserReview
          ? `${classified.message || "server busy"}; queued for browser review after ${attemptNumber} attempts.`
          : shouldDefer
        ? `${classified.message || "server busy"}; deferred after ${attemptNumber} attempts.`
        : classified.ok ? "" : classified.message,
      response_json: responseJson,
      created_at_ms: now,
      redeemed_at_ms: classified.ok ? now : null,
      updated_at_ms: now,
    });

    if (giftCode) {
      const existing = codePayloadByCode.get(giftCode) || {};
      const expired = classified.status === "expired" || existing.expired === true;
      codePayloadByCode.set(giftCode, {
        code: giftCode,
        source: "official-redeem-browser",
        expired,
        last_redeem_status: expired ? "expired" : classified.status,
        last_redeemed_at_ms: now,
        updated_at_ms: now,
      });
    }

    summary.processed += 1;
    if (classified.ok) summary.success += 1;
    else if (shouldBrowserReview) summary.reviewing += 1;
    else if (browserConfirmedBlocked) summary.failed += 1;
    else if (shouldDefer) summary.deferred += 1;
    else if (retrying) summary.retrying += 1;
    else summary.failed += 1;
    summary.results.push({
      jobKey: fallbackJobKey || jobKey,
      playerId,
      code: giftCode,
      status: finalStatus,
      message: classified.message,
    });
  }

  if (jobPayloads.length) {
    let reportError = "";
    await supabaseJson(env, "/redeem_jobs?on_conflict=job_key", {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(jobPayloads),
    }).then(() => {
      summary.saved = jobPayloads.length;
    }).catch((error) => {
      reportError = cleanText(error.message, 180);
      summary.saveFailed = jobPayloads.length;
      summary.saved = 0;
      summary.success = 0;
      summary.retrying = 0;
      summary.deferred = 0;
      summary.reviewing = 0;
      summary.failed = jobPayloads.length;
      summary.results = summary.results.map((item) => ({
        ...item,
        status: "report_failed",
        message: reportError || "Redeem results were received, but bulk job save failed.",
      }));
    });
  }

  const codePayloads = [...codePayloadByCode.values()];
  const expiredCodePayloads = codePayloads
    .filter((item) => item.expired)
    .map((item) => ({
      code: item.code,
      source: item.source,
      status: "expired",
      is_active: false,
      last_redeem_status: "expired",
      last_redeemed_at_ms: item.last_redeemed_at_ms,
      updated_at_ms: item.updated_at_ms,
    }));
  if (expiredCodePayloads.length && !summary.saveFailed) {
    await supabaseJson(env, "/redeem_codes?on_conflict=code", {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(expiredCodePayloads),
    }).catch(() => {});
  }
  if (codePayloads.length && !summary.saveFailed) {
    for (const item of codePayloads.filter((entry) => !entry.expired)) {
      await supabaseJson(env, `/redeem_codes?code=eq.${encodeURIComponent(item.code)}`, {
        method: "PATCH",
        body: JSON.stringify({
          last_redeem_status: item.last_redeem_status,
          last_redeemed_at_ms: item.last_redeemed_at_ms,
          updated_at_ms: item.updated_at_ms,
        }),
      }).catch(() => {});
    }
  }

  const startedAtMs = numberValue(body.startedAtMs) || Date.now();
  await saveRedeemDaemonStatus(env, request, {
    ok: summary.ok,
    discovery: { ok: true, active: [], discovered: [], errors: [] },
    jobs: summary,
  }, null, startedAtMs).catch(() => {});

  return json(summary);
}

async function runAutoRedeemCycle(env, reason = "cron") {
  const cfg = autoRedeemConfig(env);
  const shouldDiscover = reason !== "putty-daemon" || cfg.daemonDiscover;
  const discovery = shouldDiscover
    ? await discoverRedeemCodes(env).catch((error) => ({ ok: false, discovered: [], errors: [cleanText(error.message, 120)] }))
    : { ok: true, skipped: "Discovery is handled by Cloudflare schedule/manual refresh.", discovered: [], active: [], expired: [], errors: [] };
  const jobs = cfg.workerRedeemEnabled
    ? await runRedeemJobs(env, reason).catch((error) => ({ ok: false, error: cleanText(error.message, 120) }))
    : { ok: true, reason, skipped: "Redeem execution is handled by the PuTTY browser daemon.", processed: 0, success: 0, failed: 0, retrying: 0 };
  return { ok: Boolean(discovery.ok !== false && jobs.ok !== false), discovery, jobs };
}

async function runTrackedAutoRedeemCycle(env, source = "cloudflare-cron") {
  const startedAtMs = Date.now();
  try {
    const result = await runAutoRedeemCycle(env, source);
    await saveRedeemRunnerStatus(env, source === "cloudflare-cron" ? "redeem_engine_cloudflare" : "redeem_engine_putty", redeemHeartbeatFromResult(source, result, null, startedAtMs)).catch(() => {});
    return result;
  } catch (error) {
    const result = { ok: false, error: cleanText(error.message, 180), discovery: { errors: [cleanText(error.message, 120)] }, jobs: {} };
    await saveRedeemRunnerStatus(env, source === "cloudflare-cron" ? "redeem_engine_cloudflare" : "redeem_engine_putty", redeemHeartbeatFromResult(source, result, error, startedAtMs)).catch(() => {});
    throw error;
  }
}

function classifyRedeemPayload(payload) {
  const errCode = numberValue(payload && payload.err_code);
  const message = meaningfulText(payload && (payload.msg || payload.message || payload.err_msg), 240);
  const lower = message.toLowerCase();
  if (/too\s+many|too\s+frequent|frequently|rate\s*limit/i.test(message)) {
    return { status: "rate_limited", ok: false, message: message || "rate limited" };
  }
  if (/recharge[_\s-]*money|server\s+busy|try\s+again\s+later/i.test(message)) {
    return { status: "server_busy", ok: false, message: message || "server busy" };
  }
  if (/claim\s+limit\s+reached|unable\s+to\s+claim/i.test(message)) {
    return { status: "claim_limit_reached", ok: false, message: message || "claim limit reached" };
  }
  if (errCode === 40102) return { status: "captcha_required", ok: false, message: message || "captcha required" };
  if (errCode === 40014) return { status: "invalid_code", ok: false, message: message || "code not found" };
  if (errCode === 40009) return { status: "not_logged_in", ok: false, message: message || "not logged in" };
  if (/time\s*error|redemption\s*time|exchange\s*time|time\s*limit|超出兑换时间|교환\s*시간이\s*초과|交換.*時間/i.test(message)) {
    return { status: "time_window_closed", ok: false, message: message || "time window closed" };
  }
  if (/same\s+type\s+exchange|already|claimed|used/i.test(message)) return { status: "already_claimed", ok: false, message };
  if (/expired/i.test(message)) return { status: "expired", ok: false, message };
  if ((payload && payload.code === 0) || errCode === 0 || /redeemed,?\s*please\s*claim|claim\s+the\s+rewards\s+in\s+your\s+mail/i.test(message)) {
    return { status: "success", ok: true, message: message || "success" };
  }
  return { status: "failed", ok: false, message: message || "redeem failed" };
}

function classifyRedeemPayloadV2(payload) {
  const errCode = numberValue(payload && payload.err_code);
  const message = meaningfulText(payload && (payload.msg || payload.message || payload.err_msg), 240);
  const lower = message.toLowerCase();
  if (/too\s+many|too\s+frequent|frequently|rate\s*limit/i.test(message)) {
    return { status: "rate_limited", ok: false, message: message || "rate limited" };
  }
  if (/recharge[_\s-]*money|server\s+busy|try\s+again\s+later/i.test(message)) {
    return { status: "server_busy", ok: false, message: message || "server busy" };
  }
  if (/claim\s+limit\s+reached|unable\s+to\s+claim/i.test(message)) {
    return { status: "claim_limit_reached", ok: false, message: message || "claim limit reached" };
  }
  if (errCode === 40102 || /captcha|verification|verify|40102|验证码|驗證碼|인증/i.test(message)) {
    return { status: "captcha_required", ok: false, message: message || "captcha required" };
  }
  if (errCode === 40014 || /gift\s*code\s*not\s*found|code\s*not\s*found|case-sensitive|invalid\s+gift|invalid\s+code|cdk\s*error/i.test(message)) {
    return { status: "invalid_code", ok: false, message: message || "invalid code" };
  }
  if (errCode === 40009) return { status: "not_logged_in", ok: false, message: message || "not logged in" };
  if (/time\s*error|redemption\s*time|exchange\s*time|time\s*limit|not\s+open|not\s+started|not\s+available|兑换时间|兌換時間|교환\s*시간|交換.*時間/i.test(message)) {
    return { status: "time_window_closed", ok: false, message: message || "time window closed" };
  }
  if (/same\s+type\s+exchange|same\s+gift\s+code|only\s+be\s+redeemed\s+once|already|claimed|used|received/i.test(message)) {
    return { status: "already_claimed", ok: false, message: message || "already claimed" };
  }
  if (/expired|ended|no\s+longer\s+valid/i.test(message)) return { status: "expired", ok: false, message: message || "expired" };
  if (/player\s+not\s+found|invalid\s+player|double\s+check\s+player|problem\s+with\s+logging\s+in/i.test(message)) {
    return { status: "player_not_found", ok: false, message: message || "player not found" };
  }
  if ((payload && payload.code === 0) || errCode === 0 || /redeemed,?\s*please\s*claim|claim\s+the\s+rewards\s+in\s+your\s+mail/i.test(message)) {
    return { status: "success", ok: true, message: message || "success" };
  }
  return { status: "failed", ok: false, message: message || "redeem failed" };
}

async function redeemOfficialGiftCode(playerId, giftCode, options = {}) {
  const fid = meaningfulText(playerId, 40);
  const cdk = normalizeGiftCode(giftCode);
  if (!/^\d{3,12}$/.test(fid) || !/^[A-Za-z0-9_-]{3,64}$/.test(cdk)) {
    return { ok: false, status: "invalid_input", message: "Invalid player ID or gift code." };
  }

  const verifyPlayer = options.verifyPlayer !== false;
  const profile = verifyPlayer ? await fetchOfficialGiftProfile(fid) : null;
  if (verifyPlayer && !profile) return { ok: false, status: "player_not_found", message: "Player ID could not be verified." };

  const data = { fid, cdk, captcha_code: "", time: Date.now() };
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
    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      const classified = classifyRedeemPayloadV2(payload);
      const status = classified.status !== "failed"
        ? classified.status
        : response.status === 429 ? "rate_limited" : retryable ? "server_error" : "failed";
      return {
        ok: false,
        status,
        message: classified.message || meaningfulText(payload && (payload.msg || payload.message), 160) || `HTTP ${response.status}`,
        player: profile,
        response: payload,
      };
    }
    const result = classifyRedeemPayloadV2(payload);
    return { ...result, player: profile, response: payload };
  } catch (error) {
    const status = error && error.name === "AbortError" ? "timeout" : "network_error";
    return {
      ok: false,
      status,
      message: status === "timeout" ? "Official gift API timed out." : cleanText(error.message, 160) || "Network error.",
      player: profile,
      response: { error: cleanText(error.message, 240), name: cleanText(error.name, 80) },
    };
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

function importCacheRequest(apiPath, cacheKey = "") {
  const cleanPath = String(apiPath || "").replace(/^\/+/, "").replace(/^api\/+/, "").replace(/^kingshot\/+/, "");
  const path = cleanPath || "import/manual";
  const url = new URL(`https://collector.local/kingshot/${path}`);
  if (cacheKey) url.searchParams.set("cache_key", String(cacheKey).slice(0, 160));
  return new Request(url.toString(), { method: "GET" });
}

function normalizeIntelImportEntries(body) {
  const entries = [];
  const pushEntry = (entry, fallbackPath = "") => {
    if (!isPlainObject(entry)) return;
    const payload = entry.payload ?? entry.response ?? entry.data ?? entry.result ?? entry.body;
    if (payload == null || isIntelErrorPayload(payload)) return;
    const apiPath = cleanText(entry.apiPath || entry.path || entry.url || fallbackPath, 240) || "import/manual";
    entries.push({ apiPath, payload });
  };

  if (Array.isArray(body && body.entries)) body.entries.forEach((entry) => pushEntry(entry));
  if (Array.isArray(body && body.cache)) body.cache.forEach((entry) => pushEntry(entry));
  if ((body && (body.payload !== undefined || body.response !== undefined || body.data !== undefined)) && (body.apiPath || body.path || body.url)) {
    pushEntry(body);
  }
  if (body && body.kingdom && body.payload) pushEntry({ apiPath: `kingdoms/${body.kingdom}`, payload: body.payload });
  if (body && body.playerId && body.payload) pushEntry({ apiPath: `players/${body.playerId}`, payload: body.payload });
  return entries.slice(0, 50);
}

async function importIntelData(request, env) {
  const admin = requireAdmin(request, env);
  if (!admin.ok) return admin.response;
  if (!supabaseConfig(env).enabled && !hasIntelDb(env)) {
    return json({ ok: false, error: "No Intel storage is configured." }, 400);
  }

  const body = await request.json().catch(() => null);
  if (!isPlainObject(body)) return json({ ok: false, error: "JSON body is required." }, 400);

  const result = {
    ok: true,
    source: cleanText(body.source, 80) || "authorized-import",
    playersImported: 0,
    cacheImported: 0,
    skipped: 0,
    errors: [],
  };

  const playerRows = [];
  if (Array.isArray(body.players)) playerRows.push(...body.players);
  if (isPlainObject(body.player)) playerRows.push(body.player);
  if (isPlainObject(body.profile)) playerRows.push(body.profile);

  const normalizedPlayers = playerRows
    .map((player) => normalizePlayerSummary({ ...player, source: result.source }))
    .filter(Boolean)
    .slice(0, 200);
  if (normalizedPlayers.length) {
    await Promise.all([
      savePlayerSummariesD1(env, normalizedPlayers).catch((error) => result.errors.push(`d1 players: ${cleanText(error.message, 140)}`)),
      savePlayerSummariesSupabase(env, normalizedPlayers).catch((error) => result.errors.push(`supabase players: ${cleanText(error.message, 140)}`)),
    ]);
    result.playersImported += normalizedPlayers.length;
  }

  const entries = normalizeIntelImportEntries(body);
  for (const entry of entries) {
    try {
      await saveIntelCache(env, importCacheRequest(entry.apiPath), entry.payload);
      const players = collectPlayersFromPayload(entry.payload);
      result.playersImported += players.length;
      result.cacheImported += 1;
    } catch (error) {
      result.skipped += 1;
      result.errors.push(`${cleanText(entry.apiPath, 80)}: ${cleanText(error.message, 140)}`);
    }
  }

  if (!result.playersImported && !result.cacheImported) {
    return json({ ...result, ok: false, error: "No valid players or cache payloads were found." }, 400);
  }
  return json(result);
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
  const registeredCfg = registeredIntelConfig(env);
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
      upstreamEnabled: cfg.upstreamEnabled,
      minKingdom: cfg.minKingdom,
      maxKingdom: cfg.maxKingdom,
      kingdomBatch: cfg.kingdomBatch,
      detailLimit: cfg.detailLimit,
      staleHours: Math.round(cfg.staleMs / 60 / 60 / 1000),
      registeredEnabled: registeredCfg.enabled,
      registeredLimit: registeredCfg.limit,
      registeredStaleHours: Math.round(registeredCfg.staleMs / 60 / 60 / 1000),
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
    upstreamEnabled: envBool(env.INTEL_COLLECT_UPSTREAM_ENABLED, false),
    minKingdom,
    maxKingdom,
    kingdomBatch: envNumber(env.INTEL_COLLECT_KINGDOM_BATCH, COLLECTOR_DEFAULT_KINGDOM_BATCH, 1, 3),
    detailLimit: envNumber(env.INTEL_COLLECT_PLAYER_DETAILS, COLLECTOR_DEFAULT_DETAIL_LIMIT, 0, 25),
    staleMs: envNumber(env.INTEL_COLLECT_STALE_HOURS, COLLECTOR_DEFAULT_STALE_HOURS, 1, 720) * 60 * 60 * 1000,
    delayMs: envNumber(env.INTEL_COLLECT_DELAY_MS, COLLECTOR_DEFAULT_DELAY_MS, 100, 5000),
  };
}

function registeredIntelConfig(env) {
  return {
    enabled: envBool(env.INTEL_REGISTERED_COLLECT_ENABLED, true),
    limit: envNumber(env.INTEL_REGISTERED_COLLECT_LIMIT, REGISTERED_INTEL_DEFAULT_LIMIT, 1, 50),
    staleMs: envNumber(env.INTEL_REGISTERED_STALE_HOURS, REGISTERED_INTEL_DEFAULT_STALE_HOURS, 1, 720) * 60 * 60 * 1000,
    delayMs: envNumber(env.INTEL_REGISTERED_COLLECT_DELAY_MS, COLLECTOR_DEFAULT_DELAY_MS, 100, 5000),
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

async function runRegisteredIntelCollector(env, reason = "registered-cron") {
  const cfg = registeredIntelConfig(env);
  const result = {
    ok: true,
    reason,
    enabled: cfg.enabled,
    checked: 0,
    saved: 0,
    skippedRecent: 0,
    errors: [],
  };
  if (!cfg.enabled) return { ...result, ok: false, skipped: "INTEL_REGISTERED_COLLECT_ENABLED is off." };
  if (!supabaseConfig(env).enabled && !hasIntelDb(env)) return { ...result, ok: false, skipped: "No Intel storage is configured." };
  if (!supabaseConfig(env).enabled) return { ...result, ok: false, skipped: "Supabase is required to read registered IDs." };

  const scanLimit = Math.min(200, Math.max(cfg.limit * 6, cfg.limit));
  const rows = await supabaseJson(
    env,
    `/redeem_players?enabled=eq.true&consent=eq.true&select=id,updated_at_ms&order=updated_at_ms.asc&limit=${scanLimit}`,
  ).catch((error) => {
    result.errors.push(`redeem_players: ${cleanText(error.message, 140)}`);
    return [];
  });
  const ids = [...new Set((rows || []).map((row) => String(row.id || "")).filter(Boolean))];
  if (!ids.length) return result;

  const recent = await recentlyStoredPlayerIds(env, ids, cfg.staleMs).catch(() => new Set());
  const targets = ids.filter((id) => !recent.has(id)).slice(0, cfg.limit);
  result.skippedRecent = Math.max(0, ids.length - targets.length);

  for (const id of targets) {
    await delay(cfg.delayMs);
    result.checked += 1;
    try {
      const profile = await fetchOfficialGiftProfile(id);
      if (!profile) {
        result.errors.push(`${id}: official profile unavailable`);
        continue;
      }
      await saveOfficialProfile(env, profile);
      await refreshRedeemPlayerProfile(env, profile).catch(() => {});
      result.saved += 1;
    } catch (error) {
      result.errors.push(`${id}: ${cleanText(error.message, 140)}`);
    }
  }
  return result;
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
  if (!cfg.upstreamEnabled) return { ...result, ok: true, skipped: "Protected upstream collector is disabled. Registered/import collectors are active." };
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

async function runSafeIntelCycle(env, reason = "manual") {
  const registered = await runRegisteredIntelCollector(env, reason).catch((error) => ({
    ok: false,
    reason,
    error: cleanText(error.message, 180),
    errors: [cleanText(error.message, 140)],
  }));
  const upstream = await runIntelCollector(env, reason).catch((error) => ({
    ok: false,
    reason,
    error: cleanText(error.message, 180),
    errors: [cleanText(error.message, 140)],
  }));
  return {
    ok: Boolean(registered.ok !== false && upstream.ok !== false),
    reason,
    registered,
    upstream,
  };
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
      return json(await runSafeIntelCycle(env, "manual"));
    }
    if (url.pathname === "/api/intel/import" && request.method === "POST") return importIntelData(request, env);
    if (url.pathname === "/api/intel/cleanup" && request.method === "POST") return cleanupIntel(request, env);
    if (url.pathname === "/api/redeem/register" && request.method === "POST") return registerRedeemPlayer(request, env);
    if (url.pathname === "/api/redeem/register-bulk" && request.method === "POST") return registerRedeemPlayersBulk(request, env);
    if (url.pathname === "/api/redeem/unregister" && request.method === "POST") return unregisterRedeemPlayer(request, env);
    if (url.pathname === "/api/redeem/status" && request.method === "GET") return redeemStatus(env);
    if (url.pathname === "/api/redeem/activity" && request.method === "GET") return redeemActivity(request, env);
    if (url.pathname === "/api/redeem/kingdoms" && request.method === "GET") return redeemKingdomRegistry(request, env);
    if (url.pathname === "/api/redeem/codes" && request.method === "GET") return listRedeemCodes(request, env);
    if (url.pathname === "/api/redeem/code" && request.method === "POST") return addRedeemCode(request, env);
    if (url.pathname === "/api/redeem/claim" && request.method === "POST") return claimRedeemJobs(request, env);
    if (url.pathname === "/api/redeem/report" && request.method === "POST") return reportRedeemJobs(request, env);
    if (url.pathname === "/api/redeem/daemon-test" && request.method === "POST") {
      const ready = requireSupabase(env);
      if (!ready.ok) return ready.response;
      const admin = requireAdmin(request, env);
      if (!admin.ok) return admin.response;
      const startedAtMs = Date.now();
      const write = await saveRedeemDaemonStatus(env, request, {
        ok: true,
        discovery: { active: [], discovered: [], errors: [] },
        jobs: { processed: 0, success: 0, failed: 0, retrying: 0 },
      }, null, startedAtMs, true);
      const daemon = await readRedeemDaemonStatus(env).catch(() => null);
      const automation = await readRedeemAutomationStatus(env).catch(() => null);
      return json({ ok: Boolean(write && (write.metaOk || write.cacheOk || write.runnerOk)), write, daemon, automation });
    }
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
      const startedAtMs = Date.now();
      try {
        const result = await runAutoRedeemCycle(env, isDaemonRequest(request) ? "putty-daemon" : "manual");
        await saveRedeemDaemonStatus(env, request, result, null, startedAtMs);
        return json(result);
      } catch (error) {
        const result = { ok: false, error: cleanText(error.message, 180) };
        await saveRedeemDaemonStatus(env, request, result, error, startedAtMs);
        return json(result, 500);
      }
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
    ctx.waitUntil(runSafeIntelCycle(env, "cron").catch(() => null));
    ctx.waitUntil(runTrackedAutoRedeemCycle(env, "cloudflare-cron").catch(() => null));
  },
};
