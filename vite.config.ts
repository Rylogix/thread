import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@xyflow") || id.includes("zustand")) return "graph-vendor";
          if (id.includes("node_modules/react") || id.includes("node_modules/scheduler")) return "react-vendor";
          return undefined;
        },
      },
    },
  },
});
