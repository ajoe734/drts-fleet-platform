import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@drts/contracts": resolve(
        import.meta.dirname,
        "../../../../packages/contracts/src/index.ts",
      ),
    },
  },
  test: {
    environment: "node",
    include: [resolve(import.meta.dirname, "__tests__/**/*.test.ts")],
  },
});
