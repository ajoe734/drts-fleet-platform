import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import rootConfig from "../../../vitest.config";

// Bounded before/fixed-after reproduction: replace only the original Owned
// completion producer/callers with the accepted baseline. Keep the same source
// authorities, transport fixtures and assertions, without moving the worktree.
const baseline = "b726c5cd08c932502d768e5766bbdf4753e4a1f4";
const producer = "apps/api/src/modules/owned-mobility/owned-mobility.service.ts";

export default defineConfig({
  ...rootConfig,
  plugins: [
    {
      name: "immutable-before-e04-completion",
      enforce: "pre",
      load(id) {
        if (id.split("?")[0] === resolve(producer))
          return execFileSync("git", ["show", `${baseline}:${producer}`], {
            encoding: "utf8",
          });
      },
    },
  ],
  test: {
    ...rootConfig.test,
    include: [resolve(__dirname, "completion-capture.test.ts")],
    testNamePattern: "captures authority→explicit Fleet",
  },
});
