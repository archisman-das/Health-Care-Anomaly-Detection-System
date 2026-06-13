import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/dashboard-data.json": {
        target: "http://127.0.0.1:8001",
        changeOrigin: true,
      },
      "/api": {
        target: "http://127.0.0.1:8001",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:8001",
        changeOrigin: true,
      },
      "/models": {
        target: "http://127.0.0.1:8001",
        changeOrigin: true,
      },
      "/feedback": {
        target: "http://127.0.0.1:8001",
        changeOrigin: true,
      },
    },
  },
});
