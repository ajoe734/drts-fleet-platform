/* External Google metadata transport SIM for isolated shared-order travel acceptance.
 * The token is genuinely Google-issued by the existing auth@v2 step.
 * Never signs JWTs or intercepts internal API/create/read calls.
 * Only partner Next receives this process-local preload.
 */
"use strict";
const { appendFileSync } = process.getBuiltinModule("node:fs");
const path = process.getBuiltinModule("node:path");

const token = process.env.DRTS_GOOGLE_WORKLOAD_IDENTITY_TOKEN?.trim();
const audience = process.env.WORKLOAD_IDENTITY_GOOGLE_AUDIENCE?.trim();
const candidate = process.env.CANDIDATE_SHA ?? "";
if (
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.DRTS_UAT_ENV !== "sandbox" ||
  process.env.DRTS_API_URL !== "http://127.0.0.1:3001" ||
  process.env.DRTS_API_AUTH_AUDIENCE !== audience ||
  !audience ||
  !token ||
  !/^[a-f0-9]{40}$/.test(candidate)
)
  throw new Error(
    "Partner metadata transport requires isolated shared-order travel acceptance",
  );

// Claims inspection only rejects expired/misbound setup; the actual API still
// verifies the unmodified signature against Google's real public JWKS.
let claims;
try {
  claims = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
  );
} catch {
  throw new Error("Existing Google WIF step supplied no valid identity token");
}
if (
  !["https://accounts.google.com", "accounts.google.com"].includes(
    claims.iss,
  ) ||
  claims.aud !== audience ||
  typeof claims.exp !== "number" ||
  claims.exp * 1000 <= Date.now()
)
  throw new Error("Existing Google WIF token is expired or misbound");

const actualFetch = globalThis.fetch;
const journal = path.resolve(
  process.env.GITHUB_WORKSPACE ?? process.cwd(),
  ".artifacts/pax-review-shared-order/noncore-metadata-transport.ndjson",
);
globalThis.fetch = async function hostedMetadataTransport(input, init) {
  let url;
  try {
    url = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
  } catch {
    return actualFetch(input, init);
  }
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  const method =
    init?.method ?? (input instanceof Request ? input.method : "GET");
  if (
    url.protocol === "http:" &&
    url.hostname === "metadata.google.internal" &&
    !url.port &&
    url.pathname ===
      "/computeMetadata/v1/instance/service-accounts/default/identity" &&
    url.searchParams.get("audience") === audience &&
    url.searchParams.get("format") === "full" &&
    headers.get("Metadata-Flavor") === "Google" &&
    method.toUpperCase() === "GET"
  ) {
    if (claims.exp * 1000 <= Date.now())
      throw new Error("Existing Google token expired during UAT");
    appendFileSync(
      journal,
      JSON.stringify({
        candidate_sha: candidate,
        boundary: "external-google-metadata-transport-SIM",
        token_source: "existing-google-auth-v2-real-id-token",
        audience,
        metadata_path: url.pathname,
        at: new Date().toISOString(),
      }) + "\n",
    );
    return new Response(token, {
      status: 200,
      headers: { "Content-Type": "text/plain", "Metadata-Flavor": "Google" },
    });
  }
  return actualFetch(input, init);
};
