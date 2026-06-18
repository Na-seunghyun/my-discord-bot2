const UPSTREAM = "https://kingshot.jeab.dev";
const TOKEN_REFRESH_MARGIN_MS = 30000;

let cachedToken = "";
let cachedTokenExpires = 0;
let tokenPromise = null;

// ===============================
// JSON helper
// ===============================
const json = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

// ===============================
// Visit counter
// ===============================
const todayKey = () => new Date().toISOString().slice(0, 10);

async function incrementVisit(env) {
  if (!env.VISITS) {
    return { enabled: false, total: 0, today: 0 };
  }

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
    env.VISITS.put(
      `visits:last:${Date.now()}`,
      JSON.stringify({
        at: new Date().toISOString(),
        day: today,
      }),
      { expirationTtl: 60 * 60 * 24 * 30 }
    ),
  ]);

  return { enabled: true, total, today: todayCount };
}

async function readStats(env) {
  if (!env.VISITS) {
    return { enabled: false, total: 0, today: 0 };
  }

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

// ===============================
// Kingshot proxy
// ===============================
async function getToken(force = false) {
  if (
    !force &&
    cachedToken &&
    cachedTokenExpires - TOKEN_REFRESH_MARGIN_MS > Date.now()
  ) {
    return cachedToken;
  }

  if (!force && tokenPromise) return tokenPromise;

  tokenPromise = fetch(`${UPSTREAM}/api/session`, {
    headers: { Accept: "application/json" },
    cf: { cacheTtl: 0 },
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`session ${response.status}`);

      const data = await response.json();

      cachedToken = data.token;
      cachedTokenExpires = Number(data.expires_at || 0) * 1000;

      return cachedToken;
    })
    .finally(() => {
      tokenPromise = null;
    });

  return tokenPromise;
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonError(message, status, origin) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function proxyKingshot(request) {
  const origin = request.headers.get("Origin") || "";

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  if (request.method !== "GET") {
    return jsonError("Only GET requests are allowed.", 405, origin);
  }

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

  async function forward(forceToken = false) {
    const token = await getToken(forceToken);

    return fetch(upstream.toString(), {
      headers: {
        Accept: "application/json,text/plain,*/*",
        "User-Agent": "Legend-Nash-Kingshot-Hub/1.0",
        "X-API-Token": token,
      },
      cf: { cacheTtl: 0 },
    });
  }

  try {
    let response = await forward(false);

    if (response.status === 401) {
      response = await forward(true);
    }

    const body = await response.arrayBuffer();

    const headers = new Headers(corsHeaders(origin));
    headers.set(
      "Content-Type",
      response.headers.get("Content-Type") ||
        "application/json; charset=utf-8"
    );
    headers.set("Cache-Control", "no-store");

    return new Response(body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    return jsonError(error.message || "Proxy request failed.", 502, origin);
  }
}

// ===============================
// Main Worker
// ===============================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Kingshot API proxy
    if (url.pathname === "/kingshot" || url.pathname.startsWith("/kingshot/")) {
      return proxyKingshot(request);
    }

    // Visit counter
    if (url.pathname === "/api/visit" && request.method === "POST") {
      return json(await incrementVisit(env));
    }

    if (url.pathname === "/api/stats" && request.method === "GET") {
      return json(await readStats(env));
    }

    // Home redirect
    if (url.pathname === "/") {
      url.pathname = "/troop_training_ui.html";
      return env.ASSETS.fetch(new Request(url, request));
    }

    // Static files
    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Static asset binding is not available.", {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  },
};
