import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const BACKEND_PORT = 8815;

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 3003,
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
    emptyOutDir: true,
  },
  resolve: {
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../../../shared'),
      '@radix-ui/react-menu': path.resolve(__dirname, './node_modules/@radix-ui/react-menu/dist/index.mjs'),
    },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
    exclude: ['@radix-ui/react-menu'],
  },
})
