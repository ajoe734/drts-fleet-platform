import { tenantAuthFetch } from "@drts/tenant-auth/api-fetch";

export interface VerifiedAgencySession {
  accessToken: string;
  agencyId: string;
  roles: string[];
  scopes: string[];
}

export interface AgencySessionVerification {
  response: Response;
  body: unknown;
  session: VerifiedAgencySession | null;
}

interface AuthSessionEnvelope {
  data?: {
    active?: unknown;
    identity?: {
      realm?: unknown;
      actor_type?: unknown;
      agency_id?: unknown;
      roles?: unknown;
      scopes?: unknown;
    };
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/**
 * A cookie is only an agency session when the API confirms an active
 * `agency` realm identity bound to an agency. A tenant (or any other realm)
 * token in this cookie is rejected, never reinterpreted.
 */
export async function verifyAgencySession(
  accessToken: string,
  apiBaseUrl: string,
): Promise<AgencySessionVerification> {
  const response = await tenantAuthFetch(`${apiBaseUrl}/api/auth/session`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const body: unknown = await response.json().catch(() => null);
  const identity = (body as AuthSessionEnvelope | null)?.data?.identity;
  const agencyId = identity?.agency_id;
  const session =
    response.ok &&
    (body as AuthSessionEnvelope | null)?.data?.active === true &&
    identity?.realm === "agency" &&
    identity.actor_type === "agency_user" &&
    typeof agencyId === "string" &&
    agencyId.trim().length > 0
      ? {
          accessToken,
          agencyId: agencyId.trim(),
          roles: stringList(identity.roles),
          scopes: stringList(identity.scopes),
        }
      : null;

  return { response, body, session };
}
