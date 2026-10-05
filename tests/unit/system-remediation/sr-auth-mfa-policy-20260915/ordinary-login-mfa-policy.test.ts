import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as jwt from "jsonwebtoken";

import { OidcPkceService } from "../../../../apps/api/src/modules/auth/oidc-pkce.service";
import { JwtAuthService } from "../../../../apps/api/src/common/auth/jwt-auth.service";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { SecurityEventsService } from "../../../../apps/api/src/modules/security-events/security-events.service";
import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import {
  buildAuthStartupConfigReport,
  isOrdinaryLoginMfaRequired,
  resolveOrdinaryLoginMfaPolicy,
} from "../../../../apps/api/src/config/auth-startup-config";

/**
 * SR-AUTH-MFA-POLICY-20260915
 *
 * Product decision (2026-09-15): v1 does not require ordinary tenant/partner
 * OIDC login to carry an MFA-bearing `amr` claim. This is a named, auditable
 * policy switch (`AUTH_REQUIRE_ORDINARY_LOGIN_MFA`), not a removal of the
 * control — reverting to "required" is a config-only change.
 *
 * Explicitly NOT touched, and asserted unchanged here:
 * - tenant_admin / tenant_ops_admin trusted-MFA gate (auth.controller.ts)
 * - privileged-role-governance fresh step-up requirement
 * - STRICT_TRUSTED_AMR in staging/production (step-up-proof.service.ts) — not
 *   re-tested in this file since step-up-proof.service.ts is untouched by
 *   this task; see tests/unit/step-up-proof-policy.test.ts for its own
 *   dedicated coverage, which must keep passing unmodified.
 * - auth-startup-config production/staging FORBIDDEN_MODE guards for
 *   ALLOW_INSECURE_DEV_AUTH and AUTH_MODE
 */
