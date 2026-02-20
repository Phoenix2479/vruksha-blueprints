import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
var BACKEND_PORT = 8852;
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        proxy: {
            '/api': "http://localhost:".concat(BACKEND_PORT),
            '/qr': "http://localhost:".concat(BACKEND_PORT),
            '/logos': "http://localhost:".concat(BACKEND_PORT),
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: false,
    },
});
