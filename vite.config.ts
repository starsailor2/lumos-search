import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/launcher'),
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist/renderer/launcher'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/launcher/index.html'),
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
