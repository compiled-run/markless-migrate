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
				forbidden: resolve(root, '403.html'),
				login: resolve(root, 'login/index.html'),
				members: resolve(root, 'members/index.html'),
				admin: resolve(root, 'admin/index.html'),
		},
	},
});
