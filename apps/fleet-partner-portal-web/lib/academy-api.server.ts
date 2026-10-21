// C071-local server API adapter for the Fleet Partner Portal `/training` surface.
//
// Why this adapter is separate from `lib/api-client.server.ts`:
// 1. Ordinary Fleet Partner Portal pages (`/dashboard`, `/trips`, `/statements`,
//    etc.) use `getServerFleetPartnerClient()`, which issues a `partner_api_key`
//    (`partner` realm) client scoped only to `billing:read`.
// 2. The authoritative Academy fleet training routes
//    (`GET /api/fleet-partner/training/summary`, `/roster`,
//    `/drivers/:driverId/attempts/:attemptId`) are governed by the effective
//    `BootstrapAuthGuard` policy union (`requiredScopes: ["billing:read",
//    "reports:read"]`, `allowedRealms: ["system", "partner", "platform",
//    "tenant", "ops"]`) and `FleetPartnerTrainingController.resolveFleetPartnerId`:
//    - For a verified `tenant` principal (`identity.realm === "tenant"`), the
//      canonical fleet is derived from `identity.tenantId` (rejecting any
//      mismatched `fleetPartnerId` query with `403 ACADEMY_FORBIDDEN_FLEET_ACCESS`
//      or blank `tenantId` with `401 TENANT_IDENTITY_REQUIRED`).
//    - For a legitimately authorized non-tenant context (`ops`, `platform`,
//      `system`, `partner`), the controller requires an explicit
//      `?fleetPartnerId=<canonicalFleetId>` query parameter (ignoring the
//      `x-fleet-partner-id` header and throwing `400 FLEET_PARTNER_ID_REQUIRED`
//      when absent).
// 3. Per `SR-ACADEMY-BE-001-IDENTITY-CONTRACT` and `FLEET-TRAINING-AUTHORIZED-CALLER-20261015`,
//    this adapter adopts the existing verified principal and canonical fleet
//    binding without manufacturing authority from display role/email
//    (`x-goog-authenticated-user-email`), synthetic `x-scopes` headers, or
//    Cloud Run service invocation tokens (`x-serverless-authorization`).

import "server-only";

import { ApiClient, type RequestOptions } from "@drts/api-client";
import type {
  ApiListData,
  DriverQuizAttemptDetail,
  FleetDriverRosterItem,
  FleetTrainingView,
} from "@drts/contracts";
import {
  CONTROL_PLANE_IAP_EMAIL_HEADER,
  CONTROL_PLANE_IAP_JWT_HEADER,
  CONTROL_PLANE_REQUEST_AUTH_HEADER,
  extractIapJwtAssertion,
} from "@drts/control-plane-auth";
import { cookies as nextCookies, headers as nextHeaders } from "next/headers";

const DEFAULT_API_BASE_URL = "http://localhost:3001";
const FLEET_PARTNER_ID_HEADER = "x-fleet-partner-id";
const TENANT_ID_HEADER = "x-tenant-id";
const TENANT_SESSION_COOKIE_NAME = "drts_tenant_session";
const PORTAL_SESSION_COOKIE_NAME = "drts_session";
const TRAINING_ROUTE_PREFIX = "/api/fleet-partner/training";

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
  "x-amr",
  "x-auth-time",
  "x-session-id",
] as const;

export type FleetTrainingPrincipalSource =
  | "tenant_bearer_session"
  | "tenant_bootstrap_context"
  | "non_tenant_bearer_session"
  | "iap_workforce_assertion"
  | "non_tenant_bootstrap_context"
  | "unauthenticated";

