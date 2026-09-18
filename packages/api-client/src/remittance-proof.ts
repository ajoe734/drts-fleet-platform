/**
 * Remittance Proof — SR-RECOVERY-CONTRACTS-20260911: Typed API Client Extension
 *
 * Provides typed re-exports and functional adapter wrappers for the proof
 * upload/scan-readback/idempotent-payment-receipt methods implemented
 * directly on `ApiClient` in ./index.
 *
 * Authority: docs/04-uat/system-remediation-20260906/SR-RECOVERY-CONTRACTS-20260911.md
 */

import type {
  MarkReimbursementPaidWithProofCommand,
  RemittanceProofPaymentReceipt,
  RemittanceProofReadbackGrant,
  RemittanceProofRecord,
  RequestRemittanceProofReadbackCommand,
  UploadRemittanceProofCommand,
} from "@drts/contracts";
import type { ApiClient, RequestOptions } from "./index";

export type {
  MarkReimbursementPaidWithProofCommand,
  RemittanceProofContentIdentity,
  RemittanceProofErrorCode,
  RemittanceProofPaymentReceipt,
  RemittanceProofReadbackGrant,
  RemittanceProofRecord,
  RemittanceProofScanResult,
  RemittanceProofScanState,
  RequestRemittanceProofReadbackCommand,
  UploadRemittanceProofCommand,
} from "@drts/contracts";

export { REMITTANCE_PROOF_ERROR_CODES, REMITTANCE_PROOF_SCAN_STATES } from "@drts/contracts";

export interface RemittanceProofClientInterface {
  uploadRemittanceProof(
    command: UploadRemittanceProofCommand,
    options?: RequestOptions,
  ): Promise<RemittanceProofRecord>;
  getRemittanceProof(
    proofId: string,
    options?: RequestOptions,
  ): Promise<RemittanceProofRecord>;
  requestRemittanceProofReadback(
    command: RequestRemittanceProofReadbackCommand,
    options?: RequestOptions,
  ): Promise<RemittanceProofReadbackGrant>;
  markReimbursementPaidWithProof(
    command: MarkReimbursementPaidWithProofCommand,
    options?: RequestOptions,
  ): Promise<RemittanceProofPaymentReceipt>;
}

/**
 * Functional adapter functions allowing modular invocation over any ApiClient instance.
 */
export async function uploadRemittanceProof(
  client: ApiClient,
  command: UploadRemittanceProofCommand,
  options?: RequestOptions,
): Promise<RemittanceProofRecord> {
  return client.uploadRemittanceProof(command, options);
}

export async function getRemittanceProof(
  client: ApiClient,
  proofId: string,
  options?: RequestOptions,
): Promise<RemittanceProofRecord> {
  return client.getRemittanceProof(proofId, options);
}

export async function requestRemittanceProofReadback(
  client: ApiClient,
  command: RequestRemittanceProofReadbackCommand,
  options?: RequestOptions,
): Promise<RemittanceProofReadbackGrant> {
  return client.requestRemittanceProofReadback(command, options);
}

export async function markReimbursementPaidWithProof(
  client: ApiClient,
  command: MarkReimbursementPaidWithProofCommand,
  options?: RequestOptions,
): Promise<RemittanceProofPaymentReceipt> {
  return client.markReimbursementPaidWithProof(command, options);
}
