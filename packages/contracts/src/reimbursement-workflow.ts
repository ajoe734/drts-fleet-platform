/**
 * Reimbursement Batch Workflow (Billing & Settlement) —
 * REIMBURSEMENT-BATCH-EXPORT-RECONCILIATION-20261015
 *
 * Authority: Q-ADM12 (`docs/05-ui/system-design-answers-all-apps-20260524.md`)
 * draft -> pending_approval -> approved -> exported -> paid -> reconciled;
 * UI17 handoff §5.12-5.13 (signed batch export, manual mark-reconciled).
 *
 * This is the batch-owned signed artifact export and the explicit manual
 * paid -> reconciled transition. Neither is the driver remittance-proof
 * upload/payment rail defined in `./remittance-proof` -- that module's
 * `RemittanceProofRecord`/`MarkReimbursementPaidWithProofCommand` remain the
 * authority for the driver's own bank-transfer evidence and the
 * pending/paid payment gate. `ReimbursementBatchRecord.status` (see
 * `./index`) stays the shared `DriverPayoutStatus` union; this module's
 * receipts bind to `ReimbursementBatchRecord.workflowState` instead.
 */
import type { ControlledDownloadRecord } from ".";

// ===========================================================================
// Signed batch export
// ===========================================================================

/**
 * Durable, replayable record of one export of a batch's canonical snapshot.
 * `download.manifestHash` is permanent once first issued -- a later call
 * reissues only the signature/expiry window over the same hash (see
 * `BillingSettlementService.exportReimbursementBatch`), never re-renders
 * different bytes for an already-exported batch.
 */
export interface ReimbursementBatchExportReceipt {
  receiptId: string;
  batchId: string;
  exportedAt: string;
  exportedByActorId: string | null;
  manifestHash: string;
  download: ControlledDownloadRecord;
  createdAt: string;
}

// ===========================================================================
// Explicit manual reconciliation
// ===========================================================================

export interface MarkReimbursementBatchReconciledCommand {
  /** Non-empty, trimmed; the finance actor's stated reason for this batch. */
  reason: string;
  /** Optional free-form reference to supporting evidence (e.g. a bank statement id). */
  evidenceRef?: string | null;
}

/**
 * Durable record of the manual paid -> reconciled transition. Idempotent by
 * batch, not by a client-supplied key: a batch reconciles at most once, and
 * a repeat call (any reason text) returns this same receipt rather than
 * creating a second one or overwriting the first actor/time/reason.
 */
export interface ReimbursementBatchReconciliationReceipt {
  receiptId: string;
  batchId: string;
  reconciledAt: string;
  reconciledByActorId: string | null;
  reason: string;
  evidenceRef: string | null;
  createdAt: string;
}

export const REIMBURSEMENT_BATCH_WORKFLOW_ERROR_CODES = [
  "REIMBURSEMENT_BATCH_NOT_APPROVED_FOR_EXPORT",
  "REIMBURSEMENT_BATCH_NOT_PAID_FOR_RECONCILIATION",
  "REIMBURSEMENT_BATCH_RECONCILIATION_REASON_REQUIRED",
] as const;
export type ReimbursementBatchWorkflowErrorCode =
  (typeof REIMBURSEMENT_BATCH_WORKFLOW_ERROR_CODES)[number];
