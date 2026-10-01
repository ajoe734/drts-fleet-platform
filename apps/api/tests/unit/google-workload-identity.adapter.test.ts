import { generateKeyPairSync } from "node:crypto";

import * as jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GoogleWorkloadIdentityAdapter,
  resolveCiTenantActorGrant,
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
