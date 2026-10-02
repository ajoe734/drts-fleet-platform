import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import * as path from "node:path";

import * as jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GoogleWorkloadIdentityAdapter,
  resolveCiTenantActorGrant,
  type RegisteredGooglePrincipal,
} from "../../src/modules/auth/google-workload-identity.adapter";
import { IdentityRepository } from "../../src/modules/identity/identity.repository";

const AUDIENCE = "https://api.dev.drts.internal";
const SERVICE_ACCOUNT_EMAIL = "control-plane-proxy@dev-project.iam.gserviceaccount.com";
const PRINCIPAL_ID = "svc-control-plane-proxy";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const jwk = publicKey.export({ format: "jwk" }) as {
  kty: string;
  n: string;
  e: string;
};
const KID = "test-key-1";

function signGoogleToken(overrides?: Record<string, unknown>): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: "https://accounts.google.com",
      sub: "1234567890",
      email: SERVICE_ACCOUNT_EMAIL,
      email_verified: true,
      aud: AUDIENCE,
      iat: now,
      exp: now + 300,
      ...overrides,
    },
    privateKey,
    { algorithm: "RS256", keyid: KID },
  );
}

function mockGoogleJwks() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          keys: [{ kty: jwk.kty, kid: KID, n: jwk.n, e: jwk.e }],
        }),
        { status: 200 },
      ),
    ),
  );
}

// SEC-INTERNAL-KEY-EXCP-001-WIF-MIGRATION-20261002 (F1): lock the
// before/after "dev-ci-deployer" registry behavior to the exact JSON the
// operator rollout doc (docs/02-architecture/internal-key-exceptions.md)
// delivers, rather than a hand-typed duplicate that could silently drift
// from what ops is actually told to paste.
const INTERNAL_KEY_EXCEPTIONS_DOC_PATH = path.join(
  __dirname,
  "../../../../docs/02-architecture/internal-key-exceptions.md",
);

function parseJsonFences(markdown: string): unknown[] {
  const fences = [...markdown.matchAll(/```json\n([\s\S]*?)```/g)];
  return fences.map((match) => JSON.parse(match[1]!));
}

function findDevCiDeployerRegistry(
  matchesRouteScopes: (routeScopes: string[]) => boolean,
  description: string,
): { registry: unknown[]; entry: RegisteredGooglePrincipal } {
  const doc = readFileSync(INTERNAL_KEY_EXCEPTIONS_DOC_PATH, "utf8");
  const candidates = parseJsonFences(doc).filter(
    (parsed): parsed is RegisteredGooglePrincipal[] =>
      Array.isArray(parsed) &&
      parsed.some(
        (entry: RegisteredGooglePrincipal) =>
          entry.principalId === "dev-ci-deployer",
      ),
  );
  for (const registry of candidates) {
    const entry = registry.find(
      (candidate) => candidate.principalId === "dev-ci-deployer",
    )!;
    if (matchesRouteScopes(entry.routeScopes ?? [])) {
      return { registry, entry };
    }
  }
  throw new Error(
    `No dev-ci-deployer registry fence in ${INTERNAL_KEY_EXCEPTIONS_DOC_PATH} matches: ${description}`,
  );
}

function configureRegistry(
  overrides?: Partial<{
    allowedTokenAudiences: string[];
    routeScopes: string[];
    ciTenantActorGrants: Array<{
      tenantId: string;
      actorType: string;
      actorId: string;
    }>;
  }>,
) {
  process.env.WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS = JSON.stringify([
    {
      serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
      principalId: PRINCIPAL_ID,
      actorId: "control-plane-proxy",
      displayName: "Control Plane Proxy",
      roles: ["control_plane_proxy"],
      scopes: ["proxy:forward"],
      allowedTokenAudiences: overrides?.allowedTokenAudiences ?? [AUDIENCE],
      routeScopes: overrides?.routeScopes ?? ["* *"],
      ciTenantActorGrants: overrides?.ciTenantActorGrants ?? [],
    },
  ]);
}

