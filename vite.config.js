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
      // The legacy ticket app (index.html) is no longer built. The React app in web/ replaces it.
      input: {
        fundraising: resolve(root, "fundraising.html"),
        obsOverlay: resolve(root, "obs-overlay.html"),
      },
    },
  },
  server: {
    proxy: { "/api": "http://127.0.0.1:3000" },
  },
});
