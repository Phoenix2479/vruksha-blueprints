import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'

// Embedded UI for supply_chain_management
// Backend runs on port 8819
const BACKEND_PORT = 8819;;

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: { port: 3038, strictPort: true, cors: true },
  resolve: { alias: { '@': path.resolve(__dirname, './src'), '@': path.resolve(__dirname, './src') } },
  build: { outDir: 'dist', sourcemap: false, minify: 'esbuild' },
});
