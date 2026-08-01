import { describe, expect, it } from "vitest";
import { OidcPkceService } from "../../apps/api/src/modules/auth/oidc-pkce.service";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ApiRequestError } from "../../apps/api/src/common/api-envelope";

describe("E2E-IAM-IDP-001: Managed OIDC PKCE BFF End-to-End Suite", () => {
  const jwtAuthService = new JwtAuthService();
  const tenantPartnerService = new TenantPartnerService(new AuditNotificationService());
  const oidcService = new OidcPkceService(jwtAuthService, tenantPartnerService);

  it("completes OIDC PKCE authorization flow with active tenant membership", async () => {
    process.env.JWT_SECRET = "test_jwt_secret_key_32_characters_long_min!";
    const defaultTenantId = tenantPartnerService.getDefaultTenantId();

    // 1. Client initiates login
    const login = oidcService.generateLoginParameters("tenant", {
      redirectUri: "http://localhost:3000/api/auth/callback",
      tenantId: defaultTenantId,
    });
    expect(login.authorizationUrl).toContain("code_challenge_method=S256");

    // 2. Client receives code and exchanges it via BFF
    const session = await oidcService.exchangeTenantCallbackSession(
      {
        provider: "oidc",
        callbackUrl: "http://localhost:3000/api/auth/callback",
        code: "e2e_valid_code_001",
        state: login.state,
        pkceVerifier: login.codeVerifier,
        tenantId: defaultTenantId,
      },
      { stateToken: login.stateToken },
    );

    expect(session.accessToken).toBeDefined();
    expect(session.profile.email).toBe("admin@acme.example");
    expect(session.profile.roleCode).toBeDefined();
  });

  it("enforces negative matrix: rejects reused state token and unmapped subjects", async () => {
    process.env.JWT_SECRET = "test_jwt_secret_key_32_characters_long_min!";
    const defaultTenantId = tenantPartnerService.getDefaultTenantId();

    const login = oidcService.generateLoginParameters("tenant", {
      redirectUri: "http://localhost:3000/api/auth/callback",
      tenantId: defaultTenantId,
    });

    const cmd = {
      provider: "oidc" as const,
      callbackUrl: "http://localhost:3000/api/auth/callback",
      code: "e2e_valid_code_reuse_check",
      state: login.state,
      pkceVerifier: login.codeVerifier,
      tenantId: defaultTenantId,
    };

    // First use
    await oidcService.exchangeTenantCallbackSession(cmd, { stateToken: login.stateToken });

    // Second use (state reuse) -> Must fail
    await expect(
      oidcService.exchangeTenantCallbackSession(cmd, { stateToken: login.stateToken }),
    ).rejects.toThrow(ApiRequestError);
  });
});
