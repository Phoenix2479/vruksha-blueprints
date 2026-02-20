import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'

// Embedded UI for ai_behavior_engine
// Backend runs on port 8942
const BACKEND_PORT = 8942;;
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: { port: 3042, strictPort: true, cors: true },
  resolve: { alias: { '@': path.resolve(__dirname, './src'), '@': path.resolve(__dirname, './src') } },
  build: { outDir: 'dist', sourcemap: false, minify: 'esbuild' },
});
