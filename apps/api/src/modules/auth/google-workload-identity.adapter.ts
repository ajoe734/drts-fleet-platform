import { createHash, createPublicKey } from "node:crypto";

import type { CanonicalIdentityPrincipalRecord } from "@drts/contracts";
import { Injectable, Logger } from "@nestjs/common";
import * as jwt from "jsonwebtoken";

import { ApiRequestError } from "../../common/api-envelope";
import { matchesScope } from "../../common/auth/internal-key-exception-registry";
import { detectAuthEnvironment } from "../../config/auth-startup-config";
import { IdentityRepository } from "../identity/identity.repository";

// Google-native OIDC/WIF verification: callers already mint a real
// Google-signed identity token (GitHub Actions via
// `google-github-actions/auth@v2`, or a Cloud Run service via its metadata
// server) and present it here instead of a shared `x-drts-internal-key`
// secret. Verification uses Google's own public JWKS -- nobody in this repo
// holds or invents the signing key, unlike `WORKLOAD_IDENTITY_JWT_SECRET_OR_PUBLIC_KEY`
// (see `DEV-WI-SECRETS-001`, #1320, which explicitly rejected provisioning
// that material in dev/staging).

type HeaderValue = string | string[] | undefined;
type HeaderRecord = Record<string, HeaderValue>;

export const GOOGLE_WORKLOAD_IDENTITY_HEADER = "x-drts-google-id-token";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const JWKS_CACHE_TTL_MS = 10 * 60 * 1000;

interface GoogleJwk {
  kty: string;
  kid: string;
  n: string;
  e: string;
}

interface GoogleJwks {
  keys: GoogleJwk[];
}

export interface CiTenantActorGrant {
  tenantId: string;
  actorType: string;
  actorId: string;
}

export interface RegisteredGooglePrincipal {
  serviceAccountEmail: string;
  principalId: string;
  actorId?: string | null;
  displayName?: string | null;
  roles?: string[] | null;
  scopes?: string[] | null;
  allowedTokenAudiences: string[];
  ciTenantActorGrants?: CiTenantActorGrant[] | null;
  // Per-principal least-privilege route allowlist, using the same
  // "METHOD path" scope pattern DSL (and matcher) as
  // `InternalKeyExceptionMetadata.scope` -- a verified principal is only
  // granted bypass of `InternalKeyMiddleware` for routes it is explicitly
  // registered for, not every route the middleware guards.
  routeScopes: string[];
}

export interface ResolvedGoogleWorkloadIdentity {
  principalId: string;
  actorId: string;
  email: string;
  subject: string;
  displayName: string | null;
  roles: string[];
  scopes: string[];
  audience: string;
  authTime: string;
  ciTenantActorGrants: CiTenantActorGrant[];
}

type GooglePayload = jwt.JwtPayload & {
  email?: string;
  email_verified?: boolean;
  sub?: string;
  aud?: string | string[];
  iss?: string;
};

let cachedJwks: { fetchedAt: number; jwks: GoogleJwks } | null = null;

function normalizeHeaderValue(value: HeaderValue): string {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }
  return typeof value === "string" ? value.trim() : "";
}

function hashAssertion(assertion: string): string {
  return createHash("sha256").update(assertion).digest("hex");
}

function unique(values: readonly string[] | null | undefined): string[] {
  return [
    ...new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  ];
}

export function extractGoogleWorkloadIdentityAssertion(
  headers: HeaderRecord | undefined,
): string | null {
  return (
    normalizeHeaderValue(headers?.[GOOGLE_WORKLOAD_IDENTITY_HEADER]) || null
  );
}

async function fetchGoogleJwks(forceRefresh = false): Promise<GoogleJwks> {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedJwks &&
    now - cachedJwks.fetchedAt < JWKS_CACHE_TTL_MS
  ) {
    return cachedJwks.jwks;
  }

  let response: Response;
  try {
    response = await fetch(GOOGLE_JWKS_URL);
  } catch (error) {
    throw new ApiRequestError(
      503,
      "WORKLOAD_IDENTITY_GOOGLE_JWKS_UNAVAILABLE",
      "Unable to retrieve Google's public JWKS for workload identity verification.",
      { detail: error instanceof Error ? error.message : String(error) },
    );
  }
  if (!response.ok) {
    throw new ApiRequestError(
      503,
      "WORKLOAD_IDENTITY_GOOGLE_JWKS_UNAVAILABLE",
      "Unable to retrieve Google's public JWKS for workload identity verification.",
      { status: response.status },
    );
  }

  const jwks = (await response.json()) as GoogleJwks;
  cachedJwks = { fetchedAt: now, jwks };
  return jwks;
}

/**
 * True only for the specific "registry env var not set" condition, so the
 * middleware can fall back to `x-drts-internal-key` while EXCP_002 is still
 * active, without masking a genuine verification failure (bad signature,
 * wrong audience, unregistered principal, replay) the same way.
 */
export function isGoogleWorkloadIdentityNotConfigured(
  error: unknown,
): boolean {
  return (
    error instanceof ApiRequestError &&
    error.code === "WORKLOAD_IDENTITY_GOOGLE_NOT_CONFIGURED"
  );
}

