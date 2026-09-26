import { defineConfig } from "vitest/config";
import path from "node:path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
      "@drts/api-client": path.resolve(
        __dirname,
        "packages/api-client/src/index.ts",
      ),
      "@/lib/admin-client": path.resolve(
        __dirname,
        "apps/platform-admin-web/lib/admin-client.ts",
      ),
      "@/lib/i18n": path.resolve(
        __dirname,
        "apps/platform-admin-web/lib/i18n.tsx",
      ),
      "@": path.resolve(__dirname, "apps/tenant-console-web"),
    },
  },
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: [
      "tests/contract/**/*.test.ts",
      "tests/integ/**/*.test.ts",
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
      "tests/integration/**/*.test.ts",
      "tests/security/**/*.test.ts",
      "tests/load/**/*.test.ts",
      "tests/e2e/**/*.test.ts",
    ],
  },
});
