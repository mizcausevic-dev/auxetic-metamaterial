import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    outDir: "dist",
    assetsDir: "assets",
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
