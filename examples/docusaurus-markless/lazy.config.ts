// DocSearch's dialog and the live code editor, built as modules of their own that the page imports by URL when first needed.
import { defineConfig } from 'vite';

export default defineConfig({
	publicDir: false,
	build: {
		outDir: 'public',
		emptyOutDir: false,
		target: 'es2022',
		rollupOptions: {
			input: { docsearch: 'lib/docsearch.ts', 'playground-runtime': 'lib/playground-runtime.ts' },
			preserveEntrySignatures: 'exports-only',
			output: { format: 'es', entryFileNames: 'lazy/[name].js', chunkFileNames: 'lazy/[name]-[hash].js' },
		},
	},
});
