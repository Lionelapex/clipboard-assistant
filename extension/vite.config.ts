import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const entry = (file: string) => fileURLToPath(new URL(file, import.meta.url));

// Main bundle: toolbar popup, offscreen clipboard worker and the service worker.
// The content script is built separately (vite.content.config.ts) because it must be a
// self-contained IIFE with no code splitting, per Manifest V3 content-script rules.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: entry('./popup.html'),
        offscreen: entry('./offscreen.html'),
        background: entry('./src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
