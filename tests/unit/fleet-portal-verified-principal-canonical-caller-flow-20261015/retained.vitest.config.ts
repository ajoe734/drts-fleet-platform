import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import rootConfig from "../../../vitest.config";
export default defineConfig({
  ...rootConfig,
  test: {
    ...rootConfig.test,
    include: [
      resolve(
        __dirname,
        "../../../apps/fleet-partner-portal-web/lib/api-client.server.test.ts",
      ),
      resolve(__dirname, "../../../tests/unit/fleet-document-proxy.test.ts"),
      resolve(
        __dirname,
        "../../../tests/unit/fleet-training-authorized-caller-20261015/*.test.ts",
      ),
      resolve(
        __dirname,
        "../../../tests/unit/system-remediation/sr-fleet-case-001/*.test.ts",
      ),
    ],
  },
});
