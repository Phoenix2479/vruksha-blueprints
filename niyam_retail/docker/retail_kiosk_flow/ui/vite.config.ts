import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'

// Embedded UI for retail_kiosk_flow
// Backend runs on port 8816
const BACKEND_PORT = 8816;;
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: { port: 3039, strictPort: true, cors: true },
  resolve: { alias: { '@': path.resolve(__dirname, './src'), '@': path.resolve(__dirname, './src') } },
  build: { outDir: 'dist', sourcemap: false, minify: 'esbuild' },
});
