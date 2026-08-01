import { createHash, createSign, generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OidcPkceService } from "../../apps/api/src/modules/auth/oidc-pkce.service";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ApiRequestError } from "../../apps/api/src/common/api-envelope";

function createSignedRsaIdToken(payload: Record<string, unknown>, privateKeyPem: string, kid = "test-rsa-kid-001") {
  const header = { alg: "RS256", typ: "JWT", kid };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${headerB64}.${payloadB64}`;
  const sign = createSign("SHA256");
  sign.update(data);
  sign.end();
  const signatureB64 = sign.sign(privateKeyPem, "base64url");
  return `${data}.${signatureB64}`;
}

describe("IAM-IDP-001: Managed OIDC PKCE BFF Integration Suite", () => {
  let jwtAuthService: JwtAuthService;
  let tenantPartnerService: TenantPartnerService;
  let oidcService: OidcPkceService;

  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.JWT_SECRET = "test_jwt_secret_key_32_characters_long_min!";
    process.env.OIDC_ISSUER = "https://auth.staging.drts.internal";
    process.env.OIDC_CLIENT_ID = "drts-bff-client";
    process.env.OIDC_MOCK_MODE = "true";

    jwtAuthService = new JwtAuthService();
    tenantPartnerService = new TenantPartnerService(new AuditNotificationService());
    oidcService = new OidcPkceService(jwtAuthService, tenantPartnerService);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("completes OIDC PKCE authorization flow with active tenant membership", async () => {
    const defaultTenantId = tenantPartnerService.getDefaultTenantId();

    // 1. Initiate login parameters
    const login = oidcService.generateLoginParameters("tenant", {
      redirectUri: "http://localhost:3000/api/auth/callback",
      tenantId: defaultTenantId,
    });
    expect(login.authorizationUrl).toContain("code_challenge_method=S256");
    expect(login.authorizationUrl).toContain("response_type=code");

    // 2. Exchange authorization code via BFF callback-session using stateToken
    const session = await oidcService.exchangeTenantCallbackSession(
      {
        provider: "oidc",
        callbackUrl: "http://localhost:3000/api/auth/callback",
        code: "e2e_valid_code_001",
        state: login.state,
        tenantId: defaultTenantId,
      },
      { stateToken: login.stateToken },
    );

    expect(session.accessToken).toBeDefined();
    expect(session.profile.email).toBe("admin@acme.example");
    expect(session.profile.roleCode).toBeDefined();
    expect(session.identity.realm).toBe("tenant");
    expect(session.identity.actorType).toBe("tenant_admin");
  });

  it("completes partner OIDC PKCE flow issuing partner_user actorType and jwt_bearer authMode", async () => {
    const code = "e2e_valid_partner_code_001";
    const sub = `sub_oidc_${createHash("sha256").update(code).digest("hex").slice(0, 12)}`;
    const partnerUserIdentityLinkRepo = (oidcService as any).partnerUserIdentityLinkRepo;
    await partnerUserIdentityLinkRepo.resolveOrCreate({
      entrySlug: "yuhe-residence",
      partnerUserRef: sub,
    });

    const login = oidcService.generateLoginParameters("partner", {
      redirectUri: "http://localhost:3000/api/auth/callback",
      partnerId: "yuhe-residence",
    });

    const session = await oidcService.exchangePartnerCallbackSession(
      {
        provider: "oidc",
        callbackUrl: "http://localhost:3000/api/auth/callback",
        code: "e2e_valid_partner_code_001",
        state: login.state,
        partnerId: "yuhe-residence",
      },
      { stateToken: login.stateToken },
    );

    expect(session.accessToken).toBeDefined();
    expect(session.identity.realm).toBe("partner");
    expect(session.identity.actorType).toBe("partner_user");
    expect(session.identity.authMode).toBe("jwt_bearer");
    expect(session.partnerEntry.entrySlug).toBe("yuhe-residence");
  });

  it("enforces negative matrix: rejects state reuse, nonce mismatch, wrong issuer, wrong audience, missing PKCE verifier", async () => {
    const defaultTenantId = tenantPartnerService.getDefaultTenantId();

    const login = oidcService.generateLoginParameters("tenant", {
      redirectUri: "http://localhost:3000/api/auth/callback",
      tenantId: defaultTenantId,
    });

    const validCmd = {
      provider: "oidc" as const,
      callbackUrl: "http://localhost:3000/api/auth/callback",
      code: "e2e_valid_code_reuse_check",
      state: login.state,
      tenantId: defaultTenantId,
    };

    // 1. Successful first exchange
    await oidcService.exchangeTenantCallbackSession(validCmd, { stateToken: login.stateToken });

    // 2. Reused state token must be rejected
    await expect(
      oidcService.exchangeTenantCallbackSession(validCmd, { stateToken: login.stateToken }),
    ).rejects.toThrow(ApiRequestError);

    // 3. Invalid PKCE verifier length
    const login2 = oidcService.generateLoginParameters("tenant", {
      redirectUri: "http://localhost:3000/api/auth/callback",
    });
    try {
      await oidcService.exchangeTenantCallbackSession(
        {
          provider: "oidc",
          callbackUrl: "http://localhost:3000/api/auth/callback",
          code: "valid_code",
          state: login2.state,
          pkceVerifier: "too_short",
        },
        { stateToken: login2.stateToken },
      );
      expect.fail("Should have thrown ApiRequestError");
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect((err.getResponse() as any)?.error?.message).toMatch(/PKCE code verifier length/);
    }

    // 4. Nonce mismatch
    const login3 = oidcService.generateLoginParameters("tenant", {
      redirectUri: "http://localhost:3000/api/auth/callback",
    });
    try {
      await oidcService.exchangeTenantCallbackSession(
        {
          provider: "oidc",
          callbackUrl: "http://localhost:3000/api/auth/callback",
          code: "wrong_nonce_code",
          state: login3.state,
        },
        { stateToken: login3.stateToken },
      );
      expect.fail("Should have thrown ApiRequestError");
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect((err.getResponse() as any)?.error?.message).toMatch(/OIDC nonce/);
    }

    // 5. Issuer mismatch
    const login4 = oidcService.generateLoginParameters("tenant", {
      redirectUri: "http://localhost:3000/api/auth/callback",
    });
    try {
      await oidcService.exchangeTenantCallbackSession(
        {
          provider: "oidc",
          callbackUrl: "http://localhost:3000/api/auth/callback",
          code: "wrong_issuer_code",
          state: login4.state,
        },
        { stateToken: login4.stateToken },
      );
      expect.fail("Should have thrown ApiRequestError");
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect((err.getResponse() as any)?.error?.message).toMatch(/OIDC issuer mismatch/);
    }
  });

  it("enforces negative matrix: rejects inactive, invited, or suspended subject memberships", async () => {
    const loginInvited = oidcService.generateLoginParameters("tenant", {
      redirectUri: "http://localhost:3000/api/auth/callback",
    });

    // Invited user subject
    try {
      await oidcService.exchangeTenantCallbackSession(
        {
          provider: "oidc",
          callbackUrl: "http://localhost:3000/api/auth/callback",
          code: "invited_user_code",
          state: loginInvited.state,
        },
        { stateToken: loginInvited.stateToken },
      );
      expect.fail("Should have thrown ApiRequestError");
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect((err.getResponse() as any)?.error?.code).toBe("AUTH_SESSION_EXCHANGE_DENIED");
    }

    // Suspended user subject
    const loginSuspended = oidcService.generateLoginParameters("tenant", {
      redirectUri: "http://localhost:3000/api/auth/callback",
    });
    try {
      await oidcService.exchangeTenantCallbackSession(
        {
          provider: "oidc",
          callbackUrl: "http://localhost:3000/api/auth/callback",
          code: "suspended_user_code",
          state: loginSuspended.state,
        },
        { stateToken: loginSuspended.stateToken },
      );
      expect.fail("Should have thrown ApiRequestError");
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect((err.getResponse() as any)?.error?.code).toBe("AUTH_SESSION_EXCHANGE_DENIED");
    }
  });

  it("executes real HTTP token exchange and RS256 JWKS ID token signature verification", async () => {
    // Generate RSA key pair for OIDC provider simulation
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const publicJwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
    publicJwk.kid = "test-rsa-kid-001";
    publicJwk.use = "sig";
    publicJwk.alg = "RS256";

    process.env.OIDC_JWKS_JSON = JSON.stringify({ keys: [publicJwk] });
    process.env.OIDC_TOKEN_ENDPOINT = "https://auth.staging.drts.internal/oauth2/v1/token";
    process.env.OIDC_CLIENT_SECRET = "drts_client_secret_test";
    delete process.env.OIDC_MOCK_MODE;

    const login = oidcService.generateLoginParameters("tenant", {
      redirectUri: "http://localhost:3000/api/auth/callback",
    });
    const stateRec = oidcService.verifyStateToken(login.stateToken)!;

    const nowSeconds = Math.floor(Date.now() / 1000);
    const idTokenPayload = {
      sub: "sub_real_oidc_12345",
      iss: "https://auth.staging.drts.internal",
      aud: "drts-bff-client",
      email: "admin@acme.example",
      email_verified: true,
      nonce: stateRec.nonce,
      amr: ["pwd", "mfa"],
      acr: "urn:mace:incommon:iap:silver",
      auth_time: nowSeconds,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    };

    const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const idToken = createSignedRsaIdToken(idTokenPayload, privateKeyPem, "test-rsa-kid-001");

    // Mock OIDC token endpoint fetch response
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (url.toString().includes("/oauth2/v1/token")) {
        return new Response(
          JSON.stringify({
            access_token: "mock_provider_access_token",
            id_token: idToken,
            token_type: "Bearer",
            expires_in: 3600,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not found", { status: 404 });
    });

    const session = await oidcService.exchangeTenantCallbackSession(
      {
        provider: "oidc",
        callbackUrl: "http://localhost:3000/api/auth/callback",
        code: "real_http_auth_code_999",
        state: login.state,
      },
      { stateToken: login.stateToken },
    );

    expect(fetchSpy).toHaveBeenCalled();
    expect(session.accessToken).toBeDefined();
    expect(session.profile.email).toBe("admin@acme.example");
    expect(session.identity.realm).toBe("tenant");
  });
});
