/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const base = process.env.VITE_BASE_URL || '/';

export default defineConfig(() => ({
  root: import.meta.dirname,
  base,
  cacheDir: '../../node_modules/.vite/apps/earnings-demo',
  server: {
    port: 4200,
    host: 'localhost',
  },
  preview: {
    port: 4200,
    host: 'localhost',
  },
  plugins: [
    react(),
    {
      name: 'inject-base',
      transformIndexHtml() {
        return [{ tag: 'base', attrs: { href: base }, injectTo: 'head-prepend' }];
      },
    },
  ],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [],
  // },
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
}));
