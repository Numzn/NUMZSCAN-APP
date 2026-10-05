import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the browser talks to Vite on :5173, which forwards /api to the API. The
// proxy keeps the original Host header, so the API's same-origin check on writes still holds.
const apiTarget = process.env.EVENTPASS_API ?? "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: apiTarget, changeOrigin: false } },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
