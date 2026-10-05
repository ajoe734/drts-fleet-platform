import { readFileSync } from "node:fs";
import { join } from "node:path";

import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import {
  hasTrustedMfa,
  NON_STRICT_TRUSTED_AMR,
  STRICT_TRUSTED_AMR,
} from "../../../../apps/api/src/common/auth/trusted-mfa.policy";
import { JwtAuthService } from "../../../../apps/api/src/common/auth/jwt-auth.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { AuthController } from "../../../../apps/api/src/modules/auth/auth.controller";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

/**
 * SR-AUTH-ADMIN-MFA-ENV-20260915
 *
 * Prior bug: `auth.controller.ts` had its own hardcoded, environment-blind
 * `hasTrustedMfa` computation (a fixed AMR allow-list + acr regex) alongside
 * `step-up-proof.service.ts`'s environment-aware version. That divergence
 * blocked local/dev testing of the tenant_admin / tenant_ops_admin
 * high-privilege login gate with `tenant_bootstrap_fixture`, since the
 * controller's copy never consulted the environment.
 *
 * Fix: both call sites now share one implementation
 * (`common/auth/trusted-mfa.policy.ts`). This suite asserts:
 * - dev/test accepts `tenant_bootstrap_fixture` for the high-privilege gate
 * - production/staging still reject it and require a real trusted AMR/acr
 * - the two call sites do not carry their own divergent copy of the list
 */
// TenantPartnerService.getDefaultTenantId() throws DEFAULT_TENANT_FORBIDDEN
// in strict (production/staging) environments, independent of the MFA gate
// under test here — so production/staging cases pass this fixture tenant id
// explicitly instead of relying on the (strict-disabled) default resolution.
const DEMO_TENANT_ID = "tenant-demo-001";

