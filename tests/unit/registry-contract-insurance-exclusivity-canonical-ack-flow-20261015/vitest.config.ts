import { defineConfig } from "vitest/config";
import path from "node:path";
const root = path.resolve(__dirname, "../../..");
export default defineConfig({
  root,
  resolve: {
    alias: {
      "@drts/contracts": path.join(root, "packages/contracts/src/index.ts"),
      "@drts/control-plane-auth": path.join(
        root,
        "packages/control-plane-auth/src/index.ts",
      ),
    },
  },
  oxc: false,
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    globals: true,
    include: [
      "tests/unit/registry-contract-insurance-exclusivity-canonical-ack-flow-20261015/commands.test.ts",
    ],
    fileParallelism: false,
  },
});
