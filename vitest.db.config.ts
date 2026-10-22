import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/api/test/database.integration.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 60000,
  },
});
