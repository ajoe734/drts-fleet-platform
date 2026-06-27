import jwt from "jsonwebtoken";

export const CONTROL_PLANE_REQUEST_AUTH_HEADER = "x-drts-authorization";
export const CONTROL_PLANE_IAP_EMAIL_HEADER = "x-goog-authenticated-user-email";
export const CONTROL_PLANE_IAP_USER_ID_HEADER = "x-goog-authenticated-user-id";

export const CONTROL_PLANE_DEFAULT_EMAILS = {
  platform_admin: "admin@platform.drts",
  ops_user: "ops@platform.drts",
} as const;

export const CONTROL_PLANE_REQUEST_HEADER_BLOCKLIST = new Set([
  "authorization",
  CONTROL_PLANE_REQUEST_AUTH_HEADER,
  "x-actor-type",
  "x-actor-id",
  "x-realm",
  "x-tenant-id",
  "x-roles",
  "x-role-families",
  "x-scopes",
  "x-auth-mode",
]);

export type ControlPlaneActorType = "platform_admin" | "ops_user";

type HeaderRecord =
  | Headers
  | Record<string, string | string[] | undefined>
  | undefined
  | null;

type AuthRoleFamily = "platform" | "ops";
type AuthRealm = "platform" | "ops";

type JwtExpiresIn = Extract<NonNullable<jwt.SignOptions["expiresIn"]>, string>;

export interface ControlPlaneIdentity {
  authMode: "bootstrap_headers" | "jwt_bearer";
  actorType: ControlPlaneActorType;
  actorId: string;
  realm: AuthRealm;
  tenantId: null;
  roleFamilies: AuthRoleFamily[];
  roles: string[];
  scopes: string[];
  requestId: string | null;
}

export interface ControlPlaneRequestAuth {
  authenticatedUserEmail: string;
  identity: ControlPlaneIdentity;
  headers: Record<string, string>;
}

const CONTROL_PLANE_ROLE_FAMILIES: Record<
  ControlPlaneActorType,
  AuthRoleFamily[]
> = {
  platform_admin: ["platform"],
  ops_user: ["ops"],
};

const CONTROL_PLANE_REALMS: Record<ControlPlaneActorType, AuthRealm> = {
  platform_admin: "platform",
  ops_user: "ops",
};

const CONTROL_PLANE_SCOPE_PRESETS: Record<ControlPlaneActorType, string[]> = {
  platform_admin: [
    "identity:read",
    "foundation:read",
    "foundation:write",
    "audit:read",
    "notifications:read",
    "notifications:write",
    "tenant:read",
    "tenant:write",
    "tenant:webhooks:read",
    "tenant:webhooks:write",
    "tenant:sla:read",
    "tenant:sla:write",
    "tenant:billing:read",
    "tenant:billing:write",
    "billing:read",
    "billing:write",
    "regulatory:read",
    "regulatory:write",
    "incident:read",
    "incident:write",
    "maintenance:read",
    "maintenance:write",
    "reports:read",
    "reports:write",
    "forwarder:read",
  ],
  ops_user: [
    "identity:read",
    "audit:read",
    "notifications:read",
    "notifications:write",
    "regulatory:read",
    "regulatory:write",
    "callcenter:read",
    "callcenter:write",
    "complaints:read",
    "complaints:write",
    "incident:read",
    "incident:write",
    "maintenance:read",
    "maintenance:write",
    "owned:read",
    "owned:write",
    "dispatch:read",
    "dispatch:write",
    "billing:read",
    "billing:write",
    "reports:read",
    "reports:write",
    "forwarder:read",
    "forwarder:write",
  ],
};

const PLATFORM_ADMIN_DIRECTORY = {
  "admin@platform.drts": {
    actorId: "pa-admin-001",
    roles: ["superadmin"],
  },
  "ops@platform.drts": {
    actorId: "pa-operator-001",
    roles: ["operator"],
  },
} as const;

function readHeader(headers: HeaderRecord, key: string): string | null {
  if (!headers) {
    return null;
  }

  if (headers instanceof Headers) {
    return headers.get(key);
  }

  const exact = headers[key];
  if (Array.isArray(exact)) {
    return exact[0] ?? null;
  }
  if (typeof exact === "string") {
    return exact;
  }

  const normalizedKey = key.toLowerCase();
  for (const [candidateKey, candidateValue] of Object.entries(headers)) {
    if (candidateKey.toLowerCase() !== normalizedKey) {
      continue;
    }
    if (Array.isArray(candidateValue)) {
      return candidateValue[0] ?? null;
    }
    return candidateValue ?? null;
  }

  return null;
}

function normalizeAuthenticatedUserEmail(
  rawValue: string | null,
): string | null {
  const normalized = rawValue?.trim();
  if (!normalized) {
    return null;
  }

  const emailMatch = normalized.match(
    /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})$/i,
  );
  return emailMatch?.[1]?.toLowerCase() ?? normalized.toLowerCase();
}

