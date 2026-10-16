import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import rootConfig from "../../../vitest.config";

export default defineConfig({
  ...rootConfig,
  test: {
    ...rootConfig.test,
    include: [
      resolve(__dirname, "*.test.ts"),
      resolve(__dirname, "../../../apps/api/tests/unit/fleet-partner*.test.ts"),
      resolve(__dirname, "../../../apps/api/tests/unit/auth-bootstrap.test.ts"),
      resolve(__dirname, "../../../tests/unit/fleet-partner*.test.ts"),
      resolve(
        __dirname,
        "../../../tests/unit/system-remediation/sr-qa-governance-001/c101-fleet-partner-master.test.ts",
      ),
    ],
  },
});
