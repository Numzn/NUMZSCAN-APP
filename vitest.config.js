import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    // Integration files each rebuild the shared scratch database, so they must not overlap.
    fileParallelism: false,
  },
});
