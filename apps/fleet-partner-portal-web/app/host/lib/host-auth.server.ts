// Host (individual vehicle owner)-scoped server api-client for the Fleet
// Partner Portal's `/host/*` routes.
//
// Host is a DIFFERENT actor from the fleet-admin identity that
// `lib/api-client.server.ts` builds (`getServerFleetPartnerClient`,
// `partner_api_key` actor, `billing:read` scope, fleet-wide access). Host is
// `core.partners.partner_type = 'individual_owner'` — realm `partner`,
// authorized through `owned:read` / `reports:read` / `maintenance:read`
// scopes, resource-constrained to `vehicle.owner_partner_id ===
// identity.partnerId` (docs/04-uat/system-remediation-20260906/
// feature-contracts.md §4). Reusing the fleet-admin client would mint the
// wrong actor headers for this scope, so `/host/*` routes resolve their own
// client here instead — kept inside the task's `app/host/` write scope
// rather than the shared `lib/` directory.
//
// C012-F1-HOST-MANAGED-CREDENTIAL-CONSUMER fix: a Host login is a human OIDC
// session (see `app/api/auth/[...auth]/route.ts`'s `callback` action), which
// stores the real signed access token in the HttpOnly `drts_session` cookie.
// The previous version of this file never read that cookie at all — it
// unconditionally manufactured a full bootstrap identity
// (`x-actor-type`/`x-partner-id`/etc.) from a client-forgeable
// `x-host-partner-id` header or an env override, which `BootstrapAuthGuard`
// rejects outright in strict (production/staging) environments and, outside
// strict mode, let any caller pick an arbitrary owner's partnerId. This
// version mirrors the already-reviewed real-session forwarding pattern in
// `lib/academy-api.server.ts` (`extractInboundBearerToken`):
//   1. A real Bearer session (forwarded control-plane inner bearer, a raw
//      `Authorization` header, or the `drts_session` cookie) is forwarded
//      unchanged so `BootstrapAuthGuard` + `JwtAuthService.verifyAccessToken`
//      performs full cryptographic verification server-side. `partnerId` is
//      never trusted from an unverified claim; it is resolved authoritatively
//      by `HostViewService.resolvePartnerId` from the verified identity.
//   2. Lawful non-strict/offline harness: if the inbound request already
//      carries full bootstrap identity headers (set by the caller, e.g. a
//      local test driver), they are forwarded verbatim — never synthesized
//      from a request-controlled selector header. `BootstrapAuthGuard`
//      still rejects this path outright in strict environments regardless.
//   3. Lawful offline harness fallback: `DRTS_HOST_PARTNER_ID` is an
//      operator-set env var (not attacker-controlled HTTP input), kept for
//      single-tenant/local deployments with no live IdP.
//   4. Otherwise, authentication is required: throw a distinct
//      `HOST_UNAUTHORIZED` error instead of silently sending an unauthenticated
//      or impersonated request.
//
// Auth model mirrors `getServerFleetPartnerClient`: the portal runs behind
// the same control-plane perimeter (Google IAP in front of Cloud Run). We
// forward the IAP-authenticated user email for audit and, on Cloud Run, mint
// a metadata identity token for the protected backend. That Cloud Run outer
// credential goes exclusively to `x-serverless-authorization`, never
// `authorization`/`x-drts-authorization`, so it can never collide with or be
// mistaken for the app-level Host session credential forwarded above.

import "server-only";

import { ApiClient } from "@drts/api-client";
import {
  CONTROL_PLANE_IAP_EMAIL_HEADER,
  CONTROL_PLANE_REQUEST_AUTH_HEADER,
} from "@drts/control-plane-auth";
import { cookies as nextCookies, headers as nextHeaders } from "next/headers";

