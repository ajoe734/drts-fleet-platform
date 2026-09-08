import { mergeConfig, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import rootConfig from "../../../../vitest.config";

// Resolve the real workspace source even when shared node_modules points at
// a retired worker worktree. No token values or runtime behavior are mocked.
export default mergeConfig(rootConfig, defineConfig({
  resolve: {
    alias: {
      "@drts/ui-tokens": fileURLToPath(new URL("../../../../packages/ui-tokens/src/index.ts", import.meta.url)),
    },
  },
}));
