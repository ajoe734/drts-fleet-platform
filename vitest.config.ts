import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@drts/contracts": path.resolve(
        __dirname,
        "packages/contracts/src/index.ts",
      ),
      "@drts/control-plane-auth": path.resolve(
        __dirname,
        "packages/control-plane-auth/src/index.ts",
      ),
      "@": path.resolve(__dirname, "apps/tenant-console-web"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: [
      "tests/contract/**/*.test.ts",
      "tests/integ/**/*.test.ts",
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/security/**/*.test.ts",
      "tests/load/**/*.test.ts",
      "tests/e2e/**/*.test.ts",
    ],
  },
});
