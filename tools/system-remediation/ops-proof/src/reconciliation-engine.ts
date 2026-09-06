/**
 * Ops Reconciliation Engine
 * 
 * Performs comprehensive verification across Trips (行程), Billing (帳務), and Audit (稽核) domains.
 * Acceptance criteria: "同一snapshot可在隔離DB還原並校核行程/帳務/audit，工具不碰正式DB。"
 */

import { IsolatedDataStore } from "./snapshot-restore-engine";
import { calculateAuditLogHash } from "./snapshot-schema";

export interface ReconciliationDiscrepancy {
  domain: "trips" | "billing" | "audit";
  category: string;
  entityId: string;
  expected: any;
  actual: any;
  message: string;
}

export interface TripReconciliationResult {
  domain: "trips";
  passed: boolean;
  totalOrders: number;
  totalTrips: number;
  completedTrips: number;
  proofVerifiedCount: number;
  discrepancies: ReconciliationDiscrepancy[];
}

export interface BillingReconciliationResult {
  domain: "billing";
  passed: boolean;
  totalInvoices: number;
  totalStatements: number;
  invoiceAmountReconciled: boolean;
  statementAmountReconciled: boolean;
  totalInvoiceAmount: number;
  totalStatementGross: number;
  totalStatementNet: number;
  discrepancies: ReconciliationDiscrepancy[];
}

export interface AuditReconciliationResult {
  domain: "audit";
  passed: boolean;
  totalAuditLogs: number;
  totalTraceLogs: number;
  hashIntegrityVerified: boolean;
  lifecycleCoverageVerified: boolean;
  discrepancies: ReconciliationDiscrepancy[];
}

export interface FullReconciliationReport {
  overallPassed: boolean;
  timestamp: string;
  totalRecordsReconciled: number;
  trips: TripReconciliationResult;
  billing: BillingReconciliationResult;
  audit: AuditReconciliationResult;
  allDiscrepancies: ReconciliationDiscrepancy[];
}

export class OpsReconciliationEngine {
  /**
   * Reconciles the Trips domain (行程校核)
   */
  public reconcileTripsDomain(store: IsolatedDataStore): TripReconciliationResult {
    const discrepancies: ReconciliationDiscrepancy[] = [];
    let completedTrips = 0;
    let proofVerifiedCount = 0;

    // 1. Verify Orders and Bookings relationship
    for (const [bookingId, booking] of store.bookings.entries()) {
      if (!store.orders.has(booking.order_id)) {
        discrepancies.push({
          domain: "trips",
          category: "missing_foreign_key",
          entityId: bookingId,
          expected: "valid order_id in ops.orders",
          actual: booking.order_id,
          message: `Booking ${bookingId} references non-existent order ${booking.order_id}`,
        });
      }
    }

    // 2. Verify Dispatch Jobs and Assignments
    for (const [jobId, job] of store.dispatchJobs.entries()) {
      if (!store.orders.has(job.order_id)) {
        discrepancies.push({
          domain: "trips",
          category: "missing_foreign_key",
          entityId: jobId,
          expected: "valid order_id in ops.orders",
          actual: job.order_id,
          message: `Dispatch job ${jobId} references non-existent order ${job.order_id}`,
        });
      }
    }

    for (const [asgId, asg] of store.dispatchAssignments.entries()) {
      if (!store.dispatchJobs.has(asg.dispatch_job_id)) {
        discrepancies.push({
          domain: "trips",
          category: "missing_foreign_key",
          entityId: asgId,
          expected: "valid dispatch_job_id in ops.dispatch_jobs",
          actual: asg.dispatch_job_id,
          message: `Dispatch assignment ${asgId} references non-existent dispatch job ${asg.dispatch_job_id}`,
        });
      }
    }

    // 3. Verify Trips consistency
    for (const [tripId, trip] of store.trips.entries()) {
      // Check order link
      if (!store.orders.has(trip.order_id)) {
        discrepancies.push({
          domain: "trips",
          category: "missing_foreign_key",
          entityId: tripId,
          expected: "valid order_id in ops.orders",
          actual: trip.order_id,
          message: `Trip ${tripId} references non-existent order ${trip.order_id}`,
        });
      }

      // Check assignment link
      if (!store.dispatchAssignments.has(trip.assignment_id)) {
        discrepancies.push({
          domain: "trips",
          category: "missing_foreign_key",
          entityId: tripId,
          expected: "valid assignment_id in ops.dispatch_assignments",
          actual: trip.assignment_id,
          message: `Trip ${tripId} references non-existent assignment ${trip.assignment_id}`,
        });
      }

      // Metric invariants
      if (trip.actual_distance_km < 0) {
        discrepancies.push({
          domain: "trips",
          category: "metric_invariant_violation",
          entityId: tripId,
          expected: "actual_distance_km >= 0",
          actual: trip.actual_distance_km,
          message: `Trip ${tripId} has negative distance`,
        });
      }

      if (trip.actual_duration_sec < 0) {
        discrepancies.push({
          domain: "trips",
          category: "metric_invariant_violation",
          entityId: tripId,
          expected: "actual_duration_sec >= 0",
          actual: trip.actual_duration_sec,
          message: `Trip ${tripId} has negative duration`,
        });
      }

      if (trip.trip_status === "completed") {
        completedTrips++;
      }

      // Proof bundle verification
      if (trip.proof_required) {
        let hasProof = false;
        for (const pb of store.proofBundles.values()) {
          if (pb.trip_id === tripId) {
            hasProof = true;
            if (trip.proof_status === "verified") {
              proofVerifiedCount++;
            }
            break;
          }
        }
        if (!hasProof) {
          discrepancies.push({
            domain: "trips",
            category: "missing_required_proof",
            entityId: tripId,
            expected: "proof bundle record present",
            actual: "none",
            message: `Trip ${tripId} requires proof but has no proof bundle recorded`,
          });
        }
      }
    }

    return {
      domain: "trips",
      passed: discrepancies.length === 0,
      totalOrders: store.orders.size,
      totalTrips: store.trips.size,
      completedTrips,
      proofVerifiedCount,
      discrepancies,
    };
  }

