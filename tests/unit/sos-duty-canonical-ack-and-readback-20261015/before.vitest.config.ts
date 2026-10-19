import { execFileSync } from "node:child_process";
import path from "node:path";
import { defineConfig } from "vitest/config";
import base from "../../../vitest.config";

// Load unchanged literal prior production modules while using these same new
// regression cases and dependency tree. Never reset or switch a worktree.
const root = path.resolve(__dirname, "../../..");
const prior = "5a2f9760c570c3e2e97baa720a50d9da4a534779";
const paths = new Set([
  "apps/api/src/modules/incident/incident.repository.ts",
  "apps/api/src/modules/incident/incident.service.ts",
  "apps/api/src/modules/driver-sos/driver-sos.service.ts",
  "apps/api/src/modules/driver-sos/driver-sos-verification.repository.ts",
]);
export default defineConfig({
  ...base,
  plugins: [
    {
      name: "literal-prior-SOS-production-modules",
      enforce: "pre",
      load(id) {
        const relative = path.relative(root, id.split("?")[0]!);
        if (!paths.has(relative)) return undefined;
        return execFileSync("git", ["show", `${prior}:${relative}`], {
          cwd: root,
          encoding: "utf8",
        });
      },
    },
  ],
});
