import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import rootConfig from "../../../vitest.config";

export default defineConfig({
  ...rootConfig,
  test: {
    ...rootConfig.test,
    include: [
      resolve(__dirname, "*.test.ts"),
      resolve(__dirname, "../../../tests/unit/platform-earnings.test.ts"),
      resolve(
        __dirname,
        "../../../tests/unit/system-remediation/sr-qa-driver-001/driver-earnings-statement-access.test.ts",
      ),
      resolve(
        __dirname,
        "../../../tests/security/iam-driver-authz-enforcement.test.ts",
      ),
    ],
  },
});