  /**
   * Reconciles the Billing domain (帳務校核)
   */
  public reconcileBillingDomain(store: IsolatedDataStore): BillingReconciliationResult {
    const discrepancies: ReconciliationDiscrepancy[] = [];
    let totalInvoiceAmount = 0;
    let totalStatementGross = 0;
    let totalStatementNet = 0;

    // 1. Reconcile Tenant Invoices vs Invoice Lines
    for (const [invoiceId, invoice] of store.tenantInvoices.entries()) {
      totalInvoiceAmount += invoice.total_amount;
      const lines = Array.from(store.invoiceLines.values()).filter((l) => l.invoice_id === invoiceId);

      const calculatedTotal = lines.reduce((sum, line) => {
        // Line subtotal sanity check
        const expectedLineTotal = Math.round(line.quantity * line.unit_price * 100) / 100;
        if (Math.abs(line.line_total - expectedLineTotal) > 0.01) {
          discrepancies.push({
            domain: "billing",
            category: "line_total_arithmetic_error",
            entityId: line.invoice_line_id,
            expected: expectedLineTotal,
            actual: line.line_total,
            message: `Invoice line ${line.invoice_line_id} line_total (${line.line_total}) does not match quantity * unit_price (${expectedLineTotal})`,
          });
        }
        return sum + line.line_total;
      }, 0);

      const roundedCalcTotal = Math.round(calculatedTotal * 100) / 100;
      if (Math.abs(invoice.total_amount - roundedCalcTotal) > 0.01) {
        discrepancies.push({
          domain: "billing",
          category: "invoice_total_mismatch",
          entityId: invoiceId,
          expected: roundedCalcTotal,
          actual: invoice.total_amount,
          message: `Tenant invoice ${invoiceId} total_amount (${invoice.total_amount}) does not match sum of lines (${roundedCalcTotal})`,
        });
      }

      // Check currency invariant
      if (invoice.currency_code !== "TWD") {
        discrepancies.push({
          domain: "billing",
          category: "currency_code_violation",
          entityId: invoiceId,
          expected: "TWD",
          actual: invoice.currency_code,
          message: `Tenant invoice ${invoiceId} currency is not standard TWD`,
        });
      }
    }

    // 2. Reconcile Driver Statements
    for (const [statementId, statement] of store.driverStatements.entries()) {
      totalStatementGross += statement.gross_earning;
      totalStatementNet += statement.net_amount;

      // Check net arithmetic: gross - service_fee + subsidy
      const expectedNet = Math.round((statement.gross_earning - statement.service_fee + statement.subsidy_amount) * 100) / 100;
      if (Math.abs(statement.net_amount - expectedNet) > 0.01) {
        discrepancies.push({
          domain: "billing",
          category: "statement_net_arithmetic_error",
          entityId: statementId,
          expected: expectedNet,
          actual: statement.net_amount,
          message: `Driver statement ${statementId} net_amount (${statement.net_amount}) does not equal gross (${statement.gross_earning}) - service_fee (${statement.service_fee}) + subsidy (${statement.subsidy_amount})`,
        });
      }

      // Check statement lines sum
      const lines = Array.from(store.driverStatementLines.values()).filter((l) => l.statement_id === statementId);
      const linesSum = Math.round(lines.reduce((sum, l) => sum + l.amount, 0) * 100) / 100;

      if (lines.length > 0 && Math.abs(statement.net_amount - linesSum) > 0.01) {
        discrepancies.push({
          domain: "billing",
          category: "statement_lines_sum_mismatch",
          entityId: statementId,
          expected: statement.net_amount,
          actual: linesSum,
          message: `Driver statement ${statementId} net_amount (${statement.net_amount}) does not match sum of statement lines (${linesSum})`,
        });
      }
    }

    return {
      domain: "billing",
      passed: discrepancies.length === 0,
      totalInvoices: store.tenantInvoices.size,
      totalStatements: store.driverStatements.size,
      invoiceAmountReconciled: discrepancies.filter((d) => d.category.includes("invoice")).length === 0,
      statementAmountReconciled: discrepancies.filter((d) => d.category.includes("statement")).length === 0,
      totalInvoiceAmount,
      totalStatementGross,
      totalStatementNet,
      discrepancies,
    };
  }

