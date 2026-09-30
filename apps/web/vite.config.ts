import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

import { prerender } from "./prerender";

export default defineConfig({
  plugins: [react(), prerender()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom", "@tanstack/react-query"],
          charts: ["recharts"],
          motion: ["framer-motion"],
        },
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
