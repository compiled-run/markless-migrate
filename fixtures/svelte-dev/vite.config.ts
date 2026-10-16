import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({ cacheDir: '.vite', optimizeDeps: { include: ['svelte', 'svelte/internal/client', 'svelte/internal/disclose-version'] }, plugins: [svelte()] });
