import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';

const api = (process.env.API_ORIGIN ?? 'http://127.0.0.1:4100').replace(/\/$/, '');

export default defineConfig({
	nitro: { routeRules: { '/api/**': { proxy: `${api}/api/**` } } },
	server: { proxy: { '/api': api } },
	plugins: [markless(), router()],
});
