import { createHash } from "node:crypto";
import { describe, expect, it, beforeEach } from "vitest";
import { OidcPkceService } from "../../src/modules/auth/oidc-pkce.service";
import { JwtAuthService } from "../../src/common/auth/jwt-auth.service";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { ApiRequestError } from "../../src/common/api-envelope";

describe("OidcPkceService & BFF Auth Flow (IAM-IDP-001)", () => {
  let oidcService: OidcPkceService;
  let jwtAuthService: JwtAuthService;
  let tenantPartnerService: TenantPartnerService;

  beforeEach(() => {
    process.env.JWT_SECRET = "test_jwt_secret_key_32_characters_long_min!";
    jwtAuthService = new JwtAuthService();
    tenantPartnerService = new TenantPartnerService(new AuditNotificationService());
    oidcService = new OidcPkceService(jwtAuthService, tenantPartnerService);
  });

  describe("1. OIDC PKCE Login Authorization Parameter Generation", () => {
    it("generates valid PKCE code_challenge, state, nonce, and authorization URL", () => {
      const loginParams = oidcService.generateLoginParameters("tenant", {
        redirectUri: "http://localhost:3000/api/auth/callback",
        tenantId: "tenant-acme",
      });

      expect(loginParams.authorizationUrl).toContain("response_type=code");
      expect(loginParams.authorizationUrl).toContain("code_challenge_method=S256");
      expect(loginParams.authorizationUrl).toContain(`state=${loginParams.state}`);
      expect(loginParams.authorizationUrl).toContain(`nonce=${loginParams.nonce}`);
      expect(loginParams.codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(loginParams.codeVerifier.length).toBeLessThanOrEqual(128);

      // Verify S256 computation correctness
      const expectedChallenge = oidcService.computeCodeChallenge(loginParams.codeVerifier);
      expect(loginParams.codeChallenge).toBe(expectedChallenge);
    });

    it("supports state token signing and stateless verification", () => {
      const loginParams = oidcService.generateLoginParameters("partner");
      expect(loginParams.stateToken).toBeDefined();

      const verifiedRecord = oidcService.verifyStateToken(loginParams.stateToken);
      expect(verifiedRecord).not.toBeNull();
      expect(verifiedRecord?.state).toBe(loginParams.state);
      expect(verifiedRecord?.nonce).toBe(loginParams.nonce);
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
    it("exchanges valid authorization code and PKCE verifier for tenant session", async () => {
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
          pkceVerifier: loginParams.codeVerifier,
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
            pkceVerifier: loginParams.codeVerifier,
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
            pkceVerifier: loginParams.codeVerifier,
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
            pkceVerifier: "short_verifier",
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
        pkceVerifier: loginParams.codeVerifier,
        tenantId: defaultTenantId,
      };

      // First exchange succeeds
      await oidcService.exchangeTenantCallbackSession(cmd, {
        stateToken: loginParams.stateToken,
      });

      // Second exchange with same state fails
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
          pkceVerifier: loginParams.codeVerifier,
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
            pkceVerifier: loginParams.codeVerifier,
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
            pkceVerifier: loginParams.codeVerifier,
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
            pkceVerifier: loginParams.codeVerifier,
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
            pkceVerifier: loginParams.codeVerifier,
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
            pkceVerifier: loginParams.codeVerifier,
          },
          { stateToken: loginParams.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
    });
  });

  describe("4. Membership Status & Bound Principal Enforcement", () => {
    it("rejects login for users with 'invited' status (fails closed before invitation proof)", async () => {
      const defaultTenantId = tenantPartnerService.getDefaultTenantId();
      const invitedUser = tenantPartnerService.createTenantUser(defaultTenantId, {
        email: "invited@acme.example",
        displayName: "Invited User",
        roleCode: "tenant_viewer",
      });
      expect(invitedUser.status).toBe("invited");

      const loginParams = oidcService.generateLoginParameters("tenant");
      await expect(
        oidcService.exchangeTenantCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "code_invited_user",
            state: loginParams.state,
            pkceVerifier: loginParams.codeVerifier,
          },
          { stateToken: loginParams.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
    });

    it("rejects login for users with 'suspended' status", async () => {
      const defaultTenantId = tenantPartnerService.getDefaultTenantId();
      const user = tenantPartnerService.createTenantUser(defaultTenantId, {
        email: "suspended@acme.example",
        displayName: "Suspended User",
        roleCode: "tenant_viewer",
      });
      // Suspend user in repository
      (tenantPartnerService as any).userRoles.find(
        (u: any) => u.userId === user.userId,
      ).status = "suspended";

      const loginParams = oidcService.generateLoginParameters("tenant");
      await expect(
        oidcService.exchangeTenantCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "code_suspended_user",
            state: loginParams.state,
            pkceVerifier: loginParams.codeVerifier,
          },
          { stateToken: loginParams.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
    });

    it("rejects login for subjects not registered in tenant membership", async () => {
      const loginParams = oidcService.generateLoginParameters("tenant");
      await expect(
        oidcService.exchangeTenantCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "code_unknown_sub",
            state: loginParams.state,
            pkceVerifier: loginParams.codeVerifier,
          },
          { stateToken: loginParams.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
    });
  });

  describe("6. Real OIDC HTTP Provider Exchange & JWT Token Verification", () => {
    it("exchanges code with external OIDC token and userinfo endpoints via HTTP fetch", async () => {
      const originalFetch = globalThis.fetch;
      const fakeIdToken = [
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
        Buffer.from(
          JSON.stringify({
            sub: "sub_real_oidc_123",
            iss: "https://auth.staging.drts.internal",
            aud: "drts-bff-client",
            email: "admin@acme.example",
            amr: ["pwd", "mfa"],
            acr: "urn:mace:incommon:iap:silver",
            auth_time: Math.floor(Date.now() / 1000),
            nonce: "test_nonce_12345",
          }),
        ).toString("base64url"),
        "fake_signature",
      ].join(".");

      globalThis.fetch = (async (url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr.includes("/oauth2/v1/token")) {
          return new Response(
            JSON.stringify({
              access_token: "acc_token_999",
              id_token: fakeIdToken,
              token_type: "Bearer",
              expires_in: 3600,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (urlStr.includes("/oauth2/v1/userinfo")) {
          return new Response(
            JSON.stringify({
              sub: "sub_real_oidc_123",
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
        process.env.OIDC_TOKEN_ENDPOINT = "https://auth.staging.drts.internal/oauth2/v1/token";
        process.env.OIDC_USERINFO_ENDPOINT = "https://auth.staging.drts.internal/oauth2/v1/userinfo";
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

        expect(claims.sub).toBe("sub_real_oidc_123");
        expect(claims.email).toBe("admin@acme.example");
        expect(claims.iss).toBe("https://auth.staging.drts.internal");
      } finally {
        globalThis.fetch = originalFetch;
        delete process.env.OIDC_TOKEN_ENDPOINT;
        delete process.env.OIDC_USERINFO_ENDPOINT;
      }
    });
  });

  describe("5. Partner OIDC PKCE Flow & Durable Identity Link Binding", () => {
    it("exchanges valid authorization code for active partner entry session and binds durable passenger identity", async () => {
      const loginParams = oidcService.generateLoginParameters("partner", {
        partnerId: "yuhe-residence",
      });
      const session = await oidcService.exchangePartnerCallbackSession(
        {
          provider: "oidc",
          callbackUrl: "http://localhost:3000/api/auth/callback",
          code: "valid_partner_code_123",
          state: loginParams.state,
          pkceVerifier: loginParams.codeVerifier,
          partnerId: "yuhe-residence",
        },
        { stateToken: loginParams.stateToken },
      );

      expect(session.accessToken).toBeDefined();
      expect(session.identity.realm).toBe("partner");
      expect(session.identity.actorId).toMatch(/^passenger_/);
      expect(session.identity.subjectId).toBeDefined();
      expect(session.partnerEntry.status).toBe("active");
    });

    it("rejects partner exchange when partner entry is missing or not provided", async () => {
      const loginParams = oidcService.generateLoginParameters("partner");
      await expect(
        oidcService.exchangePartnerCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "valid_partner_code_123",
            state: loginParams.state,
            pkceVerifier: loginParams.codeVerifier,
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
            pkceVerifier: loginParams.codeVerifier,
            partnerId: "yuhe-residence",
          },
          { stateToken: loginParams.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
    });

    it("rejects partner login for unmapped, invited, or suspended partner human subjects", async () => {
      const loginParams = oidcService.generateLoginParameters("partner", {
        partnerId: "yuhe-residence",
      });
      await expect(
        oidcService.exchangePartnerCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "code_invited_user",
            state: loginParams.state,
            pkceVerifier: loginParams.codeVerifier,
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
            pkceVerifier: loginParams.codeVerifier,
            partnerId: "yuhe-residence",
          },
          { stateToken: loginParams.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
    });
  });
});
