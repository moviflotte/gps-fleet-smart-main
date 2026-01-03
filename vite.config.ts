import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0", // ✅ pour rendre accessible sur le réseau
    port: 5173, // ✅ change le port ici (évite 8080)
    proxy: {
      "/api": {
        target: "http://localhost:8080", // ton backend
        changeOrigin: true,
        secure: false,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
