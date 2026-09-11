import type { RemittanceProofScanState } from "@drts/contracts";

export const REMITTANCE_PROOF_SCANNER = Symbol("REMITTANCE_PROOF_SCANNER");

export type RemittanceProofScannerAvailability =
  | { state: "available" }
  | { state: "unavailable"; reason: string };

export interface RemittanceProofScanInput {
  proofId: string;
  contentHash: string;
  contentType: string;
  sizeBytes: number;
}

export interface RemittanceProofScanOutcome {
  scanState: Extract<RemittanceProofScanState, "clean" | "rejected">;
  /** Required when scanState is "rejected"; null when "clean". */
  rejectionReason: string | null;
  scanCompletedAt: string;
}

/**
 * A newly uploaded proof's scan state is always `pending_scan`
 * (`packages/contracts/src/remittance-proof.ts`); nothing transitions it to
 * `clean` or `rejected` except a real scan outcome recorded through this
 * port. No code path may fabricate `clean` to unblock `markPaid` -- see
 * `UnprovisionedRemittanceProofScannerAdapter` below, this module's
 * fail-closed default.
 */
export interface RemittanceProofScannerPort {
  readonly providerName: string;
  availability(): RemittanceProofScannerAvailability;
  scan(input: RemittanceProofScanInput): Promise<RemittanceProofScanOutcome>;
}