@Injectable()
export class GoogleWorkloadIdentityAdapter {
  private readonly logger = new Logger(GoogleWorkloadIdentityAdapter.name);

  constructor(private readonly identityRepository: IdentityRepository) {}

  async verifyServicePrincipal(
    headers: HeaderRecord,
    context: { requestPath?: string | undefined; requestMethod?: string | undefined },
  ): Promise<ResolvedGoogleWorkloadIdentity> {
    const token = extractGoogleWorkloadIdentityAssertion(headers);
    if (!token) {
      throw new ApiRequestError(
        401,
        "WORKLOAD_ASSERTION_MISSING",
        "Missing required Google workload identity bearer assertion.",
      );
    }

    const registry = this.loadRegistry();
    const payload = await this.verifyToken(token);

    const issuer = typeof payload.iss === "string" ? payload.iss.trim() : "";
    if (!GOOGLE_ISSUERS.includes(issuer)) {
      throw new ApiRequestError(
        403,
        "WORKLOAD_ISSUER_MISMATCH",
        "Google workload identity assertion issuer is not Google's OIDC issuer.",
      );
    }

    const email =
      typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const subject = typeof payload.sub === "string" ? payload.sub.trim() : "";
    if (!email || payload.email_verified !== true || !subject) {
      throw new ApiRequestError(
        401,
        "WORKLOAD_ASSERTION_INVALID",
        "Google workload identity assertion is missing a verified service account email.",
      );
    }

    const audience = Array.isArray(payload.aud)
      ? payload.aud[0]?.trim() ?? ""
      : payload.aud?.trim() ?? "";
    if (!audience) {
      throw new ApiRequestError(
        401,
        "WORKLOAD_ASSERTION_INVALID",
        "Google workload identity assertion is missing an audience claim.",
      );
    }

    if (typeof payload.exp !== "number" || typeof payload.iat !== "number") {
      throw new ApiRequestError(
        401,
        "WORKLOAD_ASSERTION_INVALID",
        "Google workload identity assertion is missing temporal claims.",
      );
    }

    const principal = registry.find(
      (entry) => entry.serviceAccountEmail?.trim().toLowerCase() === email,
    );
    if (!principal || !principal.principalId?.trim()) {
      throw new ApiRequestError(
        403,
        "WORKLOAD_PRINCIPAL_NOT_REGISTERED",
        "Verified Google workload identity is not registered for API access.",
      );
    }

    const allowedAudiences = unique(principal.allowedTokenAudiences);
    if (!allowedAudiences.includes(audience)) {
      throw new ApiRequestError(
        403,
        "WORKLOAD_AUDIENCE_MISMATCH",
        "Google workload identity assertion audience is not allowed for this registered principal.",
        { principalId: principal.principalId },
      );
    }

    const routeScopes = unique(principal.routeScopes);
    const routeAllowed = routeScopes.some((pattern) =>
      matchesScope(pattern, context.requestMethod, context.requestPath),
    );
    if (!routeAllowed) {
      this.logger.warn(
        `[AUTH_GOOGLE_WORKLOAD_IDENTITY_ROUTE_SCOPE_DENIED] principalId=${principal.principalId} email=${email} route=${context.requestMethod ?? "GET"} ${context.requestPath ?? "*"}`,
      );
      throw new ApiRequestError(
        403,
        "WORKLOAD_ROUTE_SCOPE_DENIED",
        "Verified Google workload identity is not authorized for the requested route.",
        {
          principalId: principal.principalId,
          route: `${context.requestMethod ?? "GET"} ${context.requestPath ?? "*"}`,
        },
      );
    }

    const replayAccepted =
      await this.identityRepository.consumeWorkloadIdentityAssertion({
        assertionHash: hashAssertion(token),
        issuer,
        subject,
        exchangeAudience: audience,
        tokenAudience: audience,
        exchangeNonceHash: null,
        principalId: principal.principalId,
        expiresAt: new Date(payload.exp * 1000).toISOString(),
      });
    if (!replayAccepted) {
      throw new ApiRequestError(
        409,
        "WORKLOAD_ASSERTION_REPLAYED",
        "Google workload identity assertion has already been consumed.",
      );
    }

    const authTime = new Date(payload.iat * 1000).toISOString();
    const principalRecord: CanonicalIdentityPrincipalRecord = {
      principalId: principal.principalId,
      sourceRef: `google_workload_identity:${principal.principalId}`,
      issuer,
      subject,
      principalType: "service",
      email,
      emailVerified: true,
      displayName: principal.displayName ?? null,
      status: "active",
      createdAt: authTime,
      updatedAt: authTime,
    };
    await this.identityRepository.ensurePrincipalRecord(principalRecord);

    this.logger.log(
      `[AUTH_GOOGLE_WORKLOAD_IDENTITY_USED] principalId=${principal.principalId} email=${email} route=${context.requestMethod ?? "GET"} ${context.requestPath ?? "*"}`,
    );

    return {
      principalId: principal.principalId,
      actorId: principal.actorId?.trim() || principal.principalId,
      email,
      subject,
      displayName: principal.displayName ?? null,
      roles: unique(principal.roles),
      scopes: unique(principal.scopes),
      audience,
      authTime,
      ciTenantActorGrants: principal.ciTenantActorGrants ?? [],
    };
  }

