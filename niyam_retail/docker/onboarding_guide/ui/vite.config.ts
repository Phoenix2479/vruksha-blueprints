import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'

// Embedded UI for onboarding_guide
// Backend runs on port 8961
const BACKEND_PORT = 8961;;
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: { port: 3049, strictPort: true, cors: true },
  resolve: { alias: { '@': path.resolve(__dirname, './src'), '@': path.resolve(__dirname, './src') } },
  build: { outDir: 'dist', sourcemap: false, minify: 'esbuild' },
});
