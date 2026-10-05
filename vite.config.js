import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(root, "index.html"),
        fundraising: resolve(root, "fundraising.html"),
        obsOverlay: resolve(root, "obs-overlay.html"),
      },
    },
  },
  server: {
    proxy: { "/api": "http://127.0.0.1:3000" },
  },
});
