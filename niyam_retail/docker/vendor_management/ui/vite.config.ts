import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'

// Embedded UI for vendor_management
// Backend runs on port 8981
const BACKEND_PORT = 8981;;
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: { port: 3047, strictPort: true, cors: true },
  resolve: { alias: { '@': path.resolve(__dirname, './src'), '@': path.resolve(__dirname, './src') } },
  build: { outDir: 'dist', sourcemap: false, minify: 'esbuild' },
});
