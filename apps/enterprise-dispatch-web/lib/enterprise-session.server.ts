// Uses the existing tenant-console session cookie and authoritative auth/session API.
// Access tokens stay in server code; client components receive only verified tenantId.
export const ENTERPRISE_TENANT_SESSION_COOKIE = "drts_tenant_session";

export interface EnterpriseTenantSession {
  accessToken: string;
  tenantId: string;
  actorId?: string;
  scopes?: string[];
  upstreamHeaders?: Record<string, string>;
}

export async function verifyEnterpriseTenantSession(
  accessToken: string | undefined,
  apiBaseUrl = process.env.DRTS_API_URL?.trim() || "http://localhost:3001",
): Promise<{ session: EnterpriseTenantSession | null; status: number }> {
  const trimmedToken = accessToken?.trim();
  if (!trimmedToken) return { session: null, status: 401 };
  try {
    const target = new URL("/api/auth/session", apiBaseUrl);
    const headers = new Headers({ Authorization: `Bearer ${trimmedToken}` });
    const audience =
      process.env.DRTS_API_AUTH_AUDIENCE?.trim() ||
      (target.hostname.endsWith(".a.run.app") ? target.origin : null);
    let upstreamHeaders: Record<string, string> | undefined;
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
      const identityToken = (await tokenResponse.text()).trim();
      if (!identityToken) return { session: null, status: 503 };
      const serverlessAuthHeader = `Bearer ${identityToken}`;
      upstreamHeaders = {
        "x-serverless-authorization": serverlessAuthHeader,
        "x-drts-google-id-token": identityToken,
      };
      // Cloud Run's own IAM invoker check (network hop).
      headers.set("x-serverless-authorization", serverlessAuthHeader);
      // apps/api's app-level caller identity, verified against Google's
      // public JWKS (INTERNAL_KEY_EXCP_002 retired, SEC-INTERNAL-KEY-WIF-MIGRATION-20260930).
      headers.set("x-drts-google-id-token", identityToken);
    }
    const response = await fetch(target, {
      headers,
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) {
      return {
        session: null,
        status:
          response.status >= 500 ? 503 : response.status === 403 ? 403 : 401,
      };
    }
    const body = await response.json();
    const payload = body?.data ?? body;
    const identity = payload?.identity;
    const tenantId =
      typeof identity?.tenant_id === "string"
        ? identity.tenant_id
        : typeof identity?.tenantId === "string"
          ? identity.tenantId
          : undefined;
    const rawScopes = Array.isArray(identity?.scopes)
      ? identity.scopes.filter(
          (s: unknown): s is string => typeof s === "string",
        )
      : undefined;
    if (
      payload?.active !== true ||
      identity?.realm !== "tenant" ||
      typeof tenantId !== "string" ||
      !tenantId.trim() ||
      (rawScopes !== undefined && !rawScopes.includes("tenant:read"))
    ) {
      return { session: null, status: 403 };
    }
    const actorId =
      typeof identity?.actor_id === "string" && identity.actor_id.trim()
        ? identity.actor_id.trim()
        : typeof identity?.actorId === "string" && identity.actorId.trim()
          ? identity.actorId.trim()
          : undefined;
    return {
      session: {
        accessToken: trimmedToken,
        tenantId: tenantId.trim(),
        ...(actorId ? { actorId } : {}),
        ...(rawScopes ? { scopes: rawScopes } : {}),
        ...(upstreamHeaders ? { upstreamHeaders } : {}),
      },
      status: 200,
    };
  } catch {
    return { session: null, status: 503 };
  }
}
