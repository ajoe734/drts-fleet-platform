/**
 * The only document families this storage layer materialises for this
 * period. Everything else that flows through `ControlledDownloadController`
 * (filing PDF/ZIP, accident-investigation bundles, regulator-realm reports,
 * multi-taxi-trip-record exports, ...) is out of scope by decision
 * (`SD-DP-20260820-012` and the SR-SCOPE exclusion list) and keeps answering
 * through the existing "not materialised" path untouched.
 */
export const DOCUMENT_ARTIFACT_KINDS = [
  "tenant-invoice",
  "placard",
  "report",
] as const;

export type DocumentArtifactKind = (typeof DOCUMENT_ARTIFACT_KINDS)[number];

export function isDocumentArtifactKind(
  value: string,
): value is DocumentArtifactKind {
  return (DOCUMENT_ARTIFACT_KINDS as readonly string[]).includes(value);
}
