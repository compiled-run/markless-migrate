import tailwindcss from '@tailwindcss/vite';
import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';
import { migrateCache } from './migrate-cache.ts';

export default defineConfig({
	// The old app preloads a route's code only on intent (TanStack defaultPreload: 'intent'), never on idle.
	plugins: [migrateCache(), tailwindcss(), markless(), router({ prefetch: false })],
	// @markless/ui 0.4.0 ships .tsrx source and no ui() plugin: Vite must leave it to markless() to compile.
	optimizeDeps: { exclude: ['@markless/ui'] },
	ssr: { noExternal: ['@markless/ui'] },
	// The browser code is minified without the compressor: in this bundle, rolldown 1.x's compressor drops the
	// `onUnmount()` call in lib/ports/radix-ui-react-dialog/engine.ts's watchPresence, so a closed dialog never gives the
	// page back (the body keeps pointer-events: none, the scroll lock and aria-hidden). Mangling and whitespace stay.
	environments: { client: { build: { rolldownOptions: { output: { minify: { compress: false, mangle: true } } } } } },
});
