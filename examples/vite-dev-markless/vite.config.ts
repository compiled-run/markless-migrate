import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';
import { migrateCache } from './migrate-cache.ts';

export default defineConfig({
	plugins: [migrateCache(), markless(), router()],
	// Built files keep the old build's /assets/name.hash.ext URLs (the hash is the same), which other sites and caches link to.
	build: { rollupOptions: { output: { assetFileNames: 'assets/[name].[hash][extname]' } } },
	// public/ holds byte-for-byte copies of the docs' public files and the files the importer writes.
	fmt: { useTabs: true, singleQuote: true, printWidth: 180, ignorePatterns: ['public/**', 'pages/**', 'lib/**'] },
	nitro: {
		compressPublicAssets: true,
	},
});
