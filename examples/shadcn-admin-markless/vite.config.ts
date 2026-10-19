import tailwindcss from '@tailwindcss/vite';
import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';

export default defineConfig({
	// The old app preloads a route's code only on intent (TanStack defaultPreload: 'intent'), never on idle.
	plugins: [tailwindcss(), markless(), router({ prefetch: false })],
	// @markless/ui 0.4.0 ships .tsrx source and no ui() plugin: Vite must leave it to markless() to compile.
	optimizeDeps: { exclude: ['@markless/ui'] },
	ssr: { noExternal: ['@markless/ui'] },
});
