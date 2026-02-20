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
      // Explicitly dedupe React
      external: [],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../../../shared'),
    },
    // Dedupe React - force all React imports to use the same instance
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
})
