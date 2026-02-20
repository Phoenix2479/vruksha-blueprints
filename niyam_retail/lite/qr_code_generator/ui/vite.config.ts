import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const BACKEND_PORT = 8852

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': `http://localhost:${BACKEND_PORT}`,
      '/qr': `http://localhost:${BACKEND_PORT}`,
      '/logos': `http://localhost:${BACKEND_PORT}`,
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
