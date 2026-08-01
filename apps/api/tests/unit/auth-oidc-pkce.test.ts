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
    it("fails when authorization code is missing or empty", () => {
      const loginParams = oidcService.generateLoginParameters("tenant");
      expect(() =>
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
      ).toThrow(ApiRequestError);
    });

    it("fails when state parameter is missing or empty", () => {
      const loginParams = oidcService.generateLoginParameters("tenant");
      expect(() =>
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
      ).toThrow(ApiRequestError);
    });

    it("fails when PKCE verifier is too short (<43 chars)", () => {
      const loginParams = oidcService.generateLoginParameters("tenant");
      expect(() =>
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
      ).toThrow(ApiRequestError);
    });

    it("fails when PKCE verifier S256 challenge does not match state record", () => {
      const loginParams = oidcService.generateLoginParameters("tenant");
      const wrongVerifier = "a".repeat(50);

      expect(() =>
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
      ).toThrow(ApiRequestError);
    });

    it("fails when state parameter is reused", () => {
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
      oidcService.exchangeTenantCallbackSession(cmd, {
        stateToken: loginParams.stateToken,
      });

      // Second exchange with same state fails
      expect(() =>
        oidcService.exchangeTenantCallbackSession(cmd, {
          stateToken: loginParams.stateToken,
        }),
      ).toThrow(ApiRequestError);
    });

    it("fails when stateToken is missing", () => {
      const loginParams = oidcService.generateLoginParameters("tenant");
      expect(() =>
        oidcService.exchangeTenantCallbackSession({
          provider: "oidc",
          callbackUrl: "http://localhost:3000/api/auth/callback",
          code: "valid_code",
          state: loginParams.state,
          pkceVerifier: loginParams.codeVerifier,
        }),
      ).toThrow(ApiRequestError);
    });

    it("fails when callbackUrl does not match redirectUri stored in state record", () => {
      const loginParams = oidcService.generateLoginParameters("tenant", {
        redirectUri: "http://localhost:3000/api/auth/callback",
      });
      expect(() =>
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
      ).toThrow(ApiRequestError);
    });

    it("fails when token issuer does not match configured OIDC issuer", () => {
      const loginParams = oidcService.generateLoginParameters("tenant", {
        redirectUri: "http://localhost:3000/api/auth/callback",
      });
      expect(() =>
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
      ).toThrow(ApiRequestError);
    });

    it("fails when token audience does not match configured client ID", () => {
      const loginParams = oidcService.generateLoginParameters("tenant", {
        redirectUri: "http://localhost:3000/api/auth/callback",
      });
      expect(() =>
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
      ).toThrow(ApiRequestError);
    });

    it("fails when OIDC nonce is mismatched", () => {
      const loginParams = oidcService.generateLoginParameters("tenant", {
        redirectUri: "http://localhost:3000/api/auth/callback",
      });
      expect(() =>
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
      ).toThrow(ApiRequestError);
    });

    it("fails when OIDC nonce is missing", () => {
      const loginParams = oidcService.generateLoginParameters("tenant", {
        redirectUri: "http://localhost:3000/api/auth/callback",
      });
      expect(() =>
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
      ).toThrow(ApiRequestError);
    });
  });

  describe("4. Membership Status & Bound Principal Enforcement", () => {
    it("rejects login for users with 'invited' status (fails closed before invitation proof)", () => {
      const defaultTenantId = tenantPartnerService.getDefaultTenantId();
      const invitedUser = tenantPartnerService.createTenantUser(defaultTenantId, {
        email: "invited@acme.example",
        displayName: "Invited User",
        roleCode: "tenant_viewer",
      });
      expect(invitedUser.status).toBe("invited");

      const loginParams = oidcService.generateLoginParameters("tenant");
      try {
        oidcService.exchangeTenantCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "code_invited_user",
            state: loginParams.state,
            pkceVerifier: loginParams.codeVerifier,
          },
          { stateToken: loginParams.stateToken },
        );
        expect.unreachable("Should have thrown IAM_MEMBERSHIP_NOT_ACTIVE");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        const apiErr = error as ApiRequestError;
        const errResp = (apiErr.getResponse() as any)?.error;
        expect(errResp?.code).toBe("IAM_MEMBERSHIP_NOT_ACTIVE");
      }
    });

    it("rejects login for users with 'suspended' status", () => {
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
      try {
        oidcService.exchangeTenantCallbackSession(
          {
            provider: "oidc",
            callbackUrl: "http://localhost:3000/api/auth/callback",
            code: "code_suspended_user",
            state: loginParams.state,
            pkceVerifier: loginParams.codeVerifier,
          },
          { stateToken: loginParams.stateToken },
        );
        expect.unreachable("Should have thrown IAM_MEMBERSHIP_NOT_ACTIVE");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        const apiErr = error as ApiRequestError;
        const errResp = (apiErr.getResponse() as any)?.error;
        expect(errResp?.code).toBe("IAM_MEMBERSHIP_NOT_ACTIVE");
      }
    });

    it("rejects login for subjects not registered in tenant membership", () => {
      const loginParams = oidcService.generateLoginParameters("tenant");
      expect(() =>
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
      ).toThrow(ApiRequestError);
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
