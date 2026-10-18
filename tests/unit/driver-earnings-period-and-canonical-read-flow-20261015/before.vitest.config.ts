import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import rootConfig from "../../../vitest.config";

const baseline = "11ed91ba151b04519670d11316d5f30f1fdc0d74";
const paths = [
  "apps/api/src/modules/platform-earnings/platform-earnings.controller.ts",
  "apps/api/src/modules/platform-earnings/platform-earnings.service.ts",
  "apps/api/src/modules/platform-earnings/platform-earnings.repository.ts",
];

// Manual before/fixed-after probe: load immutable original production files
// from the audited base commit at their normal module paths without mutating
// the working tree.
export default defineConfig({
  ...rootConfig,
  test: {
    ...rootConfig.test,
    include: [resolve(__dirname, "*.test.ts")],
  },
  plugins: [
    {
      name: "immutable-before-source",
      enforce: "pre",
      load(id) {
        const cleanId = id.split("?")[0];
        const matchedPath = paths.find(
          (relPath) => resolve(relPath) === cleanId,
        );
        if (matchedPath) {
          return execFileSync("git", ["show", `${baseline}:${matchedPath}`], {
            encoding: "utf8",
          });
        }
      },
    },
  ],
});
