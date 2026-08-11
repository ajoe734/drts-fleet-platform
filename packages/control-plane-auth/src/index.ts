import jwt from "jsonwebtoken";

export const CONTROL_PLANE_REQUEST_AUTH_HEADER = "x-drts-authorization";
export const CONTROL_PLANE_IAP_EMAIL_HEADER = "x-goog-authenticated-user-email";
export const CONTROL_PLANE_IAP_USER_ID_HEADER = "x-goog-authenticated-user-id";
export const CONTROL_PLANE_IAP_JWT_HEADER = "x-goog-iap-jwt-assertion";
export const CONTROL_PLANE_IAP_JWT_HEADER_ALT = "x-goog-authenticated-user-jwt";

/**
 * Issuer/audience the API validates against when JWT_ISSUER / JWT_AUDIENCE are
 * unset. They live here, not in the API, because the control-plane web apps
 * mint the proxy token the API verifies: when the two sides each kept their own
 * default the minted token carried no `iss`/`aud` while the API had started
 * requiring them, and every proxied request failed with JWT_INVALID.
 */
export const DEFAULT_CONTROL_PLANE_JWT_ISSUER =
  "https://auth.local.drts.internal";
export const DEFAULT_CONTROL_PLANE_JWT_AUDIENCE =
  "https://api.local.drts.internal";

export interface IapJwtPayload {
  sub: string;
  email?: string;
  aud?: string;
  iss?: string;
  exp?: number;
  iat?: number;
  hd?: string;
  gcp_ia_groups?: string[];
  groups?: string[];
  [key: string]: unknown;
}
export interface VerifyIapAssertionOptions {
  expectedAudience?: string | undefined;
  expectedIssuer?: string | undefined;
  jwtSecretOrPublicKey?: string | undefined;
}

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

export type ControlPlaneAuthEnvironment =
  | "production"
  | "staging"
  | "local"
  | "test";

type EnvLike = Record<string, string | undefined>;

/**
 * Mirrors `detectAuthEnvironment` in the API so the control-plane web apps
 * classify their deployment the same way the API does. `NODE_ENV` is a build
 * mode and is always `production` inside a deployed Next.js bundle, so on its
 * own it can never tell a dev deployment apart from production — the
 * deployment environment has to come from `DRTS_ENV`/`APP_ENV` first.
 */
export function detectControlPlaneAuthEnvironment(
  env: EnvLike = process.env,
): ControlPlaneAuthEnvironment {
  const raw = (env.DRTS_ENV ?? env.APP_ENV ?? env.NODE_ENV)
    ?.trim()
    .toLowerCase();

  if (raw === "prod" || raw === "production") {
    return "production";
  }
  if (raw === "stage" || raw === "staging") {
    return "staging";
  }
  if (raw === "test" || raw === "testing" || raw === "ci") {
    return "test";
  }
  if (
    raw === "dev" ||
    raw === "development" ||
    raw === "local" ||
    raw === "sandbox"
  ) {
    return "local";
  }

  if ((env.CI ?? "").trim().toLowerCase() === "true") {
    return "test";
  }

  return "local";
}

/**
 * Strict IAP mode is required wherever a real IAP sits in front of the app.
 * `STRICT_IAP_MODE=true` forces it on anywhere; otherwise it follows the same
 * production/staging rule the API's bootstrap auth guard uses.
 */
export function isStrictControlPlaneIapEnvironment(
  env: EnvLike = process.env,
): boolean {
  if (env.STRICT_IAP_MODE === "true") {
    return true;
  }
  const environment = detectControlPlaneAuthEnvironment(env);
  return environment === "production" || environment === "staging";
}

export type HeaderRecord =
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
  subject?: string | null;
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

