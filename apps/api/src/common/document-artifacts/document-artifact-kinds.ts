/** Materialised document families. Fleet upload kinds are private storage
 * records and must only be read through authenticated fleet/reviewer routes;
 * document-artifact-reader deliberately excludes them from signed public links.
 */
export const DOCUMENT_ARTIFACT_KINDS = [
  "tenant-invoice",
  "placard",
  "report",
  "fleet-upload-intent",
  "fleet-upload-content",
  "fleet-upload-scan",
  "fleet-case-attachments",
] as const;

export type DocumentArtifactKind = (typeof DOCUMENT_ARTIFACT_KINDS)[number];

export function isDocumentArtifactKind(
  value: string,
): value is DocumentArtifactKind {
  return (DOCUMENT_ARTIFACT_KINDS as readonly string[]).includes(value);
}
