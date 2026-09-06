/**
 * Isolated Snapshot Restore Engine
 * 
 * Safely restores database snapshots into isolated environments without touching production DB.
 * Acceptance criteria: "同一snapshot可在隔離DB還原並校核行程/帳務/audit，工具不碰正式DB。"
 */

import { assertIsolatedDatabase } from "./db-safety-guard";
import {
  OpsSnapshot,
  calculateSnapshotChecksum,
  SnapshotDomainCounts,
  OpsOrderRecord,
  OpsBookingRecord,
  OpsDispatchJobRecord,
  OpsDispatchAssignmentRecord,
  OpsTripRecord,
  OpsProofBundleRecord,
  BillingFeePlanRecord,
  BillingDriverStatementRecord,
  BillingStatementLineRecord,
  BillingTenantInvoiceRecord,
  BillingInvoiceLineRecord,
  AdminAuditLogRecord,
  OpsDispatchTraceLogRecord,
} from "./snapshot-schema";

export interface RestoreOptions {
  connectionUrl?: string; // Must point to an isolated database target or in-memory
  verifyChecksumBeforeRestore?: boolean;
}

export interface RestoreResult {
  success: boolean;
  snapshotId: string;
  isolatedTarget: string;
  restoredAt: string;
  elapsedMs: number;
  restoredRecordsCount: number;
  domainCounts: SnapshotDomainCounts;
  checksumMatched: boolean;
  store: IsolatedDataStore;
}

/**
 * Hermetic in-memory isolated data store replicating PostgreSQL tables for trips, billing, and audit.
 */
export class IsolatedDataStore {
  public orders: Map<string, OpsOrderRecord> = new Map();
  public bookings: Map<string, OpsBookingRecord> = new Map();
  public dispatchJobs: Map<string, OpsDispatchJobRecord> = new Map();
  public dispatchAssignments: Map<string, OpsDispatchAssignmentRecord> = new Map();
  public trips: Map<string, OpsTripRecord> = new Map();
  public proofBundles: Map<string, OpsProofBundleRecord> = new Map();

  public driverFeePlans: Map<string, BillingFeePlanRecord> = new Map();
  public driverStatements: Map<string, BillingDriverStatementRecord> = new Map();
  public driverStatementLines: Map<string, BillingStatementLineRecord> = new Map();
  public tenantInvoices: Map<string, BillingTenantInvoiceRecord> = new Map();
  public invoiceLines: Map<string, BillingInvoiceLineRecord> = new Map();

  public auditLogs: Map<string, AdminAuditLogRecord> = new Map();
  public dispatchTraceLogs: Map<string, OpsDispatchTraceLogRecord> = new Map();

  public clear(): void {
    this.orders.clear();
    this.bookings.clear();
    this.dispatchJobs.clear();
    this.dispatchAssignments.clear();
    this.trips.clear();
    this.proofBundles.clear();
    this.driverFeePlans.clear();
    this.driverStatements.clear();
    this.driverStatementLines.clear();
    this.tenantInvoices.clear();
    this.invoiceLines.clear();
    this.auditLogs.clear();
    this.dispatchTraceLogs.clear();
  }

  public totalRecords(): number {
    return (
      this.orders.size +
      this.bookings.size +
      this.dispatchJobs.size +
      this.dispatchAssignments.size +
      this.trips.size +
      this.proofBundles.size +
      this.driverFeePlans.size +
      this.driverStatements.size +
      this.driverStatementLines.size +
      this.tenantInvoices.size +
      this.invoiceLines.size +
      this.auditLogs.size +
      this.dispatchTraceLogs.size
    );
  }
}

/**
 * Isolated Restore Engine
 */
export class IsolatedSnapshotRestoreEngine {
  /**
   * Restores a snapshot into an isolated target.
   * Hard-fails via assertIsolatedDatabase if connectionUrl points to production.
   */
  public async restore(snapshot: OpsSnapshot, options?: RestoreOptions): Promise<RestoreResult> {
    const startTime = performance.now();
    const connectionUrl = options?.connectionUrl ?? "in-memory";

    // 1. Enforce strict isolation guard
    const targetValidation = assertIsolatedDatabase(connectionUrl);

    // 2. Validate snapshot integrity
    let checksumMatched = true;
    if (options?.verifyChecksumBeforeRestore !== false) {
      const calculated = calculateSnapshotChecksum(snapshot.trips, snapshot.billing, snapshot.audit);
      if (calculated !== snapshot.metadata.checksumSha256) {
        checksumMatched = false;
        throw new Error(
          `Snapshot checksum mismatch! Expected ${snapshot.metadata.checksumSha256}, calculated ${calculated}. Corrupt or tampered snapshot.`,
        );
      }
    }

    // 3. Perform restoration into isolated data store
    const store = new IsolatedDataStore();
    store.clear();

    // Load Trips domain
    for (const ord of snapshot.trips.orders) store.orders.set(ord.order_id, { ...ord });
    for (const bk of snapshot.trips.bookings) store.bookings.set(bk.booking_id, { ...bk });
    for (const job of snapshot.trips.dispatchJobs) store.dispatchJobs.set(job.dispatch_job_id, { ...job });
    for (const asg of snapshot.trips.dispatchAssignments) store.dispatchAssignments.set(asg.assignment_id, { ...asg });
    for (const trp of snapshot.trips.trips) store.trips.set(trp.trip_id, { ...trp });
    for (const pb of snapshot.trips.proofBundles) store.proofBundles.set(pb.proof_bundle_id, { ...pb });

    // Load Billing domain
    for (const fp of snapshot.billing.driverFeePlans) store.driverFeePlans.set(fp.plan_id, { ...fp });
    for (const stm of snapshot.billing.driverStatements) store.driverStatements.set(stm.statement_id, { ...stm });
    for (const stl of snapshot.billing.driverStatementLines) store.driverStatementLines.set(stl.line_id, { ...stl });
    for (const inv of snapshot.billing.tenantInvoices) store.tenantInvoices.set(inv.invoice_id, { ...inv });
    for (const inl of snapshot.billing.invoiceLines) store.invoiceLines.set(inl.invoice_line_id, { ...inl });

    // Load Audit domain
    for (const aud of snapshot.audit.auditLogs) store.auditLogs.set(aud.audit_id, { ...aud });
    for (const trc of snapshot.audit.dispatchTraceLogs) store.dispatchTraceLogs.set(trc.trace_id, { ...trc });

    const elapsedMs = Math.round((performance.now() - startTime) * 100) / 100;

    return {
      success: true,
      snapshotId: snapshot.metadata.snapshotId,
      isolatedTarget: `${targetValidation.dbName}@${targetValidation.host}`,
      restoredAt: new Date().toISOString(),
      elapsedMs,
      restoredRecordsCount: store.totalRecords(),
      domainCounts: {
        orders: store.orders.size,
        bookings: store.bookings.size,
        dispatchJobs: store.dispatchJobs.size,
        dispatchAssignments: store.dispatchAssignments.size,
        trips: store.trips.size,
        proofBundles: store.proofBundles.size,
        driverFeePlans: store.driverFeePlans.size,
        driverStatements: store.driverStatements.size,
        driverStatementLines: store.driverStatementLines.size,
        tenantInvoices: store.tenantInvoices.size,
        invoiceLines: store.invoiceLines.size,
        auditLogs: store.auditLogs.size,
        dispatchTraceLogs: store.dispatchTraceLogs.size,
      },
      checksumMatched,
      store,
    };
  }
}
