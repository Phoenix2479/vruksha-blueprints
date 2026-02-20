import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../../../../../shared'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 3950,
    proxy: {
      '/api': {
        target: 'http://localhost:8950',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
