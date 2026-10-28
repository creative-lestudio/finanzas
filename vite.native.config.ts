import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build de la app para empaquetarla como aplicación nativa (Capacitor): solo la app, en la raíz.
export default defineConfig({
  root: resolve(__dirname, 'app'),
  base: './',
  plugins: [react()],
  publicDir: resolve(__dirname, 'public/app'),
  build: { outDir: resolve(__dirname, 'dist-native'), emptyOutDir: true, chunkSizeWarningLimit: 1000 },
});
