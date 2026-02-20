import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { port: 5204, proxy: { '/api': { target: 'http://localhost:8834', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') } } },
})
