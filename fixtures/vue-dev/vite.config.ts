import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({ cacheDir: '.vite', optimizeDeps: { include: ['vue'] }, plugins: [vue()] });
