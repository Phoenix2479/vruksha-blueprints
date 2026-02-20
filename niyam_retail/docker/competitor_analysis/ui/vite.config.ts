import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'

// Embedded UI for competitor_analysis
// Backend runs on port 8947
const BACKEND_PORT = 8947;;

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 3031,
    strictPort: true,
    cors: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
  },
});
