import { defineConfig } from "vitest/config";
import path from "node:path";
const root = path.resolve(__dirname, "../../..");
export default defineConfig({
  root,
  resolve: {
    alias: {
      "@drts/contracts": path.join(root, "packages/contracts/src/index.ts"),
      "@drts/control-plane-auth": path.join(
        root,
        "packages/control-plane-auth/src/index.ts",
      ),
    },
  },
  oxc: false,
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    globals: true,
    include: [
      "apps/api/tests/unit/regulatory-registry.service.test.ts",
      "tests/unit/regulatory-registry.test.ts",
      "tests/unit/system-remediation/sr-contract-read-001/sr-contract-read-001.test.ts",
      "tests/unit/system-remediation/sr-credential-expiry-20260913/credential-expiry-reconciliation.test.ts",
      "tests/unit/system-remediation/sr-ops-contract-001/sr-ops-contract-001.test.ts",
      "tests/unit/system-remediation/sr-qa-driver-001/driver-license-expiry-gap.test.ts",
      "tests/unit/system-remediation/sr-qa-supply-001/sr-qa-supply-001-registry-eligibility.test.ts",
      "tests/unit/c073-final-offboarding-eligibility-20261015/c073-canonical-publication.test.ts",
      "tests/unit/registry-contract-insurance-exclusivity-canonical-ack-flow-20261015/commands.test.ts",
    ],
    fileParallelism: false,
  },
});
