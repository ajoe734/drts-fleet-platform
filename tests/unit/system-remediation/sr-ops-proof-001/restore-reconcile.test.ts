import { describe, expect, it } from "vitest";
import {
  InMemoryIsolatedDatabaseAdapter,
  ProductionDatabaseAccessDeniedError,
  assertIsolatedDatabase,
  createCanonicalProofSnapshot,
  evaluateRpoRto,
  reconcileAudit,
  reconcileBilling,
  reconcileTrips,
  runSnapshotRestoreReconciliation,
} from "../../../../tools/system-remediation/ops-proof/restore-reconciler.js";

describe("SR-OPS-PROOF-001: Snapshot Restore & Triple Reconciliation", () => {
  describe("Database Isolation Guard", () => {
    it("rejects connection string containing production keywords", () => {
      const prodTargets = [
        "postgresql://user:pass@prod-db.drts.internal:5432/drts_production",
        "drts-db-prod",
        "drts-fleet-platform-production",
        "postgresql://admin:secret@cloudsql-prod:5432/drts",
      ];

      for (const target of prodTargets) {
        expect(() => assertIsolatedDatabase(target)).toThrow(
          ProductionDatabaseAccessDeniedError,
        );
      }
    });

    it("rejects non-isolated database targets without isolated marker", () => {
      expect(() => assertIsolatedDatabase("drts_fleet_platform")).toThrow(
        ProductionDatabaseAccessDeniedError,
      );
    });

    it("accepts explicitly isolated test database targets", () => {
      const allowedTargets = [
        "drts_fleet_platform_isolated_proof",
        "drts_test_restore",
        "drts_scratch_db",
        "drts_sandbox",
        "memory_db",
        "postgresql://postgres:postgres@localhost:5432/drts_test_isolated",
      ];

      for (const target of allowedTargets) {
        const result = assertIsolatedDatabase(target);
        expect(result.isIsolated).toBe(true);
      }
    });

    it("accepts override flag for custom isolated test runner", () => {
      const result = assertIsolatedDatabase("custom_runner_db", {
        allowIsolatedOverride: true,
      });
      expect(result.isIsolated).toBe(true);
      expect(result.database).toBe("custom_runner_db");
    });
  });

  describe("Triple Reconciliation: Trips, Billing, Audit", () => {
    it("successfully restores snapshot and reconciles trips, billing, and audit logs with 100% fidelity", async () => {
      const snapshot = createCanonicalProofSnapshot({
        tripCount: 5,
        statementCount: 3,
        auditLogCount: 6,
      });

      const adapter = new InMemoryIsolatedDatabaseAdapter();
      await adapter.restoreSnapshot(snapshot);

      // 1. Reconcile trips
      const tripsResult = await reconcileTrips(snapshot, adapter);
      expect(tripsResult.status).toBe("PASSED");
      expect(tripsResult.sourceCount).toBe(5);
      expect(tripsResult.targetCount).toBe(5);
      expect(tripsResult.discrepancies).toHaveLength(0);
      expect(tripsResult.sourceHash).toBe(tripsResult.targetHash);

      // 2. Reconcile billing
      const billingResult = await reconcileBilling(snapshot, adapter);
      expect(billingResult.status).toBe("PASSED");
      expect(billingResult.sourceCount).toBe(3);
      expect(billingResult.targetCount).toBe(3);
      expect(billingResult.discrepancies).toHaveLength(0);
      expect(billingResult.sourceHash).toBe(billingResult.targetHash);

      // 3. Reconcile audit
      const auditResult = await reconcileAudit(snapshot, adapter);
      expect(auditResult.status).toBe("PASSED");
      expect(auditResult.sourceCount).toBe(6);
      expect(auditResult.targetCount).toBe(6);
      expect(auditResult.discrepancies).toHaveLength(0);
      expect(auditResult.sourceHash).toBe(auditResult.targetHash);
      expect(auditResult.details.appendOnlyTriggerVerified).toBe(true);

      await adapter.close();
    });

    it("detects discrepancies when restored trips are missing or corrupted", async () => {
      const snapshot = createCanonicalProofSnapshot({ tripCount: 4 });
      const adapter = new InMemoryIsolatedDatabaseAdapter();
      await adapter.restoreSnapshot(snapshot);

      // Corrupt target by removing one trip
      const corruptedSnapshot = {
        ...snapshot,
        trips: snapshot.trips.slice(0, 3), // Expect 3, but DB has 4
      };

      const tripsResult = await reconcileTrips(corruptedSnapshot, adapter);
      expect(tripsResult.status).toBe("FAILED");
      expect(tripsResult.discrepancies.length).toBeGreaterThan(0);
      expect(tripsResult.discrepancies[0]).toContain(
        "Trip record count mismatch",
      );

      await adapter.close();
    });

    it("detects billing statement line sum mismatch", async () => {
      const snapshot = createCanonicalProofSnapshot({ statementCount: 2 });
      const adapter = new InMemoryIsolatedDatabaseAdapter();
      await adapter.restoreSnapshot(snapshot);

      // Tamper with snapshot statement netAmount so lines don't sum up
      const tamperedSnapshot = {
        ...snapshot,
        billing: {
          ...snapshot.billing,
          statements: snapshot.billing.statements.map((s, idx) =>
            idx === 0 ? { ...s, netAmount: s.netAmount + 999 } : s,
          ),
        },
      };

      const billingResult = await reconcileBilling(tamperedSnapshot, adapter);
      expect(billingResult.status).toBe("FAILED");
      expect(
        billingResult.discrepancies.some((d) =>
          d.includes("netAmount mismatch"),
        ),
      ).toBe(true);

      await adapter.close();
    });

    it("detects audit log hash tampering or trigger failure", async () => {
      const snapshot = createCanonicalProofSnapshot({ auditLogCount: 4 });
      const adapter = new InMemoryIsolatedDatabaseAdapter();
      await adapter.restoreSnapshot(snapshot);

      // Tamper with audit log action
      const tamperedSnapshot = {
        ...snapshot,
        auditLogs: snapshot.auditLogs.map((l, idx) =>
          idx === 0 ? { ...l, actionName: "unauthorized_tampering" } : l,
        ),
      };

      const auditResult = await reconcileAudit(tamperedSnapshot, adapter);
      expect(auditResult.status).toBe("FAILED");
      expect(
        auditResult.discrepancies.some((d) =>
          d.includes("actionName mismatch"),
        ),
      ).toBe(true);

      await adapter.close();
    });
  });

  describe("RPO and RTO Evaluation", () => {
    it("evaluates RPO and RTO against Phase 1 operational thresholds", () => {
      const snapshot = createCanonicalProofSnapshot();
      const restoreDurationMs = 1250; // 1.25s restore

      const evaluation = evaluateRpoRto(snapshot, restoreDurationMs, {
        targetRpoSeconds: 900, // 15 mins
        targetRtoMs: 60000, // 60s
      });

      expect(evaluation.rpoPassed).toBe(true);
      expect(evaluation.rtoPassed).toBe(true);
      expect(evaluation.measuredRtoMs).toBe(1250);
      expect(evaluation.restoreDurationFormatted).toBe("1.25s");
      expect(evaluation.measuredRpoSeconds).toBeLessThanOrEqual(900);
    });

    it("flags RTO breach when restore duration exceeds threshold", () => {
      const snapshot = createCanonicalProofSnapshot();
      const evaluation = evaluateRpoRto(snapshot, 75000, {
        targetRpoSeconds: 900,
        targetRtoMs: 60000,
      });

      expect(evaluation.rtoPassed).toBe(false);
      expect(evaluation.measuredRtoMs).toBe(75000);
    });
  });

  describe("High-level runSnapshotRestoreReconciliation", () => {
    it("runs complete end-to-end restore and triple reconciliation in isolated target", async () => {
      const snapshot = createCanonicalProofSnapshot();
      const report = await runSnapshotRestoreReconciliation({
        snapshot,
        targetUrlOrName: "drts_isolated_test_db",
      });

      expect(report.verdict).toBe("PASSED");
      expect(report.snapshotId).toBe(snapshot.manifest.snapshotId);
      expect(report.targetDatabase.isIsolated).toBe(true);
      expect(report.reconciliation.trips.status).toBe("PASSED");
      expect(report.reconciliation.billing.status).toBe("PASSED");
      expect(report.reconciliation.audit.status).toBe("PASSED");
      expect(report.rpoRto.rpoPassed).toBe(true);
      expect(report.rpoRto.rtoPassed).toBe(true);
    });
  });
});