function toActorSlug(email: string): string {
  return email.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "user";
}

function resolvePlatformAdminIdentity(email: string) {
  const known =
    PLATFORM_ADMIN_DIRECTORY[email as keyof typeof PLATFORM_ADMIN_DIRECTORY];
  if (known) {
    return {
      actorId: known.actorId,
      roles: [...known.roles],
    };
  }

  return {
    actorId: `platform-admin-${toActorSlug(email)}`,
    roles: ["platform_admin"],
  };
}

function buildIdentity(
  actorType: ControlPlaneActorType,
  authenticatedUserEmail: string,
  requestId?: string | null,
  authMode: ControlPlaneIdentity["authMode"] = "jwt_bearer",
): ControlPlaneIdentity {
  if (actorType === "platform_admin") {
    const platformIdentity = resolvePlatformAdminIdentity(
      authenticatedUserEmail,
    );

    return {
      authMode,
      actorType,
      actorId: platformIdentity.actorId,
      realm: CONTROL_PLANE_REALMS[actorType],
      tenantId: null,
      roleFamilies: [...CONTROL_PLANE_ROLE_FAMILIES[actorType]],
      roles: platformIdentity.roles,
      scopes: [...CONTROL_PLANE_SCOPE_PRESETS[actorType]],
      requestId: requestId ?? null,
    };
  }

  return {
    authMode,
    actorType,
    actorId: `ops-user-${toActorSlug(authenticatedUserEmail)}`,
    realm: CONTROL_PLANE_REALMS[actorType],
    tenantId: null,
    roleFamilies: [...CONTROL_PLANE_ROLE_FAMILIES[actorType]],
    roles: ["ops_user"],
    scopes: [...CONTROL_PLANE_SCOPE_PRESETS[actorType]],
    requestId: requestId ?? null,
  };
}

export function extractAuthenticatedUserEmail(
  headers: HeaderRecord,
): string | null {
  const emailHeader = readHeader(headers, CONTROL_PLANE_IAP_EMAIL_HEADER);
  const userIdHeader = readHeader(headers, CONTROL_PLANE_IAP_USER_ID_HEADER);

  return (
    normalizeAuthenticatedUserEmail(emailHeader) ||
    normalizeAuthenticatedUserEmail(userIdHeader)
  );
}

export function stripControlPlaneAuthQueryParams(targetUrl: URL) {
  for (const key of [
    "actorType",
    "actorId",
    "realm",
    "tenantId",
    "roles",
    "roleFamilies",
    "scopes",
    "authMode",
    "requestId",
  ]) {
    targetUrl.searchParams.delete(key);
  }
}

export function issueControlPlaneRequestAuth(options: {
  actorType: ControlPlaneActorType;
  headers?: HeaderRecord | undefined;
  defaultEmail?: string | undefined;
  jwtSecret?: string | undefined;
  jwtIssuer?: string | undefined;
  jwtAudience?: string | undefined;
  expiresIn?: JwtExpiresIn | undefined;
  requestId?: string | null;
}): ControlPlaneRequestAuth {
  const authenticatedUserEmail =
    extractAuthenticatedUserEmail(options.headers) ||
    normalizeAuthenticatedUserEmail(options.defaultEmail ?? null) ||
    CONTROL_PLANE_DEFAULT_EMAILS[options.actorType];

  if (!authenticatedUserEmail) {
    throw new Error("Control-plane authenticated user email is unavailable.");
  }

  const hasJwtSecret = Boolean(options.jwtSecret?.trim());
  const identity = buildIdentity(
    options.actorType,
    authenticatedUserEmail,
    options.requestId,
    hasJwtSecret ? "jwt_bearer" : "bootstrap_headers",
  );

  if (!hasJwtSecret) {
    return {
      authenticatedUserEmail,
      identity,
      headers: {
        "x-actor-type": identity.actorType,
        "x-actor-id": identity.actorId,
        "x-realm": identity.realm,
        "x-roles": identity.roles.join(","),
        "x-role-families": identity.roleFamilies.join(","),
        "x-scopes": identity.scopes.join(","),
      },
    };
  }

  const signOptions: jwt.SignOptions = {
    expiresIn: options.expiresIn ?? "15m",
  };

  if (options.jwtIssuer) {
    signOptions.issuer = options.jwtIssuer;
  }
  if (options.jwtAudience) {
    signOptions.audience = options.jwtAudience;
  }

  const token = jwt.sign(
    {
      sub: identity.actorId,
      actorType: identity.actorType,
      realm: identity.realm,
      tenantId: null,
      roleFamilies: identity.roleFamilies,
      roles: identity.roles,
      scopes: identity.scopes,
    },
    options.jwtSecret!,
    signOptions,
  );

  return {
    authenticatedUserEmail,
    identity,
    headers: {
      [CONTROL_PLANE_REQUEST_AUTH_HEADER]: `Bearer ${token}`,
    },
  };
}
