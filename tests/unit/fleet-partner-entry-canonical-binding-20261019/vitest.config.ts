import { execFileSync } from "node:child_process";
import { relative, resolve } from "node:path";
import { defineConfig } from "vitest/config";
import rootConfig from "../../../vitest.config";

const root = resolve(__dirname, "../../..");
const sourceRef = process.env.FLEET_BINDING_SOURCE_REF;
if (sourceRef && !/^[a-f0-9]{40}$/.test(sourceRef)) {
  throw new Error("FLEET_BINDING_SOURCE_REF must be an immutable full SHA.");
}
const sourcePaths = new Set([
  "packages/contracts/src/index.ts",
  "apps/api/src/modules/tenant-partner/tenant-partner.service.ts",
  "apps/api/src/modules/tenant-partner/tenant-partner.module.ts",
  "apps/api/src/modules/fleet-partner/fleet-partner.repository.ts",
]);

export default defineConfig({
  ...rootConfig,
  plugins: [
    ...(rootConfig.plugins ?? []),
    {
      name: "immutable-fleet-binding-before-source",
      enforce: "pre",
      load(id) {
        const path = relative(root, id.split("?")[0]!);
        if (!sourceRef || !sourcePaths.has(path)) return null;
        return execFileSync("git", ["show", `${sourceRef}:${path}`], {
          cwd: root,
          encoding: "utf8",
          maxBuffer: 4 * 1024 * 1024,
        });
      },
    },
  ],
  cacheDir: resolve(__dirname, "../../../.local/fleet-entry-vitest-cache"),
  resolve: {
    ...rootConfig.resolve,
    alias: {
      ...rootConfig.resolve?.alias,
      "server-only": resolve(
        __dirname,
        "../fleet-portal-verified-principal-canonical-caller-flow-20261015/server-only.ts",
      ),
    },
  },
  test: {
    ...rootConfig.test,
    include:
      process.env.FLEET_BINDING_REGRESSION === "api"
        ? [resolve(root, "apps/api/tests/unit/tenant-partner.service.test.ts")]
        : [
            resolve(__dirname, "*.test.ts"),
            ...(process.env.FLEET_BINDING_REGRESSION === "1"
              ? [
                  resolve(
                    root,
                    "tests/unit/system-remediation/sr-partner-notify-fix-entry-20260927/tenant-partner-persistence.test.ts",
                  ),
                  resolve(
                    root,
                    "tests/unit/fleet-portal-verified-principal-canonical-caller-flow-20261015/principal.test.ts",
                  ),
                  resolve(root, "tests/unit/fleet-partner.repository.test.ts"),
                ]
              : []),
          ],
    maxWorkers: 1,
  },
});
