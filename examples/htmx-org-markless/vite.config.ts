import { fileURLToPath } from "node:url";
import { markless } from "@markless/core/vite";
import { router } from "@markless/router/vite";
import { defineConfig } from "vite-plus";
import { INTERNAL_PATHS } from "./internal-paths.ts";
import { NETLIFY_ROUTES } from "./netlify-routes.ts";
import { HEADS } from "./site-heads.ts";
import { migrateCache } from './migrate-cache.ts';

// Every page is the same for every visitor: the CDN keeps each one after its first render until the next deploy.
const pages = Object.keys(HEADS).filter((path) => path !== "/404/" && !Object.values(INTERNAL_PATHS).includes(path));
const exact = (path: string) => `^${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;

export default defineConfig({
  nitro: {
    // Static files, feeds, sitemap, robots.txt and alias pages htmx.org serves, written by scripts/import-htmx-org.ts;
    // fallthrough keeps Nitro's year-long immutable cache header off pages, which share this base path.
    publicAssets: [{ dir: fileURLToPath(new URL("./.import/public", import.meta.url)), baseURL: "/", fallthrough: true }],
    // Netlify sends htmx.org's files compressed; the Node server sends these copies, written at build time, the same way.
    compressPublicAssets: { gzip: true, brotli: true },
    routeRules: Object.fromEntries(pages.map((path) => [path, { isr: true }])),
    vercel: {
      config: {
        routes: Object.entries(NETLIFY_ROUTES).map(([path, route]) =>
          "location" in route
            ? { src: exact(path), caseSensitive: true, status: route.status, headers: { Location: route.location } }
            : { src: exact(path), caseSensitive: true, dest: route.dest, check: true },
        ),
      },
    },
  },
  plugins: [migrateCache(), markless(), router()],
});
