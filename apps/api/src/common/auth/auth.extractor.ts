import type {
  AuthActorType,
  AuthBootstrapHeaders,
  AuthRealm,
  AuthRoleFamily,
  BootstrapRequestIdentity,
} from "./auth.types";
import { AUTH_ACTOR_TYPES, AUTH_MODE } from "./auth.types";
import {
  AUTH_ROLE_FAMILY_FROM_ACTOR_TYPE,
  AUTH_SCOPE_PRESETS,
} from "./auth.constants";
import { detectAuthEnvironment } from "../../config/auth-startup-config";

function isStrictAuthEnvironment(): boolean {
  const environment = detectAuthEnvironment(process.env);
  return environment === "production" || environment === "staging";
}

interface ExtractIdentityOptions {
  allowAnonymous: boolean;
  method?: string | undefined;
  requestUrl?: string | undefined;
  // Callers that mint a durable session record (POST /api/auth/token) must
  // not fall back to the deterministic `bootstrap:<actorId>` session id: two
  // independent exchanges for the same actor (e.g. mail bootstrap and a
  // running deploy acceptance session) would then collide on the same
  // iam.identity_sessions row and the newer exchange would overwrite the
  // older one's currentTokenId, invalidating a still-valid session. Guard-only
  // callers that never create a session row (bootstrap-auth.guard,
  // @CurrentIdentity) keep the deterministic default so repeat header-only
  // requests from the same actor can still correlate step-up proofs without
  // an explicit x-session-id header.
  requireExplicitSessionId?: boolean;
}

// x-tenant-id is a tenant *resource selector*, not proof of identity: a
// caller who sends only that header (no Bearer token, no other bootstrap
// identity header) must not be treated as an authenticated bootstrap actor.
function hasAuthSignal(headers: AuthBootstrapHeaders): boolean {
  return [
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
  ].some((key) => Boolean(headers[key]));
}

function normalizeHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function splitDelimitedList(value: string | string[] | undefined): string[] {
  const normalized = normalizeHeaderValue(value).trim();
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/[,|;]/)
    .flatMap((chunk) => chunk.split(/\s+/))
    .map((token) => token.trim())
    .filter(Boolean);
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function isAuthActorType(value: string): value is AuthActorType {
  return AUTH_ACTOR_TYPES.includes(value as AuthActorType);
}

function normalizeRealm(actorType: AuthActorType, rawRealm: string): AuthRealm {
  if (
    rawRealm === "system" ||
    rawRealm === "platform" ||
    rawRealm === "tenant" ||
    rawRealm === "ops" ||
    rawRealm === "driver" ||
    rawRealm === "partner"
  ) {
    return rawRealm;
  }

  switch (actorType) {
    case "platform_admin":
      return "platform";
    case "tenant_admin":
      return "tenant";
    case "ops_user":
      return "ops";
    case "driver_user":
      return "driver";
    case "partner_api_key":
    case "partner_user":
    case "referral_passenger":
      return "partner";
    default:
      return "system";
  }
}

function normalizeRoleFamilies(
  rawFamilies: string[],
  actorType: AuthActorType,
): AuthRoleFamily[] {
  const fromHeaders = rawFamilies.filter(
    (family): family is AuthRoleFamily =>
      family === "platform" ||
      family === "tenant" ||
      family === "ops" ||
      family === "driver" ||
      family === "partner",
  );

  const fromActorType = AUTH_ROLE_FAMILY_FROM_ACTOR_TYPE[actorType];

  return dedupe([...fromHeaders, ...fromActorType]) as AuthRoleFamily[];
}

function deriveScopes(
  actorType: AuthActorType,
  explicitScopes: string[],
): string[] {
  if (explicitScopes.length > 0) {
    return dedupe(explicitScopes);
  }

  return [...AUTH_SCOPE_PRESETS[actorType]];
}

