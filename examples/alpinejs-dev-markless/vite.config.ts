import { markless } from "@markless/core/vite";
import { router } from "@markless/router/vite";
import { defineConfig } from "vite-plus";
import { PAGE_ROUTES } from "./generated/routes.ts";

// Every page is the same for every visitor: the CDN keeps each one after its first render until the next deploy.
export default defineConfig({
  nitro: {
    routeRules: {
      ...Object.fromEntries(PAGE_ROUTES.map((path) => [path, { isr: true }])),
      // alpinejs.dev serves its sitemap as text/xml.
      "/sitemap.xml": { headers: { "content-type": "text/xml; charset=utf-8" } },
    },
  },
  plugins: [markless(), router()],
});
