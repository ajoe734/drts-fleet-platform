import { createHash, randomUUID } from "node:crypto";

import type {
  CommitRemittanceProofContentCommand,
  CommittedRemittanceProofContent,
  ReadRemittanceProofContent,
  RemittanceProofStorageProvider,
  StageRemittanceProofContentCommand,
  StagedRemittanceProofContent,
} from "./remittance-proof-storage.port";

interface StagedEntry {
  bytes: Buffer;
  contentType: string;
}

/**
 * The default, always-available adapter for `RemittanceProofStorageProvider`:
 * an in-process map, the same durability posture as
 * `InMemoryDocumentArtifactStore` (`../../common/document-artifacts`) --
 * real bytes, real sha256 identity, but not durable across process
 * restarts. A production deployment wanting durable object storage would
 * implement this same interface against a real backend (following
 * `S3DriverSosAttachmentStorageAdapter`'s precedent in
 * `../driver-sos/s3-driver-sos-attachment-storage.adapter.ts`); that
 * adapter is out of this task's write_scopes.
 *
 * Every read copies its buffer, so a caller mutating a returned buffer can
 * never reach in and rewrite what is "on disk".
 */
export class InMemoryRemittanceProofStorageAdapter
  implements RemittanceProofStorageProvider
{
  readonly providerName = "in-memory-remittance-proof-storage";

  private readonly staged = new Map<string, StagedEntry>();
  private readonly committed = new Map<
    string,
    CommittedRemittanceProofContent & { bytes: Buffer }
  >();

  availability() {
    return { state: "available" as const };
  }

  async stage(
    command: StageRemittanceProofContentCommand,
  ): Promise<StagedRemittanceProofContent> {
    if (!Buffer.isBuffer(command.bytes) || command.bytes.length === 0) {
      throw new Error(
        "RemittanceProofStorageProvider.stage requires non-empty bytes.",
      );
    }
    const contentType = command.contentType?.trim();
    if (!contentType) {
      throw new Error(
        "RemittanceProofStorageProvider.stage requires a non-empty contentType.",
      );
    }

    const stagedContentRef = `staged-remittance-proof-${randomUUID()}`;
    this.staged.set(stagedContentRef, {
      bytes: Buffer.from(command.bytes),
      contentType,
    });
    return { stagedContentRef };
  }

  async commit(
    command: CommitRemittanceProofContentCommand,
  ): Promise<CommittedRemittanceProofContent> {
    const proofId = command.proofId?.trim();
    if (!proofId) {
      throw new Error(
        "RemittanceProofStorageProvider.commit requires a non-empty proofId.",
      );
    }
    const entry = this.staged.get(command.stagedContentRef);
    if (!entry) {
      throw new Error(
        `RemittanceProofStorageProvider.commit: stagedContentRef "${command.stagedContentRef}" ` +
          "was not found. It may already have been committed, or was never staged.",
      );
    }
    // Single-use: a stagedContentRef cannot be replayed into a second proof.
    this.staged.delete(command.stagedContentRef);

    const record: CommittedRemittanceProofContent = {
      contentHash: createHash("sha256").update(entry.bytes).digest("hex"),
      contentType: entry.contentType,
      sizeBytes: entry.bytes.length,
    };
    this.committed.set(proofId, { ...record, bytes: entry.bytes });
    return record;
  }

  async read(proofId: string): Promise<ReadRemittanceProofContent | null> {
    const entry = this.committed.get(proofId);
    if (!entry) {
      return null;
    }
    return {
      bytes: Buffer.from(entry.bytes),
      contentType: entry.contentType,
    };
  }
}
