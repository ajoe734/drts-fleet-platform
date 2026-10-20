import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import retainedConfig from "./retained.vitest.config";
const paths = [
  "tests/unit/fleet-data-filter-paging-20261015/consumers.test.tsx",
  "tests/unit/fleet-overview-revenue-actions-20261013/pages.test.tsx",
  "tests/unit/fleet-statement-decisions-20261013/backend.test.ts",
  "tests/unit/fleet-statement-decisions-20261013/frontend-actions.test.tsx",
  "tests/unit/fleet-statement-decisions-20261013/sdk.test.ts",
  "tests/unit/fleet-document-upload.test.ts",
  "tests/unit/fleet-document-portal.test.tsx",
  "tests/unit/system-remediation/sr-fleet-form-001/*.test.ts",
  "tests/unit/supply-submission.test.ts",
  "tests/unit/fleet-partner-list-envelope.test.ts",
  "tests/unit/system-remediation/sr-qa-supply-001/*.test.ts",
  "apps/api/tests/unit/supply-review.service.test.ts",
];
export default defineConfig({
  ...retainedConfig,
  test: {
    ...retainedConfig.test,
    include: [
      ...(retainedConfig.test?.include ?? []),
      ...paths.map((path) => resolve(__dirname, "../../..", path)),
    ],
  },
});
