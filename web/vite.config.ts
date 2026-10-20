import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The EventWise API (Web2/eventwise) runs on 8787; proxy it so the browser stays same-origin.
const API_TARGET = process.env.EVENTWISE_API ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': API_TARGET },
  },
  preview: {
    proxy: { '/api': API_TARGET },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
