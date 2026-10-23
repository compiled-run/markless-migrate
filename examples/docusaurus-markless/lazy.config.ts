// DocSearch's dialog or the live code editor (LAZY_ENTRY), built as a module of its own that the page imports by URL when
// first needed. One entry per build keeps each in one file, with no shared chunk between them to wait on.
import { defineConfig } from 'vite';

const entries = { docsearch: 'lib/docsearch.ts', 'playground-runtime': 'lib/playground-runtime.ts' };
const entry = process.env.LAZY_ENTRY as keyof typeof entries;
if (!entries[entry]) throw new Error(`LAZY_ENTRY must be one of ${Object.keys(entries).join(', ')}`);

export default defineConfig({
	publicDir: false,
	build: {
		outDir: 'public',
		emptyOutDir: false,
		target: 'es2022',
		rollupOptions: {
			input: { [entry]: entries[entry] },
			preserveEntrySignatures: 'allow-extension',
			output: { format: 'es', entryFileNames: 'lazy/[name].js', chunkFileNames: 'lazy/[name]-[hash].js' },
		},
	},
});
