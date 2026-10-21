import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import taskConfig from "./vitest.config";
const baseline = "8995f5bf2c18750747a411481acaa9ab611a54c6";
const callers = [
  "apps/fleet-partner-portal-web/components/fleet-supply-workspace.tsx",
  "apps/fleet-partner-portal-web/app/cases/[caseId]/case-reply-composer.tsx",
  "apps/fleet-partner-portal-web/lib/fleet-document-upload.ts",
];
export default defineConfig({
  ...taskConfig,
  plugins: [
    {
      name: "immutable-original-fleet-browser-callers",
      enforce: "pre",
      load(id) {
        const path = callers.find((path) => resolve(path) === id.split("?")[0]);
        if (path)
          return execFileSync("git", ["show", `${baseline}:${path}`], {
            encoding: "utf8",
          });
      },
    },
  ],
});
