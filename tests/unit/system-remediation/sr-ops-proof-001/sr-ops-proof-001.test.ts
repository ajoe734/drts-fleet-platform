import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertIsolatedDatabase,
  isProductionTarget,
  ProductionDatabaseAccessDeniedError,
} from "../../../../tools/system-remediation/ops-proof/src/db-safety-guard";

import {
  calculateAuditLogHash,
  calculateSnapshotChecksum,
  generateCanonicalReferenceSnapshot,
} from "../../../../tools/system-remediation/ops-proof/src/snapshot-schema";

import {
  IsolatedDataStore,
  IsolatedSnapshotRestoreEngine,
} from "../../../../tools/system-remediation/ops-proof/src/snapshot-restore-engine";

import {
  OpsReconciliationEngine,
} from "../../../../tools/system-remediation/ops-proof/src/reconciliation-engine";

import {
  calculateRpo,
  calculateRto,
  evaluateDisasterRecoveryReadiness,
  DISASTER_RECOVERY_BASELINE,
} from "../../../../tools/system-remediation/ops-proof/src/rpo-rto-calculator";

import {
  WORKLOAD_BASELINES,
} from "../../../../tools/system-remediation/ops-proof/src/workload-baseline-contracts";

import {
  calculatePercentiles,
  LoadGenerator,
} from "../../../../tools/system-remediation/ops-proof/src/load-generator";

import {
  DeployRollbackHarness,
} from "../../../../tools/system-remediation/ops-proof/src/deploy-rollback-harness";

import {
  OpsProofRunner,
} from "../../../../tools/system-remediation/ops-proof/src/ops-proof-runner";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliPath = path.resolve(__dirname, "../../../../tools/system-remediation/ops-proof/bin/ops-proof.mjs");

