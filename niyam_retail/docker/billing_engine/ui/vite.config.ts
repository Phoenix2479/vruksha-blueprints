import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Embedded UI for billing_engine
// Backend runs on port 8812
const BACKEND_PORT = 8812;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 3004,
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
      '@shared': path.resolve(__dirname, '../../../shared'),
    },
    dedupe: ['react', 'react-dom'],
  },
})
