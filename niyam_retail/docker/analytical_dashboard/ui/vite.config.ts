import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'

// Embedded UI for analytical_dashboard
// Backend runs on port 8943
const BACKEND_PORT = 8943;;
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: { port: 3044, strictPort: true, cors: true },
  resolve: { alias: { '@': path.resolve(__dirname, './src'), '@': path.resolve(__dirname, './src') } },
  build: { outDir: 'dist', sourcemap: false, minify: 'esbuild' },
});
