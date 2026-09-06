import { createHash } from "node:crypto";

import { isDocumentArtifactKind } from "./document-artifact-kinds";
import type { DocumentArtifactKind } from "./document-artifact-kinds";
import type {
  DocumentArtifactEntry,
  DocumentArtifactRecord,
  DocumentArtifactStore,
  PutDocumentArtifactCommand,
} from "./document-artifact.types";

function storageKey(kind: string, subjectId: string): string {
  return `${kind}::${subjectId}`;
}

/**
 * The local adapter for `DocumentArtifactStore`: an in-process map, keyed by
 * the exact (kind, subjectId) pair. It is the default wherever the platform
 * runs -- app boot and isolated tests alike -- until a task that produces
 * real files wires a durable backing behind the same interface.
 *
 * Every read and write copies its buffer. Nothing handed to `put` or
 * returned from `get` aliases the store's internal bytes, so a caller
 * mutating either side can never reach in and silently rewrite what is
 * "on disk" -- reissuing a link must never change the file it names.
 */
export class InMemoryDocumentArtifactStore implements DocumentArtifactStore {
  private readonly entries = new Map<string, DocumentArtifactEntry>();

  put(command: PutDocumentArtifactCommand): DocumentArtifactRecord {
    if (!isDocumentArtifactKind(command.kind)) {
      throw new Error(
        `DocumentArtifactStore does not accept kind "${command.kind}". ` +
          "Only tenant-invoice, placard, and report are in scope this period.",
      );
    }
    const subjectId = command.subjectId?.trim();
    if (!subjectId) {
      throw new Error("DocumentArtifactStore.put requires a non-empty subjectId.");
    }
    const mimeType = command.mimeType?.trim();
    if (!mimeType) {
      throw new Error("DocumentArtifactStore.put requires a non-empty mimeType.");
    }
    if (!Buffer.isBuffer(command.bytes) || command.bytes.length === 0) {
      throw new Error("DocumentArtifactStore.put requires non-empty bytes.");
    }

    const bytes = Buffer.from(command.bytes);
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

  get(
    kind: DocumentArtifactKind,
    subjectId: string,
  ): DocumentArtifactEntry | null {
    const entry = this.entries.get(storageKey(kind, subjectId));
    if (!entry) {
      return null;
    }
    return {
      record: { ...entry.record },
      bytes: Buffer.from(entry.bytes),
    };
  }
}
