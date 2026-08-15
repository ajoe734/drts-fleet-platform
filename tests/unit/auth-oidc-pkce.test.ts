import { createHash } from "node:crypto";
import { describe, expect, it, beforeEach } from "vitest";
import * as jwt from "jsonwebtoken";
import { OidcPkceService } from "../../apps/api/src/modules/auth/oidc-pkce.service";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ApiRequestError } from "../../apps/api/src/common/api-envelope";

describe("OidcPkceService & BFF Auth Flow (IAM-IDP-001)", () => {
  let oidcService: OidcPkceService;
  let jwtAuthService: JwtAuthService;
  let tenantPartnerService: TenantPartnerService;

  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.APP_ENV = "local";
    process.env.AUTH_MODE = "local";
    process.env.OIDC_MOCK_MODE = "true";
    process.env.JWT_SECRET = "test_jwt_secret_key_32_characters_long_min!";
    jwtAuthService = new JwtAuthService();
    tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    oidcService = new OidcPkceService(jwtAuthService, tenantPartnerService);
  });

  describe("1. OIDC PKCE Login Authorization Parameter Generation", () => {
    it("generates valid PKCE code_challenge, state, nonce, and authorization URL", () => {
      const loginParams = oidcService.generateLoginParameters("tenant", {
        redirectUri: "http://localhost:3000/api/auth/callback",
        tenantId: "tenant-acme",
      });

      expect(loginParams.authorizationUrl).toContain("response_type=code");
      expect(loginParams.authorizationUrl).toContain(
        "code_challenge_method=S256",
      );
      expect(loginParams.authorizationUrl).toContain(
        `state=${loginParams.state}`,
      );

      const stateRecord = oidcService.verifyStateToken(loginParams.stateToken)!;
      expect(stateRecord).toBeDefined();
      expect(loginParams.authorizationUrl).toContain(
        `nonce=${stateRecord.nonce}`,
      );
      expect(stateRecord.codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(stateRecord.codeVerifier.length).toBeLessThanOrEqual(128);

      const expectedChallenge = oidcService.computeCodeChallenge(
        stateRecord.codeVerifier,
      );
      expect(stateRecord.codeChallenge).toBe(expectedChallenge);
    });

    it("supports state token encryption and opaque verification", () => {
      const loginParams = oidcService.generateLoginParameters("partner");
      expect(loginParams.stateToken).toBeDefined();

      const firstPart = loginParams.stateToken.split(".")[0]!;
      expect(() =>
        JSON.parse(Buffer.from(firstPart, "base64url").toString("utf8")),
      ).toThrow();

      const verifiedRecord = oidcService.verifyStateToken(
        loginParams.stateToken,
      );
      expect(verifiedRecord).not.toBeNull();
      expect(verifiedRecord?.state).toBe(loginParams.state);
      expect(verifiedRecord?.nonce).toBeDefined();
      expect(typeof verifiedRecord?.nonce).toBe("string");
      expect(verifiedRecord?.realm).toBe("partner");
    });

    it("rejects disallowed redirect URI hosts", () => {
      expect(() =>
        oidcService.generateLoginParameters("tenant", {
          redirectUri: "http://attacker-evil-host.com/evil-callback",
        }),
      ).toThrow(ApiRequestError);
    });
  });

  describe("2. Tenant OIDC PKCE Callback Happy Path", () => {
    it("exchanges valid authorization code for tenant session with bound active subject", async () => {
      const defaultTenantId = tenantPartnerService.getDefaultTenantId();
      const loginParams = oidcService.generateLoginParameters("tenant", {
        redirectUri: "http://localhost:3000/api/auth/callback",
        tenantId: defaultTenantId,
      });

      const session = await oidcService.exchangeTenantCallbackSession(
        {
          provider: "oidc",
          callbackUrl: "http://localhost:3000/api/auth/callback",
          code: "valid_authorization_code_12345",
          state: loginParams.state,
          tenantId: defaultTenantId,
        },
        { stateToken: loginParams.stateToken },
      );

      expect(session.accessToken).toBeDefined();
      expect(session.identity.realm).toBe("tenant");
      expect(session.identity.actorType).toBe("tenant_admin");
      expect(session.profile.email).toBe("admin@acme.example");
      expect(session.profile.roleCode).toBeDefined();
    });
  });

  describe("3. Callback Negative Validation Matrix", () => {
    it("fails when authorization code is missing or empty", async () => {
      const loginParams = oidcService.generateLoginParameters("tenant");
      await expect(
        oidcService.exchangeTenantCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "",
            state: loginParams.state,
          },
          { stateToken: loginParams.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
    });

    it("fails when state parameter is missing or empty", async () => {
      const loginParams = oidcService.generateLoginParameters("tenant");
      await expect(
        oidcService.exchangeTenantCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "valid_code",
            state: "",
          },
          { stateToken: loginParams.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
    });

    it("fails when PKCE verifier is too short (<43 chars)", async () => {
      const loginParams = oidcService.generateLoginParameters("tenant");
      await expect(
        oidcService.exchangeTenantCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "valid_code",
            state: loginParams.state,
            pkceVerifier: "too_short",
          },
          { stateToken: loginParams.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
    });

    it("fails when PKCE verifier S256 challenge does not match state record", async () => {
      const loginParams = oidcService.generateLoginParameters("tenant");
      const wrongVerifier = "a".repeat(50);

      await expect(
        oidcService.exchangeTenantCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "valid_code",
            state: loginParams.state,
            pkceVerifier: wrongVerifier,
          },
          { stateToken: loginParams.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
    });

    it("fails when state parameter is reused", async () => {
      const defaultTenantId = tenantPartnerService.getDefaultTenantId();
      const loginParams = oidcService.generateLoginParameters("tenant");
      const cmd = {
        provider: "oidc" as const,
        callbackUrl: "http://localhost:3000/api/auth/callback",
        code: "valid_code_reuse_test",
        state: loginParams.state,
        tenantId: defaultTenantId,
      };

      await oidcService.exchangeTenantCallbackSession(cmd, {
        stateToken: loginParams.stateToken,
      });

      await expect(
        oidcService.exchangeTenantCallbackSession(cmd, {
          stateToken: loginParams.stateToken,
        }),
      ).rejects.toThrow(ApiRequestError);
    });

    it("fails when stateToken is missing", async () => {
      const loginParams = oidcService.generateLoginParameters("tenant");
      await expect(
        oidcService.exchangeTenantCallbackSession({
          provider: "oidc",
          callbackUrl: "http://localhost:3000/api/auth/callback",
          code: "valid_code",
          state: loginParams.state,
        }),
      ).rejects.toThrow(ApiRequestError);
    });

    it("fails when callbackUrl does not match redirectUri stored in state record", async () => {
      const loginParams = oidcService.generateLoginParameters("tenant", {
        redirectUri: "http://localhost:3000/api/auth/callback",
      });
      await expect(
        oidcService.exchangeTenantCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/other-callback",
            code: "valid_code",
            state: loginParams.state,
          },
          { stateToken: loginParams.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
    });

    it("fails when token issuer does not match configured OIDC issuer", async () => {
      const loginParams = oidcService.generateLoginParameters("tenant", {
        redirectUri: "http://localhost:3000/api/auth/callback",
      });
      await expect(
        oidcService.exchangeTenantCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "code_wrong_issuer",
            state: loginParams.state,
          },
          { stateToken: loginParams.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
    });

    it("fails when token audience does not match configured client ID", async () => {
      const loginParams = oidcService.generateLoginParameters("tenant", {
        redirectUri: "http://localhost:3000/api/auth/callback",
      });
      await expect(
        oidcService.exchangeTenantCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "code_wrong_audience",
            state: loginParams.state,
          },
          { stateToken: loginParams.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
    });

    it("fails when OIDC nonce is mismatched", async () => {
      const loginParams = oidcService.generateLoginParameters("tenant", {
        redirectUri: "http://localhost:3000/api/auth/callback",
      });
      await expect(
        oidcService.exchangeTenantCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "code_wrong_nonce",
            state: loginParams.state,
          },
          { stateToken: loginParams.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
    });

    it("fails when OIDC nonce is missing", async () => {
      const loginParams = oidcService.generateLoginParameters("tenant", {
        redirectUri: "http://localhost:3000/api/auth/callback",
      });
      await expect(
        oidcService.exchangeTenantCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "code_missing_nonce",
            state: loginParams.state,
          },
          { stateToken: loginParams.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
    });
  });

  describe("4. Immutable Subject Binding & Membership Enforcement", () => {
    it("rejects login when claims email_verified is false or missing", async () => {
      const loginParams = oidcService.generateLoginParameters("tenant", {
        redirectUri: "http://localhost:3000/api/auth/callback",
      });

      await expect(
        oidcService.exchangeTenantCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "unverified_email_code",
            state: loginParams.state,
          },
          { stateToken: loginParams.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
    });

    it("rejects login when subject is not bound to a tenant user (no auto-binding by email)", async () => {
      const defaultTenantId = tenantPartnerService.getDefaultTenantId();
      const login = oidcService.generateLoginParameters("tenant", {
        redirectUri: "http://localhost:3000/api/auth/callback",
        tenantId: defaultTenantId,
      });

      await expect(
        oidcService.exchangeTenantCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "unbound_tenant_subject_code",
            state: login.state,
            tenantId: defaultTenantId,
          },
          { stateToken: login.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
    });

    it("rejects login for users with 'invited' status", async () => {
      const loginParams = oidcService.generateLoginParameters("tenant");
      await expect(
        oidcService.exchangeTenantCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "code_invited_user",
            state: loginParams.state,
          },
          { stateToken: loginParams.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
    });

    it("rejects login for users with 'suspended' status", async () => {
      const loginParams = oidcService.generateLoginParameters("tenant");
      await expect(
        oidcService.exchangeTenantCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "code_suspended_user",
            state: loginParams.state,
          },
          { stateToken: loginParams.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
    });

    it("rejects login for unknown subjects", async () => {
      const loginParams = oidcService.generateLoginParameters("tenant");
      await expect(
        oidcService.exchangeTenantCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "code_unknown_sub",
            state: loginParams.state,
          },
          { stateToken: loginParams.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
    });
  });

  describe("5. Partner OIDC PKCE Flow & Identity Link", () => {
    it("exchanges valid authorization code for active partner entry session", async () => {
      const code = "e2e_valid_partner_code_001";
      const partnerUserIdentityLinkRepo = (oidcService as any)
        .partnerUserIdentityLinkRepo;
      const sub = `sub_oidc_${createHash("sha256").update(code).digest("hex").slice(0, 12)}`;
      await partnerUserIdentityLinkRepo.resolveOrCreate({
        entrySlug: "yuhe-residence",
        partnerUserRef: sub,
      });

      const loginParams = oidcService.generateLoginParameters("partner", {
        partnerId: "yuhe-residence",
      });
      const session = await oidcService.exchangePartnerCallbackSession(
        {
          provider: "oidc",
          callbackUrl: "http://localhost:3000/api/auth/callback",
          code: "e2e_valid_partner_code_001",
          state: loginParams.state,
          partnerId: "yuhe-residence",
        },
        { stateToken: loginParams.stateToken },
      );

      expect(session.accessToken).toBeDefined();
      expect(session.identity.realm).toBe("partner");
      expect(session.identity.actorType).toBe("partner_user");
      expect(session.partnerEntry.status).toBe("active");
    });

    it("rejects partner exchange when email is unverified", async () => {
      const loginParams = oidcService.generateLoginParameters("partner", {
        partnerId: "yuhe-residence",
      });
      await expect(
        oidcService.exchangePartnerCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "unverified_email_code",
            state: loginParams.state,
            partnerId: "yuhe-residence",
          },
          { stateToken: loginParams.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
    });

    it("rejects partner exchange when partner entry is missing or not provided", async () => {
      const loginParams = oidcService.generateLoginParameters("partner");
      await expect(
        oidcService.exchangePartnerCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "e2e_valid_partner_code_001",
            state: loginParams.state,
          },
          { stateToken: loginParams.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
    });

    it("rejects partner login when subject claims lack required MFA proof", async () => {
      const loginParams = oidcService.generateLoginParameters("partner", {
        partnerId: "yuhe-residence",
      });
      await expect(
        oidcService.exchangePartnerCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "code_no_mfa",
            state: loginParams.state,
            partnerId: "yuhe-residence",
          },
          { stateToken: loginParams.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
    });

    it("rejects partner login when subject has no pre-existing active identity link (unbound subject)", async () => {
      const loginParams = oidcService.generateLoginParameters("partner", {
        partnerId: "yuhe-residence",
      });
      await expect(
        oidcService.exchangePartnerCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "brand_new_partner_subject",
            state: loginParams.state,
            partnerId: "yuhe-residence",
          },
          { stateToken: loginParams.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
    });
  });

  describe("6. Real OIDC HTTP Provider Exchange & JWT Token Verification", () => {
    it("exchanges code with external OIDC token and userinfo endpoints via HTTP fetch and verifies JWT signature", async () => {
      const originalFetch = globalThis.fetch;
      const secret = "test_jwt_secret_key_32_characters_long_min!";
      process.env.JWT_SECRET = secret;
      process.env.OIDC_CLIENT_SECRET = secret;

      const validIdToken = jwt.sign(
        {
          sub: "sub_oidc_admin_acme",
          iss: "https://auth.staging.drts.internal",
          aud: "drts-bff-client",
          email: "admin@acme.example",
          amr: ["pwd", "mfa"],
          acr: "urn:mace:incommon:iap:silver",
          auth_time: Math.floor(Date.now() / 1000),
          nonce: "test_nonce_12345",
        },
        secret,
        { algorithm: "HS256" },
      );

      globalThis.fetch = (async (url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr.includes("/oauth2/v1/token")) {
          return new Response(
            JSON.stringify({
              access_token: "acc_token_999",
              id_token: validIdToken,
              token_type: "Bearer",
              expires_in: 3600,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (urlStr.includes("/oauth2/v1/userinfo")) {
          return new Response(
            JSON.stringify({
              sub: "sub_oidc_admin_acme",
              email: "admin@acme.example",
              email_verified: true,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      try {
        process.env.OIDC_ISSUER = "https://auth.staging.drts.internal";
        process.env.OIDC_CLIENT_ID = "drts-bff-client";
        process.env.OIDC_TOKEN_ENDPOINT =
          "https://auth.staging.drts.internal/oauth2/v1/token";
        process.env.OIDC_USERINFO_ENDPOINT =
          "https://auth.staging.drts.internal/oauth2/v1/userinfo";
        process.env.OIDC_MOCK_MODE = "false";

        const claims = await oidcService.exchangeRealOidcTokenEndpoint(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "real_provider_auth_code_xyz",
            state: "test_state",
            pkceVerifier: "a".repeat(50),
          },
          {
            state: "test_state",
            nonce: "test_nonce_12345",
            codeVerifier: "a".repeat(50),
            codeChallenge: oidcService.computeCodeChallenge("a".repeat(50)),
            codeChallengeMethod: "S256",
            realm: "tenant",
            redirectUri: "http://localhost:3000/api/auth/callback",
            tenantId: null,
            partnerId: null,
            createdAt: Date.now(),
            expiresAt: Date.now() + 600000,
          },
          "https://auth.staging.drts.internal/oauth2/v1/token",
        );

        expect(claims.sub).toBe("sub_oidc_admin_acme");
        expect(claims.email).toBe("admin@acme.example");
        expect(claims.email_verified).toBe(true);
        expect(claims.iss).toBe("https://auth.staging.drts.internal");
      } finally {
        globalThis.fetch = originalFetch;
        delete process.env.OIDC_TOKEN_ENDPOINT;
        delete process.env.OIDC_USERINFO_ENDPOINT;
      }
    });

    it("rejects real OIDC token exchange when email_verified is missing and defaults to false", async () => {
      const originalFetch = globalThis.fetch;
      const secret = "test_jwt_secret_key_32_characters_long_min!";
      process.env.JWT_SECRET = secret;
      process.env.OIDC_CLIENT_SECRET = secret;

      const idTokenWithoutEmailVerified = jwt.sign(
        {
          sub: "sub_oidc_admin_acme",
          iss: "https://auth.staging.drts.internal",
          aud: "drts-bff-client",
          email: "admin@acme.example",
          nonce: "test_nonce_12345",
        },
        secret,
        { algorithm: "HS256" },
      );

      globalThis.fetch = (async (url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr.includes("/oauth2/v1/token")) {
          return new Response(
            JSON.stringify({
              access_token: "acc_token_999",
              id_token: idTokenWithoutEmailVerified,
              token_type: "Bearer",
              expires_in: 3600,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (urlStr.includes("/oauth2/v1/userinfo")) {
          return new Response(
            JSON.stringify({
              sub: "sub_oidc_admin_acme",
              email: "admin@acme.example",
              // email_verified omitted
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      try {
        process.env.OIDC_ISSUER = "https://auth.staging.drts.internal";
        process.env.OIDC_CLIENT_ID = "drts-bff-client";
        process.env.OIDC_TOKEN_ENDPOINT =
          "https://auth.staging.drts.internal/oauth2/v1/token";
        process.env.OIDC_USERINFO_ENDPOINT =
          "https://auth.staging.drts.internal/oauth2/v1/userinfo";
        process.env.OIDC_MOCK_MODE = "false";

        const claims = await oidcService.exchangeRealOidcTokenEndpoint(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "real_code_no_email_verified",
            state: "test_state",
            pkceVerifier: "a".repeat(50),
          },
          {
            state: "test_state",
            nonce: "test_nonce_12345",
            codeVerifier: "a".repeat(50),
            codeChallenge: oidcService.computeCodeChallenge("a".repeat(50)),
            codeChallengeMethod: "S256",
            realm: "tenant",
            redirectUri: "http://localhost:3000/api/auth/callback",
            tenantId: null,
            partnerId: null,
            createdAt: Date.now(),
            expiresAt: Date.now() + 600000,
          },
          "https://auth.staging.drts.internal/oauth2/v1/token",
        );

        expect(claims.email_verified).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
        delete process.env.OIDC_TOKEN_ENDPOINT;
        delete process.env.OIDC_USERINFO_ENDPOINT;
      }
    });

    it("rejects id_token with forged signature or unsafe alg", async () => {
      const forgedIdToken = [
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
        Buffer.from(
          JSON.stringify({
            sub: "attacker_sub",
            iss: "https://auth.staging.drts.internal",
            aud: "drts-bff-client",
            email: "attacker@forged.example",
          }),
        ).toString("base64url"),
        "invalid_forged_signature",
      ].join(".");

      await expect(
        oidcService.verifyAndDecodeIdToken(forgedIdToken),
      ).rejects.toThrow(ApiRequestError);

      const noneAlgIdToken = [
        "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0",
        Buffer.from(
          JSON.stringify({
            sub: "attacker_sub",
            iss: "https://auth.staging.drts.internal",
            aud: "drts-bff-client",
          }),
        ).toString("base64url"),
        "",
      ].join(".");

      await expect(
        oidcService.verifyAndDecodeIdToken(noneAlgIdToken),
      ).rejects.toThrow(ApiRequestError);
    });
  });
});
