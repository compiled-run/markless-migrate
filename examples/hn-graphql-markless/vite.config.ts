import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';

export default defineConfig({
	nitro: {
		experimental: { asyncContext: true },
		// The old app's Next server sends its files compressed; the Node server sends these copies, written at build time.
		compressPublicAssets: { gzip: true, brotli: true },
	},
	plugins: [markless(), router()],
	fmt: {
		useTabs: true,
		tabWidth: 4,
		printWidth: 100,
		singleQuote: true,
	},
});
