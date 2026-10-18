import { markless } from "@markless/core/vite";
import { router } from "@markless/router/vite";
import { defineConfig } from "vite-plus";

// The three pages are the same for every visitor: the CDN keeps each one after its first render until the next deploy.
const pages = ["/", "/start-here", "/directives/model"];

export default defineConfig({
  nitro: { routeRules: Object.fromEntries(pages.map((path) => [path, { isr: true }])) },
  plugins: [markless(), router()],
});