describe("SR-AUTH-ADMIN-MFA-ENV-20260915: admin MFA gate is environment-aware and unified", () => {
  const ORIGINAL_ENV = { ...process.env };

  function createController() {
    const auditNotificationService = new AuditNotificationService();
    const tenantPartnerService = new TenantPartnerService(
      auditNotificationService,
    );
    const jwtAuthService = new JwtAuthService(undefined, tenantPartnerService);
    return new AuthController(
      jwtAuthService,
      tenantPartnerService,
      {} as never,
    );
  }

  function signTenantIdToken(overrides: {
    sub: string;
    email: string;
    amr: string[];
    acr?: string;
  }) {
    return jwt.sign(
      {
        sub: overrides.sub,
        email: overrides.email,
        email_verified: true,
        amr: overrides.amr,
        ...(overrides.acr ? { acr: overrides.acr } : {}),
      },
      process.env.TENANT_OIDC_JWT_SECRET!,
      {
        issuer: process.env.TENANT_OIDC_ISSUER,
        audience: process.env.TENANT_OIDC_AUDIENCE,
        expiresIn: "5m",
      },
    );
  }

  async function expectApiRequestError(
    action: () => unknown | Promise<unknown>,
    assertions?: (error: ApiRequestError) => void | Promise<void>,
  ) {
    try {
      await action();
      throw new Error("Expected ApiRequestError");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      if (error instanceof ApiRequestError && assertions) {
        await assertions(error);
      }
    }
  }

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.JWT_SECRET = "sr-auth-admin-mfa-env-test-secret";
    process.env.TENANT_OIDC_ISSUER = "https://tenant-idp.tests";
    process.env.TENANT_OIDC_AUDIENCE = "tenant-portal-tests";
    process.env.TENANT_OIDC_JWT_SECRET = "tenant-oidc-test-secret";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe("1. dev/test accepts tenant_bootstrap_fixture for the high-privilege gate", () => {
    it("APP_ENV=local: tenant_admin login succeeds with amr=[tenant_bootstrap_fixture]", async () => {
      process.env.APP_ENV = "local";
      const controller = createController();
      const idToken = signTenantIdToken({
        sub: "sub_oidc_admin_acme",
        email: "admin@acme.example",
        amr: ["tenant_bootstrap_fixture"],
      });

      const response = await controller.issueTenantOidcSession({ idToken });

      expect(response.data).toMatchObject({
        tokenType: "Bearer",
        profile: { email: "admin@acme.example", roleCode: "tenant_admin" },
      });
    });

    it("APP_ENV=local: tenant_ops_admin login succeeds with amr=[tenant_bootstrap_fixture]", async () => {
      process.env.APP_ENV = "local";
      const controller = createController();
      const idToken = signTenantIdToken({
        sub: "sub_oidc_ops_acme",
        email: "ops@acme.example",
        amr: ["tenant_bootstrap_fixture"],
      });

      const response = await controller.issueTenantOidcSession({ idToken });

      expect(response.data).toMatchObject({
        tokenType: "Bearer",
        profile: { email: "ops@acme.example", roleCode: "tenant_ops_admin" },
      });
    });
  });

  describe("2. production/staging still require real trusted MFA", () => {
    it("APP_ENV=production: rejects tenant_admin login with amr=[tenant_bootstrap_fixture]", async () => {
      process.env.APP_ENV = "production";
      const controller = createController();
      const idToken = signTenantIdToken({
        sub: "sub_oidc_admin_acme",
        email: "admin@acme.example",
        amr: ["tenant_bootstrap_fixture"],
      });

      await expectApiRequestError(
        () =>
          controller.issueTenantOidcSession({ idToken, tenantId: DEMO_TENANT_ID }),
        (apiError) => expect(apiError.getStatus()).toBe(403),
      );
    });

    it("APP_ENV=staging: rejects tenant_ops_admin login with amr=[tenant_bootstrap_fixture]", async () => {
      process.env.APP_ENV = "staging";
      const controller = createController();
      const idToken = signTenantIdToken({
        sub: "sub_oidc_ops_acme",
        email: "ops@acme.example",
        amr: ["tenant_bootstrap_fixture"],
      });

      await expectApiRequestError(
        () =>
          controller.issueTenantOidcSession({ idToken, tenantId: DEMO_TENANT_ID }),
        (apiError) => expect(apiError.getStatus()).toBe(403),
      );
    });
  });

  describe("3. shared implementation directly (common/auth/trusted-mfa.policy.ts)", () => {
    it("NON_STRICT_TRUSTED_AMR trusts tenant_bootstrap_fixture; STRICT_TRUSTED_AMR does not", () => {
      expect(NON_STRICT_TRUSTED_AMR.has("tenant_bootstrap_fixture")).toBe(
        true,
      );
      expect(STRICT_TRUSTED_AMR.has("tenant_bootstrap_fixture")).toBe(false);
    });

    it("hasTrustedMfa is environment-aware for tenant_bootstrap_fixture", () => {
      process.env.APP_ENV = "local";
      expect(
        hasTrustedMfa({ amr: ["tenant_bootstrap_fixture"], acr: "aal1" }),
      ).toBe(true);

      process.env.APP_ENV = "production";
      expect(
        hasTrustedMfa({ amr: ["tenant_bootstrap_fixture"], acr: "aal1" }),
      ).toBe(false);

      process.env.APP_ENV = "staging";
      expect(
        hasTrustedMfa({ amr: ["tenant_bootstrap_fixture"], acr: "aal1" }),
      ).toBe(false);
    });

    it("a real trusted AMR method (webauthn) or aal2/aal3 acr is still trusted in production/staging (unchanged happy path)", () => {
      process.env.APP_ENV = "production";
      expect(hasTrustedMfa({ amr: ["pwd", "webauthn"] })).toBe(true);
      expect(hasTrustedMfa({ amr: ["pwd"], acr: "aal2" })).toBe(true);

      process.env.APP_ENV = "staging";
      expect(hasTrustedMfa({ amr: ["pwd", "fido2"] })).toBe(true);
      expect(hasTrustedMfa({ amr: ["pwd"], acr: "aal3" })).toBe(true);
    });
  });

  describe("4. no divergent copy: both call sites use the shared module", () => {
    const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

    it("auth.controller.ts imports hasTrustedMfa from trusted-mfa.policy and has no local AMR allow-list literal", () => {
      const source = readFileSync(
        join(
          REPO_ROOT,
          "apps/api/src/modules/auth/auth.controller.ts",
        ),
        "utf8",
      );
      expect(source).toMatch(
        /import\s*\{\s*hasTrustedMfa\s*\}\s*from\s*["']\.\.\/\.\.\/common\/auth\/trusted-mfa\.policy["']/,
      );
      expect(source).not.toMatch(/\["mfa",\s*"otp",\s*"webauthn"/);
    });

    it("step-up-proof.service.ts imports hasTrustedMfa from trusted-mfa.policy and no longer defines its own AMR sets", () => {
      const source = readFileSync(
        join(
          REPO_ROOT,
          "apps/api/src/common/auth/step-up-proof.service.ts",
        ),
        "utf8",
      );
      expect(source).toMatch(
        /import\s*\{\s*hasTrustedMfa\s*\}\s*from\s*["']\.\/trusted-mfa\.policy["']/,
      );
      expect(source).not.toMatch(/const STRICT_TRUSTED_AMR/);
      expect(source).not.toMatch(/const NON_STRICT_TRUSTED_AMR/);
    });
  });
});
