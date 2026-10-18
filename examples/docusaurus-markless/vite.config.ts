import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';

// The three pages are the same for every visitor, so the CDN keeps each one after its first render until the next deploy.
// (Nitro's `prerender: true` renders every Markless page as a 404 at build time in 0.5.0.)
const pages = ['/', '/docs', '/docs/installation'];

export default defineConfig({
	nitro: { routeRules: Object.fromEntries(pages.map((path) => [path, { isr: true }])) },
	plugins: [markless(), router()],
});