const DEFAULT_API_BASE_URL = "http://localhost:3001";
const HOST_SESSION_COOKIE_NAME = "drts_session";
// Per feature-contracts.md §4: Host authorization reuses the existing
// owned-mobility / reporting / maintenance read scopes, never a fleet-admin
// write scope. Only consulted on the lawful offline-harness fallback path
// (§3 above) — a real session's scopes come from its verified JWT claims.
const HOST_SCOPES = ["owned:read", "reports:read", "maintenance:read"];

// Full bootstrap identity header set BootstrapAuthGuard's auth extractor
// reads. Forwarded verbatim only when the caller already supplied them
// (§2 above) — never synthesized from a request-controlled selector.
const BOOTSTRAP_IDENTITY_HEADER_KEYS = [
  "x-actor-type",
  "x-actor-id",
  "x-realm",
  "x-roles",
  "x-role-families",
  "x-scopes",
  "x-auth-mode",
  "x-partner-id",
  "x-partner-program-id",
  "x-partner-entry-slug",
] as const;

export class HostAuthenticationRequiredError extends Error {
  readonly code = "HOST_UNAUTHORIZED";
  readonly statusCode = 401;

  constructor(message: string) {
    super(message);
    this.name = "HostAuthenticationRequiredError";
  }
}

function resolveServerApiBaseUrl(): string {
  return process.env.DRTS_API_URL || DEFAULT_API_BASE_URL;
}

function readCookieFromHeader(
  cookieHeader: string | null,
  targetName: string,
): string | null {
  if (!cookieHeader) {
    return null;
  }
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx <= 0) continue;
    const name = pair.slice(0, eqIdx).trim();
    if (name !== targetName) continue;
    const rawValue = pair.slice(eqIdx + 1).trim();
    if (!rawValue) continue;
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }
  return null;
}

interface InboundBearer {
  token: string;
  headerName: typeof CONTROL_PLANE_REQUEST_AUTH_HEADER | "authorization";
}

async function extractInboundHostBearerToken(
  requestHeaders: Headers,
): Promise<InboundBearer | null> {
  const innerBearer = requestHeaders
    .get(CONTROL_PLANE_REQUEST_AUTH_HEADER)
    ?.trim();
  if (innerBearer && /^Bearer\s+/i.test(innerBearer)) {
    const token = innerBearer.replace(/^Bearer\s+/i, "").trim();
    if (token) {
      return { token, headerName: CONTROL_PLANE_REQUEST_AUTH_HEADER };
    }
  }

  const authHeader = requestHeaders.get("authorization")?.trim();
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (token) {
      return { token, headerName: "authorization" };
    }
  }

  const cookieHeader = requestHeaders.get("cookie");
  const fromRawCookie = readCookieFromHeader(
    cookieHeader,
    HOST_SESSION_COOKIE_NAME,
  );
  if (fromRawCookie) {
    const token = fromRawCookie.replace(/^Bearer\s+/i, "").trim();
    if (token) {
      return { token, headerName: "authorization" };
    }
  }

  try {
    const cookieStore = await nextCookies();
    const cookieVal = cookieStore?.get?.(
      HOST_SESSION_COOKIE_NAME,
    )?.value?.trim();
    if (cookieVal) {
      const token = cookieVal.replace(/^Bearer\s+/i, "").trim();
      if (token) {
        return { token, headerName: "authorization" };
      }
    }
  } catch {
    // `nextCookies()` may throw outside a request scope; ignore safely.
  }

  return null;
}

function hasInboundBootstrapSignal(requestHeaders: Headers): boolean {
  return BOOTSTRAP_IDENTITY_HEADER_KEYS.some((key) =>
    Boolean(requestHeaders.get(key)?.trim()),
  );
}

