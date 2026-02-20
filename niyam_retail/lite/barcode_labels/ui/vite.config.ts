import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Fix for @radix-ui/react-menu resolution issue
      '@radix-ui/react-menu': path.resolve(__dirname, 'node_modules/@radix-ui/react-menu/dist/index.mjs'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
