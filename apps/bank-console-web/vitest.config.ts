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
      "@drts/control-plane-auth": path.resolve(
        __dirname,
        "../../packages/control-plane-auth/src/index.ts",
      ),
      "@drts/ui-tokens": path.resolve(
        __dirname,
        "../../packages/ui-tokens/src/index.ts",
      ),
      "@drts/ui-web": path.resolve(
        __dirname,
        "../../packages/ui-web/src/index.tsx",
      ),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
});
