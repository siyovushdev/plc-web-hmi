import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

const API_TARGET = process.env.VITE_API_PROXY_TARGET || "http://localhost:8080"

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
})
