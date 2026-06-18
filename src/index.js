const API_BASE = "https://kingshot.jeab.dev";

const json = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === "/api/visit" && request.method === "POST") {
      return json(await incrementVisit(env));
    }

    if (url.pathname === "/api/stats" && request.method === "GET") {
      return json(await readStats(env));
    }

    // Kingshot API proxy
    if (url.pathname.startsWith("/kingshot/")) {
      const targetUrl = API_BASE + url.pathname + url.search;

      const apiRes = await fetch(targetUrl, {
        method: request.method,
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "application/json, text/plain, */*",
        },
      });

      const headers = new Headers(apiRes.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "*");

      return new Response(apiRes.body, {
        status: apiRes.status,
        statusText: apiRes.statusText,
        headers,
      });
    }

    if (url.pathname === "/") {
      url.pathname = "/troop_training_ui.html";
      return env.ASSETS.fetch(new Request(url, request));
    }

    return env.ASSETS.fetch(request);
  },
};