export interface ServerFleetTrainingClient {
  client: ApiClient;
  /** Canonical fleet partner ID resolved from tenantId (for tenant realm) or explicit selector (for non-tenant realm). */
  fleetPartnerId: string | null;
  /** Query selector transmitted to `/api/fleet-partner/training/*` when required by non-tenant routes or cross-fleet check. */
  queryFleetPartnerId: string | null;
  principalRealm: string | null;
  principalSource: FleetTrainingPrincipalSource;
  getFleetTrainingSummary(options?: RequestOptions): Promise<FleetTrainingView>;
  listFleetDriverRoster(
    query?: { page?: number; pageSize?: number },
    options?: RequestOptions,
  ): Promise<ApiListData<FleetDriverRosterItem>>;
  getFleetDriverQuizAttempt(
    driverId: string,
    attemptId: string,
    options?: RequestOptions,
  ): Promise<DriverQuizAttemptDetail>;
}

function resolveServerApiBaseUrl(): string {
  return process.env.DRTS_API_URL || DEFAULT_API_BASE_URL;
}

function resolveExplicitFleetPartnerId(requestHeaders: Headers): string | null {
  const fromHeader = requestHeaders.get(FLEET_PARTNER_ID_HEADER)?.trim();
  if (fromHeader) {
    return fromHeader;
  }

  const fromEnv = process.env.DRTS_FLEET_PARTNER_ID?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  return null;
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

async function extractInboundBearerToken(requestHeaders: Headers): Promise<{
  token: string;
  headerName: typeof CONTROL_PLANE_REQUEST_AUTH_HEADER | "authorization";
} | null> {
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
  for (const cookieName of [
    TENANT_SESSION_COOKIE_NAME,
    PORTAL_SESSION_COOKIE_NAME,
  ]) {
    const fromRawCookie = readCookieFromHeader(cookieHeader, cookieName);
    if (fromRawCookie) {
      const token = fromRawCookie.replace(/^Bearer\s+/i, "").trim();
      if (token) {
        return { token, headerName: "authorization" };
      }
    }
  }

  try {
    const cookieStore = await nextCookies();
    if (cookieStore && typeof cookieStore.get === "function") {
      for (const cookieName of [
        TENANT_SESSION_COOKIE_NAME,
        PORTAL_SESSION_COOKIE_NAME,
      ]) {
        const cookieVal = cookieStore.get(cookieName)?.value?.trim();
        if (cookieVal) {
          const token = cookieVal.replace(/^Bearer\s+/i, "").trim();
          if (token) {
            return { token, headerName: "authorization" };
          }
        }
      }
    }
  } catch {
    // `nextCookies()` may throw outside a request scope; ignore safely.
  }

  return null;
}

interface DecodedJwtClaimsHint {
  realm: string | null;
  tenantId: string | null;
}

/**
 * Reads the unverified `realm` and `tenantId` claim hints from a 3-part JWT
 * solely to decide whether the caller is a `tenant` realm principal (whose
 * canonical fleet derives from `tenantId`) or a non-tenant principal (which
 * requires the explicit `?fleetPartnerId=` query parameter).
 *
 * Security invariant: these hints are NEVER converted into bootstrap identity
 * headers or trusted locally; the raw Bearer token is forwarded unchanged so
 * `BootstrapAuthGuard` + `JwtAuthService.verifyAccessToken` performs full
 * cryptographic signature, expiration, and durable session verification.
 */
function decodeJwtClaimsHint(token: string): DecodedJwtClaimsHint {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) {
    return { realm: null, tenantId: null };
  }
  try {
    const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    const realm =
      typeof parsed.realm === "string" && parsed.realm.trim()
        ? parsed.realm.trim()
        : null;
    const rawTenantId = parsed.tenantId ?? parsed.tenant_id;
    const tenantId =
      typeof rawTenantId === "string" && rawTenantId.trim()
        ? rawTenantId.trim()
        : null;
    return { realm, tenantId };
  } catch {
    return { realm: null, tenantId: null };
  }
}

function hasInboundBootstrapSignal(requestHeaders: Headers): boolean {
  return BOOTSTRAP_IDENTITY_HEADER_KEYS.some((key) =>
    Boolean(requestHeaders.get(key)?.trim()),
  );
}

