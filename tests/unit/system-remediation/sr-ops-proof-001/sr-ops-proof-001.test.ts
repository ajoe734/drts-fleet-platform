import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import * as path from "node:path";
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
  startSelfTestServer,
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
    it("restores snapshot into isolated SQLite database and verifies table creation", async () => {
      const engine = new IsolatedSnapshotRestoreEngine();
      const snapshot = generateCanonicalReferenceSnapshot();

      const result = await engine.restore(snapshot, { connectionUrl: "sqlite://:memory:" });
      expect(result.success).toBe(true);
      expect(result.checksumMatched).toBe(true);
      expect(result.adapterType).toBe("sqlite");
      expect(result.resourceEvidence?.tablesCreated.length).toBeGreaterThan(0);
      expect(result.restoredRecordsCount).toBe(
        snapshot.metadata.domainCounts.orders +
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

    it("fails when targeting unreachable isolated PostgreSQL URL", async () => {
      const engine = new IsolatedSnapshotRestoreEngine();
      const snapshot = generateCanonicalReferenceSnapshot();

      await expect(
        engine.restore(snapshot, {
          connectionUrl: "postgresql://localhost:1/review_isolated",
        }),
      ).rejects.toThrowError(/Failed to connect to isolated PostgreSQL/i);
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

      store.trips.set("trp-broken", {
        trip_id: "trp-broken",
        order_id: "non-existent-order",
        assignment_id: "asg-001",
        vehicle_id: "veh-001",
        driver_id: "drv-001",
        trip_status: "completed",
        actual_distance_km: -5.0,
        actual_duration_sec: -100,
        proof_required: true,
        proof_status: "not_required",
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

      const inv = store.tenantInvoices.get("inv-001")!;
      inv.total_amount = 999999.0;

      const stm = store.driverStatements.get("stm-001")!;
      stm.net_amount = 500.0;

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

      const aud = store.auditLogs.get("aud-001")!;
      aud.hash_value = "forged-hash-value-00000000000000000000000000000000";

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
    it("flags baseline as pending confirmation with no fabricated sourceRef and reports unevaluated", () => {
      expect(DISASTER_RECOVERY_BASELINE.status).toBe("pending_confirmation");
      expect(DISASTER_RECOVERY_BASELINE.isConfirmed).toBe(false);
      expect(DISASTER_RECOVERY_BASELINE.sourceRef).toBeNull();
      expect(DISASTER_RECOVERY_BASELINE.note).toContain("RPO/RTO 基準待確認");

      const rpo = calculateRpo(new Date());
      expect(rpo.status).toBe("unevaluated");
      expect(rpo.compliant).toBeNull();
      expect(rpo.passed).toBeNull();
      expect(rpo.notes).toContain("未評定 (unevaluated)");

      const rto = calculateRto(new Date(), new Date());
      expect(rto.status).toBe("unevaluated");
      expect(rto.compliant).toBeNull();
      expect(rto.passed).toBeNull();
      expect(rto.notes).toContain("未評定 (unevaluated)");
    });

    it("evaluates DR readiness while explicitly noting pending confirmation in readinessStatus and summary", () => {
      const snapshotTime = new Date(Date.now() - 5 * 60 * 1000);
      const rpo = calculateRpo(snapshotTime);
      const rto = calculateRto(new Date(Date.now() - 10 * 1000), new Date());
      const mockReconciliation = {
        overallPassed: true,
        trips: { passed: true },
        billing: { passed: true },
        audit: { passed: true },
        allDiscrepancies: [],
      } as any;

      const assessment = evaluateDisasterRecoveryReadiness(rpo, rto, mockReconciliation);
      expect(assessment.overallCompliant).toBe(false); // Unconfirmed baseline cannot claim compliant PASS
      expect(assessment.readinessStatus).toBe("unevaluated_pending_confirmation");
      expect(assessment.baselineConfirmed).toBe(false);
      expect(assessment.summaryZh).toContain("未評定 (unevaluated)");
    });
  });

  // --------------------------------------------------------------------------
  // 6. Workload Baselines Contracts (C123)
  // --------------------------------------------------------------------------
  describe("Workload Baseline Contracts (C123 / Acceptance #2)", () => {
    it("preserves exact canonical baseline values from architecture doc", () => {
      expect(WORKLOAD_BASELINES.booking.steadyStateRatePerMin).toBe(20);
      expect(WORKLOAD_BASELINES.booking.burstRatePerMin).toBe(60);
      expect(WORKLOAD_BASELINES.booking.latencySlo.p95TargetMs).toBe(2000);
      expect(WORKLOAD_BASELINES.booking.latencySlo.p99TargetMs).toBe(5000);
      expect(WORKLOAD_BASELINES.booking.availabilityTargetPct).toBe(99.9);

      expect(WORKLOAD_BASELINES.dispatch.steadyStateRatePerMin).toBe(120);
      expect(WORKLOAD_BASELINES.dispatch.burstRatePerMin).toBe(300);
      expect(WORKLOAD_BASELINES.dispatch.latencySlo.p95TargetMs).toBe(10000);
      expect(WORKLOAD_BASELINES.dispatch.availabilityTargetPct).toBe(99.9);

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

    it("reports not-run when target is missing (does not fake PASS)", async () => {
      const generator = new LoadGenerator();
      const result = await generator.runBookingLoad();

      expect(result.status).toBe("not_run");
      expect(result.sloEvaluation.allPassed).toBe(false);
      expect(result.totalRequests).toBe(0);
      expect(result.rawLatencies.length).toBe(0);
      expect(result.note).toContain("Reporting not-run");
    });

    it("executes real measured HTTP load test against test server", async () => {
      const { url, close } = await startSelfTestServer();
      try {
        const generator = new LoadGenerator();
        const result = await generator.runBookingLoad({ targetUrl: url, sampleCount: 15 });

        expect(result.status).toBe("completed");
        expect(result.totalRequests).toBe(15);
        expect(result.rawLatencies.length).toBe(15);
        expect(result.statistics.p95Ms).toBeLessThanOrEqual(WORKLOAD_BASELINES.booking.latencySlo.p95TargetMs);
        expect(result.sloEvaluation.allPassed).toBe(true);
      } finally {
        await close();
      }
    });

    it("captures real network/HTTP errors when faults occur", async () => {
      const { url, close } = await startSelfTestServer(1.0); // 100% simulated server faults
      try {
        const generator = new LoadGenerator();
        const result = await generator.runBookingLoad({ targetUrl: url, sampleCount: 10 });

        expect(result.rawErrors.length).toBe(10);
        expect(result.errorRatePct).toBe(100);
        expect(result.sloEvaluation.allPassed).toBe(false);
      } finally {
        await close();
      }
    });

    it("runs consolidated load test across all 3 families in self-test mode", async () => {
      const generator = new LoadGenerator();
      const report = await generator.runAllFamilies({ selfTest: true, sampleCount: 10 });

      expect(report.overallPassed).toBe(true);
      expect(report.families.booking.totalRequests).toBe(10);
      expect(report.families.dispatch.totalRequests).toBe(10);
      expect(report.families.report.totalRequests).toBe(10);
      expect(report.summaryZh).toContain("三項負載測試全數通過基準");
    });
  });

  // --------------------------------------------------------------------------
  // 8. Deployment & Rollback Drill Verification (C124)
  // --------------------------------------------------------------------------
  describe("Deploy & Rollback Verification (C124)", () => {
    it("validates candidate SHA format and rejects invalid hashes", () => {
      const harness = new DeployRollbackHarness();
      const valid = harness.verifyVersion(
        "40ba315e4114369eaa7e12d35aae83a795c97b1d",
        "40ba315e4114369eaa7e12d35aae83a795c97b1d",
      );
      expect(valid.versionMatched).toBe(true);
      expect(valid.passed).toBe(true);

      const invalid = harness.verifyVersion("invalid", "40ba315e4114369eaa7e12d35aae83a795c97b1d");
      expect(invalid.versionMatched).toBe(false);
      expect(invalid.passed).toBe(false);
    });

    it("reports not-run when health URL is missing without self-test", async () => {
      const harness = new DeployRollbackHarness();
      const health = await harness.verifyHealthEndpoint();
      expect(health.passed).toBe(false);
      expect(health.status).toBe("not_run");
    });

    it("validates health endpoint in self-test mode", async () => {
      const harness = new DeployRollbackHarness();
      const health = await harness.verifyHealthEndpoint({ selfTest: true });
      expect(health.passed).toBe(true);
      expect(health.serviceHealth?.status).toBe("ok");
    });

    it("validates rollback drill protocol strictly enforcing skip_migration=true", () => {
      const harness = new DeployRollbackHarness();
      const drill = harness.validateRollbackDrillProtocol({
        selfTest: true,
        currentTag: "prod/v2026.05.19.1",
        previousTag: "prod/v2026.05.18.0",
        skipMigration: true,
      });

      expect(drill.drillPassed).toBe(true);
      expect(drill.skipMigrationEnforced).toBe(true);
      expect(drill.steps.every((s) => s.passed)).toBe(true);
    });

    it("rejects rollback drill if skip_migration=false", () => {
      const harness = new DeployRollbackHarness();
      const drill = harness.validateRollbackDrillProtocol({
        selfTest: true,
        skipMigration: false,
      });
      expect(drill.drillPassed).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 9. Ops Proof Runner End-to-End Execution
  // --------------------------------------------------------------------------
  describe("Ops Proof Runner (E2E Integration)", () => {
    it("runs self-test suite and outputs consolidated evidence", async () => {
      const runner = new OpsProofRunner();
      const summary = await runner.runAll({
        baseSha: "40ba315e4114369eaa7e12d35aae83a795c97b1d",
        candidateSha: "40ba315e4114369eaa7e12d35aae83a795c97b1d",
        resourceId: "iso-db-res-001",
        selfTest: true,
      });

      expect(summary.taskId).toBe("SR-OPS-PROOF-001");
      expect(summary.isSelfTest).toBe(true);
      expect(summary.acceptanceResults.overallPassed).toBe(true);
      expect(summary.acceptanceResults.isolatedDbRestoreAndReconcile.passed).toBe(true);
      expect(summary.acceptanceResults.multiFamilyLoadTesting.passed).toBe(true);
      expect(summary.acceptanceResults.deploymentAndRollback.passed).toBe(true);
      expect(summary.notDoneLiveBoundaries.length).toBeGreaterThan(0);
    });

    it("reports missing targets when external acceptance is run without inputs", async () => {
      const runner = new OpsProofRunner();
      const summary = await runner.runAll({
        baseSha: "40ba315e4114369eaa7e12d35aae83a795c97b1d",
        candidateSha: "40ba315e4114369eaa7e12d35aae83a795c97b1d",
        selfTest: false, // Normal acceptance mode without targets
      });

      expect(summary.acceptanceResults.overallPassed).toBe(false);
      expect(summary.acceptanceResults.isolatedDbRestoreAndReconcile.passed).toBe(false);
      expect(summary.acceptanceResults.multiFamilyLoadTesting.passed).toBe(false);
      expect(summary.acceptanceResults.deploymentAndRollback.passed).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 10. CLI Binary Execution (ops-proof.mjs)
  // --------------------------------------------------------------------------
  describe("CLI Binary (ops-proof.mjs)", () => {
    it("fails and exits with code 1 when targeting unreachable PostgreSQL URL", () => {
      expect(() => {
        execFileSync(
          process.execPath,
          [cliPath, "snapshot-verify", "--isolated-url", "postgresql://localhost:1/review_isolated", "--json"],
          { encoding: "utf8", cwd: path.resolve(__dirname, "../../../../") },
        );
      }).toThrow();
    });

    it("fails and exits with code 1 when candidate SHA is invalid", () => {
      expect(() => {
        execFileSync(
          process.execPath,
          [cliPath, "deploy-verify", "--candidate-sha", "invalid", "--json"],
          { encoding: "utf8", cwd: path.resolve(__dirname, "../../../../") },
        );
      }).toThrow();
    });

    it("fails and exits with code 1 when all is run with no external inputs", () => {
      expect(() => {
        execFileSync(
          process.execPath,
          [cliPath, "all", "--json"],
          { encoding: "utf8", cwd: path.resolve(__dirname, "../../../../") },
        );
      }).toThrow();
    });

    it("succeeds with exit code 0 when all is run with --self-test", () => {
      const stdout = execFileSync(process.execPath, [cliPath, "all", "--self-test", "--json"], {
        encoding: "utf8",
        cwd: path.resolve(__dirname, "../../../../"),
      });

      const parsed = JSON.parse(stdout);
      expect(parsed.taskId).toBe("SR-OPS-PROOF-001");
      expect(parsed.mode).toBe("self_test");
      expect(parsed.overallPassed).toBe(true);
      expect(parsed.snapshotRestoreVerification.passed).toBe(true);
      expect(parsed.loadCapacityVerification.passed).toBe(true);
      expect(parsed.deployRollbackVerification.passed).toBe(true);
      expect(parsed.snapshotRestoreVerification.rpo.status).toBe("unevaluated");
      expect(parsed.snapshotRestoreVerification.rto.status).toBe("unevaluated");
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
