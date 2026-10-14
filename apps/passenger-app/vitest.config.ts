import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: here,
  resolve: {
    alias: {
      "@": here,
      "@drts/passenger-client": path.resolve(
        here,
        "../../packages/passenger-client/src/index.ts",
      ),
      "@drts/contracts": path.resolve(
        here,
        "../../packages/contracts/src/index.ts",
      ),
      "@drts/ui-tokens": path.resolve(
        here,
        "../../packages/ui-tokens/src/index.ts",
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
  },
});
