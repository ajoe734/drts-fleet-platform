import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Root Vitest's @ alias belongs to the tenant console. Isolate bank SSR imports
// here without changing the shared runner or another app's module resolution.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": resolve("apps/bank-console-web"),
      "@drts/contracts": resolve("packages/contracts/src/index.ts"),
      "@drts/control-plane-auth": resolve(
        "packages/control-plane-auth/src/index.ts",
      ),
      "@drts/ui-tokens": resolve("packages/ui-tokens/src/index.ts"),
      "@drts/ui-web": resolve("packages/ui-web/src/index.tsx"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/system-remediation/sr-bank-002/*.spec.mts"],
  },
});
