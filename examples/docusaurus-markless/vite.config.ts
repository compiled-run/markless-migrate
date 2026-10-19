import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';
import { migrateCache } from './migrate-cache.ts';
import aliases from './lib/route-aliases.json' with { type: 'json' };

export default defineConfig({
	nitro: {
		routeRules: {
			...Object.fromEntries(Object.entries(aliases).map(([path, file]) => [path, { proxy: { to: file } }])),
			// Nitro answers /api/** itself with a plain-text 404; the old site's not-found page is served there instead.
			'/api/**': { proxy: { to: '/__not-found/api/**' } },
		},
	},
	plugins: [migrateCache(), markless(), router()],
});
