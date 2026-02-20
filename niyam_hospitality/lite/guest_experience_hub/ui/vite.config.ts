import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"

// This is a template - update the BACKEND_PORT for each app
const BACKEND_PORT = 8923

export default defineConfig({
  plugins: [react()],
  base: "/",
  server: {
    port: 3000,
    strictPort: true,
    open: false,
    proxy: {
      "/api": `http://localhost:${BACKEND_PORT}`,
      "/health": `http://localhost:${BACKEND_PORT}`,
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  resolve: {
    extensions: [".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx", ".json"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // NOTE: No @shared alias - each lite app must be self-contained
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
})
