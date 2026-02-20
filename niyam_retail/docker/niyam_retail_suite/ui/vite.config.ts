import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Embedded UI for niyam_retail_suite
// Backend runs on port 8838
const BACKEND_PORT = 8838;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 3002,
    strictPort: true,
    open: false,
    proxy: {
      '/api': `http://localhost:${BACKEND_PORT}`,
      '/health': `http://localhost:${BACKEND_PORT}`,
      '/metrics': `http://localhost:${BACKEND_PORT}`,
    },
  },
  build: {
    outDir: 'dist',
  },
  resolve: {
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