  /**
   * Reconciles the Audit domain (稽核校核)
   */
  public reconcileAuditDomain(store: IsolatedDataStore): AuditReconciliationResult {
    const discrepancies: ReconciliationDiscrepancy[] = [];
    let hashIntegrityVerified = true;

    // 1. Verify Tamper-evident hash integrity of audit log records
    for (const [auditId, auditLog] of store.auditLogs.entries()) {
      const calculatedHash = calculateAuditLogHash(
        auditLog.actor_id,
        auditLog.module_name,
        auditLog.action_name,
        auditLog.resource_id,
        auditLog.created_at,
      );

      if (auditLog.hash_value !== calculatedHash) {
        hashIntegrityVerified = false;
        discrepancies.push({
          domain: "audit",
          category: "tamper_evident_hash_mismatch",
          entityId: auditId,
          expected: calculatedHash,
          actual: auditLog.hash_value,
          message: `Audit log ${auditId} hash_value failed integrity check! Potential record tampering detected.`,
        });
      }
    }

    // 2. Lifecycle Audit Trail Coverage
    // Orders should have order.created audit log
    for (const orderId of store.orders.keys()) {
      const hasCreationAudit = Array.from(store.auditLogs.values()).some(
        (log) => log.resource_id === orderId && log.action_name === "order.created",
      );
      if (!hasCreationAudit) {
        discrepancies.push({
          domain: "audit",
          category: "missing_lifecycle_audit_trail",
          entityId: orderId,
          expected: "order.created audit log record",
          actual: "none",
          message: `Order ${orderId} does not have a corresponding 'order.created' audit record`,
        });
      }
    }

    // Completed trips should have trace logs
    for (const [tripId, trip] of store.trips.entries()) {
      if (trip.trip_status === "completed") {
        const hasTrace = Array.from(store.dispatchTraceLogs.values()).some(
          (t) => t.order_id === trip.order_id && t.event_type === "trip_completed",
        );
        if (!hasTrace) {
          discrepancies.push({
            domain: "audit",
            category: "missing_dispatch_trace",
            entityId: tripId,
            expected: "trip_completed trace log",
            actual: "none",
            message: `Completed trip ${tripId} (order ${trip.order_id}) has no dispatch trace log entry`,
          });
        }
      }
    }

    return {
      domain: "audit",
      passed: discrepancies.length === 0,
      totalAuditLogs: store.auditLogs.size,
      totalTraceLogs: store.dispatchTraceLogs.size,
      hashIntegrityVerified,
      lifecycleCoverageVerified: discrepancies.filter((d) => d.category.includes("missing")).length === 0,
      discrepancies,
    };
  }

  /**
   * Reconciles all three domains and produces a consolidated report
   */
  public reconcileAll(store: IsolatedDataStore): FullReconciliationReport {
    const trips = this.reconcileTripsDomain(store);
    const billing = this.reconcileBillingDomain(store);
    const audit = this.reconcileAuditDomain(store);

    const allDiscrepancies = [
      ...trips.discrepancies,
      ...billing.discrepancies,
      ...audit.discrepancies,
    ];

    return {
      overallPassed: trips.passed && billing.passed && audit.passed,
      timestamp: new Date().toISOString(),
      totalRecordsReconciled: store.totalRecords(),
      trips,
      billing,
      audit,
      allDiscrepancies,
    };
  }
}
