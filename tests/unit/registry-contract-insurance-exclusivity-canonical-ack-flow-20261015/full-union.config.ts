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
      "tests/unit/c073-final-offboarding-eligibility-20261015/c073-final-offboarding-eligibility.test.ts",
      "tests/unit/driver-credential-preexpiry-reminder-flow-20261015/reminders.test.ts",
      "tests/unit/driver-credential-preexpiry-reminder-flow-20261015/renewal-recovery.test.ts",
      "tests/unit/incident-suppression-canonical-dispatch-flow-20261015/canonical-incident.test.ts",
      "tests/unit/p5-disclosure-review-canonical-flow-20261015/commands.test.ts",
      "tests/unit/p5-disclosure-review-canonical-flow-20261015/mounted.test.tsx",
      "tests/unit/registry-driver-master-durable-ack-20261014/baseline.test.ts",
      "tests/unit/registry-driver-master-durable-ack-20261014/legacy-readback.test.ts",
      "tests/unit/registry-driver-master-durable-ack-20261014/profile-caller-order.test.ts",
      "tests/unit/registry-driver-master-durable-ack-20261014/regressions.test.ts",
      "tests/unit/registry-driver-master-durable-ack-20261014/workstate.test.ts",
      "tests/unit/registry-expiry-backlog-intent-recovery-20261015/expiry-recovery.test.ts",
      "tests/unit/registry-expiry-backlog-intent-recovery-20261015/expiry-sql.test.ts",
      "tests/unit/registry-expiry-backlog-intent-recovery-20261015/pool-timeout.test.ts",
    ],
    fileParallelism: false,
  },
});
