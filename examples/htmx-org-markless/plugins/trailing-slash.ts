import { definePlugin } from "nitro";
import { INTERNAL_PATHS } from "../internal-paths.ts";
import { NETLIFY_ROUTES } from "../netlify-routes.ts";

// htmx.org is served by Netlify; the port answers as Netlify does (see netlify-routes.ts), and a page path without its
// trailing slash with a 301 to the slash form. A page whose path Markless Router reserves is served from its internal
// route. On Vercel the same routes run on the CDN (vite.config.ts); this covers the local server.
export default definePlugin((nitro) => {
  const fetch = nitro.fetch;
  nitro.fetch = async (request) => {
    const url = new URL(request.url);
    const read = request.method === "GET" || request.method === "HEAD";
    const route = read ? NETLIFY_ROUTES[url.pathname] : undefined;
    if (route && "location" in route) return new Response(null, { status: route.status, headers: { location: route.location } });
    if (route) return (route.dest.endsWith(".html") ? fetch : nitro.fetch)(new Request(new URL(`${route.dest}${url.search}`, url), request));
    const last = url.pathname.split("/").pop() ?? "";
    if (read && last && !last.includes(".") && !url.pathname.startsWith("/build/") && !url.pathname.startsWith("/_")) {
      return new Response(null, { status: 301, headers: { location: `${url.pathname}/${url.search}` } });
    }
    const internal = read ? INTERNAL_PATHS[url.pathname] : undefined;
    if (internal) return fetch(new Request(new URL(`${internal}${url.search}`, url), request));
    return fetch(request);
  };
});
