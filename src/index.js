const ALLOWED_ASSETS = new Set([
  "/troop_training_ui.html",
  "/kingshot_calculator_data.json",
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      url.pathname = "/troop_training_ui.html";
      return env.ASSETS.fetch(new Request(url, request));
    }

    if (ALLOWED_ASSETS.has(url.pathname)) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};