// Unverified, display-only hint for the returned `partnerId` field. Never
// used for authorization — the backend independently re-verifies the same
// token's signature and derives the authoritative `identity.partnerId`
// (`HostViewService.resolvePartnerId`) before any ownership-scoped query.
function decodeJwtPartnerIdHint(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) {
    return null;
  }
  try {
    const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    const raw = parsed.partnerId ?? parsed.partner_id;
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

async function mintMetadataIdentityToken(
  audience: string,
): Promise<string | null> {
  const metadataUrl = new URL(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity",
  );
  metadataUrl.searchParams.set("audience", audience);
  metadataUrl.searchParams.set("format", "full");

  try {
    const response = await fetch(metadataUrl, {
      cache: "no-store",
      headers: {
        "Metadata-Flavor": "Google",
      },
    });

    if (!response.ok) {
      return null;
    }

    return response.text();
  } catch {
    return null;
  }
}

export interface ServerHostClient {
  client: ApiClient;
  partnerId: string | null;
}

export async function getServerHostClient(): Promise<ServerHostClient> {
  const apiUrl = resolveServerApiBaseUrl();
  const requestHeaders = await nextHeaders();

  const defaultHeaders: Record<string, string> = {};
  let partnerId: string | null = null;

  const bearer = await extractInboundHostBearerToken(requestHeaders);
  if (bearer) {
    defaultHeaders[bearer.headerName] = `Bearer ${bearer.token}`;
    partnerId = decodeJwtPartnerIdHint(bearer.token);
  } else if (hasInboundBootstrapSignal(requestHeaders)) {
    // Lawful non-strict/offline harness (§2): forward only caller-supplied
    // bootstrap headers unchanged. Never synthesize or upgrade
    // scopes/roles/realms; BootstrapAuthGuard rejects this outright in
    // strict environments regardless of what's forwarded here.
    for (const key of BOOTSTRAP_IDENTITY_HEADER_KEYS) {
      const value = requestHeaders.get(key)?.trim();
      if (value) {
        defaultHeaders[key] = value;
      }
    }
    partnerId = requestHeaders.get("x-partner-id")?.trim() || null;
  } else {
    const fromEnv = process.env.DRTS_HOST_PARTNER_ID?.trim();
    if (fromEnv) {
      // Lawful offline harness fallback (§3): operator-set env var, not
      // attacker-controlled HTTP input.
      defaultHeaders["x-actor-type"] = "partner_user";
      defaultHeaders["x-actor-id"] = fromEnv;
      defaultHeaders["x-partner-id"] = fromEnv;
      defaultHeaders["x-realm"] = "partner";
      defaultHeaders["x-roles"] = "partner";
      defaultHeaders["x-role-families"] = "partner";
      defaultHeaders["x-scopes"] = HOST_SCOPES.join(",");
      partnerId = fromEnv;
    } else {
      throw new HostAuthenticationRequiredError(
        "Host authentication required: no managed session, bootstrap identity, or DRTS_HOST_PARTNER_ID offline-harness override was found.",
      );
    }
  }

  const iapEmail = requestHeaders.get(CONTROL_PLANE_IAP_EMAIL_HEADER);
  if (iapEmail) {
    defaultHeaders[CONTROL_PLANE_IAP_EMAIL_HEADER] = iapEmail;
  }

  const requestId = requestHeaders.get("x-request-id");
  if (requestId) {
    defaultHeaders["x-request-id"] = requestId;
  }

  // Cloud Run service-to-service IAM perimeter token goes exclusively to
  // `x-serverless-authorization`, never `authorization`/`x-drts-authorization`,
  // so it is never treated as (or collides with) the app-level Host session
  // credential set above.
  const protectedAudience =
    process.env.DRTS_API_AUTH_AUDIENCE?.trim() ||
    (apiUrl.includes(".a.run.app") ? apiUrl : "");
  if (protectedAudience) {
    const metadataToken = await mintMetadataIdentityToken(protectedAudience);
    if (metadataToken) {
      defaultHeaders["x-serverless-authorization"] = `Bearer ${metadataToken}`;
    }
  }

  const client = new ApiClient({
    baseUrl: apiUrl,
    defaultHeaders,
  });

  return { client, partnerId };
}
