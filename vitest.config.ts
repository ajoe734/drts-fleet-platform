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
      "@drts/ui-tokens": path.resolve(
        __dirname,
        "packages/ui-tokens/src/index.ts",
      ),
      "@": path.resolve(__dirname, "apps/tenant-console-web"),
    },
  },
  esbuild: {
    jsx: "transform",
  },
  test: {
    environment: "node",
    globals: true,
    include: [
      "tests/contract/**/*.test.{ts,tsx}",
      "tests/integ/**/*.test.{ts,tsx}",
      "tests/unit/**/*.test.{ts,tsx}",
      "tests/integration/**/*.test.{ts,tsx}",
      "tests/security/**/*.test.{ts,tsx}",
      "tests/load/**/*.test.ts",
      "tests/e2e/**/*.test.ts",
    ],
  },
});
