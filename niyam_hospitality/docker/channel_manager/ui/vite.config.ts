import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
export default defineConfig({
  plugins: [react()],
  server: { port: 3060, strictPort: true },
  resolve: { alias: { '@shared': path.resolve(__dirname, '../../../shared'), 'react': path.resolve(__dirname, 'node_modules/react'), 'react-dom': path.resolve(__dirname, 'node_modules/react-dom') }, dedupe: ['react', 'react-dom'] },
})
