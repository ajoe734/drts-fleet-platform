import "server-only";

import { ApiClientError } from "@drts/api-client";
import { CONTROL_PLANE_REQUEST_AUTH_HEADER } from "@drts/control-plane-auth";

export const FLEET_PARTNER_ID_HEADER = "x-fleet-partner-id";

export function fleetApiUrl(): string {
  return process.env.DRTS_API_URL || "http://localhost:3001";
}

export function fleetError(statusCode: number, code: string, message: string) {
  return new ApiClientError({
    statusCode,
    code,
    message,
    retryable: false,
    rawBody: JSON.stringify({ error: { code, message } }),
  });
}

/** Same wire normalization as ApiClient: do not reinterpret status/IDs/dates. */
export function normalizeFleetWire(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeFleetWire);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
        normalizeFleetWire(nested),
      ]),
    );
  }
  return value;
}

export async function readFleetResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const rawBody = await response.text();
    let error: {
      code?: string;
      message?: string;
      retryable?: boolean;
      details?: Record<string, unknown>;
      traceId?: string;
    } = {};
    try {
      error =
        (normalizeFleetWire(JSON.parse(rawBody)) as { error?: typeof error })
          .error ?? {};
    } catch {
      /* Preserve the original non-JSON upstream body on the error. */
    }
    throw new ApiClientError({
      statusCode: response.status,
      code: error.code ?? `HTTP_${response.status}`,
      message:
        error.message ?? `API request failed with status ${response.status}`,
      retryable: error.retryable ?? false,
      rawBody,
      ...(error.details !== undefined ? { details: error.details } : {}),
      ...(error.traceId !== undefined ? { traceId: error.traceId } : {}),
    });
  }
  return normalizeFleetWire(await response.json()) as T;
}

function inboundBearer(headers: Headers): string | null {
  // The inner application bearer takes precedence over an invocation bearer.
  for (const key of [CONTROL_PLANE_REQUEST_AUTH_HEADER, "authorization"]) {
    const value = headers.get(key)?.trim();
    if (value && /^Bearer\s+\S+$/i.test(value)) return value;
  }
  // These are the existing application session cookie contracts. Never decode
  // JWT claims to derive authority, and never substitute email/IAP/IAM proof.
  for (const name of ["drts_session", "drts_tenant_session"]) {
    const cookie = headers
      .get("cookie")
      ?.split(";")
      .find((pair) => pair.trim().startsWith(`${name}=`));
    if (!cookie) continue;
    let token: string;
    try {
      token = decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1).trim());
    } catch {
      continue;
    }
    token = token.replace(/^Bearer\s+/i, "").trim();
    if (token && !/\s/.test(token)) return `Bearer ${token}`;
  }
  return null;
}

async function infrastructureHeaders(apiUrl: string): Promise<Headers> {
  const headers = new Headers();
  const target = new URL(apiUrl);
  const audience =
    process.env.DRTS_API_AUTH_AUDIENCE?.trim() ||
    (target.hostname.endsWith(".a.run.app") ? target.origin : "");
  if (!audience) return headers;
  const url = new URL(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity",
  );
  url.searchParams.set("audience", audience);
  url.searchParams.set("format", "full");
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("metadata denied");
    const token = (await response.text()).trim();
    if (!token) throw new Error("empty metadata token");
    headers.set("x-serverless-authorization", `Bearer ${token}`);
  } catch {
    throw fleetError(
      503,
      "FLEET_INFRASTRUCTURE_AUTH_UNAVAILABLE",
      "Backend invocation proof is unavailable for the configured API audience.",
    );
  }
  return headers;
}

export interface VerifiedFleetPrincipal {
  fleetPartnerId: string;
  actorId: string;
  headers: Headers;
}

/** /api/auth/session is the existing backend authority, including revocation.
 * Every downstream API call still goes through the existing backend guards.
 */
export async function resolveFleetPrincipal(
  requestHeaders: Headers,
  apiUrl = fleetApiUrl(),
): Promise<VerifiedFleetPrincipal> {
  const bearer = inboundBearer(requestHeaders);
  if (!bearer)
    throw fleetError(
      401,
      "FLEET_PRINCIPAL_REQUIRED",
      "An existing backend-verified partner application session is required; a fleet selector or invocation proof cannot establish partner authority.",
    );

  const headers = await infrastructureHeaders(apiUrl);
  headers.set("authorization", bearer);
  const requestId = requestHeaders.get("x-request-id");
  if (requestId) headers.set("x-request-id", requestId);
  let response: Response;
  try {
    response = await fetch(new URL("/api/auth/session", apiUrl), {
      headers,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw fleetError(
      503,
      "FLEET_SESSION_UNAVAILABLE",
      "The existing backend session authority is unavailable.",
    );
  }
  const session = await readFleetResponse<{
    data?: {
      active?: boolean;
      identity?: {
        realm?: string;
        actorType?: string;
        actorId?: string;
        partnerId?: string;
        scopes?: string[];
      };
    };
  }>(response);
  const identity = session.data?.identity;
  if (session.data?.active !== true || !identity?.actorId?.trim())
    throw fleetError(
      401,
      "FLEET_PRINCIPAL_REQUIRED",
      "The backend did not return an active application principal.",
    );
  if (
    identity.realm !== "partner" ||
    !["partner_user", "partner_api_key"].includes(identity.actorType ?? "")
  )
    throw fleetError(
      403,
      "FLEET_PARTNER_AUTHORITY_REQUIRED",
      "The existing principal has no original partner-realm binding; tenant/training or workforce authority cannot be promoted to Fleet partner authority.",
    );
  if (!identity.scopes?.includes("billing:read"))
    throw fleetError(
      403,
      "AUTH_SCOPE_DENIED",
      "The existing partner principal requires billing:read for Fleet self-service.",
    );
  const partnerId = identity.partnerId?.trim();
  if (!partnerId)
    throw fleetError(
      403,
      "FLEET_PARTNER_BINDING_REQUIRED",
      "The verified partner principal is missing its canonical partnerId binding.",
    );
  const configured = process.env.DRTS_FLEET_PARTNER_ID?.trim();
  const requested = requestHeaders.get(FLEET_PARTNER_ID_HEADER)?.trim();
  if (!configured && !requested)
    throw fleetError(
      503,
      "FLEET_SELECTOR_REQUIRED",
      "Missing fleet scope configuration: DRTS_FLEET_PARTNER_ID or x-fleet-partner-id is required.",
    );
  if (
    (configured && configured !== partnerId) ||
    (requested && requested !== partnerId)
  )
    throw fleetError(
      403,
      "FLEET_SCOPE_DENIED",
      "The requested/configured fleet differs from the verified principal's canonical partnerId.",
    );
  headers.set(FLEET_PARTNER_ID_HEADER, partnerId);
  return {
    fleetPartnerId: partnerId,
    actorId: identity.actorId.trim(),
    headers,
  };
}
