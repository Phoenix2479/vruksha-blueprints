import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const BACKEND_PORT = 8823;

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 3000,
    proxy: {
      '/api': `http://localhost:${BACKEND_PORT}`,
      '/health': `http://localhost:${BACKEND_PORT}`,
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
  resolve: { 
    alias: { 
      '@': path.resolve(__dirname, './src'),
    } 
  },
})
