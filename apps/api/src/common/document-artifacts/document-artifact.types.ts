import type { DocumentArtifactKind } from "./document-artifact-kinds";

/**
 * What the store knows about one materialised file, independent of any
 * controlled-download link that happens to point at it. A link can be
 * reissued at will; this record -- and the bytes beside it -- does not
 * change as a result. That separation is what lets the controller tell
 * "expired link" apart from "the file itself changed underneath a live
 * link", instead of conflating the two into one signature check.
 */
export interface DocumentArtifactRecord {
  kind: DocumentArtifactKind;
  subjectId: string;
  mimeType: string;
  sha256: string;
  byteLength: number;
  storedAt: string;
}

export interface DocumentArtifactEntry {
  record: DocumentArtifactRecord;
  bytes: Buffer;
}

export interface PutDocumentArtifactCommand {
  kind: DocumentArtifactKind;
  subjectId: string;
  mimeType: string;
  bytes: Buffer;
}

export interface PutIfAbsentDocumentArtifactResult {
  record: DocumentArtifactRecord;
  /**
   * `true` when this call's own bytes were the ones actually stored.
   * `false` means a concurrent writer's object was already there --
   * `record` describes THAT object, not the bytes this call offered, and
   * nothing was overwritten.
   */
  created: boolean;
}

/**
 * The read/write seam producers (tenant invoice, placard, report generation)
 * and `ControlledDownloadController` share. Both `put`/`get` are async: the
 * durable adapter (`S3DocumentArtifactStoreAdapter`) talks to real object
 * storage over the network, and the in-process adapter
 * (`InMemoryDocumentArtifactStore`) implements the same async signature so
 * every caller goes through one seam regardless of which backend is wired in
 * via `DOCUMENT_ARTIFACT_STORE`.
 */
export interface DocumentArtifactStore {
  put(command: PutDocumentArtifactCommand): Promise<DocumentArtifactRecord>;
  /**
   * A conditional create: writes `command`'s bytes only when nothing exists
   * yet at this (kind, subjectId). Used by the controlled-download recovery
   * path (never by a producer's own explicit issuance/republish), where an
   * unconditional `put` could race a sibling instance's own concurrent
   * recovery of a genuinely good, still-existing object and overwrite it
   * with independently re-derived bytes. When the object already exists --
   * whether from a concurrent winner or because it was never actually
   * missing -- this returns that existing record with `created: false`
   * instead of touching the store.
   */
  putIfAbsent(
    command: PutDocumentArtifactCommand,
  ): Promise<PutIfAbsentDocumentArtifactResult>;
  get(
    kind: DocumentArtifactKind,
    subjectId: string,
  ): Promise<DocumentArtifactEntry | null>;
}

export const DOCUMENT_ARTIFACT_STORE = Symbol("DOCUMENT_ARTIFACT_STORE");
