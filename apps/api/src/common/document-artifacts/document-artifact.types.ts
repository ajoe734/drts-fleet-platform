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
  /**
   * Opaque fencing token for this exact object state -- an S3 ETag in the
   * durable adapter, a synthetic per-write id in the in-memory adapter.
   * Compare only for equality (see `putIfUnchanged`'s `expectedGeneration`);
   * never parse it or derive meaning from its value or format.
   */
  generation: string;
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

export type PutIfUnchangedDocumentArtifactResult =
  | { applied: true; record: DocumentArtifactRecord }
  | { applied: false; record: DocumentArtifactRecord | null };

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
  /**
   * Conditional overwrite fenced by object state, not caller identity:
   * writes only when the object's CURRENT generation still equals
   * `expectedGeneration` (or the object is still absent, when
   * `expectedGeneration` is `null`). A writer that captured its baseline
   * generation right after winning some other, caller-level ownership
   * fence (e.g. a database publish claim) -- then rendered and attempted
   * this write, possibly much later if its own request stalled in
   * transit -- cannot silently replace bytes a different, legitimate
   * writer already stored in between: `applied: false` means exactly that
   * happened, and `record` is whatever now actually exists (or `null`, if
   * even that could not be re-resolved) for the caller to adopt instead of
   * trusting its own unwritten render.
   */
  putIfUnchanged(
    command: PutDocumentArtifactCommand,
    expectedGeneration: string | null,
  ): Promise<PutIfUnchangedDocumentArtifactResult>;
  get(
    kind: DocumentArtifactKind,
    subjectId: string,
  ): Promise<DocumentArtifactEntry | null>;
}

export const DOCUMENT_ARTIFACT_STORE = Symbol("DOCUMENT_ARTIFACT_STORE");
