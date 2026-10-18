import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';
import aliases from './lib/route-aliases.json' with { type: 'json' };
import routes from './lib/routes.json' with { type: 'json' };

// Every page is the same for every visitor, so the CDN keeps each one after its first render until the next deploy.
// (Nitro's `prerender: true` renders every Markless page as a 404 at build time in 0.5.0.)
export default defineConfig({
	nitro: {
		routeRules: {
			...Object.fromEntries(routes.map((path) => [encodeURI(path), { isr: true }])),
			...Object.fromEntries(Object.entries(aliases).map(([path, file]) => [path, { proxy: { to: file } }])),
		},
	},
	plugins: [markless(), router()],
});
