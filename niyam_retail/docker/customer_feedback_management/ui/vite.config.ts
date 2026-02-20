import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'

// Embedded UI for customer_feedback_management
// Backend runs on port 8950
const BACKEND_PORT = 8950;;

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: { port: 3034, strictPort: true, cors: true },
  resolve: { alias: { '@': path.resolve(__dirname, './src'), '@': path.resolve(__dirname, './src') } },
  build: { outDir: 'dist', sourcemap: false, minify: 'esbuild' },
});
