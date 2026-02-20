import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "../../../shared"),
      "@radix-ui/react-menu": path.resolve(__dirname, "node_modules/@radix-ui/react-menu/dist/index.mjs"),
    },
  },
  build: { outDir: "dist" },
})
