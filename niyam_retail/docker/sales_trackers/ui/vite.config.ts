import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'

// Embedded UI for sales_trackers
// Backend runs on port 8971
const BACKEND_PORT = 8971;;
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: { port: 3041, strictPort: true, cors: true },
  resolve: { alias: { '@': path.resolve(__dirname, './src'), '@': path.resolve(__dirname, './src') } },
  build: { outDir: 'dist', sourcemap: false, minify: 'esbuild' },
});
