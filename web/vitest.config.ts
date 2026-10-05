import { defineConfig } from "vitest/config";

// No React plugin here: Vitest bundles its own Vite, and esbuild already compiles TSX
// using the jsx setting in tsconfig.json.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
  },
});
