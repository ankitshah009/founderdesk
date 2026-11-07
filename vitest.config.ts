import { availableParallelism } from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/stubs/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Use every core: files run in parallel workers.
    pool: "threads",
    maxWorkers: availableParallelism(),
    fileParallelism: true,
    testTimeout: 30_000,
    env: { NODE_ENV: "test", APP_URL: "http://founderdesk.test", APP_SECRET: "test-secret" },
  },
});