describe("SR-AUTH-MFA-POLICY-20260915: ordinary tenant/partner login MFA policy", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.APP_ENV = "local";
    process.env.AUTH_MODE = "local";
    process.env.OIDC_MOCK_MODE = "true";
    process.env.JWT_SECRET = "test_jwt_secret_key_32_characters_long_min!";
  });

  describe("1. Named policy switch (auth-startup-config.ts)", () => {
    it("defaults to v1_not_required when AUTH_REQUIRE_ORDINARY_LOGIN_MFA is unset", () => {
      delete process.env.AUTH_REQUIRE_ORDINARY_LOGIN_MFA;
      expect(isOrdinaryLoginMfaRequired()).toBe(false);
      expect(resolveOrdinaryLoginMfaPolicy()).toBe("v1_not_required");
    });

    it("restores the requirement when AUTH_REQUIRE_ORDINARY_LOGIN_MFA=true, with no code change", () => {
      process.env.AUTH_REQUIRE_ORDINARY_LOGIN_MFA = "true";
      expect(isOrdinaryLoginMfaRequired()).toBe(true);
      expect(resolveOrdinaryLoginMfaPolicy()).toBe("required");
    });

    it("treats an explicit false the same as unset", () => {
      process.env.AUTH_REQUIRE_ORDINARY_LOGIN_MFA = "false";
      expect(isOrdinaryLoginMfaRequired()).toBe(false);
    });
  });

  describe("2. Tenant OIDC session exchange (oidc-pkce.service.ts)", () => {
    let jwtAuthService: JwtAuthService;
    let tenantPartnerService: TenantPartnerService;
    let securityEventsService: SecurityEventsService;
    let oidcService: OidcPkceService;
    let originalFetch: typeof fetch;
    const secret = "test_jwt_secret_key_32_characters_long_min!";

    beforeEach(() => {
      jwtAuthService = new JwtAuthService();
      tenantPartnerService = new TenantPartnerService(
        new AuditNotificationService(),
      );
      securityEventsService = new SecurityEventsService();
      oidcService = new OidcPkceService(
        jwtAuthService,
        tenantPartnerService,
        securityEventsService,
      );
      originalFetch = globalThis.fetch;
      process.env.JWT_SECRET = secret;
      process.env.OIDC_CLIENT_SECRET = secret;
      process.env.OIDC_ISSUER = "https://auth.staging.drts.internal";
      process.env.OIDC_CLIENT_ID = "drts-bff-client";
      process.env.OIDC_TOKEN_ENDPOINT =
        "https://auth.staging.drts.internal/oauth2/v1/token";
      process.env.OIDC_USERINFO_ENDPOINT =
        "https://auth.staging.drts.internal/oauth2/v1/userinfo";
      process.env.OIDC_MOCK_MODE = "false";
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    // sub_oidc_admin_acme is a pre-bound, active tenant fixture user
    // (email admin@acme.example) — this exercises the real HTTP OIDC
    // exchange path with a genuine bound subject, not the unbound synthetic
    // "no_mfa" test double, so a policy denial can only come from the MFA
    // gate itself.
    async function exchangeWithAmr(amr: string[]) {
      const defaultTenantId = tenantPartnerService.getDefaultTenantId();
      const loginParams = oidcService.generateLoginParameters("tenant", {
        tenantId: defaultTenantId,
      });
      const nonce = oidcService.verifyStateToken(loginParams.stateToken)!
        .nonce;

      const idToken = jwt.sign(
        {
          sub: "sub_oidc_admin_acme",
          iss: "https://auth.staging.drts.internal",
          aud: "drts-bff-client",
          email: "admin@acme.example",
          amr,
          acr: "urn:mace:incommon:iap:bronze",
          auth_time: Math.floor(Date.now() / 1000),
          nonce,
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
              id_token: idToken,
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

      return oidcService.exchangeTenantCallbackSession(
        {
          provider: "oidc",
          callbackUrl: "http://localhost:3000/api/auth/callback",
          code: "real_oidc_code",
          state: loginParams.state,
        },
        { stateToken: loginParams.stateToken },
      );
    }

    it("v1: succeeds for a bound tenant subject lacking any MFA-bearing amr claim", async () => {
      const session = await exchangeWithAmr(["pwd"]);
      expect(session.accessToken).toBeDefined();
      expect(session.identity.realm).toBe("tenant");
    });

    it("honestly records the security event as v1-not-required without faking amr/mfaVerified", async () => {
      await exchangeWithAmr(["pwd"]);

      const events = await securityEventsService.listEvents(null, {
        limit: 10,
      });
      const issued = events.find(
        (event) => event.eventType === "tenant_oidc_session.issued",
      );
      expect(issued).toBeDefined();
      const afterSummary = issued?.afterSummary as
        | Record<string, unknown>
        | null
        | undefined;
      expect(afterSummary?.mfaVerified).toBe(false);
      expect(afterSummary?.mfaPolicy).toBe("v1_not_required");
      expect(afterSummary?.amr).toEqual(["pwd"]);
    });

    it("AUTH_REQUIRE_ORDINARY_LOGIN_MFA=true restores the blanket tenant MFA gate", async () => {
      process.env.AUTH_REQUIRE_ORDINARY_LOGIN_MFA = "true";
      await expect(exchangeWithAmr(["pwd"])).rejects.toThrow(ApiRequestError);
    });

    it("still succeeds normally when the amr claim does carry an MFA method (unchanged happy path)", async () => {
      const session = await exchangeWithAmr(["pwd", "mfa"]);
      expect(session.accessToken).toBeDefined();
    });
  });

  describe("3. Partner OIDC session exchange (oidc-pkce.service.ts)", () => {
    let jwtAuthService: JwtAuthService;
    let tenantPartnerService: TenantPartnerService;
    let securityEventsService: SecurityEventsService;
    let oidcService: OidcPkceService;

    beforeEach(() => {
      jwtAuthService = new JwtAuthService();
      tenantPartnerService = new TenantPartnerService(
        new AuditNotificationService(),
      );
      securityEventsService = new SecurityEventsService();
      oidcService = new OidcPkceService(
        jwtAuthService,
        tenantPartnerService,
        securityEventsService,
      );
    });

    async function seedPartnerIdentityLink(sub: string) {
      const partnerUserIdentityLinkRepo = (oidcService as any)
        .partnerUserIdentityLinkRepo;
      await partnerUserIdentityLinkRepo.resolveOrCreate({
        entrySlug: "yuhe-residence",
        partnerUserRef: sub,
      });
    }

    it("v1: succeeds for a partner login lacking any MFA-bearing amr claim", async () => {
      await seedPartnerIdentityLink("sub_no_mfa");
      const loginParams = oidcService.generateLoginParameters("partner", {
        partnerId: "yuhe-residence",
      });

      const session = await oidcService.exchangePartnerCallbackSession(
        {
          provider: "oidc",
          callbackUrl: "http://localhost:3000/api/auth/callback",
          code: "code_no_mfa",
          state: loginParams.state,
          partnerId: "yuhe-residence",
        },
        { stateToken: loginParams.stateToken },
      );

      expect(session.accessToken).toBeDefined();
      expect(session.identity.realm).toBe("partner");
    });

    it("honestly records the security event as v1-not-required without faking amr/mfaVerified", async () => {
      await seedPartnerIdentityLink("sub_no_mfa");
      const loginParams = oidcService.generateLoginParameters("partner", {
        partnerId: "yuhe-residence",
      });

      await oidcService.exchangePartnerCallbackSession(
        {
          provider: "oidc",
          callbackUrl: "http://localhost:3000/api/auth/callback",
          code: "code_no_mfa",
          state: loginParams.state,
          partnerId: "yuhe-residence",
        },
        { stateToken: loginParams.stateToken },
      );

      const events = await securityEventsService.listEvents(null, {
        limit: 10,
      });
      const issued = events.find(
        (event) => event.eventType === "partner_oidc_session.issued",
      );
      expect(issued).toBeDefined();
      const afterSummary = issued?.afterSummary as
        | Record<string, unknown>
        | null
        | undefined;
      expect(afterSummary?.mfaVerified).toBe(false);
      expect(afterSummary?.mfaPolicy).toBe("v1_not_required");
      expect(afterSummary?.amr).toEqual(["pwd"]);
    });

    it("AUTH_REQUIRE_ORDINARY_LOGIN_MFA=true restores the blanket partner MFA gate", async () => {
      await seedPartnerIdentityLink("sub_no_mfa");
      process.env.AUTH_REQUIRE_ORDINARY_LOGIN_MFA = "true";
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
  });

  describe("4. production/staging auth-startup guards remain unchanged", () => {
    it("ALLOW_INSECURE_DEV_AUTH=true is still FORBIDDEN_MODE in production regardless of the MFA policy switch", () => {
      const report = buildAuthStartupConfigReport({
        APP_ENV: "production",
        ALLOW_INSECURE_DEV_AUTH: "true",
        AUTH_REQUIRE_ORDINARY_LOGIN_MFA: "false",
      });
      expect(report.valid).toBe(false);
      expect(
        report.issues.some(
          (issue) =>
            issue.control === "ALLOW_INSECURE_DEV_AUTH" &&
            issue.code === "FORBIDDEN_MODE",
        ),
      ).toBe(true);
    });

    it("AUTH_MODE=local is still FORBIDDEN_MODE in staging regardless of the MFA policy switch", () => {
      const report = buildAuthStartupConfigReport({
        APP_ENV: "staging",
        AUTH_MODE: "local",
        AUTH_REQUIRE_ORDINARY_LOGIN_MFA: "false",
      });
      expect(report.valid).toBe(false);
      expect(
        report.issues.some(
          (issue) => issue.control === "AUTH_MODE" && issue.code === "FORBIDDEN_MODE",
        ),
      ).toBe(true);
    });
  });
});
