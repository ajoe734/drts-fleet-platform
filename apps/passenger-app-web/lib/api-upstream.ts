const METADATA_IDENTITY_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

/** Existing Cloud Run BFF transport: the Google service credential goes in its
 * own header; the product role Bearer remains the passenger/driver credential.
 */
export async function applyUpstreamAuth(
  headers: Headers,
  targetUrl: URL,
  token?: string,
) {
  if (token) headers.set("authorization", `Bearer ${token}`);
  const audience =
    process.env.DRTS_API_AUTH_AUDIENCE?.trim() ||
    (targetUrl.hostname.endsWith(".a.run.app") ? targetUrl.origin : null);
  if (!audience) return;
  const metadataUrl = new URL(METADATA_IDENTITY_TOKEN_URL);
  metadataUrl.searchParams.set("audience", audience);
  metadataUrl.searchParams.set("format", "full");
  const response = await fetch(metadataUrl.toString(), {
    cache: "no-store",
    headers: { "Metadata-Flavor": "Google" },
  });
  if (!response.ok)
    throw new Error(`Metadata fetch failed: ${response.status}`);
  const identityToken = await response.text();
  if (!identityToken)
    throw new Error("Metadata identity token fetch returned empty");
  headers.set("x-serverless-authorization", `Bearer ${identityToken}`);
  headers.set("x-drts-google-id-token", identityToken);
}
