import { isDocumentArtifactKind } from "./document-artifact-kinds";
import type { PutDocumentArtifactCommand } from "./document-artifact.types";

/**
 * Shared input validation for every `DocumentArtifactStore.put` adapter, so
 * the in-memory (test/dev) and S3 (production) backends reject the exact
 * same malformed input in the exact same way -- a test running against one
 * adapter cannot pass by relying on a validation gap the other closes.
 */
export function validatePutDocumentArtifactCommand(
  command: PutDocumentArtifactCommand,
): { subjectId: string; mimeType: string; bytes: Buffer } {
  if (!isDocumentArtifactKind(command.kind)) {
    throw new Error(
      `DocumentArtifactStore does not accept kind "${command.kind}". `,
    );
  }
  const subjectId = command.subjectId?.trim();
  if (!subjectId) {
    throw new Error(
      "DocumentArtifactStore.put requires a non-empty subjectId.",
    );
  }
  const mimeType = command.mimeType?.trim();
  if (!mimeType) {
    throw new Error("DocumentArtifactStore.put requires a non-empty mimeType.");
  }
  if (!Buffer.isBuffer(command.bytes) || command.bytes.length === 0) {
    throw new Error("DocumentArtifactStore.put requires non-empty bytes.");
  }
  return { subjectId, mimeType, bytes: Buffer.from(command.bytes) };
}
