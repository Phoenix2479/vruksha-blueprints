import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'

// Embedded UI for multi_store_management
// Backend runs on port 8802
const BACKEND_PORT = 8802;;

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: { port: 3037, strictPort: true, cors: true },
  resolve: { alias: { '@': path.resolve(__dirname, './src'), '@': path.resolve(__dirname, './src') } },
  build: { outDir: 'dist', sourcemap: false, minify: 'esbuild' },
});
