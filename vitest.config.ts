import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@drts/contracts": path.resolve(
        __dirname,
        "packages/contracts/src/index.ts",
      ),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: [
      "tests/integ/**/*.test.ts",
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/load/**/*.test.ts",
    ],
  },
});
