import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;

export default defineConfig({
	build: {
		rollupOptions: {
			input: {
				home: resolve(root, 'index.html'),
				about: resolve(root, 'about/index.html'),
				fr: resolve(root, 'fr/index.html'),
				ar: resolve(root, 'ar/index.html'),
				notFound: resolve(root, '404.html'),
			},
		},
	},
});