describe("GoogleWorkloadIdentityAdapter", () => {
  let adapter: GoogleWorkloadIdentityAdapter;

  beforeEach(() => {
    adapter = new GoogleWorkloadIdentityAdapter(new IdentityRepository());
    mockGoogleJwks();
    delete process.env.WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS;
    delete process.env.WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED;
    delete process.env.APP_ENV;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS;
    delete process.env.WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED;
    delete process.env.APP_ENV;
  });

  it("rejects when no assertion header is present", async () => {
    await expect(adapter.verifyServicePrincipal({}, {})).rejects.toMatchObject(
      { code: "WORKLOAD_ASSERTION_MISSING" },
    );
  });

  it("rejects with a distinguishable not-configured error when the registry env var is unset", async () => {
    const token = signGoogleToken();
    await expect(
      adapter.verifyServicePrincipal(
        { "x-drts-google-id-token": token },
        {},
      ),
    ).rejects.toMatchObject({ code: "WORKLOAD_IDENTITY_GOOGLE_NOT_CONFIGURED" });
  });

  it("verifies a valid Google-signed assertion against a registered principal", async () => {
    configureRegistry();
    const token = signGoogleToken();
    const resolved = await adapter.verifyServicePrincipal(
      { "x-drts-google-id-token": token },
      { requestMethod: "GET", requestPath: "/api/tenant/passengers" },
    );
    expect(resolved.principalId).toBe(PRINCIPAL_ID);
    expect(resolved.email).toBe(SERVICE_ACCOUNT_EMAIL);
    expect(resolved.audience).toBe(AUDIENCE);
  });

  it("rejects an unregistered service account email", async () => {
    configureRegistry();
    const token = signGoogleToken({ email: "someone-else@dev-project.iam.gserviceaccount.com" });
    await expect(
      adapter.verifyServicePrincipal({ "x-drts-google-id-token": token }, {}),
    ).rejects.toMatchObject({ code: "WORKLOAD_PRINCIPAL_NOT_REGISTERED" });
  });

  it("rejects an audience not allowed for the registered principal", async () => {
    configureRegistry({ allowedTokenAudiences: ["https://other.dev.drts.internal"] });
    const token = signGoogleToken();
    await expect(
      adapter.verifyServicePrincipal({ "x-drts-google-id-token": token }, {}),
    ).rejects.toMatchObject({ code: "WORKLOAD_AUDIENCE_MISMATCH" });
  });

  it("rejects an unverified email claim", async () => {
    configureRegistry();
    const token = signGoogleToken({ email_verified: false });
    await expect(
      adapter.verifyServicePrincipal({ "x-drts-google-id-token": token }, {}),
    ).rejects.toMatchObject({ code: "WORKLOAD_ASSERTION_INVALID" });
  });

  it("rejects a token signed by a different key", async () => {
    configureRegistry();
    const { privateKey: otherKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      {
        iss: "https://accounts.google.com",
        sub: "1234567890",
        email: SERVICE_ACCOUNT_EMAIL,
        email_verified: true,
        aud: AUDIENCE,
        iat: now,
        exp: now + 300,
      },
      otherKey,
      { algorithm: "RS256", keyid: "unknown-kid" },
    );
    await expect(
      adapter.verifyServicePrincipal({ "x-drts-google-id-token": token }, {}),
    ).rejects.toMatchObject({ code: "WORKLOAD_ASSERTION_INVALID" });
  });

  it("rejects an issuer that is not Google's OIDC issuer", async () => {
    configureRegistry();
    const token = signGoogleToken({ iss: "https://attacker.example" });
    await expect(
      adapter.verifyServicePrincipal({ "x-drts-google-id-token": token }, {}),
    ).rejects.toMatchObject({ code: "WORKLOAD_ISSUER_MISMATCH" });
  });

  it("rejects replaying the same assertion twice by default", async () => {
    configureRegistry();
    const token = signGoogleToken();
    await adapter.verifyServicePrincipal({ "x-drts-google-id-token": token }, {});
    await expect(
      adapter.verifyServicePrincipal({ "x-drts-google-id-token": token }, {}),
    ).rejects.toMatchObject({ code: "WORKLOAD_ASSERTION_REPLAYED" });
  });

  it("allows reusing the identical assertion repeatedly when replay protection is disabled (general proxy requests)", async () => {
    // A Cloud Run metadata server caches and returns the identical token for
    // its whole validity window, so concurrent proxied requests on the same
    // page legitimately present byte-identical assertions. The one-time-use
    // ledger must not reject that for general requests.
    configureRegistry();
    const token = signGoogleToken();
    const context = {
      requestMethod: "GET",
      requestPath: "/api/tenant/passengers",
      enforceReplayProtection: false,
    };
    const [first, second, third] = await Promise.all([
      adapter.verifyServicePrincipal({ "x-drts-google-id-token": token }, context),
      adapter.verifyServicePrincipal({ "x-drts-google-id-token": token }, context),
      adapter.verifyServicePrincipal({ "x-drts-google-id-token": token }, context),
    ]);
    expect(first.principalId).toBe(PRINCIPAL_ID);
    expect(second.principalId).toBe(PRINCIPAL_ID);
    expect(third.principalId).toBe(PRINCIPAL_ID);
  });

  it("still enforces every other check (issuer, audience, route scope) when replay protection is disabled", async () => {
    configureRegistry({ routeScopes: ["POST partner/ingress/handoff"] });
    const token = signGoogleToken();
    await expect(
      adapter.verifyServicePrincipal(
        { "x-drts-google-id-token": token },
        {
          requestMethod: "GET",
          requestPath: "/api/tenant/passengers",
          enforceReplayProtection: false,
        },
      ),
    ).rejects.toMatchObject({ code: "WORKLOAD_ROUTE_SCOPE_DENIED" });
  });

  it("rejects a registered principal whose route scope does not cover the requested route", async () => {
    // Least-privilege narrowing: a narrow-purpose principal (e.g. a referral
    // embed proxy only ever granted `/api/partner/*`) must not be able to
    // ride a verified assertion into an unrelated route the middleware
    // guards, even though signature/issuer/audience/replay all check out.
    configureRegistry({ routeScopes: ["POST partner/ingress/handoff"] });
    const token = signGoogleToken();
    await expect(
      adapter.verifyServicePrincipal(
        { "x-drts-google-id-token": token },
        { requestMethod: "GET", requestPath: "/api/tenant/passengers" },
      ),
    ).rejects.toMatchObject({ code: "WORKLOAD_ROUTE_SCOPE_DENIED" });
  });

  it("allows a registered principal on a route matching its declared route scope", async () => {
    configureRegistry({ routeScopes: ["POST partner/ingress/handoff"] });
    const token = signGoogleToken();
    const resolved = await adapter.verifyServicePrincipal(
      { "x-drts-google-id-token": token },
      { requestMethod: "POST", requestPath: "/api/partner/ingress/handoff" },
    );
    expect(resolved.principalId).toBe(PRINCIPAL_ID);
  });

  it("rejects a registry entry missing allowedTokenAudiences", async () => {
    process.env.WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS = JSON.stringify([
      {
        serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
        principalId: PRINCIPAL_ID,
        routeScopes: ["* *"],
      },
    ]);
    const token = signGoogleToken();
    await expect(
      adapter.verifyServicePrincipal(
        { "x-drts-google-id-token": token },
        { requestMethod: "GET", requestPath: "/api/tenant/passengers" },
      ),
    ).rejects.toMatchObject({ code: "WORKLOAD_IDENTITY_GOOGLE_NOT_CONFIGURED" });
  });

  it("rejects a registry entry missing routeScopes", async () => {
    process.env.WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS = JSON.stringify([
      {
        serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
        principalId: PRINCIPAL_ID,
        allowedTokenAudiences: [AUDIENCE],
      },
    ]);
    const token = signGoogleToken();
    await expect(
      adapter.verifyServicePrincipal(
        { "x-drts-google-id-token": token },
        { requestMethod: "GET", requestPath: "/api/tenant/passengers" },
      ),
    ).rejects.toMatchObject({ code: "WORKLOAD_IDENTITY_GOOGLE_NOT_CONFIGURED" });
  });

  // SEC-INTERNAL-KEY-EXCP-001-WIF-MIGRATION-20261002 (F1 reopen): Codex's
  // review reproduced, with an ad hoc probe, that the live dev registry's
  // current `dev-ci-deployer` routeScopes (docs §8.2, unchanged by this
  // task) reject the referral embed handoff issuance route, and that the
  // documented §9.3 rollout (adding that one route) accepts it. Lock both
  // halves of that reproduction into checked-in, doc-content-driven
  // coverage: each case loads the real fenced JSON straight out of
  // docs/02-architecture/internal-key-exceptions.md (not a hand-typed
  // duplicate that could drift from what ops is actually told to paste),
  // and exercises the real adapter with the exact call shape
  // `requireReferralEmbedWorkloadIdentity` makes
  // (apps/api/src/modules/tenant-partner/tenant-partner.controller.ts):
  // `enforceReplayProtection: false`, method/path of the issuance route.
  describe("deploy-dev referral embed handoff rollout (docs §8.2/§9.3 registry content)", () => {
    const ISSUANCE_ROUTE = {
      requestMethod: "POST",
      requestPath: "/api/partner/ingress/referral-embed-handoff",
      enforceReplayProtection: false,
    } as const;

    it("rejects dev-ci-deployer with WORKLOAD_ROUTE_SCOPE_DENIED under the current (pre-rollout) registry", async () => {
      const { registry, entry } = findDevCiDeployerRegistry(
        (routeScopes) =>
          !routeScopes.includes("POST partner/ingress/referral-embed-handoff"),
        "current registry (no referral-embed-handoff route scope yet)",
      );
      process.env.WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS =
        JSON.stringify(registry);
      const token = signGoogleToken({
        email: entry.serviceAccountEmail,
        aud: entry.allowedTokenAudiences![0],
      });
      await expect(
        adapter.verifyServicePrincipal(
          { "x-drts-google-id-token": token },
          ISSUANCE_ROUTE,
        ),
      ).rejects.toMatchObject({ code: "WORKLOAD_ROUTE_SCOPE_DENIED" });
    });

    it("completes the issuance-route authorization lifecycle for dev-ci-deployer under the documented §9.3 rollout", async () => {
      const { registry, entry } = findDevCiDeployerRegistry(
        (routeScopes) =>
          routeScopes.includes("POST partner/ingress/referral-embed-handoff"),
        "rolled-out registry (§9.3, includes the referral-embed-handoff route scope)",
      );
      process.env.WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS =
        JSON.stringify(registry);
      const token = signGoogleToken({
        email: entry.serviceAccountEmail,
        aud: entry.allowedTokenAudiences![0],
      });
      const resolved = await adapter.verifyServicePrincipal(
        { "x-drts-google-id-token": token },
        ISSUANCE_ROUTE,
      );
      expect(resolved.principalId).toBe("dev-ci-deployer");
      expect(resolved.email).toBe(entry.serviceAccountEmail);
    });
  });
});

