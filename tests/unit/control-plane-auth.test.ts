import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import jwt from "jsonwebtoken";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CONTROL_PLANE_REQUEST_AUTH_HEADER,
  DEFAULT_CONTROL_PLANE_JWT_AUDIENCE,
  DEFAULT_CONTROL_PLANE_JWT_ISSUER,
  IAP_GOOGLE_JWKS_URL,
  detectControlPlaneAuthEnvironment,
  extractAuthenticatedUserEmail,
  isStrictControlPlaneIapEnvironment,
  issueControlPlaneRequestAuth,
  resetIapJwksCacheForTests,
  resolveGoogleIapJwtVerificationKey,
  signTestIapJwtAssertion,
  verifyIapJwtAssertion,
} from "../../packages/control-plane-auth/src/index";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";

describe("control-plane auth helper", () => {
  it("keeps the package runtime type aligned with its CommonJS output", () => {
    const packageManifest = JSON.parse(
      readFileSync(
        new URL(
          "../../packages/control-plane-auth/package.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const tsconfig = JSON.parse(
      readFileSync(
        new URL(
          "../../packages/control-plane-auth/tsconfig.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const sourceManifest = JSON.parse(
      readFileSync(
        new URL(
          "../../packages/control-plane-auth/src/package.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );

    expect(packageManifest.type).toBe("commonjs");
    expect(sourceManifest.type).toBe("module");
    expect(tsconfig.compilerOptions.module).toBe("CommonJS");
  });

  it("extracts the normalized IAP user email from request headers", () => {
    expect(
      extractAuthenticatedUserEmail({
        "x-goog-authenticated-user-email":
          "accounts.google.com:Edna@cctech-support.com",
      }),
    ).toBe("edna@cctech-support.com");
  });

  it("issues a JWT-backed control-plane auth header when JWT_SECRET is present", async () => {
    process.env.JWT_SECRET = "control-plane-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";

    const auth = await issueControlPlaneRequestAuth({
      actorType: "platform_admin",
      headers: {
        "x-goog-authenticated-user-email":
          "accounts.google.com:admin@platform.drts",
      },
      jwtSecret: "control-plane-secret",
      jwtIssuer: "drts-tests",
      jwtAudience: "drts-api",
      requestId: "req-control-plane-001",
    });

    const token = auth.headers[CONTROL_PLANE_REQUEST_AUTH_HEADER]?.replace(
      /^Bearer\s+/i,
      "",
    ).trim();

    expect(token).toBeTruthy();
    expect(auth.identity).toMatchObject({
      authMode: "jwt_bearer",
      actorType: "platform_admin",
      actorId: "pa-admin-001",
      realm: "platform",
      roles: ["superadmin"],
      requestId: "req-control-plane-001",
    });

    const payload = new JwtAuthService().verify(token!);

    expect(payload?.sub).toBe("pa-admin-001");
    expect(payload?.actorType).toBe("platform_admin");
    expect(payload?.realm).toBe("platform");
    expect(payload?.scopes).toContain("foundation:write");
    expect(payload?.scopes).toContain("forwarder:read");
    expect(payload?.scopes).toContain("multi_taxi_ratings:read");
    expect(payload?.scopes).toContain("multi_taxi_ratings:moderate");
    expect(await new JwtAuthService().verifyAccessToken(token!)).toBeNull();
    await expect(
      new JwtAuthService().verifyAccessToken(token!, {
        allowControlPlaneProxyToken: true,
      }),
    ).resolves.toMatchObject({
      controlPlaneProxy: true,
      actorType: "platform_admin",
    });

    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
  });

  it("falls back to server-owned bootstrap headers when JWT_SECRET is unavailable", async () => {
    const auth = await issueControlPlaneRequestAuth({
      actorType: "ops_user",
      headers: {
        "x-goog-authenticated-user-email":
          "accounts.google.com:ops@cctech-support.com",
      },
    });

    expect(auth.identity).toMatchObject({
      authMode: "bootstrap_headers",
      actorType: "ops_user",
      realm: "ops",
    });
    expect(auth.headers["x-actor-type"]).toBe("ops_user");
    expect(auth.headers["x-realm"]).toBe("ops");
    expect(auth.headers[CONTROL_PLANE_REQUEST_AUTH_HEADER]).toBeUndefined();
  });

  it("rejects unverified email headers when strictIapMode is enabled", async () => {
    await expect(
      issueControlPlaneRequestAuth({
        actorType: "platform_admin",
        headers: {
          "x-goog-authenticated-user-email":
            "accounts.google.com:admin@platform.drts",
        },
        strictIapMode: true,
      }),
    ).rejects.toThrowError(
      "Control-plane strict IAP mode requires a valid x-goog-iap-jwt-assertion header.",
    );
  });

  it("extracts verified subject and email from signed IAP JWT assertion, with no group claim required", async () => {
    const testSecret = "iap_test_secret_32bytes_minimum!";
    const iapToken = signTestIapJwtAssertion(
      {
        sub: "accounts.google.com:10099",
        email: "admin@platform.drts",
        aud: "drts-iap-aud",
      },
      testSecret,
    );

    const auth = await issueControlPlaneRequestAuth({
      actorType: "platform_admin",
      headers: {
        "x-goog-iap-jwt-assertion": iapToken,
      },
      strictIapMode: true,
      iapJwtSecretOrPublicKey: testSecret,
      expectedIapAudience: "drts-iap-aud",
    });

    expect(auth.identity.subject).toBe("accounts.google.com:10099");
    expect(auth.authenticatedUserEmail).toBe("admin@platform.drts");
    expect(auth.identity.actorId).toBe("pa-admin-001");
  });

  it("rejects assertion when JWT verification key is missing", () => {
    const iapToken = signTestIapJwtAssertion(
      {
        sub: "user-123",
        email: "user@platform.drts",
      },
      "some_secret",
    );

    expect(() => verifyIapJwtAssertion(iapToken)).toThrowError(
      "IAP JWT assertion signature verification failed: verification key is required.",
    );
  });

  it("rejects assertion when issuer does not match expected IAP issuer", () => {
    const testSecret = "iap_test_secret_32bytes_minimum!";
    const invalidIssuerToken = signTestIapJwtAssertion(
      {
        sub: "user-123",
        email: "user@platform.drts",
        iss: "https://evil-issuer.com",
      },
      testSecret,
    );

    expect(() =>
      verifyIapJwtAssertion(invalidIssuerToken, {
        jwtSecretOrPublicKey: testSecret,
      }),
    ).toThrowError("IAP JWT assertion issuer mismatch");
  });

  it("fails closed when a verified assertion lacks email in strict IAP mode or when assertion is present", async () => {
    const testSecret = "iap_test_secret_32bytes_minimum!";
    const noEmailToken = signTestIapJwtAssertion(
      {
        sub: "user-no-email-01",
      },
      testSecret,
    );

    await expect(
      issueControlPlaneRequestAuth({
        actorType: "platform_admin",
        headers: {
          "x-goog-iap-jwt-assertion": noEmailToken,
        },
        strictIapMode: true,
        iapJwtSecretOrPublicKey: testSecret,
      }),
    ).rejects.toThrowError(
      "Control-plane strict IAP mode requires a verified user email in assertion.",
    );
  });

  it("preserves x-goog-iap-jwt-assertion in minted headers when an assertion is present", async () => {
    const testSecret = "iap_test_secret_32bytes_minimum!";
    const iapToken = signTestIapJwtAssertion(
      {
        sub: "user-forward-01",
        email: "forward@platform.drts",
      },
      testSecret,
    );

    const auth = await issueControlPlaneRequestAuth({
      actorType: "platform_admin",
      headers: {
        "x-goog-iap-jwt-assertion": iapToken,
      },
      strictIapMode: true,
      iapJwtSecretOrPublicKey: testSecret,
    });

    expect(auth.headers["x-goog-iap-jwt-assertion"]).toBe(iapToken);
  });

  it("rejects no-assertion requests once CONTROL_PLANE_IAP_ENABLED is on, even outside strict mode", async () => {
    await expect(
      issueControlPlaneRequestAuth({
        actorType: "platform_admin",
        headers: {},
        iapEnabled: true,
      }),
    ).rejects.toThrowError(
      "Control-plane IAP is enabled; a verified x-goog-iap-jwt-assertion is required and no default identity is applied.",
    );
  });

  it("still applies the default identity when IAP is not enabled and no assertion is present", async () => {
    const auth = await issueControlPlaneRequestAuth({
      actorType: "platform_admin",
      headers: {},
      defaultEmail: "admin@platform.drts",
      iapEnabled: false,
    });

    expect(auth.authenticatedUserEmail).toBe("admin@platform.drts");
  });
});

describe("real Google IAP JWKS verification", () => {
  afterEach(() => {
    resetIapJwksCacheForTests();
    vi.unstubAllGlobals();
  });

  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const jwk = publicKey.export({ format: "jwk" }) as {
    kty: string;
    crv: string;
    x: string;
    y: string;
  };
  const KID = "test-iap-key-1";

  function signRealIapToken(overrides: Record<string, unknown> = {}): string {
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
      {
        iss: "https://cloud.google.com/iap",
        sub: "accounts.google.com:real-iap-subject",
        email: "real-admin@platform.drts",
        aud: "/projects/123/apps/drts",
        iat: now,
        exp: now + 3600,
        ...overrides,
      },
      privateKey,
      { algorithm: "ES256", keyid: KID },
    );
  }

  function mockIapJwks(
    keys: Array<Record<string, string>> = [
      { kty: jwk.kty, kid: KID, crv: jwk.crv, x: jwk.x, y: jwk.y },
    ],
  ) {
    const fetchMock = vi.fn(async (url: string | URL) => {
      expect(String(url)).toBe(IAP_GOOGLE_JWKS_URL);
      return new Response(JSON.stringify({ keys }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("resolves the ES256 public key for a real IAP assertion's kid from Google's published JWKS", async () => {
    mockIapJwks();
    const token = signRealIapToken();

    const resolvedKey = await resolveGoogleIapJwtVerificationKey(token);
    const payload = verifyIapJwtAssertion(token, {
      jwtSecretOrPublicKey: resolvedKey,
    });

    expect(payload.email).toBe("real-admin@platform.drts");
    expect(payload.sub).toBe("accounts.google.com:real-iap-subject");
  });

  it("caches the JWKS across repeated resolutions instead of refetching every call", async () => {
    const fetchMock = mockIapJwks();
    const token = signRealIapToken();

    await resolveGoogleIapJwtVerificationKey(token);
    await resolveGoogleIapJwtVerificationKey(token);
    await resolveGoogleIapJwtVerificationKey(token);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches the JWKS once when the token's kid is not in the cached keyset (key rotation)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ keys: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            keys: [
              { kty: jwk.kty, kid: KID, crv: jwk.crv, x: jwk.x, y: jwk.y },
            ],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const token = signRealIapToken();

    const resolvedKey = await resolveGoogleIapJwtVerificationKey(token);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(() =>
      verifyIapJwtAssertion(token, { jwtSecretOrPublicKey: resolvedKey }),
    ).not.toThrow();
  });

  it("rejects an assertion signed with an unrecognized kid even after a refetch", async () => {
    mockIapJwks([]);
    const token = signRealIapToken();

    await expect(
      resolveGoogleIapJwtVerificationKey(token),
    ).rejects.toThrowError(/not recognized/);
  });

  it("rejects a non-ES256 token before ever contacting Google's JWKS endpoint", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const hs256Token = jwt.sign(
      {
        iss: "https://cloud.google.com/iap",
        sub: "x",
        email: "x@platform.drts",
      },
      "some-hmac-secret",
      { algorithm: "HS256" },
    );

    await expect(
      resolveGoogleIapJwtVerificationKey(hs256Token),
    ).rejects.toThrowError(/ES256/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("issueControlPlaneRequestAuth resolves a real assertion end to end with no pinned key", async () => {
    mockIapJwks();
    const token = signRealIapToken();

    const auth = await issueControlPlaneRequestAuth({
      actorType: "platform_admin",
      headers: { "x-goog-iap-jwt-assertion": token },
      strictIapMode: true,
    });

    expect(auth.authenticatedUserEmail).toBe("real-admin@platform.drts");
    expect(auth.identity.subject).toBe("accounts.google.com:real-iap-subject");
  });
});

describe("control-plane deployment environment detection", () => {
  it("prefers DRTS_ENV over the NODE_ENV build mode", () => {
    expect(
      detectControlPlaneAuthEnvironment({
        DRTS_ENV: "development",
        NODE_ENV: "production",
      }),
    ).toBe("local");
  });

  it("falls back to APP_ENV and then NODE_ENV", () => {
    expect(
      detectControlPlaneAuthEnvironment({
        APP_ENV: "staging",
        NODE_ENV: "production",
      }),
    ).toBe("staging");
    expect(detectControlPlaneAuthEnvironment({ NODE_ENV: "production" })).toBe(
      "production",
    );
  });

  it("keeps strict IAP mode on for production and staging deployments", () => {
    expect(isStrictControlPlaneIapEnvironment({ DRTS_ENV: "production" })).toBe(
      true,
    );
    expect(isStrictControlPlaneIapEnvironment({ DRTS_ENV: "staging" })).toBe(
      true,
    );
  });

  it("keeps strict IAP mode on when the deployment environment is unset", () => {
    // A deployed Next.js bundle always reports NODE_ENV=production, so an
    // unset DRTS_ENV must never downgrade a real production deployment.
    expect(isStrictControlPlaneIapEnvironment({ NODE_ENV: "production" })).toBe(
      true,
    );
  });

  it("relaxes strict IAP mode for a dev deployment built in production mode", () => {
    expect(
      isStrictControlPlaneIapEnvironment({
        DRTS_ENV: "development",
        NODE_ENV: "production",
      }),
    ).toBe(false);
  });

  it("still allows strict IAP mode to be forced on explicitly", () => {
    expect(
      isStrictControlPlaneIapEnvironment({
        DRTS_ENV: "development",
        NODE_ENV: "production",
        STRICT_IAP_MODE: "true",
      }),
    ).toBe(true);
  });
});

describe("control-plane proxy token is accepted by the API", () => {
  // Asserted as literals on purpose: comparing against the imported constants
  // would pass even when the export is missing, because both sides would be
  // undefined and the token would carry no iss/aud at all.
  const EXPECTED_ISSUER = "https://auth.local.drts.internal";
  const EXPECTED_AUDIENCE = "https://api.local.drts.internal";

  async function mintToken(overrides: Record<string, unknown> = {}) {
    const auth = await issueControlPlaneRequestAuth({
      actorType: "ops_user",
      headers: {},
      jwtSecret: "control-plane-secret",
      requestId: "req-iss-001",
      ...overrides,
    });
    return (
      auth.headers[CONTROL_PLANE_REQUEST_AUTH_HEADER]?.replace(
        /^Bearer\s+/i,
        "",
      ) ?? ""
    );
  }

  it("keeps the shared defaults aligned with the API", () => {
    expect(DEFAULT_CONTROL_PLANE_JWT_ISSUER).toBe(EXPECTED_ISSUER);
    expect(DEFAULT_CONTROL_PLANE_JWT_AUDIENCE).toBe(EXPECTED_AUDIENCE);
  });

  it("stamps issuer and audience when the env vars are unset", async () => {
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;

    const decoded = jwt.decode(await mintToken()) as jwt.JwtPayload;

    expect(decoded.iss).toBe(EXPECTED_ISSUER);
    expect(decoded.aud).toBe(EXPECTED_AUDIENCE);
  });

  it("verifies under the claims the API enforces", async () => {
    // The API resolves iss/aud from JWT_ISSUER/JWT_AUDIENCE and falls back to
    // these same values. A token minted without them was rejected with
    // JWT_INVALID, which silently emptied every control-plane page.
    const token = await mintToken();
    expect(() =>
      jwt.verify(token, "control-plane-secret", {
        issuer: EXPECTED_ISSUER,
        audience: EXPECTED_AUDIENCE,
      }),
    ).not.toThrow();
  });

  it("still honours an explicitly configured issuer and audience", async () => {
    const decoded = jwt.decode(
      await mintToken({
        actorType: "platform_admin",
        jwtIssuer: "https://issuer.example",
        jwtAudience: "https://audience.example",
      }),
    ) as jwt.JwtPayload;

    expect(decoded.iss).toBe("https://issuer.example");
    expect(decoded.aud).toBe("https://audience.example");
  });
});
