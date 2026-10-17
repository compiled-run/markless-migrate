// Bundles the page's load-time scripts for a plain <script type="module">; files keep the old build's /assets/name.hash.ext URLs.
import { defineConfig } from 'vite';

export default defineConfig({
	publicDir: false,
	build: {
		outDir: 'public',
		emptyOutDir: false,
		target: 'es2022',
		rollupOptions: {
			input: { page: 'islands/page.ts' },
			output: { entryFileNames: 'islands/[name].js', chunkFileNames: 'islands/[name]-[hash].js', assetFileNames: 'assets/[name].[hash][extname]' },
		},
	},
});
