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

/**
 * The read/write seam producers (tenant invoice, placard, report generation)
 * and `ControlledDownloadController` share. Both methods are synchronous by
 * design: the only adapter this task ships is the in-process local one, so a
 * durable/shared backing (S3, a filesystem volume, ...) is deliberately left
 * for whichever task wires a real producer -- swapping the adapter only
 * requires implementing this same interface.
 */
export interface DocumentArtifactStore {
  put(command: PutDocumentArtifactCommand): DocumentArtifactRecord;
  get(kind: DocumentArtifactKind, subjectId: string): DocumentArtifactEntry | null;
}

export const DOCUMENT_ARTIFACT_STORE = Symbol("DOCUMENT_ARTIFACT_STORE");
