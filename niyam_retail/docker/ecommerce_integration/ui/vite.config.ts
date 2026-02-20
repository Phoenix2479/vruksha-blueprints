import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@originjs/vite-plugin-federation'
import path from 'path'

const BACKEND_PORT = 8970;

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'ecommerce_integration_remote',
      filename: 'remoteEntry.js',
      exposes: {
        './App': './src/App.tsx'
      },
      shared: {
        react: {
          singleton: true,
          requiredVersion: '^19.0.0'
        },
        'react-dom': {
          singleton: true,
          requiredVersion: '^19.0.0'
        }
      }
    })
  ],
  base: '/',
  server: {
    port: 5332,
    strictPort: true,
    cors: true,
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
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    target: 'esnext',
    minify: false,
    cssCodeSplit: false
  },
  resolve: { 
    alias: { 
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../../../shared'),
    },
    dedupe: ['react', 'react-dom'],
  },
})
