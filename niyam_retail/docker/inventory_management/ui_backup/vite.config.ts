import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Embedded UI for Inventory Management App
// Backend runs on port 8811
const BACKEND_PORT = 8811;

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 3005,
    strictPort: true,
    open: false,
    proxy: {
      '/api': `http://localhost:${BACKEND_PORT}`,
      '/products': `http://localhost:${BACKEND_PORT}`,
      '/stock': `http://localhost:${BACKEND_PORT}`,
      '/inventory': `http://localhost:${BACKEND_PORT}`,
      '/health': `http://localhost:${BACKEND_PORT}`,
      '/metrics': `http://localhost:${BACKEND_PORT}`,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      '../../../../shared': path.resolve(__dirname, '../../../../../shared'),
    },
  },
})
