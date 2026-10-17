import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';

export default defineConfig({
	nitro: { experimental: { asyncContext: true } },
	// Vite's default CSS minifier adds vendor prefixes (-webkit-backdrop-filter) the old app's stylesheet does not have.
	build: { cssMinify: false },
	plugins: [markless(), router()],
});