describe("SR-OPS-PROOF-001: 備份還原／容量／背景部署可驗證方案", () => {
  // --------------------------------------------------------------------------
  // 1. Database Safety Guardrails (工具不碰正式DB)
  // --------------------------------------------------------------------------
  describe("Database Safety Guard (C122 / Acceptance #1)", () => {
    it("allows authorized in-memory and isolated test database URLs", () => {
      expect(assertIsolatedDatabase("in-memory").isIsolated).toBe(true);
      expect(assertIsolatedDatabase("sqlite://:memory:").isIsolated).toBe(true);
      expect(
        assertIsolatedDatabase("postgresql://postgres:postgres@localhost:5432/drts_isolated_restore_test").isIsolated,
      ).toBe(true);
      expect(
        assertIsolatedDatabase("postgresql://tester:secret@127.0.0.1:5433/drts_test_ops_proof").isIsolated,
      ).toBe(true);
    });

    it("strictly rejects production connection strings containing production markers", () => {
      expect(() => {
        assertIsolatedDatabase("postgresql://app:pass@drts-prod-db.internal:5432/drts_isolated");
      }).toThrowError(ProductionDatabaseAccessDeniedError);

      expect(() => {
        assertIsolatedDatabase("postgresql://app:pass@prod-db.gcp.internal:5432/drts_test");
      }).toThrowError(ProductionDatabaseAccessDeniedError);

      expect(() => {
        assertIsolatedDatabase("postgresql://app:pass@cloudsql.drts.internal:5432/test");
      }).toThrowError(ProductionDatabaseAccessDeniedError);
    });

    it("strictly rejects canonical production database names (e.g. drts_fleet_platform)", () => {
      expect(() => {
        assertIsolatedDatabase("postgresql://postgres:postgres@localhost:5432/drts_fleet_platform");
      }).toThrowError(ProductionDatabaseAccessDeniedError);

      expect(() => {
        assertIsolatedDatabase("postgresql://admin:secret@127.0.0.1:5432/drts_production");
      }).toThrowError(ProductionDatabaseAccessDeniedError);
    });

    it("correctly identifies production targets", () => {
      expect(isProductionTarget("drts-prod")).toBe(true);
      expect(isProductionTarget("drts_fleet_platform")).toBe(true);
      expect(isProductionTarget("drts_isolated_test")).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Snapshot Model & Integrity
  // --------------------------------------------------------------------------
  describe("Snapshot Model & Checksum (C122)", () => {
    it("generates canonical snapshot with valid schema and metadata", () => {
      const snap = generateCanonicalReferenceSnapshot();
      expect(snap.metadata.snapshotId).toBe("snap-ops-proof-ref-001");
      expect(snap.metadata.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(snap.trips.orders.length).toBeGreaterThan(0);
      expect(snap.billing.tenantInvoices.length).toBeGreaterThan(0);
      expect(snap.audit.auditLogs.length).toBeGreaterThan(0);
    });

    it("calculates deterministic SHA-256 checksum", () => {
      const snap = generateCanonicalReferenceSnapshot();
      const calculated = calculateSnapshotChecksum(snap.trips, snap.billing, snap.audit);
      expect(calculated).toBe(snap.metadata.checksumSha256);
    });

    it("verifies audit log tamper-evident hash matches definition", () => {
      const hash = calculateAuditLogHash(
        "usr-01",
        "ops.orders",
        "order.created",
        "ord-123",
        "2026-09-06T12:00:00Z",
      );
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      // Changing any input must alter the hash
      const tamperedHash = calculateAuditLogHash(
        "usr-02",
        "ops.orders",
        "order.created",
        "ord-123",
        "2026-09-06T12:00:00Z",
      );
      expect(tamperedHash).not.toBe(hash);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Isolated Restore Engine
  // --------------------------------------------------------------------------
  describe("Isolated Snapshot Restore Engine (C122 / Acceptance #1)", () => {
    it("restores snapshot into isolated store without touching production DB", async () => {
      const engine = new IsolatedSnapshotRestoreEngine();
      const snapshot = generateCanonicalReferenceSnapshot();

      const result = await engine.restore(snapshot, { connectionUrl: "in-memory" });
      expect(result.success).toBe(true);
      expect(result.checksumMatched).toBe(true);
      expect(result.restoredRecordsCount).toBe(snapshot.metadata.domainCounts.orders +
        snapshot.metadata.domainCounts.bookings +
        snapshot.metadata.domainCounts.dispatchJobs +
        snapshot.metadata.domainCounts.dispatchAssignments +
        snapshot.metadata.domainCounts.trips +
        snapshot.metadata.domainCounts.proofBundles +
        snapshot.metadata.domainCounts.driverFeePlans +
        snapshot.metadata.domainCounts.driverStatements +
        snapshot.metadata.domainCounts.driverStatementLines +
        snapshot.metadata.domainCounts.tenantInvoices +
        snapshot.metadata.domainCounts.invoiceLines +
        snapshot.metadata.domainCounts.auditLogs +
        snapshot.metadata.domainCounts.dispatchTraceLogs
      );
      expect(result.store.orders.size).toBe(2);
      expect(result.store.trips.size).toBe(2);
      expect(result.store.tenantInvoices.size).toBe(1);
    });

    it("rejects corrupt snapshots with mismatched checksums", async () => {
      const engine = new IsolatedSnapshotRestoreEngine();
      const snapshot = generateCanonicalReferenceSnapshot();
      snapshot.metadata.checksumSha256 = "corrupted-checksum-sha256-invalid";

      await expect(engine.restore(snapshot)).rejects.toThrowError(/checksum mismatch/i);
    });

    it("aborts restore immediately if target is production URL", async () => {
      const engine = new IsolatedSnapshotRestoreEngine();
      const snapshot = generateCanonicalReferenceSnapshot();

      await expect(
        engine.restore(snapshot, {
          connectionUrl: "postgresql://postgres:secret@prod-db.drts:5432/drts_fleet_platform",
        }),
      ).rejects.toThrowError(ProductionDatabaseAccessDeniedError);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Reconciliation Engine: Trips, Billing, Audit
  // --------------------------------------------------------------------------
  describe("Reconciliation Engine (C122 / Acceptance #1)", () => {
    it("passes all three domains on canonical reference snapshot data", async () => {
      const engine = new IsolatedSnapshotRestoreEngine();
      const reconEngine = new OpsReconciliationEngine();
      const snapshot = generateCanonicalReferenceSnapshot();

      const { store } = await engine.restore(snapshot);
      const report = reconEngine.reconcileAll(store);

      expect(report.overallPassed).toBe(true);
      expect(report.trips.passed).toBe(true);
      expect(report.billing.passed).toBe(true);
      expect(report.audit.passed).toBe(true);
      expect(report.allDiscrepancies.length).toBe(0);
    });

    it("detects missing foreign keys and invariant breaches in Trips domain", async () => {
      const engine = new IsolatedSnapshotRestoreEngine();
      const reconEngine = new OpsReconciliationEngine();
      const snapshot = generateCanonicalReferenceSnapshot();
      const { store } = await engine.restore(snapshot);

      // Inject a broken trip referencing non-existent order
      store.trips.set("trp-broken", {
        trip_id: "trp-broken",
        order_id: "non-existent-order",
        assignment_id: "asg-001",
        vehicle_id: "veh-001",
        driver_id: "drv-001",
        trip_status: "completed",
        actual_distance_km: -5.0, // negative invariant breach
        actual_duration_sec: -100, // negative invariant breach
        proof_required: true,
        proof_status: "not_required", // missing proof bundle
        created_at: "2026-09-06T10:00:00Z",
      });

      const result = reconEngine.reconcileTripsDomain(store);
      expect(result.passed).toBe(false);
      expect(result.discrepancies.some((d) => d.category === "missing_foreign_key")).toBe(true);
      expect(result.discrepancies.some((d) => d.category === "metric_invariant_violation")).toBe(true);
      expect(result.discrepancies.some((d) => d.category === "missing_required_proof")).toBe(true);
    });

    it("detects invoice total mismatches and net arithmetic errors in Billing domain", async () => {
      const engine = new IsolatedSnapshotRestoreEngine();
      const reconEngine = new OpsReconciliationEngine();
      const snapshot = generateCanonicalReferenceSnapshot();
      const { store } = await engine.restore(snapshot);

      // Tamper invoice total
      const inv = store.tenantInvoices.get("inv-001")!;
      inv.total_amount = 999999.0; // Lines sum to 900.0

      // Tamper driver statement net amount
      const stm = store.driverStatements.get("stm-001")!;
      stm.net_amount = 500.0; // Gross 900 - fee 135 + subsidy 50 = 815.0

      const result = reconEngine.reconcileBillingDomain(store);
      expect(result.passed).toBe(false);
      expect(result.discrepancies.some((d) => d.category === "invoice_total_mismatch")).toBe(true);
      expect(result.discrepancies.some((d) => d.category === "statement_net_arithmetic_error")).toBe(true);
    });

    it("detects tampered audit log hashes and missing lifecycle audit trails", async () => {
      const engine = new IsolatedSnapshotRestoreEngine();
      const reconEngine = new OpsReconciliationEngine();
      const snapshot = generateCanonicalReferenceSnapshot();
      const { store } = await engine.restore(snapshot);

      // Tamper hash value
      const aud = store.auditLogs.get("aud-001")!;
      aud.hash_value = "forged-hash-value-00000000000000000000000000000000";

      // Add order without audit log
      store.orders.set("ord-unlogged", {
        order_id: "ord-unlogged",
        order_no: "ORD-UNLOGGED",
        tenant_id: "tenant-001",
        service_bucket: "enterprise_dispatch",
        pickup_address: "Address",
        pickup_lat: 25.0,
        pickup_lng: 121.5,
        current_status: "created",
        created_at: "2026-09-06T12:00:00Z",
      });

      const result = reconEngine.reconcileAuditDomain(store);
      expect(result.passed).toBe(false);
      expect(result.hashIntegrityVerified).toBe(false);
      expect(result.discrepancies.some((d) => d.category === "tamper_evident_hash_mismatch")).toBe(true);
      expect(result.discrepancies.some((d) => d.category === "missing_lifecycle_audit_trail")).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 5. RPO / RTO Evaluator
  // --------------------------------------------------------------------------
  describe("RPO / RTO & Disaster Recovery Evaluator (C122)", () => {
    it("evaluates compliant RPO and RTO within runbook baselines", () => {
      const snapshotTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes old
      const rpo = calculateRpo(snapshotTime);
      expect(rpo.compliant).toBe(true);
      expect(rpo.rpoMinutes).toBeLessThanOrEqual(DISASTER_RECOVERY_BASELINE.rpoTargetMinutes);

      const restoreStart = new Date(Date.now() - 10 * 1000); // 10 seconds ago
      const verificationEnd = new Date();
      const rto = calculateRto(restoreStart, verificationEnd);
      expect(rto.compliant).toBe(true);
      expect(rto.rtoMinutes).toBeLessThanOrEqual(DISASTER_RECOVERY_BASELINE.rtoTargetMinutes);
    });

    it("flags breach when RPO or RTO exceeds baseline", () => {
      const ancientSnapshot = new Date(Date.now() - 25 * 60 * 1000); // 25 minutes old (target 15m)
      const rpo = calculateRpo(ancientSnapshot);
      expect(rpo.compliant).toBe(false);
      expect(rpo.notes).toContain("breached baseline");

      const slowStart = new Date(Date.now() - 75 * 60 * 1000); // 75 minutes ago (target 60m)
      const rto = calculateRto(slowStart, new Date());
      expect(rto.compliant).toBe(false);
      expect(rto.notes).toContain("breached baseline");
    });
  });

  // --------------------------------------------------------------------------
  // 6. Workload Baselines Contracts (C123)
  // --------------------------------------------------------------------------
  describe("Workload Baseline Contracts (C123 / Acceptance #2)", () => {
    it("preserves exact canonical baseline values from architecture doc", () => {
      // Booking
      expect(WORKLOAD_BASELINES.booking.steadyStateRatePerMin).toBe(20);
      expect(WORKLOAD_BASELINES.booking.burstRatePerMin).toBe(60);
      expect(WORKLOAD_BASELINES.booking.latencySlo.p95TargetMs).toBe(2000);
      expect(WORKLOAD_BASELINES.booking.latencySlo.p99TargetMs).toBe(5000);
      expect(WORKLOAD_BASELINES.booking.availabilityTargetPct).toBe(99.9);

      // Dispatch
      expect(WORKLOAD_BASELINES.dispatch.steadyStateRatePerMin).toBe(120);
      expect(WORKLOAD_BASELINES.dispatch.burstRatePerMin).toBe(300);
      expect(WORKLOAD_BASELINES.dispatch.latencySlo.p95TargetMs).toBe(10000);
      expect(WORKLOAD_BASELINES.dispatch.availabilityTargetPct).toBe(99.9);

      // Report
      expect(WORKLOAD_BASELINES.report.steadyStateRatePerMin).toBe(10);
      expect(WORKLOAD_BASELINES.report.burstRatePerMin).toBe(30);
      expect(WORKLOAD_BASELINES.report.latencySlo.p95TargetMs).toBe(3000);
      expect(WORKLOAD_BASELINES.report.availabilityTargetPct).toBe(99.0);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Multi-Family Load Testing & Raw Latencies/Errors
  // --------------------------------------------------------------------------
  describe("Multi-Family Load Testing (C123 / Acceptance #2)", () => {
    it("computes accurate percentiles (p50, p90, p95, p99)", () => {
      const sample = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const stats = calculatePercentiles(sample);
      expect(stats.minMs).toBe(10);
      expect(stats.maxMs).toBe(100);
      expect(stats.meanMs).toBe(55);
      expect(stats.p50Ms).toBe(50);
      expect(stats.p95Ms).toBe(100);
    });

    it("runs booking load test and outputs raw latencies and raw errors", async () => {
      const generator = new LoadGenerator();
      const result = await generator.runBookingLoad({ sampleCount: 30 });

      expect(result.family).toBe("booking");
      expect(result.totalRequests).toBe(30);
      expect(result.rawLatencies.length).toBe(30);
      expect(Array.isArray(result.rawErrors)).toBe(true);
      expect(result.statistics.p95Ms).toBeLessThanOrEqual(WORKLOAD_BASELINES.booking.latencySlo.p95TargetMs);
      expect(result.sloEvaluation.p95Compliant).toBe(true);
      expect(result.sloEvaluation.allPassed).toBe(true);
    });

    it("runs dispatch load test and verifies candidate attempt SLO", async () => {
      const generator = new LoadGenerator();
      const result = await generator.runDispatchLoad({ sampleCount: 50 });

      expect(result.family).toBe("dispatch");
      expect(result.totalRequests).toBe(50);
      expect(result.rawLatencies.length).toBe(50);
      expect(result.statistics.p95Ms).toBeLessThanOrEqual(WORKLOAD_BASELINES.dispatch.latencySlo.p95TargetMs);
      expect(result.sloEvaluation.allPassed).toBe(true);
    });

    it("runs report load test and verifies query/enqueue SLO", async () => {
      const generator = new LoadGenerator();
      const result = await generator.runReportLoad({ sampleCount: 20 });

      expect(result.family).toBe("report");
      expect(result.totalRequests).toBe(20);
      expect(result.rawLatencies.length).toBe(20);
      expect(result.statistics.p95Ms).toBeLessThanOrEqual(WORKLOAD_BASELINES.report.latencySlo.p95TargetMs);
      expect(result.sloEvaluation.allPassed).toBe(true);
    });

    it("captures simulated raw errors and reports SLO breaches", async () => {
      const generator = new LoadGenerator();
      // Force 100% simulated error rate to verify error capture and breach reporting
      const result = await generator.runBookingLoad({ sampleCount: 10, simulateFaultRate: 1.0 });

      expect(result.rawErrors.length).toBe(10);
      expect(result.rawErrors[0].code).toBe("ERR_INTAKE_FAILED");
      expect(result.errorRatePct).toBe(100);
      expect(result.sloEvaluation.availabilityCompliant).toBe(false);
      expect(result.sloEvaluation.allPassed).toBe(false);
      expect(result.sloEvaluation.breaches.length).toBeGreaterThan(0);
    });

    it("executes consolidated load report across all 3 families", async () => {
      const generator = new LoadGenerator();
      const report = await generator.runAllFamilies({ profile: "steady_state" });

      expect(report.overallPassed).toBe(true);
      expect(report.families.booking.totalRequests).toBeGreaterThan(0);
      expect(report.families.dispatch.totalRequests).toBeGreaterThan(0);
      expect(report.families.report.totalRequests).toBeGreaterThan(0);
      expect(report.totalRequestsAcrossFamilies).toBe(
        report.families.booking.totalRequests +
        report.families.dispatch.totalRequests +
        report.families.report.totalRequests,
      );
      expect(report.summaryZh).toContain("三項負載測試全數通過基準");
    });
  });

  // --------------------------------------------------------------------------
  // 8. Deployment & Rollback Drill Verification (C124)
  // --------------------------------------------------------------------------
  describe("Deploy & Rollback Verification (C124)", () => {
    it("validates candidate SHA format and cleanliness", () => {
      const harness = new DeployRollbackHarness();
      const result = harness.verifyVersion(
        "40ba315e4114369eaa7e12d35aae83a795c97b1d",
        "40ba315e4114369eaa7e12d35aae83a795c97b1d",
      );
      expect(result.versionMatched).toBe(true);
      expect(result.gitStatusClean).toBe(true);
    });

    it("validates /health endpoint contracts", () => {
      const harness = new DeployRollbackHarness();
      const health = harness.verifyHealthEndpoint();
      expect(health.passed).toBe(true);
      expect(health.serviceHealth.status).toBe("ok");
      expect(health.serviceHealth.database).toBe("connected");
    });

    it("validates rollback drill protocol strictly enforcing skip_migration=true", () => {
      const harness = new DeployRollbackHarness();
      const drill = harness.validateRollbackDrillProtocol({
        currentTag: "prod/v2026.05.19.1",
        previousTag: "prod/v2026.05.18.0",
        skipMigration: true,
        servicesReady: true,
      });

      expect(drill.drillPassed).toBe(true);
      expect(drill.skipMigrationEnforced).toBe(true);
      expect(drill.steps.length).toBe(5);
      expect(drill.steps.every((s) => s.passed)).toBe(true);
      expect(drill.evidenceSummary).toContain("回滾演練通過");
    });

    it("rejects rollback drill if skip_migration=false without reviewed down-path", () => {
      const harness = new DeployRollbackHarness();
      const drill = harness.validateRollbackDrillProtocol({
        skipMigration: false,
      });
      expect(drill.drillPassed).toBe(false);
      expect(drill.steps.find((s) => s.step === "B_DRY_RUN_REVIEW")?.passed).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 9. Ops Proof Runner End-to-End Execution
  // --------------------------------------------------------------------------
  describe("Ops Proof Runner (E2E Integration)", () => {
    it("runs complete suite and outputs consolidated acceptance evidence", async () => {
      const runner = new OpsProofRunner();
      const summary = await runner.runAll({
        baseSha: "40ba315e4114369eaa7e12d35aae83a795c97b1d",
        candidateSha: "40ba315e4114369eaa7e12d35aae83a795c97b1d",
        resourceId: "iso-db-res-001",
      });

      expect(summary.taskId).toBe("SR-OPS-PROOF-001");
      expect(summary.acceptanceResults.overallPassed).toBe(true);
      expect(summary.acceptanceResults.isolatedDbRestoreAndReconcile.passed).toBe(true);
      expect(summary.acceptanceResults.multiFamilyLoadTesting.passed).toBe(true);
      expect(summary.acceptanceResults.deploymentAndRollback.passed).toBe(true);
      expect(summary.notDoneLiveBoundaries.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // 10. CLI Binary Execution (ops-proof.mjs)
  // --------------------------------------------------------------------------
  describe("CLI Binary (ops-proof.mjs)", () => {
    it("runs via node with --json and returns valid JSON result", () => {
      const stdout = execFileSync(process.execPath, [cliPath, "all", "--json"], {
        encoding: "utf8",
        cwd: path.resolve(__dirname, "../../../../"),
      });

      const parsed = JSON.parse(stdout);
      expect(parsed.taskId).toBe("SR-OPS-PROOF-001");
      expect(parsed.overallPassed).toBe(true);
      expect(parsed.snapshotRestoreVerification.passed).toBe(true);
      expect(parsed.loadCapacityVerification.passed).toBe(true);
      expect(parsed.deployRollbackVerification.passed).toBe(true);
    });

    it("exits with error when targeting forbidden production database", () => {
      expect(() => {
        execFileSync(
          process.execPath,
          [cliPath, "all", "--isolated-url", "postgresql://app:pass@drts-prod:5432/drts_fleet_platform"],
          { encoding: "utf8", cwd: path.resolve(__dirname, "../../../../") },
        );
      }).toThrow();
    });
  });
});
