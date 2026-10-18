import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';
import oldRoutes from './old-routes.json' with { type: 'json' };

// Every route but `/` stays on the old app during the migration (scripts/old-routes.mjs lists them).
const old = (process.env.OLD_ORIGIN ?? 'http://localhost:4710').replace(/\/$/, '');

export default defineConfig({
	plugins: [markless(), router()],
	// public/ holds byte-for-byte copies of the old site's files.
	fmt: { ignorePatterns: ['public/**'] },
	nitro: {
		compressPublicAssets: true,
		routeRules: {
			// The homepage is the same for every visitor; the CDN keeps it an hour.
			'/': { isr: 3600 },
			...Object.fromEntries(oldRoutes.paths.map((path) => [path, { proxy: `${old}${path}` }])),
		},
	},
});
