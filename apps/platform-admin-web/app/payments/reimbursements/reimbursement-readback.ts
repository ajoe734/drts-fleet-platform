import type { MoneyAmount, ReimbursementBatchRecord } from "@drts/contracts";

export const REIMBURSEMENT_WORKFLOW_STEPS = [
  "draft",
  "pending_approval",
  "approved",
  "exported",
  "paid",
  "reconciled",
] as const;

export type ReimbursementWorkflowState =
  (typeof REIMBURSEMENT_WORKFLOW_STEPS)[number];

export type ReimbursementBatchReadbackSource = ReimbursementBatchRecord & {
  reconciledAt?: string | null;
  reconciliationReceiptId?: string | null;
  workflowState?: ReimbursementWorkflowState | null;
};

/**
 * Formats canonical MoneyAmount integer minor units (e.g. NTD cents) into
 * two-decimal major units while preserving currency code, signs, and null
 * fallback ("—"). Does not alter canonical integer amounts or apply fee/rounding
 * policy changes.
 */
export function formatReimbursementMoney(
  amount?: Pick<MoneyAmount, "amountMinor" | "currency"> | null,
): string {
  if (
    !amount ||
    typeof amount.amountMinor !== "number" ||
    !Number.isFinite(amount.amountMinor)
  ) {
    return "—";
  }

  const sign = amount.amountMinor < 0 ? "-" : "";
  const absMinor = Math.abs(Math.trunc(amount.amountMinor));
  const whole = Math.floor(absMinor / 100);
  const cents = String(absMinor % 100).padStart(2, "0");
  return `${sign}${whole}.${cents} ${amount.currency}`;
}

export function hasAuthoritativeReconciliationState(
  batch: ReimbursementBatchReadbackSource,
): boolean {
  if (batch.workflowState === "reconciled") {
    return true;
  }
  if (
    typeof batch.reconciledAt === "string" &&
    batch.reconciledAt.trim().length > 0
  ) {
    return true;
  }
  if (
    typeof batch.reconciliationReceiptId === "string" &&
    batch.reconciliationReceiptId.trim().length > 0
  ) {
    return true;
  }
  return false;
}

/**
 * Derives the canonical workflow state for both the reimbursement queue and
 * batch detail view. A paid batch stays "paid" regardless of wall-clock age
 * unless an explicit authoritative reconciliation record/state is present.
 */
export function deriveReimbursementWorkflowState(
  batch: ReimbursementBatchReadbackSource,
): ReimbursementWorkflowState {
  if (batch.status === "paid") {
    return hasAuthoritativeReconciliationState(batch) ? "reconciled" : "paid";
  }

  if (!batch.approvedAt) {
    return batch.items.length === 0 ? "draft" : "pending_approval";
  }

  if (batch.remittanceProofId) {
    return "exported";
  }

  return "approved";
}
