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
 * and `ControlledDownloadController` share. Both methods are async: the
 * durable adapter (`S3DocumentArtifactStoreAdapter`) talks to real object
 * storage over the network, and the in-process adapter
 * (`InMemoryDocumentArtifactStore`) implements the same async signature so
 * every caller goes through one seam regardless of which backend is wired in
 * via `DOCUMENT_ARTIFACT_STORE`.
 */
export interface DocumentArtifactStore {
  put(command: PutDocumentArtifactCommand): Promise<DocumentArtifactRecord>;
  get(
    kind: DocumentArtifactKind,
    subjectId: string,
  ): Promise<DocumentArtifactEntry | null>;
}

export const DOCUMENT_ARTIFACT_STORE = Symbol("DOCUMENT_ARTIFACT_STORE");
