import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'

// Embedded UI for quality_control
// Backend runs on port 8967

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: { port: 3036, strictPort: true, cors: true },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: { outDir: 'dist', sourcemap: false, minify: 'esbuild' },
});
