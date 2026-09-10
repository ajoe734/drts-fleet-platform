import { describe, expect, it } from "vitest";
import {
  createCanonicalProofSnapshot,
  runSnapshotRestoreReconciliation,
} from "../../../../tools/system-remediation/ops-proof/restore-reconciler.js";
import { runAllWorkloadTests } from "../../../../tools/system-remediation/ops-proof/workload-load-harness.js";
import { verifyDeploymentCatalog } from "../../../../tools/system-remediation/ops-proof/deployment-verification.js";

describe("SR-OPS-PROOF-001: Ops-Proof Combined CLI Execution", () => {
  it("executes the full end-to-end ops-proof suite and verifies all gates", async () => {
    const candidateSha = "2093cf7e38526a7a7c027600be92004f7275efd3";

    // 1. Snapshot Restore & Triple Reconciliation
    const snapshot = createCanonicalProofSnapshot();
    const restoreResult = await runSnapshotRestoreReconciliation({
      snapshot,
      targetUrlOrName: "drts_isolated_test_suite",
    });

    expect(restoreResult.verdict).toBe("PASSED");
    expect(restoreResult.reconciliation.trips.status).toBe("PASSED");
    expect(restoreResult.reconciliation.billing.status).toBe("PASSED");
    expect(restoreResult.reconciliation.audit.status).toBe("PASSED");
    expect(restoreResult.rpoRto.rpoPassed).toBe(true);
    expect(restoreResult.rpoRto.rtoPassed).toBe(true);

    // 2. Workload Load & Latency Harness
    const workloadResult = await runAllWorkloadTests({
      mode: "steady-state",
      baseSha: candidateSha,
    });

    expect(workloadResult.overallVerdict).toBe("PASSED");
    expect(workloadResult.results.booking.verdict).toBe("PASSED");
    expect(workloadResult.results.dispatch.verdict).toBe("PASSED");
    expect(workloadResult.results.report.verdict).toBe("PASSED");

    // 3. Deployment Parity & Rollback Feasibility Drill
    const deployResult = await verifyDeploymentCatalog({ candidateSha });

    expect(deployResult.overallVerdict).toBe("PASSED");
    expect(deployResult.versionParityPassed).toBe(true);
    expect(deployResult.allHealthPassed).toBe(true);
    expect(deployResult.allRoleJourneysPassed).toBe(true);
    expect(deployResult.rollbackFeasibility.gatePassed).toBe(true);
  });
});
