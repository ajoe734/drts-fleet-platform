/**
 * Task-local adapter for the finance-only remittance-proof
 * staged-content/upload routes (REMITTANCE-FINANCE-PROOF-UPLOAD-FLOW-20261015).
 * `@drts/api-client` (`ApiClient`) is a shared SDK this task does not own;
 * this file calls its already-public generic `post()` directly against the
 * real Billing routes instead of adding methods there -- the same pattern
 * `../reimbursement-workflow-client.ts` uses for the C080 export/reconcile
 * commands.
 */
import type { ApiClient } from "@drts/api-client";
import type {
  RemittanceProofRecord,
  UploadRemittanceProofCommand,
} from "@drts/contracts";

export async function financeStageRemittanceProofContent(
  client: ApiClient,
  input: { contentBase64: string; contentType: string },
  options: { idempotencyKey: string },
): Promise<{ stagedContentRef: string }> {
  return client.post<{ stagedContentRef: string }>(
    "/api/reimbursements/proofs/finance-staged-content",
    { body: input, idempotencyKey: options.idempotencyKey },
  );
}

export async function financeUploadRemittanceProof(
  client: ApiClient,
  command: UploadRemittanceProofCommand,
  options: { idempotencyKey: string },
): Promise<RemittanceProofRecord> {
  return client.post<RemittanceProofRecord>(
    "/api/reimbursements/proofs/finance-upload",
    { body: command, idempotencyKey: options.idempotencyKey },
  );
}
