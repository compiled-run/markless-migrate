import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';

export default defineConfig({
	plugins: [markless(), router()],
	lint: {
		ignorePatterns: ['public/**'],
	},
	fmt: {
		// Copied as they are: the old extension's own entries, AG Grid's injected styles and fontsource's CSS, and the
		// parity specs markless-migrate regenerates.
		ignorePatterns: [
			'public/**',
			'styles/ag-grid.css',
			'styles/ag-theme.css',
			'styles/fonts.css',
			'lib/parity/**/behaviour.*',
		],
		useTabs: true,
		tabWidth: 4,
		printWidth: 100,
		singleQuote: true,
	},
});
