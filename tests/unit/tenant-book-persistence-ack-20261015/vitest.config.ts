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
        "../../../apps/api/tests/unit/tenant-partner.service.test.ts",
      ),
      resolve(
        __dirname,
        "../../../apps/api/tests/unit/tenant-partner.controller.test.ts",
      ),
      resolve(
        __dirname,
        "../../../apps/api/tests/unit/tenant-partner.repository.test.ts",
      ),
      resolve(
        __dirname,
        "../../../apps/api/tests/unit/owned-mobility.service.test.ts",
      ),
      resolve(
        __dirname,
        "../../../apps/api/tests/unit/tenant-governance-default-seed.test.ts",
      ),
      resolve(
        __dirname,
        "../../../apps/api/tests/integration/tenant-governance-e2e.test.ts",
      ),
      resolve(
        __dirname,
        "../../../tests/unit/tenant-partner-foundation.test.ts",
      ),
      resolve(
        __dirname,
        "../../../tests/unit/system-remediation/sr-qa-tenant-001/tenant-directory-and-settings.test.ts",
      ),
      resolve(
        __dirname,
        "../../../tests/unit/system-remediation/sr-qa-tenant-001/tenant-approval-and-quota-lifecycle.test.ts",
      ),
      resolve(
        __dirname,
        "../../../tests/unit/system-remediation/sr-qa-booking-001-fix-quota-release/c028-tenant-quota-release.test.ts",
      ),
      resolve(
        __dirname,
        "../../../tests/integ/tenant-governance-negative.test.ts",
      ),
      resolve(
        __dirname,
        "../../../tests/security/iam-tenant-session-revocation-e2e.test.ts",
      ),
      resolve(
        __dirname,
        "../../../tests/e2e/tenant-console-oidc-production.test.ts",
      ),
      resolve(__dirname, "*.test.ts"),
    ],
  },
});
