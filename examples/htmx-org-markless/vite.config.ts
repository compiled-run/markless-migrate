import { markless } from "@markless/core/vite";
import { router } from "@markless/router/vite";
import { defineConfig } from "vite-plus";

// The four pages are the same for every visitor: the CDN keeps each one after its first render until the next deploy.
const pages = ["/", "/docs/", "/examples/", "/examples/click-to-edit/"];

export default defineConfig({
  nitro: { routeRules: Object.fromEntries(pages.map((path) => [path, { isr: true }])) },
  plugins: [markless(), router()],
});
