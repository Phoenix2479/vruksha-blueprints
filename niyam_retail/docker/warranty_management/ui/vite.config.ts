import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'

// Embedded UI for warranty_management
// Backend runs on port 8975
const BACKEND_PORT = 8975;

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 3033,
    strictPort: true,
    cors: true,
    proxy: {
      '/api': `http://localhost:${BACKEND_PORT}`,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: { outDir: 'dist', sourcemap: false, minify: 'esbuild' },
});
