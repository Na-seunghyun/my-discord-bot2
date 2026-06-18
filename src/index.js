const UPSTREAM = "https://kingshot.jeab.dev";
const TOKEN_REFRESH_MARGIN_MS = 30000;

let cachedToken = "";
let cachedTokenExpires = 0;
let tokenPromise = null;

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
    env.VISITS.put(
      `visits:last:${Date.now()}`,
      JSON.stringify({ at: new Date().toISOString(), day: today }),
      { expirationTtl: 60 * 60 * 24 * 30 },
    ),
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
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "Content-Type",
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

async function proxyKingshot(request) {
  const origin = request.headers.get("origin") || "";

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (request.method !== "GET") {
    return jsonError("Only GET requests are allowed.", 405, origin);
  }

  const upstream = buildUpstreamUrl(request);

  async function forward(forceToken = false) {
    const token = await getToken(forceToken);
    return fetch(upstream.toString(), {
      headers: {
        accept: "application/json,text/plain,*/*",
        "user-agent": "Legend-Nash-Kingshot-Hub/1.0",
        "x-api-token": token,
      },
      cf: { cacheTtl: 0 },
    });
  }

  try {
    let response = await forward(false);
    if (response.status === 401) response = await forward(true);

    const headers = new Headers(corsHeaders(origin));
    headers.set("content-type", response.headers.get("content-type") || "application/json; charset=utf-8");
    headers.set("cache-control", "no-store");

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
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
      return proxyKingshot(request);
    }

    if (url.pathname === "/api/visit" && request.method === "POST") {
      return json(await incrementVisit(env));
    }

    if (url.pathname === "/api/stats" && request.method === "GET") {
      return json(await readStats(env));
    }

    if (!env.ASSETS) {
      return new Response("Static asset binding is not available.", {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname === "/") {
      return env.ASSETS.fetch(assetRequest(request, "/index.html"));
    }

    return env.ASSETS.fetch(request);
  },
};
