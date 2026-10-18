// Bundles the page's load-time scripts for a plain <script type="module">; files keep the old build's /assets/name.hash.ext URLs.
import { defineConfig } from 'vite';

export default defineConfig({
	publicDir: false,
	build: {
		outDir: 'public',
		emptyOutDir: false,
		target: 'es2022',
		rollupOptions: {
			input: { page: 'page-scripts/page.ts' },
			output: { entryFileNames: 'page-scripts/[name].js', chunkFileNames: 'page-scripts/[name]-[hash].js', assetFileNames: 'assets/[name].[hash][extname]' },
		},
	},
});
