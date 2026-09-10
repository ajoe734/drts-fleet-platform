#!/usr/bin/env node
import {
  createCanonicalProofSnapshot,
  runSnapshotRestoreReconciliation,
} from "./restore-reconciler.js";
import { runAllWorkloadTests } from "./workload-load-harness.js";
import { verifyDeploymentCatalog } from "./deployment-verification.js";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "all";

  const targetDb =
    process.env.ISOLATED_RESTORE_DB || "drts_fleet_platform_isolated_proof";
  const candidateSha =
    process.env.CANDIDATE_SHA ||
    process.env.GITHUB_SHA ||
    "2093cf7e38526a7a7c027600be92004f7275efd3";

  console.log(`[SR-OPS-PROOF-001] Command: ${command}`);
  console.log(`[SR-OPS-PROOF-001] Target Isolated DB: ${targetDb}`);
  console.log(`[SR-OPS-PROOF-001] Candidate SHA: ${candidateSha}\n`);

  let allPassed = true;

  if (command === "restore-reconcile" || command === "all") {
    console.log(
      "=== STEP 1: Snapshot Restore & Triple Reconciliation (Trips / Billing / Audit) ===",
    );
    const snapshot = createCanonicalProofSnapshot();
    const result = await runSnapshotRestoreReconciliation({
      snapshot,
      targetUrlOrName: targetDb,
      allowIsolatedOverride: true,
    });

    console.log(`Snapshot ID: ${result.snapshotId}`);
    console.log(
      `Target DB: ${result.targetDatabase.database} (Isolated: ${result.targetDatabase.isIsolated})`,
    );
    console.log(
      `Trips: ${result.reconciliation.trips.status} (${result.reconciliation.trips.sourceCount} records)`,
    );
    console.log(
      `Billing: ${result.reconciliation.billing.status} (${result.reconciliation.billing.sourceCount} statements, lines reconciled)`,
    );
    console.log(
      `Audit: ${result.reconciliation.audit.status} (${result.reconciliation.audit.sourceCount} logs, append-only trigger verified)`,
    );
    console.log(
      `RPO: ${result.rpoRto.measuredRpoSeconds}s (Target: <=${result.rpoRto.targetRpoSeconds}s, Pass: ${result.rpoRto.rpoPassed})`,
    );
    console.log(
      `RTO: ${result.rpoRto.measuredRtoMs}ms (Target: <=${result.rpoRto.targetRtoMs}ms, Pass: ${result.rpoRto.rtoPassed})`,
    );
    console.log(`Reconciliation Verdict: ${result.verdict}\n`);

    if (result.verdict !== "PASSED") {
      allPassed = false;
    }
  }

  if (command === "workload-harness" || command === "all") {
    console.log(
      "=== STEP 2: Workload Capacity & Latency Harness (Booking / Dispatch / Report) ===",
    );
    const workloadReport = await runAllWorkloadTests({
      mode: "steady-state",
      baseSha: candidateSha,
    });

    for (const [name, metrics] of Object.entries(workloadReport.results)) {
      console.log(`--- Workload: ${name.toUpperCase()} (${metrics.mode}) ---`);
      console.log(
        `  Requests: ${metrics.totalRequests} (Success: ${metrics.successfulRequests}, Fail: ${metrics.failedRequests})`,
      );
      console.log(
        `  Error Rate: ${metrics.errorRatePercent}% (Availability Pass: ${metrics.availabilityPassed})`,
      );
      console.log(`  Throughput: ${metrics.throughputReqPerSec} req/sec`);
      console.log(
        `  Latencies (ms): min=${metrics.latencyMinMs}, p50=${metrics.latencyP50Ms}, p90=${metrics.latencyP90Ms}, p95=${metrics.latencyP95Ms}, p99=${metrics.latencyP99Ms}, max=${metrics.latencyMaxMs}`,
      );
      console.log(
        `  Mean: ${metrics.latencyMeanMs}ms, StdDev: ${metrics.latencyStdDevMs}ms`,
      );
      console.log(
        `  SLA p95 Pass: ${metrics.slaP95Passed}, SLA p99 Pass: ${metrics.slaP99Passed}`,
      );
      console.log(`  Workload Verdict: ${metrics.verdict}`);
    }
    console.log(
      `Workload Harness Overall Verdict: ${workloadReport.overallVerdict}\n`,
    );

    if (workloadReport.overallVerdict !== "PASSED") {
      allPassed = false;
    }
  }

  if (command === "deploy-verify" || command === "all") {
    console.log(
      "=== STEP 3: Unified Service Inventory, Health, Role Journeys & Rollback Drill ===",
    );
    const deployReport = await verifyDeploymentCatalog({ candidateSha });

    console.log(`Services Checked: ${deployReport.services.length}`);
    for (const svc of deployReport.services) {
      console.log(
        `  - [${svc.kind.toUpperCase()}] ${svc.name}: SHA=${svc.deployedCandidateSha || "none"} Health=${svc.healthStatus} Journey=${svc.roleJourneyPassed ? "OK" : "FAIL"}`,
      );
    }
    console.log(`Version Parity: ${deployReport.versionParityPassed}`);
    console.log(`Health Endpoints: ${deployReport.allHealthPassed}`);
    console.log(`Role Journeys: ${deployReport.allRoleJourneysPassed}`);
    console.log(
      `Rollback Feasibility: ${deployReport.rollbackFeasibility.gatePassed ? "READY" : "BLOCKED"} (Target: ${deployReport.rollbackFeasibility.targetRollbackRevision})`,
    );
    console.log(`Deployment Verdict: ${deployReport.overallVerdict}\n`);

    if (deployReport.overallVerdict !== "PASSED") {
      allPassed = false;
    }
  }

  if (allPassed) {
    console.log(">>> ALL SR-OPS-PROOF-001 CHECKS PASSED SUCCESSFULLY <<<");
    process.exit(0);
  } else {
    console.error(">>> SR-OPS-PROOF-001 CHECKS FAILED <<<");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal ops-proof error:", err);
  process.exit(1);
});