describe("resolveCiTenantActorGrant", () => {
  const resolved = {
    principalId: PRINCIPAL_ID,
    actorId: "control-plane-proxy",
    email: SERVICE_ACCOUNT_EMAIL,
    subject: "1234567890",
    displayName: null,
    roles: [],
    scopes: [],
    audience: AUDIENCE,
    authTime: new Date().toISOString(),
    ciTenantActorGrants: [
      {
        tenantId: "10000000-0000-0000-0000-000000000201",
        actorType: "tenant_admin",
        actorId: "10000000-0000-0000-0000-000000000901",
      },
    ],
  };

  afterEach(() => {
    delete process.env.WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED;
    delete process.env.APP_ENV;
  });

  it("returns null when the CI tenant actor gate is not enabled", () => {
    process.env.APP_ENV = "development";
    expect(
      resolveCiTenantActorGrant(resolved, {
        tenantId: "10000000-0000-0000-0000-000000000201",
        actorType: "tenant_admin",
        actorId: "10000000-0000-0000-0000-000000000901",
      }),
    ).toBeNull();
  });

  it("returns null in production even when the gate flag is set", () => {
    process.env.WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED = "true";
    process.env.APP_ENV = "production";
    expect(
      resolveCiTenantActorGrant(resolved, {
        tenantId: "10000000-0000-0000-0000-000000000201",
        actorType: "tenant_admin",
        actorId: "10000000-0000-0000-0000-000000000901",
      }),
    ).toBeNull();
  });

  it("returns the matching grant when enabled, non-production, and the tuple matches exactly", () => {
    process.env.WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED = "true";
    process.env.APP_ENV = "development";
    expect(
      resolveCiTenantActorGrant(resolved, {
        tenantId: "10000000-0000-0000-0000-000000000201",
        actorType: "tenant_admin",
        actorId: "10000000-0000-0000-0000-000000000901",
      }),
    ).toEqual(resolved.ciTenantActorGrants[0]);
  });

  it("returns null when the requested tuple does not match any registered grant", () => {
    process.env.WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED = "true";
    process.env.APP_ENV = "development";
    expect(
      resolveCiTenantActorGrant(resolved, {
        tenantId: "10000000-0000-0000-0000-000000000201",
        actorType: "tenant_admin",
        actorId: "some-other-actor",
      }),
    ).toBeNull();
  });
});
