import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';

export default defineConfig({
	nitro: { plugins: ['./server/void-elements.ts'] },
	plugins: [markless(), router()],
});
