import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
var BACKEND_PORT = 8880;
export default defineConfig({
    plugins: [react()],
    base: '/',
    server: {
        port: 10052,
        strictPort: true,
        cors: true,
        proxy: {
            '/api': "http://localhost:".concat(BACKEND_PORT),
            '/healthz': "http://localhost:".concat(BACKEND_PORT),
            '/readyz': "http://localhost:".concat(BACKEND_PORT),
            '/status': "http://localhost:".concat(BACKEND_PORT),
            '/metrics': "http://localhost:".concat(BACKEND_PORT),
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@shared': path.resolve(__dirname, '../../../../../shared'),
            // Deduplicate React - force all imports to use the app's React
            'react': path.resolve(__dirname, './node_modules/react'),
            'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
            'react/jsx-runtime': path.resolve(__dirname, './node_modules/react/jsx-runtime'),
            'react/jsx-dev-runtime': path.resolve(__dirname, './node_modules/react/jsx-dev-runtime'),
        },
    },
});