function inferBootstrapRealm(requestHeaders: Headers): string | null {
  const rawRealm = requestHeaders.get("x-realm")?.trim();
  if (rawRealm) {
    return rawRealm;
  }
  const actorType = requestHeaders.get("x-actor-type")?.trim();
  switch (actorType) {
    case "tenant_admin":
      return "tenant";
    case "ops_user":
      return "ops";
    case "platform_admin":
      return "platform";
    case "driver_user":
      return "driver";
    case "partner_api_key":
    case "partner_user":
    case "referral_passenger":
      return "partner";
    case "system":
      return "system";
    default:
      return actorType || null;
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

export function appendFleetPartnerQuery(
  path: string,
  fleetPartnerId: string | null,
): string {
  const trimmedFleetId = fleetPartnerId?.trim();
  if (!trimmedFleetId || !path.startsWith(TRAINING_ROUTE_PREFIX)) {
    return path;
  }
  const [pathname, rawSearch = ""] = path.split("?", 2);
  const params = new URLSearchParams(rawSearch);
  if (!params.has("fleetPartnerId")) {
    params.set("fleetPartnerId", trimmedFleetId);
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname!;
}

export async function getServerFleetTrainingClient(): Promise<ServerFleetTrainingClient> {
  const apiUrl = resolveServerApiBaseUrl();
  const requestHeaders = await nextHeaders();
  const explicitFleetPartnerId = resolveExplicitFleetPartnerId(requestHeaders);

  const defaultHeaders: Record<string, string> = {};
  let principalRealm: string | null = null;
  let principalSource: FleetTrainingPrincipalSource = "unauthenticated";
  let tenantIdFromPrincipal: string | null = null;

  const bearer = await extractInboundBearerToken(requestHeaders);
  const iapAssertion = extractIapJwtAssertion(requestHeaders);

  if (bearer) {
    defaultHeaders[bearer.headerName] = `Bearer ${bearer.token}`;
    const claims = decodeJwtClaimsHint(bearer.token);
    principalRealm = claims.realm;
    if (claims.realm === "tenant") {
      principalSource = "tenant_bearer_session";
      tenantIdFromPrincipal =
        claims.tenantId || requestHeaders.get(TENANT_ID_HEADER)?.trim() || null;
    } else {
      principalSource = "non_tenant_bearer_session";
    }
  } else if (iapAssertion) {
    defaultHeaders[CONTROL_PLANE_IAP_JWT_HEADER] = iapAssertion;
    principalRealm = "ops";
    principalSource = "iap_workforce_assertion";
  } else if (hasInboundBootstrapSignal(requestHeaders)) {
    // Forward only caller-supplied bootstrap headers in non-strict mode;
    // never synthesize or upgrade scopes/roles/realms.
    for (const key of BOOTSTRAP_IDENTITY_HEADER_KEYS) {
      const value = requestHeaders.get(key)?.trim();
      if (value) {
        defaultHeaders[key] = value;
      }
    }
    const inboundTenantId = requestHeaders.get(TENANT_ID_HEADER)?.trim();
    if (inboundTenantId) {
      defaultHeaders[TENANT_ID_HEADER] = inboundTenantId;
    }
    principalRealm = inferBootstrapRealm(requestHeaders);
    if (principalRealm === "tenant") {
      principalSource = "tenant_bootstrap_context";
      tenantIdFromPrincipal = inboundTenantId || null;
    } else {
      principalSource = "non_tenant_bootstrap_context";
    }
  }

  let fleetPartnerId: string | null = null;
  let queryFleetPartnerId: string | null = null;

  if (principalRealm === "tenant") {
    // Verified tenant identity derives its canonical fleet from `tenantId`.
    // If an explicit selector (`x-fleet-partner-id` or `DRTS_FLEET_PARTNER_ID`)
    // targets a different fleet, pass that requested selector in the query so
    // `FleetPartnerTrainingController.resolveFleetPartnerId` enforces the
    // `403 ACADEMY_FORBIDDEN_FLEET_ACCESS` isolation rule.
    fleetPartnerId = tenantIdFromPrincipal;
    if (tenantIdFromPrincipal) {
      defaultHeaders[TENANT_ID_HEADER] = tenantIdFromPrincipal;
    }
    if (
      explicitFleetPartnerId &&
      tenantIdFromPrincipal &&
      explicitFleetPartnerId !== tenantIdFromPrincipal
    ) {
      queryFleetPartnerId = explicitFleetPartnerId;
    } else {
      queryFleetPartnerId = null;
    }
  } else {
    if (!explicitFleetPartnerId && principalSource === "unauthenticated") {
      throw new Error(
        "Missing fleet scope configuration: DRTS_FLEET_PARTNER_ID environment variable or x-fleet-partner-id header is required.",
      );
    }
    fleetPartnerId = explicitFleetPartnerId;
    queryFleetPartnerId = explicitFleetPartnerId;
    if (explicitFleetPartnerId) {
      defaultHeaders[FLEET_PARTNER_ID_HEADER] = explicitFleetPartnerId;
    }
  }

  // Forward audit metadata without manufacturing authority from display email.
  const iapEmail = requestHeaders.get(CONTROL_PLANE_IAP_EMAIL_HEADER)?.trim();
  if (iapEmail) {
    defaultHeaders[CONTROL_PLANE_IAP_EMAIL_HEADER] = iapEmail;
  }

  const requestId = requestHeaders.get("x-request-id")?.trim();
  if (requestId) {
    defaultHeaders["x-request-id"] = requestId;
  }

  // Cloud Run service-to-service IAM perimeter token goes exclusively to
  // `x-serverless-authorization`, never `authorization`, so a Cloud Run
  // invocation identity is never treated as an application principal.
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
    pathTransform: (path) => appendFleetPartnerQuery(path, queryFleetPartnerId),
  });

  return {
    client,
    fleetPartnerId,
    queryFleetPartnerId,
    principalRealm,
    principalSource,
    async getFleetTrainingSummary(
      options?: RequestOptions,
    ): Promise<FleetTrainingView> {
      if (queryFleetPartnerId) {
        return client.get<FleetTrainingView>(
          appendFleetPartnerQuery(
            `${TRAINING_ROUTE_PREFIX}/summary`,
            queryFleetPartnerId,
          ),
          options,
        );
      }
      return client.getFleetTrainingSummary(options);
    },
    async listFleetDriverRoster(
      query?: { page?: number; pageSize?: number },
      options?: RequestOptions,
    ): Promise<ApiListData<FleetDriverRosterItem>> {
      if (queryFleetPartnerId) {
        const params = new URLSearchParams();
        if (query?.page !== undefined) params.set("page", String(query.page));
        if (query?.pageSize !== undefined) {
          params.set("pageSize", String(query.pageSize));
        }
        params.set("fleetPartnerId", queryFleetPartnerId);
        return client.get<ApiListData<FleetDriverRosterItem>>(
          `${TRAINING_ROUTE_PREFIX}/roster?${params.toString()}`,
          options,
        );
      }
      return client.listFleetDriverRoster(query, options);
    },
    async getFleetDriverQuizAttempt(
      driverId: string,
      attemptId: string,
      options?: RequestOptions,
    ): Promise<DriverQuizAttemptDetail> {
      if (queryFleetPartnerId) {
        return client.get<DriverQuizAttemptDetail>(
          appendFleetPartnerQuery(
            `${TRAINING_ROUTE_PREFIX}/drivers/${encodeURIComponent(driverId)}/attempts/${encodeURIComponent(attemptId)}`,
            queryFleetPartnerId,
          ),
          options,
        );
      }
      return client.getFleetDriverQuizAttempt(driverId, attemptId, options);
    },
  };
}
