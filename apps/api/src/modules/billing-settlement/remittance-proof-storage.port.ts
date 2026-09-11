/**
 * Remittance Proof storage seam (SR-PROOF-001).
 *
 * Deliberately narrower than the shared `DocumentArtifactStore`
 * (`../../common/document-artifacts`): that store's accepted kinds are a
 * fixed enum (`document-artifact-kinds.ts`), which SR-PROOF-001's
 * write_scopes does not include -- widening it to add a "remittance-proof"
 * kind is out of scope. This module owns its own read/write seam instead,
 * following the same two-method (`put`-like / `get`) shape.
 */
export const REMITTANCE_PROOF_STORAGE = Symbol("REMITTANCE_PROOF_STORAGE");

export type RemittanceProofStorageAvailability =
  | { state: "available" }
  | { state: "unavailable"; reason: string };

export interface StageRemittanceProofContentCommand {
  bytes: Buffer;
  contentType: string;
}

export interface StagedRemittanceProofContent {
  stagedContentRef: string;
}

export interface CommitRemittanceProofContentCommand {
  proofId: string;
  stagedContentRef: string;
}

/**
 * Server-computed from the actual staged bytes at commit time -- never
 * trusted from whatever `contentType`/`sizeBytes` a caller declared on the
 * upload command.
 */
export interface CommittedRemittanceProofContent {
  contentHash: string;
  contentType: string;
  sizeBytes: number;
}

export interface ReadRemittanceProofContent {
  bytes: Buffer;
  contentType: string;
}

/**
 * The read/write seam `RemittanceProofService` uses to hold proof bytes.
 *
 * Upload is two-phase (`stage` then `commit`) so the identity computed by
 * `commit` is always over bytes the storage adapter itself received, not a
 * client-declared hash -- the same non-trust shape as
 * `S3DriverSosAttachmentStorageAdapter.inspectUploadedObject` in
 * `../driver-sos/s3-driver-sos-attachment-storage.adapter.ts`. A
 * `stagedContentRef` is consumed exactly once by `commit`; committing twice
 * with the same ref fails rather than silently duplicating content.
 */
export interface RemittanceProofStorageProvider {
  readonly providerName: string;
  availability(): RemittanceProofStorageAvailability;
  stage(
    command: StageRemittanceProofContentCommand,
  ): Promise<StagedRemittanceProofContent>;
  commit(
    command: CommitRemittanceProofContentCommand,
  ): Promise<CommittedRemittanceProofContent>;
  read(proofId: string): Promise<ReadRemittanceProofContent | null>;
}
