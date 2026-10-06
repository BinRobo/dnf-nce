import { defineConfig } from 'vite';

// 开发和预览时把 /api 转给本机的后端（node server/index.mjs，默认 5180）
const api = { '/api': { target: 'http://127.0.0.1:5180', changeOrigin: false } };

export default defineConfig({
  base: './',
  server: { proxy: api },
  build: { chunkSizeWarningLimit: 2000 },
  preview: { port: 5174, strictPort: true, host: '0.0.0.0', proxy: api },
  test: { environment: 'node' },
});
