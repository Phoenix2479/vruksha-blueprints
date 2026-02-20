import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'

// Embedded UI for curbside_pickup_scheduler
// Backend runs on port 8817
const BACKEND_PORT = 8817;;
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: { port: 3040, strictPort: true, cors: true },
  resolve: { alias: { '@': path.resolve(__dirname, './src'), '@': path.resolve(__dirname, './src') } },
  build: { outDir: 'dist', sourcemap: false, minify: 'esbuild' },
});
