import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { describe, expect, it, beforeEach } from "vitest";
import * as jwt from "jsonwebtoken";
import { OidcPkceService } from "../../apps/api/src/modules/auth/oidc-pkce.service";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { PartnerUserIdentityLinkRepository } from "../../apps/api/src/modules/tenant-partner/partner-user-identity-link.repository";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { AuthController } from "../../apps/api/src/modules/auth/auth.controller";
import { BootstrapAuthGuard } from "../../apps/api/src/common/auth/bootstrap-auth.guard";

const { Reflector } = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
)("@nestjs/core");

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

    it("v1 policy: allows partner login without MFA-bearing amr claims (product decision 2026-09-15)", async () => {
      const partnerUserIdentityLinkRepo = (oidcService as any)
        .partnerUserIdentityLinkRepo;
      await partnerUserIdentityLinkRepo.resolveOrCreate({
        entrySlug: "yuhe-residence",
        partnerUserRef: "sub_no_mfa",
      });

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

    it("AUTH_REQUIRE_ORDINARY_LOGIN_MFA=true restores the blanket partner MFA gate without a code change", async () => {
      const partnerUserIdentityLinkRepo = (oidcService as any)
        .partnerUserIdentityLinkRepo;
      await partnerUserIdentityLinkRepo.resolveOrCreate({
        entrySlug: "yuhe-residence",
        partnerUserRef: "sub_no_mfa",
      });

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

  describe("6. Partner canonical session issuance and readback", () => {
    it("issues a durable partner session bound to the real entry version, verifies it and rejects revocation, invalid JWT and entry changes", async () => {
      const repository = new IdentityRepository(); // in-memory fallback; no PG or live issuer
      const auth = new JwtAuthService(repository, tenantPartnerService);
      const service = new OidcPkceService(auth, tenantPartnerService);
      const code = "partner_canonical_valid_code";
      const sub = `sub_oidc_${createHash("sha256").update(code).digest("hex").slice(0, 12)}`;
      await (service as any).partnerUserIdentityLinkRepo.resolveOrCreate({
        entrySlug: "yuhe-residence",
        partnerUserRef: sub,
      });
      const login = service.generateLoginParameters("partner", {
        partnerId: "yuhe-residence",
      });
      const command = {
        provider: "oidc" as const,
        code,
        state: login.state,
        callbackUrl: "http://localhost:3000/api/auth/callback",
        partnerId: "yuhe-residence",
      };
      const session = await service.exchangePartnerCallbackSession(command, {
        stateToken: login.stateToken,
      });
      const payload = auth.verify(session.accessToken)!;
      const entry = tenantPartnerService.getPartnerEntry("yuhe-residence");
      expect(payload).toMatchObject({
        realm: "partner",
        actorType: "partner_user",
        partnerId: entry.entrySlug,
        partnerEntrySlug: entry.entrySlug,
        roles: ["partner_admin"],
        scopes: ["partner:read", "partner:write"],
        tokenVersion: Date.parse(entry.updatedAt),
      });
      expect(payload.sid).toBeTruthy();
      expect(payload.jti).toBeTruthy();
      expect(payload.auth_time).toBeGreaterThan(0);
      expect(payload.acr).toBeTypeOf("string");
      expect(payload.policyVersion).toBeTruthy();
      expect(await repository.getSession(payload.sid!)).toMatchObject({
        status: "active",
        currentTokenId: payload.jti,
        partnerEntrySlug: entry.entrySlug,
        tokenVersion: payload.tokenVersion,
      });
      expect(await auth.verifyAccessToken(session.accessToken)).toMatchObject({
        sid: payload.sid,
        sub: payload.sub,
      });
      const controller = new AuthController(
        auth,
        tenantPartnerService,
        {} as never,
      );
      const guard = new BootstrapAuthGuard(new Reflector(), auth);
      const request = {
        method: "GET",
        url: "/api/auth/session",
        headers: { authorization: `Bearer ${session.accessToken}` },
        identity: null as ReturnType<
          JwtAuthService["toRequestIdentity"]
        > | null,
      };
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => AuthController.prototype.getAuthSession,
        getClass: () => AuthController,
      } as never;
      expect(await guard.canActivate(context)).toBe(true);
      expect(controller.getAuthSession(request.identity).data).toMatchObject({
        active: true,
        identity: {
          realm: "partner",
          actorType: "partner_user",
          partnerEntrySlug: entry.entrySlug,
          sessionId: payload.sid,
        },
      });
      expect(
        await auth.verifyAccessToken(`${session.accessToken}forged`),
      ).toBeNull();
      request.headers.authorization = `Bearer ${session.accessToken}forged`;
      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: "JWT_INVALID",
      });
      request.headers.authorization = `Bearer ${session.accessToken}`;
      // Mutate only the in-memory entry fixture; production verifier still
      // calls getPartnerEntry and compares its real updatedAt fingerprint.
      const entries = (
        tenantPartnerService as unknown as {
          partnerEntries: { entrySlug: string; updatedAt: string }[];
        }
      ).partnerEntries;
      const storedEntry = entries.find(
        (item) => item.entrySlug === entry.entrySlug,
      )!;
      const originalVersion = storedEntry.updatedAt;
      storedEntry.updatedAt = new Date(
        Date.parse(originalVersion) + 1000,
      ).toISOString();
      try {
        expect(await auth.verifyAccessToken(session.accessToken)).toBeNull();
      } finally {
        storedEntry.updatedAt = originalVersion;
      }
      await auth.revokeCurrentSession(payload.sid!);
      expect(await auth.verifyAccessToken(session.accessToken)).toBeNull();
      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: "JWT_INVALID",
      });
    });

    it("denies mismatched partner scope, wrong state and replay without minting a session", async () => {
      const repo = new IdentityRepository();
      const auth = new JwtAuthService(repo, tenantPartnerService);
      const service = new OidcPkceService(auth, tenantPartnerService);
      const login = service.generateLoginParameters("partner", {
        partnerId: "yuhe-residence",
      });
      const base = {
        provider: "oidc" as const,
        code: "partner_canonical_valid_code",
        state: login.state,
        callbackUrl: "http://localhost:3000/api/auth/callback",
      };
      await expect(
        service.exchangePartnerCallbackSession(
          { ...base, state: "wrong" },
          { stateToken: login.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
      await expect(
        service.exchangePartnerCallbackSession(
          { ...base, partnerId: "other-entry" },
          { stateToken: login.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
      await expect(
        service.exchangePartnerCallbackSession(
          { ...base, code: "invalid_code", partnerId: "yuhe-residence" },
          { stateToken: login.stateToken },
        ),
      ).rejects.toThrow(ApiRequestError);
      await expect(
        service.exchangePartnerCallbackSession(
          { ...base, partnerId: "yuhe-residence" },
          { stateToken: login.stateToken },
        ),
      ).rejects.toMatchObject({
        response: {
          error: { message: expect.stringContaining("already been used") },
        },
      });

      const expiredLogin = service.generateLoginParameters("partner", {
        partnerId: "yuhe-residence",
      });
      const stateRecord = service.verifyStateToken(expiredLogin.stateToken)!;
      const expiredToken = service.createSignedStateToken({
        ...stateRecord,
        expiresAt: Date.now() - 1,
      });
      await expect(
        service.exchangePartnerCallbackSession(
          { ...base, state: expiredLogin.state, partnerId: "yuhe-residence" },
          { stateToken: expiredToken },
        ),
      ).rejects.toMatchObject({
        response: {
          error: { message: expect.stringContaining("invalid or expired") },
        },
      });
    });
  });

  describe("7. Two existing partner entry links for one verified OIDC subject", () => {
    it("issues separate durable canonical principals with stable linked subjects and keeps external-sub audit", async () => {
      // In-memory repository only; production link resolution, OIDC callback,
      // canonical JWT issuance, principal persistence and self reader are real.
      // The PG UNIQUE(issuer, subject) constraint is not emulated here.
      const repository = new IdentityRepository();
      const auth = new JwtAuthService(repository, tenantPartnerService);
      const links = new PartnerUserIdentityLinkRepository();
      const auditEvents: Array<{
        eventType: string;
        subjectId: string | null;
        actorId: string | null;
      }> = [];
      // Observe only the external audit sink; real OIDC and JWT behavior is
      // exercised below, with an independent entry-scoped link repository.
      const audit = {
        recordEvent: (event: (typeof auditEvents)[number]) => {
          auditEvents.push(event);
        },
      };
      const service = new OidcPkceService(
        auth,
        tenantPartnerService,
        audit as never,
        links,
      );
      const code = "partner_two_entries_same_subject";
      const externalSub = `sub_oidc_${createHash("sha256").update(code).digest("hex").slice(0, 12)}`;
      const entries = ["yuhe-residence", "referral-demo-community"];
      const linked = await Promise.all(
        entries.map((entrySlug) =>
          links.resolveOrCreate({ entrySlug, partnerUserRef: externalSub }),
        ),
      );
      expect(linked[0]!.drtsPassengerId).not.toBe(linked[1]!.drtsPassengerId);
      const controller = new AuthController(
        auth,
        tenantPartnerService,
        {} as never,
      );
      const guard = new BootstrapAuthGuard(new Reflector(), auth);
      const keys: string[] = [];
      const issuers: string[] = [];
      for (const [index, entrySlug] of entries.entries()) {
        const entry = tenantPartnerService.getPartnerEntry(entrySlug!);
        expect(entry).toMatchObject({ status: "active", activeFlag: true });
        const login = service.generateLoginParameters("partner", {
          partnerId: entrySlug,
        });
        const session = await service.exchangePartnerCallbackSession(
          {
            provider: "oidc",
            code,
            state: login.state,
            callbackUrl: "http://localhost:3000/api/auth/callback",
            partnerId: entrySlug,
          },
          { stateToken: login.stateToken },
        );
        const payload = auth.verify(session.accessToken)!;
        const passengerId = linked[index]!.drtsPassengerId;
        expect(payload).toMatchObject({
          sub: passengerId,
          principalId: passengerId,
          partnerEntrySlug: entrySlug,
          roles: ["partner_admin"],
          scopes: ["partner:read", "partner:write"],
          tokenVersion: Date.parse(entry.updatedAt),
        });
        expect(session.identity.actorId).toBe(passengerId);
        expect(await auth.verifyAccessToken(session.accessToken)).toMatchObject(
          {
            sid: payload.sid,
            sub: passengerId,
          },
        );
        const principal = await repository.findPrincipalById(passengerId);
        expect(principal).toMatchObject({
          sourceRef: `jwt_principal:partner:${passengerId}`,
          subject: passengerId,
          status: "active",
        });
        keys.push(`${principal!.issuer}:${principal!.subject}`);
        issuers.push(principal!.issuer);
        const request = {
          method: "GET",
          url: "/api/auth/session",
          headers: { authorization: `Bearer ${session.accessToken}` },
          identity: null as ReturnType<
            JwtAuthService["toRequestIdentity"]
          > | null,
        };
        const context = {
          switchToHttp: () => ({ getRequest: () => request }),
          getHandler: () => AuthController.prototype.getAuthSession,
          getClass: () => AuthController,
        } as never;
        expect(await guard.canActivate(context)).toBe(true);
        expect(controller.getAuthSession(request.identity).data).toMatchObject({
          active: true,
          identity: { actorId: passengerId, partnerEntrySlug: entrySlug },
        });
        // Raw IdP subject remains the trusted link lookup and audit subject;
        // it is not the canonical API-issued subject shared across entries.
        expect(
          (await links.find(entrySlug!, externalSub))?.drtsPassengerId,
        ).toBe(passengerId);
        expect(await repository.getSession(payload.sid!)).toMatchObject({
          subject: passengerId,
          principalId: passengerId,
          partnerEntrySlug: entrySlug,
        });
        expect(auditEvents).toContainEqual(
          expect.objectContaining({
            eventType: "partner_oidc_session.issued",
            subjectId: externalSub,
            actorId: passengerId,
          }),
        );
      }
      expect(new Set(issuers).size).toBe(1);
      expect(new Set(keys).size).toBe(2);
    });
  });

  describe("8. Real OIDC HTTP Provider Exchange & JWT Token Verification", () => {
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
        { algorithm: "HS256", expiresIn: "5m" },
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
        { algorithm: "HS256", expiresIn: "5m" },
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
