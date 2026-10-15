import type { ReportJobRecord } from "@drts/contracts";

export function artifactDownloadUrl(
  artifact: ReportJobRecord["artifact"] | null | undefined,
): string | null {
  if (!artifact || typeof artifact !== "object") return null;
  const url = artifact.downloadUrl;
  if (typeof url !== "string" || !url) return null;

  // The API's file route is relative to the API, while window.open resolves
  // relative URLs on Ops. Use the existing authenticated same-origin proxy.
  // Other URLs (including external signed downloads) retain their semantics.
  return /^\/reports\/[^/?#\\]+\/artifact(?:[?#].*)?$/.test(url)
    ? `/control-plane-proxy${url}`
    : url;
}
