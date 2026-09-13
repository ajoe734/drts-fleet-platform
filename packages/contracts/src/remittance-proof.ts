/**
 * Remittance Proof (Billing & Settlement) — SR-RECOVERY-CONTRACTS-20260911
 *
 * Authority: phase1_prd_detailed_v1.md §9.8.4 (Driver Reimbursement);
 * phase1_service_contracts_v1.md §3.11 (Billing & Settlement Service owns
 * remittance proof and its index). Routed via
 * support/unblock/SR-PROOF-001/SR-PROOF-001-UNBLOCK-PLANNING-DECISION.md.
 *
 * `ReimbursementBatchRecord.remittanceProofId` (see ./index) remains the
 * batch-side foreign reference; this module defines the authoritative proof
 * record it points at, plus the scan, readback and payment-receipt
 * lifecycle that a bare string id cannot express.
 */
import type { MoneyAmount } from ".";

// ===========================================================================
// Content identity — immutable once recorded
// ===========================================================================

/**
 * Server-computed at upload time from the stored bytes. Never accepted from
 * the client and never recomputed afterward — a proof's identity is fixed at
 * the moment it is durably stored.
 */
export interface RemittanceProofContentIdentity {
  /** Lowercase hex digest, e.g. sha256, computed server-side over stored bytes. */
  contentHash: string;
  contentType: string;
  sizeBytes: number;
}

// ===========================================================================
// Scan lifecycle
// ===========================================================================

export const REMITTANCE_PROOF_SCAN_STATES = [
  "pending_scan",
  "clean",
  "rejected",
] as const;
export type RemittanceProofScanState =
  (typeof REMITTANCE_PROOF_SCAN_STATES)[number];

export interface RemittanceProofScanResult {
  proofId: string;
  scanState: Extract<RemittanceProofScanState, "clean" | "rejected">;
  scanCompletedAt: string;
  /** Required when scanState is "rejected"; null otherwise. */
  rejectionReason: string | null;
}

// ===========================================================================
// Proof record
// ===========================================================================

export interface RemittanceProofRecord {
  /** Server-generated (e.g. uuid); never client-supplied. */
  proofId: string;
  batchId: string;
  /** Denormalised at upload time from the batch for ownership checks without a join. */
  driverId: string;
  uploadedByActorId: string | null;
  originalFilename: string;
  content: RemittanceProofContentIdentity;
  scanState: RemittanceProofScanState;
  scanCompletedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

export interface UploadRemittanceProofCommand {
  batchId: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  /** Opaque reference into the storage adapter's staged upload; not the raw bytes. */
  stagedContentRef: string;
}

// ===========================================================================
// Authorized, expiring readback
// ===========================================================================

export interface RequestRemittanceProofReadbackCommand {
  proofId: string;
}

/**
 * A short-lived, single-purpose authorization to fetch the stored bytes.
 * `readbackUrl` is meaningless after `expiresAt`; callers must re-request.
 */
export interface RemittanceProofReadbackGrant {
  proofId: string;
  readbackUrl: string;
  expiresAt: string;
  issuedAt: string;
}

// ===========================================================================
// Durable, idempotent payment receipt
// ===========================================================================

/**
 * `markReimbursementPaid` must be gated on an approved batch
 * (`ReimbursementBatchRecord.approvedAt` set) and a `clean`-scanned proof
 * belonging to that same batch; a receipt is the durable, idempotent record
 * of that transition. Replaying the same `idempotencyKey` for a batch that
 * is already paid returns the original receipt rather than creating a
 * second one or erroring.
 */
export interface RemittanceProofPaymentReceipt {
  receiptId: string;
  batchId: string;
  proofId: string;
  idempotencyKey: string;
  driverId: string;
  amount: MoneyAmount;
  paidAt: string;
  createdAt: string;
}

export interface MarkReimbursementPaidWithProofCommand {
  batchId: string;
  proofId: string;
  idempotencyKey: string;
  paidAt?: string;
}

export const REMITTANCE_PROOF_ERROR_CODES = [
  "REMITTANCE_PROOF_BATCH_NOT_APPROVED",
  "REMITTANCE_PROOF_NOT_FOUND",
  "REMITTANCE_PROOF_BATCH_MISMATCH",
  "REMITTANCE_PROOF_NOT_CLEAN",
  "REMITTANCE_PROOF_READBACK_EXPIRED",
] as const;
export type RemittanceProofErrorCode =
  (typeof REMITTANCE_PROOF_ERROR_CODES)[number];
