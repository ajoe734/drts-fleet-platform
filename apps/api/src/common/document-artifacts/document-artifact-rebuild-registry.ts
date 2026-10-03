import type { DocumentArtifactKind } from "./document-artifact-kinds";
import type { DocumentArtifactRecord } from "./document-artifact.types";

/**
 * Deterministically re-derives the exact bytes a producer already issued
 * for one (kind, subjectId), from that producer's own durably persisted
 * source record (e.g. an invoice's line items), and stores the result back
 * into `DocumentArtifactStore` before returning it. Returns null when this
 * producer's own source data has no such subjectId -- which is a genuine
 * "never produced" case, not a failure to rebuild.
 */
export type DocumentArtifactRebuilder = (
  subjectId: string,
) => DocumentArtifactRecord | null;

export const DOCUMENT_ARTIFACT_REBUILD_REGISTRY = Symbol(
  "DOCUMENT_ARTIFACT_REBUILD_REGISTRY",
);

/**
 * `DocumentArtifactStore` is process-local: a Cloud Run instance that never
 * rendered a given (kind, subjectId) -- a sibling instance produced it, or
 * this instance restarted -- has nothing for it, even though the link
 * pointing at it already carries a verified signature and an unexpired
 * window. Replicating bytes across instances is one way to close that gap;
 * this registry takes the other one, already used by the producers
 * themselves to reissue a stale link (`ensureTenantInvoiceArtifact` and
 * friends): ask the producer to re-render the same bytes from the source
 * record it already persists durably and reads on every instance, then let
 * the caller re-check the result against the link's manifest hash before
 * trusting it.
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

  rebuild(kind: string, subjectId: string): DocumentArtifactRecord | null {
    const rebuilder = this.rebuilders.get(kind);
    if (!rebuilder) {
      return null;
    }
    return rebuilder(subjectId);
  }
}
