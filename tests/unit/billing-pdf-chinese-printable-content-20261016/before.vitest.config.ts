import { execFileSync } from "node:child_process";
import { defineConfig, mergeConfig } from "vitest/config";
import base from "../../../vitest.config";

// Run the identical actual producer tests against the immutable accepted service
// in memory. No active worktree reset or copied substitute implementation.
const accepted = "d9b63d0317475ba79160f8d633df0ab24cf1df64";
const service =
  "apps/api/src/modules/billing-settlement/billing-settlement.service.ts";
export default mergeConfig(
  base,
  defineConfig({
    plugins: [
      {
        name: "accepted-billing-service-before",
        enforce: "pre",
        load(id) {
          if (id.endsWith(`/${service}`)) {
            return execFileSync("git", ["show", `${accepted}:${service}`], {
              encoding: "utf8",
            });
          }
        },
      },
    ],
  }),
);
