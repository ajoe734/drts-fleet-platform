import type { DocumentArtifactKind } from "./document-artifact-kinds";
import type { DocumentArtifactRecord } from "./document-artifact.types";

/**
 * Deterministically re-derives the exact bytes a producer already issued
 * for one (kind, subjectId), from that producer's own durably persisted
 * source record (e.g. an invoice's line items), and stores the result back
 * into `DocumentArtifactStore` before returning it. Returns null when this
 * producer's own source data has no such subjectId -- which is a genuine
 * "never produced" case, not a failure to rebuild.
 *
 * `expectedSha256`, when the caller supplies one (a verified link's own
 * manifest hash), asks the producer for exactly THAT publication's bytes,
 * never a re-derivation from whatever current state looks like now -- see
 * `PlatformAdminService`'s own registration for why this distinction
 * matters (R10-E/R10-F): a producer's own durable, content-addressed
 * backup of an already-issued publication can restore it unchanged even
 * after a legitimate later source mutation would make re-deriving it
 * produce different bytes. A producer that has no such notion simply
 * ignores the second argument and behaves exactly as before.
 */
export type DocumentArtifactRebuilder = (
  subjectId: string,
  expectedSha256?: string,
) => Promise<DocumentArtifactRecord | null>;

export const DOCUMENT_ARTIFACT_REBUILD_REGISTRY = Symbol(
  "DOCUMENT_ARTIFACT_REBUILD_REGISTRY",
);

/**
 * `DocumentArtifactStore` is now a durable, shared backend (see
 * `document-artifact-runtime.config.ts`), so this registry is no longer the
 * primary way a sibling Cloud Run instance or a post-restart instance serves
 * a verified, unexpired link -- the shared store itself does that directly.
 * This remains the last-resort fallback for the genuine data-gap case: the
 * durable store has actually lost the object behind a (kind, subjectId) that
 * a verified, unexpired link still names. It asks the producer to re-render
 * the same bytes from the source record it already persists durably and
 * reads on every instance, then lets the caller re-check the result against
 * the link's manifest hash before trusting it.
 *
 * A kind with no registered rebuilder (or a rebuilder that returns null)
 * behaves exactly as it did before this registry existed: "not found" is
 * still "not found", not reinterpreted as "rebuild failed".
 */
export class DocumentArtifactRebuildRegistry {
  private readonly rebuilders = new Map<string, DocumentArtifactRebuilder>();

  register(
    kind: DocumentArtifactKind,
    rebuilder: DocumentArtifactRebuilder,
  ): void {
    this.rebuilders.set(kind, rebuilder);
  }

  async rebuild(
    kind: string,
    subjectId: string,
    expectedSha256?: string,
  ): Promise<DocumentArtifactRecord | null> {
    const rebuilder = this.rebuilders.get(kind);
    if (!rebuilder) {
      return null;
    }
    return rebuilder(subjectId, expectedSha256);
  }
}
