/*
 * Cloudflare Worker entrypoint.
 * v1: just serves the static SPA from the [assets] binding.
 *
 * Seam for later: route /api/* here to a KV/D1-backed sync layer so progress
 * can follow you across devices (phone next to the TV + desktop). The
 * frontend already isolates all state behind store.js, so only this file
 * and store.js need to change.
 */
export default {
  async fetch(request, env) {
    // const url = new URL(request.url);
    // if (url.pathname.startsWith("/api/")) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  }
};