  private loadRegistry(): RegisteredGooglePrincipal[] {
    const raw = process.env.WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS?.trim();
    if (!raw) {
      throw new ApiRequestError(
        503,
        "WORKLOAD_IDENTITY_GOOGLE_NOT_CONFIGURED",
        "Google workload identity verification is not configured for this environment.",
        { requiredEnv: ["WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS"] },
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new ApiRequestError(
        503,
        "WORKLOAD_IDENTITY_GOOGLE_NOT_CONFIGURED",
        "Google workload identity service principal registry is not valid JSON.",
        { detail: error instanceof Error ? error.message : String(error) },
      );
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new ApiRequestError(
        503,
        "WORKLOAD_IDENTITY_GOOGLE_NOT_CONFIGURED",
        "Google workload identity service principal registry must be a non-empty JSON array.",
      );
    }

    const invalid = (parsed as RegisteredGooglePrincipal[]).find(
      (entry) =>
        !entry.serviceAccountEmail?.trim() ||
        !entry.principalId?.trim() ||
        !Array.isArray(entry.allowedTokenAudiences) ||
        entry.allowedTokenAudiences.length === 0 ||
        !Array.isArray(entry.routeScopes) ||
        entry.routeScopes.length === 0,
    );
    if (invalid) {
      throw new ApiRequestError(
        503,
        "WORKLOAD_IDENTITY_GOOGLE_NOT_CONFIGURED",
        "Google workload identity service principal registry entries must declare serviceAccountEmail, principalId, allowedTokenAudiences, and routeScopes.",
      );
    }

    return parsed as RegisteredGooglePrincipal[];
  }

  private async verifyToken(token: string): Promise<GooglePayload> {
    let decoded: { header: { kid?: string; alg?: string } } | null;
    try {
      decoded = jwt.decode(token, { complete: true }) as {
        header: { kid?: string; alg?: string };
      } | null;
    } catch {
      decoded = null;
    }
    if (!decoded?.header?.kid || decoded.header.alg !== "RS256") {
      throw new ApiRequestError(
        401,
        "WORKLOAD_ASSERTION_INVALID",
        "Google workload identity assertion has an unsupported or missing key id / algorithm.",
      );
    }
    const kid = decoded.header.kid;

    let jwks = await fetchGoogleJwks();
    let jwk = jwks.keys.find((key) => key.kid === kid);
    if (!jwk) {
      jwks = await fetchGoogleJwks(true);
      jwk = jwks.keys.find((key) => key.kid === kid);
    }
    if (!jwk) {
      throw new ApiRequestError(
        401,
        "WORKLOAD_ASSERTION_INVALID",
        "Google workload identity assertion signing key is not recognized.",
      );
    }

    let publicKey;
    try {
      publicKey = createPublicKey({
        key: { kty: jwk.kty, n: jwk.n, e: jwk.e },
        format: "jwk",
      });
    } catch {
      throw new ApiRequestError(
        401,
        "WORKLOAD_ASSERTION_INVALID",
        "Google workload identity assertion signing key could not be parsed.",
      );
    }

    try {
      return jwt.verify(token, publicKey, {
        algorithms: ["RS256"],
      }) as GooglePayload;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ApiRequestError(
        401,
        "WORKLOAD_ASSERTION_INVALID",
        `Google workload identity assertion failed verification: ${message}`,
      );
    }
  }
}

/**
 * Deliberately narrow: only used to let `POST /api/auth/token` mint a
 * tenant/ops session for a fixed, pre-registered (tenantId, actorType,
 * actorId) tuple on behalf of CI's post-deploy acceptance probe. This is not
 * general tenant impersonation -- `ServiceWorkloadIdentityAdapter`'s own
 * resolution path stays hardcoded to `actorType: "system"` -- and it is
 * inert unless explicitly turned on for a non-production environment.
 */
export function isCiTenantActorGateEnabled(): boolean {
  if (
    process.env.WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED?.trim().toLowerCase() !==
    "true"
  ) {
    return false;
  }
  return detectAuthEnvironment(process.env) !== "production";
}

export function resolveCiTenantActorGrant(
  resolved: ResolvedGoogleWorkloadIdentity,
  requested: { tenantId: string; actorType: string; actorId: string },
): CiTenantActorGrant | null {
  if (!isCiTenantActorGateEnabled()) {
    return null;
  }
  if (!requested.tenantId || !requested.actorType || !requested.actorId) {
    return null;
  }
  return (
    resolved.ciTenantActorGrants.find(
      (grant) =>
        grant.tenantId === requested.tenantId &&
        grant.actorType === requested.actorType &&
        grant.actorId === requested.actorId,
    ) ?? null
  );
}
