// Uses the existing tenant-console session cookie and authoritative auth/session API.
// Access tokens stay in server code; client components receive only verified tenantId.
export const ENTERPRISE_TENANT_SESSION_COOKIE = "drts_tenant_session";

export interface EnterpriseTenantSession {
  accessToken: string;
  tenantId: string;
}

export async function verifyEnterpriseTenantSession(
  accessToken: string | undefined,
  apiBaseUrl = process.env.DRTS_API_URL?.trim() || "http://localhost:3001",
): Promise<{ session: EnterpriseTenantSession | null; status: number }> {
  if (!accessToken?.trim()) return { session: null, status: 401 };
  try {
    const target = new URL("/api/auth/session", apiBaseUrl);
    const headers = new Headers({ Authorization: `Bearer ${accessToken}` });
    const audience =
      process.env.DRTS_API_AUTH_AUDIENCE?.trim() ||
      (target.hostname.endsWith(".a.run.app") ? target.origin : null);
    if (audience) {
      const metadata = new URL(
        "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity",
      );
      metadata.searchParams.set("audience", audience);
      metadata.searchParams.set("format", "full");
      const tokenResponse = await fetch(metadata, {
        headers: { "Metadata-Flavor": "Google" },
        cache: "no-store",
      });
      if (!tokenResponse.ok) return { session: null, status: 503 };
      const identityToken = await tokenResponse.text();
      // Cloud Run's own IAM invoker check (network hop).
      headers.set("x-serverless-authorization", `Bearer ${identityToken}`);
      // apps/api's app-level caller identity, verified against Google's
      // public JWKS (INTERNAL_KEY_EXCP_002 retired, SEC-INTERNAL-KEY-WIF-MIGRATION-20260930).
      headers.set("x-drts-google-id-token", identityToken);
    }
    const response = await fetch(target, {
      headers,
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok)
      return { session: null, status: response.status >= 500 ? 503 : 401 };
    const payload = (await response.json())?.data;
    const identity = payload?.identity;
    const tenantId = identity?.tenant_id;
    if (
      payload?.active !== true ||
      identity?.realm !== "tenant" ||
      typeof tenantId !== "string" ||
      !tenantId.trim()
    ) {
      return { session: null, status: 403 };
    }
    return { session: { accessToken, tenantId: tenantId.trim() }, status: 200 };
  } catch {
    return { session: null, status: 503 };
  }
}
