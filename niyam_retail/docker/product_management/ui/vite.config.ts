import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const BACKEND_PORT = 8964;

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 3100,
    proxy: {
      '/api': `http://localhost:${BACKEND_PORT}`,
      '/healthz': `http://localhost:${BACKEND_PORT}`,
      '/health': `http://localhost:${BACKEND_PORT}`,
      '/metrics': `http://localhost:${BACKEND_PORT}`,
      '/employees': `http://localhost:${BACKEND_PORT}`,
      '/shifts': `http://localhost:${BACKEND_PORT}`,
      '/promotions': `http://localhost:${BACKEND_PORT}`,
      '/price': `http://localhost:${BACKEND_PORT}`,
      '/categories': `http://localhost:${BACKEND_PORT}`,
      '/products': `http://localhost:${BACKEND_PORT}`,
      '/feedback': `http://localhost:${BACKEND_PORT}`,
      '/logs': `http://localhost:${BACKEND_PORT}`,
      '/purchase-orders': `http://localhost:${BACKEND_PORT}`,
      '/suppliers': `http://localhost:${BACKEND_PORT}`,
      '/sync': `http://localhost:${BACKEND_PORT}`,
      '/orders': `http://localhost:${BACKEND_PORT}`,
      '/pos': `http://localhost:${BACKEND_PORT}`,
      '/time-clock': `http://localhost:${BACKEND_PORT}`,
      '/commissions': `http://localhost:${BACKEND_PORT}`,
      '/verify-age': `http://localhost:${BACKEND_PORT}`,
      '/hazmat': `http://localhost:${BACKEND_PORT}`,
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
