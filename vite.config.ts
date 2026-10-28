import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Pone una versión única en el service worker en cada build para que los
// usuarios reciban la versión nueva al abrir la app.
const swVersion = (): Plugin => ({
  name: 'sw-version',
  apply: 'build',
  closeBundle() {
    const file = resolve(__dirname, 'dist/app/sw.js');
    if (existsSync(file)) writeFileSync(file, readFileSync(file, 'utf8').replace('__BUILD__', Date.now().toString(36)));
  },
});

export default defineConfig({
  // Rutas relativas: funciona en GitHub Pages (/finanzas/), en un dominio propio o en local.
  base: './',
  plugins: [react(), swVersion()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        site: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app/index.html'),
      },
    },
  },
  test: { environment: 'node' },
} as never);
