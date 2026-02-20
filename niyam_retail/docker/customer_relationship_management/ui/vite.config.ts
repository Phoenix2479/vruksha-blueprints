import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Embedded UI for customer_relationship_management
// Backend runs on port 8952
const BACKEND_PORT = 8952;

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: { port: 3045, strictPort: true, cors: true },
  resolve: {
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../../../shared'),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: { outDir: 'dist', sourcemap: false, minify: 'esbuild' },
});
