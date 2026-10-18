import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';

const api = (process.env.API_ORIGIN ?? 'http://127.0.0.1:4100').replace(/\/$/, '');

// Every page is rendered in its loading state and filled in the browser, so the HTML is the same for every visitor:
// the CDN keeps each page after its first render until the next deploy.
const pages = ['/', '/login', '/register', '/settings', '/editor', '/editor/**', '/article/**', '/tag/**', '/profile/**'];

export default defineConfig({
	nitro: { routeRules: { '/api/**': { proxy: `${api}/api/**` }, ...Object.fromEntries(pages.map((path) => [path, { isr: true }])) } },
	server: { proxy: { '/api': api } },
	plugins: [markless(), router()],
});
