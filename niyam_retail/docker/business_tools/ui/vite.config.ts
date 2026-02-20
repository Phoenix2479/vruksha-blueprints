import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'

// Embedded UI for business_tools
// Backend runs on port 8946
const BACKEND_PORT = 8946;;
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: { port: 3048, strictPort: true, cors: true },
  resolve: { alias: { '@': path.resolve(__dirname, './src'), '@': path.resolve(__dirname, './src') } },
  build: { outDir: 'dist', sourcemap: false, minify: 'esbuild' },
});
