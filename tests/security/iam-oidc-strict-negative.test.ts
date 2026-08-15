import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { OidcPkceService } from "../../apps/api/src/modules/auth/oidc-pkce.service";
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
          code: "authorization-code",
          callbackUrl: "https://app.drts.internal/callback",
        },
        null,
        "https://oidc.drts.internal/token",
      ),
    ).rejects.toMatchObject({ code: "AUTH_SESSION_EXCHANGE_DENIED" });

    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(leakedToken);
  });
});
