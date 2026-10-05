/** Server-only transport for the private Cloud Run API. The user's bearer
 * stays in Authorization; the infrastructure proof uses a separate header. */
export function resolveTenantApiUrl(): string {
  return process.env.DRTS_API_URL?.trim() || process.env.API_URL?.trim()
    || process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:3001";
}

export async function tenantAuthFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const target = new URL(url);
  if (target.origin !== new URL(resolveTenantApiUrl()).origin) {
    throw new Error("Authentication request must target the configured API.");
  }
  const headers = new Headers(init.headers);
  const audience = process.env.DRTS_API_AUTH_AUDIENCE?.trim()
    || (target.hostname.endsWith(".a.run.app") ? target.origin : null);
  if (audience) {
    const metadata = new URL("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity");
    metadata.searchParams.set("audience", audience);
    metadata.searchParams.set("format", "full");
    const proof = await fetch(metadata, { headers: { "Metadata-Flavor": "Google" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5_000) });
    if (!proof.ok) throw new Error("API caller identity unavailable.");
    const idToken = await proof.text();
    headers.set("x-serverless-authorization", `Bearer ${idToken}`);
    headers.set("x-drts-google-id-token", idToken);
  }
  return fetch(target.toString(), { ...init, headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
}
