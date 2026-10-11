import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "./",
  // VITE_H5=1：腾讯新闻 H5 发布版，打成单个经典脚本（无代码分割、无 modulePreload），
  // 让发布工具能完整替换资源路径；见 scripts/build-h5.mjs
  build: process.env.VITE_H5
    ? {
        outDir: "dist/h5",
        modulePreload: false,
        cssCodeSplit: false,
        rollupOptions: { output: { format: "iife", inlineDynamicImports: true } },
      }
    : {
        outDir: "dist/client",
      },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
