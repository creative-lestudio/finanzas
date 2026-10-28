import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Build de un único HTML autocontenido (para vistas previas compartibles).
export default defineConfig({
  root: resolve(__dirname, 'app'),
  base: './',
  plugins: [react(), viteSingleFile()],
  define: { 'import.meta.env.VITE_PREVIEW': JSON.stringify('1') },
  build: { outDir: resolve(__dirname, 'dist-artifact'), emptyOutDir: true },
});
