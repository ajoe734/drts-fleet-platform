import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { AuthController } from "../../apps/api/src/modules/auth/auth.controller";
import { OidcPkceService } from "../../apps/api/src/modules/auth/oidc-pkce.service";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

describe("IAM-OP-OIDC-001 strict OIDC negative controls", () => {
  const originalEnv = { ...process.env };
  let oidcService: OidcPkceService;

  beforeEach(() => {
    process.env = { ...originalEnv };
    oidcService = new OidcPkceService(
      new JwtAuthService(),
      new TenantPartnerService(new AuditNotificationService()),
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("never falls back to synthetic exchange in a strict environment", async () => {
    process.env.DRTS_ENV = "staging";
    process.env.OIDC_MOCK_MODE = "false";
    delete process.env.OIDC_TOKEN_ENDPOINT;
    delete process.env.OIDC_ISSUER;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      (oidcService as any).performOidcCodeExchange({ code: "synthetic-code" }),
    ).rejects.toMatchObject({ code: "AUTH_SESSION_EXCHANGE_DENIED" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("permits synthetic exchange only with explicit mock mode in local or test", async () => {
    process.env.DRTS_ENV = "test";
    process.env.OIDC_MOCK_MODE = "true";
    process.env.OIDC_ISSUER = "https://oidc.test.drts.internal";
    process.env.OIDC_CLIENT_ID = "drts-test-client";
    delete process.env.OIDC_TOKEN_ENDPOINT;

    await expect(
      (oidcService as any).performOidcCodeExchange({ code: "synthetic-code" }),
    ).resolves.toMatchObject({
      iss: "https://oidc.test.drts.internal",
      aud: "drts-test-client",
    });
  });

  it("does not log provider response bodies that may contain token material", async () => {
    const leakedToken = "access_token=should-never-appear";
    const errorSpy = vi.spyOn((oidcService as any).logger, "error");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(leakedToken, { status: 500 }),
    );

    await expect(
      oidcService.exchangeRealOidcTokenEndpoint(
        {
          provider: "oidc",
          code: "authorization-code",
          callbackUrl: "https://app.drts.internal/callback",
          state: "test-state",
        },
        null,
        "https://oidc.drts.internal/token",
      ),
    ).rejects.toMatchObject({ code: "AUTH_SESSION_EXCHANGE_DENIED" });

    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(leakedToken);
  });
});

describe("PWD-LOGIN-005 strict password-login negative controls", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.APP_ENV = "local";
    process.env.AUTH_MODE = "local";
    process.env.JWT_SECRET = "test_jwt_secret_key_32_characters_long_min!";
    // Deliberately no PASSWORD_PEPPER_SECRETS_JSON / _CURRENT_VERSION: the
    // negative control this suite exists for is that an unconfigured pepper
    // must fail every password-login attempt closed (503), never silently
    // skip the pepper step and compare against an unpeppered hash (SA/SD §2,
    // Stage 1.5 §15.2's "all-or-nothing" startup rule).
    delete process.env.PASSWORD_PEPPER_SECRETS_JSON;
    delete process.env.PASSWORD_PEPPER_CURRENT_VERSION;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("fails closed, not open, when no password pepper is configured", async () => {
    const identityRepository = new IdentityRepository();
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    const controller = new AuthController(
      new JwtAuthService(identityRepository, tenantPartnerService),
      tenantPartnerService,
      {} as never,
      undefined,
      undefined,
      undefined,
      identityRepository,
    );

    await expect(
      controller.passwordLogin("tenant", {
        email: "anyone@example.com",
        password: "whatever-the-attacker-sends",
        tenantId: "tenant-strict-negative",
      }),
    ).rejects.toMatchObject({
      code: "PASSWORD_LOGIN_UNAVAILABLE",
    });
  });

  it("answers account-not-found the same way across tenant, agency and partner", async () => {
    const identityRepository = new IdentityRepository();
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    process.env.PASSWORD_PEPPER_SECRETS_JSON = JSON.stringify({
      v1: "iam-oidc-strict-negative-test-pepper-32ch!",
    });
    process.env.PASSWORD_PEPPER_CURRENT_VERSION = "v1";
    const controller = new AuthController(
      new JwtAuthService(identityRepository, tenantPartnerService),
      tenantPartnerService,
      {} as never,
      undefined,
      undefined,
      undefined,
      identityRepository,
    );

    const attempt = (realm: string) =>
      controller.passwordLogin(realm, {
        email: "nobody@example.com",
        password: "whatever-the-attacker-sends",
      });

    let tenantMessage: string | undefined;
    let agencyMessage: string | undefined;
    let partnerMessage: string | undefined;
    for (const [realm, assign] of [
      ["tenant", (value: string) => (tenantMessage = value)],
      ["agency", (value: string) => (agencyMessage = value)],
      ["partner", (value: string) => (partnerMessage = value)],
    ] as const) {
      try {
        await attempt(realm);
        throw new Error("expected denial");
      } catch (error) {
        const apiError = error as ApiRequestError;
        expect(apiError.getStatus()).toBe(401);
        const body = apiError.getResponse() as {
          error: { code: string; message: string };
        };
        expect(body.error.code).toBe("AUTHENTICATION_FAILED");
        assign(body.error.message);
      }
    }
    expect(agencyMessage).toBe(tenantMessage);
    expect(partnerMessage).toBe(tenantMessage);
  });
});
