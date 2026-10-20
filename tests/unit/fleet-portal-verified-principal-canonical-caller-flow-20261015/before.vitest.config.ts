import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import taskConfig from "./vitest.config";
const baseline = "6dfff99fcc8f54d10fc18c1f19c5bcfabeb57add";
const paths = [
  "apps/fleet-partner-portal-web/lib/api-client.server.ts",
  "apps/fleet-partner-portal-web/app/control-plane-proxy/[...path]/route.ts",
  "apps/api/src/modules/fleet-partner/fleet-partner.controller.ts",
];
// Re-run the current meaningful regression against immutable original source;
// never reset or replace any file in the active worker tree.
export default defineConfig({
  ...taskConfig,
  plugins: [
    {
      name: "immutable-original-fleet-source",
      enforce: "pre",
      load(id) {
        const path = paths.find((path) => resolve(path) === id.split("?")[0]);
        if (path)
          return execFileSync("git", ["show", `${baseline}:${path}`], {
            encoding: "utf8",
          });
      },
    },
  ],
});
