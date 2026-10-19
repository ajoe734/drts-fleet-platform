import { execFileSync } from "node:child_process";
import path from "node:path";
import { defineConfig } from "vitest/config";
import base from "../../../vitest.config";
const root = path.resolve(__dirname, "../../..");
const files = new Set([
  "apps/api/src/modules/incident/incident.controller.ts",
  "apps/api/src/modules/incident/incident.service.ts",
  "apps/api/src/modules/incident/incident.repository.ts",
  "apps/api/src/modules/driver-sos/driver-sos.service.ts",
  "apps/api/src/modules/driver-sos/driver-sos.repository.ts",
  "apps/api/src/modules/driver-sos/driver-sos-verification.repository.ts",
]);
export default defineConfig({
  ...base,
  plugins: [
    {
      name: "literal-aafe-before-production",
      enforce: "pre",
      load(id) {
        const relative = path.relative(root, id.split("?")[0]!);
        if (!files.has(relative)) return undefined;
        return execFileSync(
          "git",
          ["show", `aafe0200d2729320394fa46675b1553891a035de:${relative}`],
          { cwd: root, encoding: "utf8" },
        );
      },
    },
  ],
});
