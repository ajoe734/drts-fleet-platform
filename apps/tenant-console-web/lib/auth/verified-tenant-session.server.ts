export interface VerifiedTenantSession {
  accessToken: string;
  tenantId: string;
}

export interface TenantSessionVerification {
  response: Response;
  body: unknown;
  session: VerifiedTenantSession | null;
}

interface AuthSessionEnvelope {
  data?: {
    active?: unknown;
    identity?: {
      realm?: unknown;
      tenant_id?: unknown;
    };
  };
}

export async function verifyTenantSession(
  accessToken: string,
  apiBaseUrl: string,
): Promise<TenantSessionVerification> {
  const response = await fetch(`${apiBaseUrl}/api/auth/session`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const body: unknown = await response.json().catch(() => null);
  const payload = (body as AuthSessionEnvelope | null)?.data;
  const tenantId = payload?.identity?.tenant_id;
  const session =
    response.ok &&
    payload?.active === true &&
    payload.identity?.realm === "tenant" &&
    typeof tenantId === "string" &&
    tenantId.trim().length > 0
      ? { accessToken, tenantId: tenantId.trim() }
      : null;

  return { response, body, session };
}
