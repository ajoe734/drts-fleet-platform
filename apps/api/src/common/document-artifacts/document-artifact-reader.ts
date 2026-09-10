import { isDocumentArtifactKind } from "./document-artifact-kinds";
import type { DocumentArtifactStore } from "./document-artifact.types";

export interface ResolveDocumentArtifactInput {
  kind: string;
  subjectId: string;
  /** The manifest hash a verified, unexpired controlled-download link carries. */
  manifestHash: string;
}

export type DocumentArtifactResolution =
  | { status: "not_found" }
  | {
      status: "content_mismatch";
      expectedSha256: string;
      actualSha256: string;
    }
  | {
      status: "ok";
      bytes: Buffer;
      mimeType: string;
      sha256: string;
      byteLength: number;
    };

/**
 * The read port `ControlledDownloadController` calls once a link's signature
 * and expiry have already checked out. A verified, unexpired signature is
 * necessary but not sufficient to hand back bytes: it only proves the link
 * was genuinely issued for this (kind, subjectId, manifestHash) tuple, not
 * that a matching, unaltered file still exists behind it.
 *
 * Two independent failures collapse into "not_found" here on purpose:
 * an unsupported kind (out of this store's scope) and a kind/subjectId pair
 * that was simply never materialised. Neither should tell an already-verified
 * caller anything about which subject ids exist for a *different* kind --
 * the composite key means a lookup under the wrong kind never sees the
 * artifact stored under the right one, and the not-found response reads
 * identically either way.
 *
 * A resolved entry whose stored sha256 no longer matches the link's
 * manifestHash is reported separately as "content_mismatch", not served and
 * not silently treated as not_found: the artifact exists, but the link no
 * longer names it faithfully (the file was regenerated, or the link was
 * tampered with), and a caller re-requesting a fresh link is the correct next
 * step, not indistinguishable "never produced" language.
 */
export function resolveDocumentArtifact(
  store: DocumentArtifactStore,
  input: ResolveDocumentArtifactInput,
): DocumentArtifactResolution {
  if (!isDocumentArtifactKind(input.kind)) {
    return { status: "not_found" };
  }

  const entry = store.get(input.kind, input.subjectId);
  if (!entry) {
    return { status: "not_found" };
  }

  if (entry.record.sha256 !== input.manifestHash) {
    return {
      status: "content_mismatch",
      expectedSha256: input.manifestHash,
      actualSha256: entry.record.sha256,
    };
  }

  return {
    status: "ok",
    bytes: entry.bytes,
    mimeType: entry.record.mimeType,
    sha256: entry.record.sha256,
    byteLength: entry.record.byteLength,
  };
}
