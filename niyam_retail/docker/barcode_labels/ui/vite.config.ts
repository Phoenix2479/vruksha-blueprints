import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const BACKEND_PORT = 8880

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 10052,
    strictPort: true,
    cors: true,
    proxy: {
      '/api': `http://localhost:${BACKEND_PORT}`,
      '/healthz': `http://localhost:${BACKEND_PORT}`,
      '/readyz': `http://localhost:${BACKEND_PORT}`,
      '/status': `http://localhost:${BACKEND_PORT}`,
      '/metrics': `http://localhost:${BACKEND_PORT}`,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../../../../../shared'),
      // Deduplicate React - force all imports to use the app's React
      'react': path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
      'react/jsx-runtime': path.resolve(__dirname, './node_modules/react/jsx-runtime'),
      'react/jsx-dev-runtime': path.resolve(__dirname, './node_modules/react/jsx-dev-runtime'),
    },
  },
})
