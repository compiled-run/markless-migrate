import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({ cacheDir: '.vite', optimizeDeps: { include: ['react', 'react/jsx-dev-runtime', 'react-dom/client'] }, plugins: [react()] });
