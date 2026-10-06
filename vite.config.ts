import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
  preview: { port: 5174, strictPort: true, host: '0.0.0.0' },
  test: { environment: 'node' },
});
