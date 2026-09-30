import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/client'),
    },
  },
  server: {
    // VITE_PORT 覆盖前端端口；后端端口以后端 PORT 为准（见 .env.example），
    // 代理目标跟随 PORT，避免后端换端口后前端仍打到旧 3001（静默连到 stale 服务）。
    port: Number(process.env.VITE_PORT) || 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT || 3001}`,
        changeOrigin: true,
      },
    },
  },
});
