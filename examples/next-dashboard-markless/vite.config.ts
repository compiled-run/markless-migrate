import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';

export default defineConfig({
	nitro: { experimental: { asyncContext: true } },
	plugins: [markless(), router()],
});