// These presets are minted into `x-scopes` (or the JWT `scopes` claim) by the
// control-plane proxy, and the API's `deriveScopes()` honours explicit scopes
// verbatim — so for a browser request these REPLACE, rather than supplement,
// `AUTH_SCOPE_PRESETS` in `apps/api/src/common/auth/auth.constants.ts`.
//
// Source of truth for the grant per actor type is that API table; this copy
// exists only because the package must stay dependency-free. Any scope added
// there for `ops_user` / `platform_admin` must be mirrored here or the surface
// that needs it 403s with `AUTH_SCOPE_DENIED` from the browser while passing
// every server-side test. Parity is pinned by
// `apps/api/tests/unit/ops-driver-tasks-scope.test.ts`.
const CONTROL_PLANE_SCOPE_PRESETS: Record<ControlPlaneActorType, string[]> = {
  platform_admin: [
    "identity:break-glass:request",
    "identity:break-glass:approve",
    "identity:break-glass:activate",
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
    "sandbox.compliance.read",
    "sandbox.compliance.manage",
    "sandbox.investigation.read",
    "sandbox.investigation.manage",
    "sandbox.evidence.preview",
    "sandbox.evidence.export.request",
    "sandbox.evidence.export.approve",
    "sandbox.legal_hold.place",
    "sandbox.legal_hold.release.request",
    "sandbox.legal_hold.release.approve",
    "sandbox.regulatory_report.review",
    "sandbox.regulatory_report.submit",
    "multi_taxi_ratings:read",
    "multi_taxi_ratings:moderate",
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
    "driver:read",
    "billing:read",
    "billing:write",
    "reports:read",
    "reports:write",
    "forwarder:read",
    "forwarder:write",
    "sandbox.compliance.read",
    "sandbox.investigation.read",
    "sandbox.evidence.preview",
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
  subject?: string | null,
  overrideRoles?: string[],
): ControlPlaneIdentity {
  const known =
    PLATFORM_ADMIN_DIRECTORY[
      authenticatedUserEmail as keyof typeof PLATFORM_ADMIN_DIRECTORY
    ];

  if (actorType === "platform_admin") {
    const platformIdentity = resolvePlatformAdminIdentity(
      authenticatedUserEmail,
    );

    return {
      authMode,
      actorType,
      actorId: known
        ? known.actorId
        : subject
          ? `iap-subject-${toActorSlug(subject)}`
          : platformIdentity.actorId,
      ...(subject ? { subject } : {}),
      realm: CONTROL_PLANE_REALMS[actorType],
      tenantId: null,
      roleFamilies: [...CONTROL_PLANE_ROLE_FAMILIES[actorType]],
      roles: overrideRoles ?? platformIdentity.roles,
      scopes: [...CONTROL_PLANE_SCOPE_PRESETS[actorType]],
      requestId: requestId ?? null,
    };
  }

  return {
    authMode,
    actorType,
    actorId: known
      ? known.actorId
      : subject
        ? `iap-subject-${toActorSlug(subject)}`
        : `ops-user-${toActorSlug(authenticatedUserEmail)}`,
    ...(subject ? { subject } : {}),
    realm: CONTROL_PLANE_REALMS[actorType],
    tenantId: null,
    roleFamilies: [...CONTROL_PLANE_ROLE_FAMILIES[actorType]],
    roles: overrideRoles ?? ["ops_user"],
    scopes: [...CONTROL_PLANE_SCOPE_PRESETS[actorType]],
    requestId: requestId ?? null,
  };
}

export function extractIapJwtAssertion(headers: HeaderRecord): string | null {
  const jwtHeader = readHeader(headers, CONTROL_PLANE_IAP_JWT_HEADER);
  if (jwtHeader?.trim()) {
    return jwtHeader.trim();
  }
  const altJwtHeader = readHeader(headers, CONTROL_PLANE_IAP_JWT_HEADER_ALT);
  if (altJwtHeader?.trim()) {
    return altJwtHeader.trim();
  }
  return null;
}

export function verifyIapJwtAssertion(
  token: string,
  options: VerifyIapAssertionOptions = {},
): IapJwtPayload {
  const trimmed = token.replace(/^Bearer\s+/i, "").trim();
  if (!trimmed) {
    throw new Error("IAP JWT assertion token is empty.");
  }

  let payload: IapJwtPayload;
  if (options.jwtSecretOrPublicKey) {
    try {
      payload = jwt.verify(
        trimmed,
        options.jwtSecretOrPublicKey,
      ) as IapJwtPayload;
    } catch (err) {
      throw new Error(
        `IAP JWT assertion signature verification failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  } else {
    throw new Error(
      "IAP JWT assertion signature verification failed: verification key is required.",
    );
  }

  const expectedIssuer =
    options.expectedIssuer ?? "https://cloud.google.com/iap";
  if (!payload.iss || payload.iss !== expectedIssuer) {
    throw new Error(
      `IAP JWT assertion issuer mismatch: expected ${expectedIssuer}, got ${payload.iss ?? "none"}`,
    );
  }

  if (options.expectedAudience) {
    if (!payload.aud || payload.aud !== options.expectedAudience) {
      const err = new Error(
        `IAP JWT assertion audience mismatch: expected ${options.expectedAudience}, got ${payload.aud ?? "none"}`,
      );
      (err as any).code = "IAP_AUDIENCE_MISMATCH";
      throw err;
    }
  }

  if (payload.exp && typeof payload.exp === "number") {
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      throw new Error("IAP JWT assertion is expired.");
    }
  }

  if (!payload.sub) {
    throw new Error("IAP JWT assertion missing subject claim.");
  }

  return payload;
}

export function signTestIapJwtAssertion(
  payload: Record<string, unknown>,
  secret: string,
  options?: jwt.SignOptions,
): string {
  const fullPayload = {
    iss: "https://cloud.google.com/iap",
    ...payload,
  };
  return jwt.sign(fullPayload, secret, options);
}

export function extractAuthenticatedUserEmail(
  headers: HeaderRecord,
  options?: {
    strictIapMode?: boolean | undefined;
    expectedAudience?: string | undefined;
    expectedIssuer?: string | undefined;
    jwtSecretOrPublicKey?: string | undefined;
  },
): string | null {
  const assertion = extractIapJwtAssertion(headers);
  if (assertion) {
    try {
      const payload = verifyIapJwtAssertion(assertion, {
        expectedAudience: options?.expectedAudience,
        expectedIssuer: options?.expectedIssuer,
        jwtSecretOrPublicKey: options?.jwtSecretOrPublicKey,
      });
      if (payload.email) {
        return normalizeAuthenticatedUserEmail(payload.email);
      }
    } catch {
      if (options?.strictIapMode) {
        return null;
      }
    }
  }

  if (options?.strictIapMode) {
    return null;
  }

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
  strictIapMode?: boolean | undefined;
  iapJwtSecretOrPublicKey?: string | undefined;
  expectedIapAudience?: string | undefined;
  expectedIapIssuer?: string | undefined;
}): ControlPlaneRequestAuth {
  let verifiedSubject: string | null = null;
  let verifiedEmail: string | null = null;
  let verifiedGroups: string[] | null = null;

  if (options.headers) {
    const assertion = extractIapJwtAssertion(options.headers);
    if (assertion) {
      try {
        const payload = verifyIapJwtAssertion(assertion, {
          expectedAudience: options.expectedIapAudience,
          expectedIssuer: options.expectedIapIssuer,
          jwtSecretOrPublicKey: options.iapJwtSecretOrPublicKey,
        });
        verifiedSubject = payload.sub;
        if (payload.email) {
          verifiedEmail = normalizeAuthenticatedUserEmail(payload.email);
        }
        if (Array.isArray(payload.gcp_ia_groups)) {
          verifiedGroups = payload.gcp_ia_groups;
        } else if (Array.isArray(payload.groups)) {
          verifiedGroups = payload.groups;
        }
      } catch (err: any) {
        if (options.strictIapMode || extractIapJwtAssertion(options.headers)) {
          throw new Error(
            `Control-plane IAP assertion verification failed: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    } else if (options.strictIapMode) {
      throw new Error(
        "Control-plane strict IAP mode requires a valid x-goog-iap-jwt-assertion header.",
      );
    }
  }

  // Derive authority strictly from verified subject group membership when assertion/groups present or in strict IAP mode
  let overrideRoles: string[] | undefined = undefined;

  if (options.strictIapMode || verifiedGroups !== null) {
    if (verifiedGroups === null) {
      throw new Error(
        "Verified IAP subject has no valid workforce group membership.",
      );
    }

    const isPlatformAdmin = verifiedGroups.includes(
      "platform-admins@platform.drts",
    );
    const isOpsUser = verifiedGroups.includes("ops-users@platform.drts");

    if (!isPlatformAdmin && !isOpsUser) {
      throw new Error(
        "Verified IAP subject has no valid workforce group membership.",
      );
    }

    if (options.actorType === "platform_admin") {
      if (!isPlatformAdmin) {
        throw new Error(
          "Verified IAP subject does not possess required platform-admins group membership.",
        );
      }
      overrideRoles = ["superadmin"];
    } else if (options.actorType === "ops_user") {
      if (!isOpsUser && !isPlatformAdmin) {
        throw new Error(
          "Verified IAP subject does not possess required ops-users group membership.",
        );
      }
      overrideRoles = isPlatformAdmin ? ["operator"] : ["ops_user"];
    }
  }

  const assertionPresent = Boolean(
    options.headers && extractIapJwtAssertion(options.headers),
  );
  let authenticatedUserEmail: string | null =
    verifiedEmail ||
    extractAuthenticatedUserEmail(options.headers, {
      ...(options.strictIapMode !== undefined && {
        strictIapMode: options.strictIapMode,
      }),
      ...(options.expectedIapAudience !== undefined && {
        expectedAudience: options.expectedIapAudience,
      }),
      ...(options.expectedIapIssuer !== undefined && {
        expectedIssuer: options.expectedIapIssuer,
      }),
      ...(options.iapJwtSecretOrPublicKey !== undefined && {
        jwtSecretOrPublicKey: options.iapJwtSecretOrPublicKey,
      }),
    });

  if (!authenticatedUserEmail) {
    if (options.strictIapMode || assertionPresent) {
      throw new Error(
        "Control-plane strict IAP mode requires a verified user email in assertion.",
      );
    }
    authenticatedUserEmail =
      normalizeAuthenticatedUserEmail(options.defaultEmail ?? null) ||
      CONTROL_PLANE_DEFAULT_EMAILS[options.actorType];
  }

  if (!authenticatedUserEmail) {
    throw new Error("Control-plane authenticated user email is unavailable.");
  }

  const hasJwtSecret = Boolean(options.jwtSecret?.trim());
  const identity = buildIdentity(
    options.actorType,
    authenticatedUserEmail,
    options.requestId,
    hasJwtSecret ? "jwt_bearer" : "bootstrap_headers",
    verifiedSubject,
    overrideRoles,
  );

  const rawAssertion = options.headers
    ? extractIapJwtAssertion(options.headers)
    : null;

  if (!hasJwtSecret) {
    const headers: Record<string, string> = {
      "x-actor-type": identity.actorType,
      "x-actor-id": identity.actorId,
      "x-realm": identity.realm,
      "x-roles": identity.roles.join(","),
      "x-role-families": identity.roleFamilies.join(","),
      "x-scopes": identity.scopes.join(","),
    };
    if (rawAssertion) {
      headers[CONTROL_PLANE_IAP_JWT_HEADER] = rawAssertion;
    }
    return {
      authenticatedUserEmail,
      identity,
      headers,
    };
  }

  const signOptions: jwt.SignOptions = {
    expiresIn: options.expiresIn ?? "15m",
  };

  // Always stamp iss/aud. The API validates them and falls back to the same
  // shared defaults, so an unset JWT_ISSUER/JWT_AUDIENCE on the web side must
  // not produce a token that the API will reject.
  signOptions.issuer = options.jwtIssuer || DEFAULT_CONTROL_PLANE_JWT_ISSUER;
  signOptions.audience =
    options.jwtAudience || DEFAULT_CONTROL_PLANE_JWT_AUDIENCE;

  const token = jwt.sign(
    {
      controlPlaneProxy: true,
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

  const headers: Record<string, string> = {
    [CONTROL_PLANE_REQUEST_AUTH_HEADER]: `Bearer ${token}`,
  };
  if (rawAssertion) {
    headers[CONTROL_PLANE_IAP_JWT_HEADER] = rawAssertion;
  }

  return {
    authenticatedUserEmail,
    identity,
    headers,
  };
}
