import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import taskConfig from "./vitest.config";

const baseline = "df77ae3586694b9ad753eecf2b3ceab3fbfacb90";
const paths = [
  "apps/api/src/modules/fleet-partner/fleet-partner.service.ts",
  "apps/api/src/modules/fleet-partner/fleet-partner.controller.ts",
];

// Manual before/fixed-after probe: load immutable original production files
// at their normal module paths, without replacing files in the active tree.
export default defineConfig({
  ...taskConfig,
  plugins: [
    {
      name: "immutable-before-source",
      enforce: "pre",
      load(id) {
        const path = paths.find((path) => resolve(path) === id.split("?")[0]);
        if (path) {
          return execFileSync("git", ["show", `${baseline}:${path}`], {
            encoding: "utf8",
          });
        }
      },
    },
  ],
});
