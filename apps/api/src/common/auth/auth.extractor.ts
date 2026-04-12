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

interface ExtractIdentityOptions {
  allowAnonymous: boolean;
  method?: string | undefined;
  requestUrl?: string | undefined;
}

function hasAuthSignal(headers: AuthBootstrapHeaders): boolean {
  return [
    "x-actor-type",
    "x-actor-id",
    "x-realm",
    "x-roles",
    "x-role-families",
    "x-scopes",
    "x-auth-mode",
    "x-tenant-id",
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
    rawRealm === "driver"
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
      family === "driver",
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
    roleFamilies: normalizeRoleFamilies(explicitRoleFamilies, actorType),
    roles,
    scopes,
    requestId: normalizeHeaderValue(headers["x-request-id"]) || null,
  };
}
