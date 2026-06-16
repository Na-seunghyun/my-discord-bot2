export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      const pageUrl = new URL("/troop_training_ui.html", url.origin);
      return env.ASSETS.fetch(new Request(pageUrl, request));
    }

    return env.ASSETS.fetch(request);
  },
};