export function extractBootstrapRequestIdentity(
  headers: AuthBootstrapHeaders,
  options: ExtractIdentityOptions,
): BootstrapRequestIdentity | null {
  const hasSignal = hasAuthSignal(headers);
  if (!hasSignal && !options.allowAnonymous) {
    return null;
  }

  if (!hasSignal && options.allowAnonymous) {
    return {
      authMode: AUTH_MODE,
      actorType: "system",
      actorId: null,
      realm: "system",
      tenantId: null,
      roleFamilies: [],
      roles: [],
      scopes: [],
      requestId: normalizeHeaderValue(headers["x-request-id"]) || null,
      partnerId: null,
      partnerProgramId: null,
      partnerEntrySlug: null,
    };
  }

  const actorTypeHeader = normalizeHeaderValue(headers["x-actor-type"]);
  const actorType: AuthActorType = isAuthActorType(actorTypeHeader)
    ? actorTypeHeader
    : "system";
  const roles = dedupe(
    splitDelimitedList(headers["x-roles"]).length > 0
      ? splitDelimitedList(headers["x-roles"])
      : [actorType],
  );
  const explicitRoleFamilies = splitDelimitedList(headers["x-role-families"]);
  const scopes = deriveScopes(
    actorType,
    splitDelimitedList(headers["x-scopes"]),
  );
  const realm = normalizeRealm(
    actorType,
    normalizeHeaderValue(headers["x-realm"]),
  );

  return {
    authMode: AUTH_MODE,
    actorType,
    actorId: normalizeHeaderValue(headers["x-actor-id"]) || null,
    realm,
    tenantId: normalizeHeaderValue(headers["x-tenant-id"]) || null,
    partnerId: normalizeHeaderValue(headers["x-partner-id"]) || null,
    partnerProgramId:
      normalizeHeaderValue(headers["x-partner-program-id"]) || null,
    partnerEntrySlug:
      normalizeHeaderValue(headers["x-partner-entry-slug"]) || null,
    drtsPassengerId:
      normalizeHeaderValue(headers["x-drts-passenger-id"]) ||
      normalizeHeaderValue(headers["x-actor-id"]) ||
      null,
    roleFamilies: normalizeRoleFamilies(explicitRoleFamilies, actorType),
    roles,
    scopes,
    requestId: normalizeHeaderValue(headers["x-request-id"]) || null,
    authTime:
      normalizeHeaderValue(headers["x-auth-time"]) ||
      (isStrictAuthEnvironment() ? null : new Date().toISOString()),
    // The `tenant_bootstrap_fixture` dev default is scoped to `tenant_admin`
    // only -- it's the documented non-strict login-gate fixture for tenant
    // high-privilege roles (trusted-mfa.policy.ts). Applying it to every
    // actor type would make it the amr for platform_admin/ops_user bootstrap
    // identities too, and `tenant_bootstrap_fixture` is itself a trusted amr
    // in non-strict environments (NON_STRICT_TRUSTED_AMR): that silently
    // satisfies the workforce step-up MFA gate's `hasTrustedMfa` check for
    // every dev bootstrap session regardless of the explicit
    // DRTS_DEV_MFA_WAIVED waiver (ENTRY-IAP-WORKFORCE-AUTH-20261005).
    amr:
      splitDelimitedList(headers["x-amr"]).length > 0
        ? splitDelimitedList(headers["x-amr"])
        : isStrictAuthEnvironment() || actorType !== "tenant_admin"
          ? []
          : ["tenant_bootstrap_fixture"],
    sessionId:
      normalizeHeaderValue(headers["x-session-id"]) ||
      (isStrictAuthEnvironment() || options.requireExplicitSessionId
        ? null
        : actorTypeHeader
          ? `bootstrap:${normalizeHeaderValue(headers["x-actor-id"]) || "anon"}`
          : null),
  };
}

export function normalizeDriverId(
  actorId: string | null | undefined,
): string | null {
  if (!actorId) {
    return null;
  }
  const trimmed = actorId.trim();
  if (trimmed.startsWith("e2e-driver-")) {
    return trimmed.slice("e2e-driver-".length);
  }
  return trimmed;
}

export function isDriverIdentityMatching(
  actorId: string | null | undefined,
  targetDriverId: string | null | undefined,
): boolean {
  const normActor = normalizeDriverId(actorId);
  const normTarget = normalizeDriverId(targetDriverId);
  if (!normActor || !normTarget) {
    return false;
  }
  return normActor === normTarget;
}

