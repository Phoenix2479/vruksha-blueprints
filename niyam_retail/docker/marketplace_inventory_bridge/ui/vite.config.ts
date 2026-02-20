import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'

// Embedded UI for marketplace_inventory_bridge
// Backend runs on port 8957
const BACKEND_PORT = 8957;;
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: { port: 3046, strictPort: true, cors: true },
  resolve: { alias: { '@': path.resolve(__dirname, './src'), '@': path.resolve(__dirname, './src') } },
  build: { outDir: 'dist', sourcemap: false, minify: 'esbuild' },
});
