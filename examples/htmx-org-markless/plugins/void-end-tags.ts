// A plain plugin function: importing definePlugin from 'nitro' leaves the import unbundled in the Vercel build.
import type { NitroAppPlugin } from "nitro/types";

// Markless 0.4.0 server rendering writes `</br>`, which every HTML parser reads as a second `<br>`: an extra line break, and
// every element after it one place later than the resume locators expect. Drop it before the page leaves the server.
const plugin: NitroAppPlugin = (nitro) => {
  const fetch = nitro.fetch;
  nitro.fetch = async (request) => {
    const response = await fetch(request);
    if (!response.headers.get("content-type")?.includes("text/html")) return response;
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    const html = (await response.text()).replaceAll("</br>", "");
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
};

export default plugin;
