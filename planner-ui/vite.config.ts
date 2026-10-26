import { defineConfig } from "vite";
export default defineConfig({
  root: "planner-ui",
  server: { host: "127.0.0.1", proxy: { "/api": "http://127.0.0.1:8000" } },
  build: { outDir: "dist", emptyOutDir: true },
});
