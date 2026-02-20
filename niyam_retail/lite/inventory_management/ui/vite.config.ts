import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const BACKEND_PORT = 8811

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 3005,
    proxy: {
      '/api': `http://localhost:${BACKEND_PORT}`,
      '/products': `http://localhost:${BACKEND_PORT}`,
      '/stock': `http://localhost:${BACKEND_PORT}`,
      '/inventory': `http://localhost:${BACKEND_PORT}`,
      '/healthz': `http://localhost:${BACKEND_PORT}`,
      '/readyz': `http://localhost:${BACKEND_PORT}`,
      '/status': `http://localhost:${BACKEND_PORT}`,
      '/stats': `http://localhost:${BACKEND_PORT}`,
      '/metrics': `http://localhost:${BACKEND_PORT}`,
      '/bundles': `http://localhost:${BACKEND_PORT}`,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      external: [],
    },
  },
  resolve: {
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@radix-ui/react-menu': path.resolve(__dirname, './node_modules/@radix-ui/react-menu/dist/index.mjs'),
    },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
    exclude: ['@radix-ui/react-menu'],
  },
})
