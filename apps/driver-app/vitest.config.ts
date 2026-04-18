import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "@drts/contracts": path.resolve(
        __dirname,
        "../../packages/contracts/src/index.ts",
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});
