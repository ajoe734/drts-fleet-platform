/**
 * Task-local adapter for the C080 batch export / manual reconciliation
 * commands. `@drts/api-client` (`ApiClient`) is a shared SDK this task does
 * not own; this file calls its already-public generic `post()` directly
 * against the real Billing routes instead of adding methods there.
 */
import type { ApiClient } from "@drts/api-client";
import type {
  MarkReimbursementBatchReconciledCommand,
  ReimbursementBatchExportReceipt,
  ReimbursementBatchReconciliationReceipt,
} from "@drts/contracts";

export async function exportReimbursementBatch(
  client: ApiClient,
  batchId: string,
  options: { idempotencyKey: string },
): Promise<ReimbursementBatchExportReceipt> {
  return client.post<ReimbursementBatchExportReceipt>(
    `/api/reimbursements/${encodeURIComponent(batchId)}/export`,
    { idempotencyKey: options.idempotencyKey },
  );
}

export async function markReimbursementBatchReconciled(
  client: ApiClient,
  batchId: string,
  command: MarkReimbursementBatchReconciledCommand,
  options: { idempotencyKey: string },
): Promise<ReimbursementBatchReconciliationReceipt> {
  return client.post<ReimbursementBatchReconciliationReceipt>(
    `/api/reimbursements/${encodeURIComponent(batchId)}/reconcile`,
    { body: command, idempotencyKey: options.idempotencyKey },
  );
}
