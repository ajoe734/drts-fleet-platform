import { createHash } from "node:crypto";

import type { DocumentArtifactKind } from "./document-artifact-kinds";
import type {
  DocumentArtifactEntry,
  DocumentArtifactRecord,
  DocumentArtifactStore,
  PutDocumentArtifactCommand,
  PutIfAbsentDocumentArtifactResult,
} from "./document-artifact.types";
import { validatePutDocumentArtifactCommand } from "./document-artifact-validation";

function storageKey(kind: string, subjectId: string): string {
  return `${kind}::${subjectId}`;
}

/**
 * The local, process-private adapter for `DocumentArtifactStore`: an
 * in-process map, keyed by the exact (kind, subjectId) pair. It is the
 * default for isolated unit tests and (via `DOCUMENT_ARTIFACT_STORAGE_PROVIDER
 * = "memory"`) `NODE_ENV=test` runs; a production boot wires
 * `S3DocumentArtifactStoreAdapter` instead (see
 * `document-artifact-runtime.config.ts`) so bytes survive a restart and are
 * visible to every Cloud Run instance, not just the one that rendered them.
 *
 * Every read and write copies its buffer. Nothing handed to `put` or
 * returned from `get` aliases the store's internal bytes, so a caller
 * mutating either side can never reach in and silently rewrite what is
 * "on disk" -- reissuing a link must never change the file it names.
 */
export class InMemoryDocumentArtifactStore implements DocumentArtifactStore {
  private readonly entries = new Map<string, DocumentArtifactEntry>();

  async put(
    command: PutDocumentArtifactCommand,
  ): Promise<DocumentArtifactRecord> {
    const { subjectId, mimeType, bytes } =
      validatePutDocumentArtifactCommand(command);

    const record: DocumentArtifactRecord = {
      kind: command.kind,
      subjectId,
      mimeType,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      byteLength: bytes.length,
      storedAt: new Date().toISOString(),
    };

    this.entries.set(storageKey(command.kind, subjectId), {
      record,
      bytes,
    });

    return { ...record };
  }

  async get(
    kind: DocumentArtifactKind,
    subjectId: string,
  ): Promise<DocumentArtifactEntry | null> {
    const entry = this.entries.get(storageKey(kind, subjectId));
    if (!entry) {
      return null;
    }
    return {
      record: { ...entry.record },
      bytes: Buffer.from(entry.bytes),
    };
  }

  /**
   * No `await` separates the existence check from the write below, so --
   * exactly like the real `IfNoneMatch: "*"` conditional `PutObject` this
   * models -- nothing can observably interleave between them in this
   * process; the in-process analogue of the same atomicity guarantee.
   */
  async putIfAbsent(
    command: PutDocumentArtifactCommand,
  ): Promise<PutIfAbsentDocumentArtifactResult> {
    const { subjectId, mimeType, bytes } =
      validatePutDocumentArtifactCommand(command);
    const existingKey = storageKey(command.kind, subjectId);
    const existing = this.entries.get(existingKey);
    if (existing) {
      return { created: false, record: { ...existing.record } };
    }

    const record: DocumentArtifactRecord = {
      kind: command.kind,
      subjectId,
      mimeType,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      byteLength: bytes.length,
      storedAt: new Date().toISOString(),
    };
    this.entries.set(existingKey, { record, bytes });
    return { created: true, record: { ...record } };
  }
}
