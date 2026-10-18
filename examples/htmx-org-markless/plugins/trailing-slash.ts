import { definePlugin } from "nitro";

// htmx.org (Netlify) answers a page path without its trailing slash with a 301 to the slash form; so does the port.
export default definePlugin((nitro) => {
  const fetch = nitro.fetch;
  nitro.fetch = async (request) => {
    const url = new URL(request.url);
    const last = url.pathname.split("/").pop() ?? "";
    if (
      (request.method === "GET" || request.method === "HEAD") &&
      last &&
      !last.includes(".") &&
      !url.pathname.startsWith("/build/") &&
      !url.pathname.startsWith("/_")
    ) {
      return new Response(null, {
        status: 301,
        headers: { location: `${url.pathname}/${url.search}` },
      });
    }
    return fetch(request);
  };
});
