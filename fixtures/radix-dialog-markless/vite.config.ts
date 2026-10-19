import tailwindcss from '@tailwindcss/vite';
import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';

export default defineConfig({
	plugins: [tailwindcss(), markless(), router({ prefetch: false })],
});
