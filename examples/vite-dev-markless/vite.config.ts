import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';
import oldRoutes from './old-routes.json' with { type: 'json' };

// Every route but `/` stays on the old app during the migration (scripts/old-routes.mjs lists them).
const old = (process.env.OLD_ORIGIN ?? 'http://localhost:4710').replace(/\/$/, '');

export default defineConfig({
	plugins: [markless(), router()],
	nitro: {
		compressPublicAssets: true,
		handlers: [{ route: '/**', middleware: true, handler: './server/html-attributes.ts' }],
		routeRules: Object.fromEntries(oldRoutes.paths.map((path) => [path, { proxy: `${old}${path}` }])),
	},
});
