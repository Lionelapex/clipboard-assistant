import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Content-script bundle. Built as a single IIFE so it can be declared directly in
// manifest.json content_scripts (ES modules are not supported there). Styles are
// imported with `?inline` and injected into the panel's shadow root, so nothing
// from Tailwind leaks into the host page.
export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2022',
    minify: 'esbuild',
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL('./src/content/index.tsx', import.meta.url)),
      name: 'ClipboardAssistantContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    rollupOptions: {
      output: {
        extend: true,
        inlineDynamicImports: true,
      },
    },
  },
});
