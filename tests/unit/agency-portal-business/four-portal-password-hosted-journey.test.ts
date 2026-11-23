import { createHash, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CanonicalIdentityMembershipRecord,
  CanonicalIdentityPrincipalRecord,
  CanonicalIdentityRoleBindingRecord,
  PartnerChannelEntryRecord,
} from "@drts/contracts";
import {
  AGENCY_PORTAL_EXPORT_SCOPES,
  AGENCY_PORTAL_READ_SCOPES,
} from "../../../packages/contracts/src/iam-policy-catalog";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import {
  AGENCY_WRITE_ROUTE_ALLOWLIST,
  AUTH_ALLOWED_REALMS_KEY,
} from "../../../apps/api/src/common/auth/auth.constants";
import { resolveRouteAuthPolicy } from "../../../apps/api/src/common/auth/auth.policy";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { PasswordHashingService } from "../../../apps/api/src/common/auth/password-hashing.service";
import { AgencyDirectoryRepository } from "../../../apps/api/src/modules/agency-access/agency-directory.repository";
import { AuthController } from "../../../apps/api/src/modules/auth/auth.controller";
import {
  TotpCodeReplayedError,
  TotpService,
} from "../../../apps/api/src/modules/auth/totp.service";
import { TotpCredentialRepository } from "../../../apps/api/src/modules/auth/totp-credential.repository";
import { IdentityRepository } from "../../../apps/api/src/modules/identity/identity.repository";
import { SecurityEventsService } from "../../../apps/api/src/modules/security-events/security-events.service";
import { PartnerUserIdentityLinkRepository } from "../../../apps/api/src/modules/tenant-partner/partner-user-identity-link.repository";
import { TenantInvitationDeliveryService } from "../../../apps/api/src/modules/tenant-partner/tenant-invitation-delivery.service";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { middleware as fleetMiddleware } from "../../../apps/fleet-partner-portal-web/middleware";
import {
  SIMULATED_AUTHENTICATOR_DEVICE_LABEL,
  SimulatedTotpAuthenticatorDevice,
  assertNoLeakedSecretsInEvidence,
  buildFourPortalHostedJourneyClassification,
  extractInvitationLink,
  extractPasswordResetTarget,
  redactHostedJourneySecrets,
} from "../../e2e/agency-portal-business/totp-authenticator-fixture";

const TEST_JWT_SECRET = "unit-test-four-portal-password-hosted-journey-secret";
const TEST_PEPPER_JSON = JSON.stringify({
  v1: "unit-test-four-portal-password-pepper-v1",
});
const TEST_TOTP_KEYS_JSON = JSON.stringify({
  activeKeyId: "v1",
  keys: {
    v1: Buffer.alloc(32, 0x42).toString("base64"),
  },
});

describe("FOUR-PORTAL-PASSWORD-HOSTED-JOURNEY-20261123: fixture authenticator, evidence redaction & real-surface classification", () => {
  beforeEach(() => {
    vi.stubEnv("DRTS_ENV", "development");
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("JWT_SECRET", TEST_JWT_SECRET);
    vi.stubEnv("JWT_ISSUER", "drts-local");
    vi.stubEnv("JWT_AUDIENCE", "drts-api");
    vi.stubEnv("PASSWORD_PEPPER_SECRETS_JSON", TEST_PEPPER_JSON);
    vi.stubEnv("PASSWORD_PEPPER_CURRENT_VERSION", "v1");
    vi.stubEnv("TOTP_ENCRYPTION_KEYS_JSON", TEST_TOTP_KEYS_JSON);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("verifies 3 consecutive RFC 6238 TOTP codes (confirm, initial MFA login, post-reset MFA login) through real TotpService without 30s sleeps and rejects replay", async () => {
    vi.useFakeTimers();
    let fakeNowMs = 1_795_000_005_000;
    vi.setSystemTime(fakeNowMs);

    try {
      const totpRepository = new TotpCredentialRepository();
      const totpService = new TotpService(totpRepository);
      const device = new SimulatedTotpAuthenticatorDevice();
      expect(device.deviceLabel).toBe(SIMULATED_AUTHENTICATOR_DEVICE_LABEL);

      const principalId = `principal_totp_fixture_${randomUUID()}`;
      const enrollment = await totpService.enroll(
        principalId,
        "disposable.user@hosted.example",
      );
      expect(enrollment.secret).toBeTruthy();
      expect(enrollment.otpauthUri).toContain("otpauth://totp/");

      const waitCalls: number[] = [];
      const options = {
        nowMs: () => fakeNowMs,
        waitFn: async (ms: number) => {
          waitCalls.push(ms);
          fakeNowMs += ms;
          vi.setSystemTime(fakeNowMs);
        },
      };

      // 1. Confirm enrollment (`nowStep - 1`)
      const confirmCode = await device.nextCode(enrollment.secret, options);
      const confirmed = await totpService.confirm(
        principalId,
        confirmCode.code,
      );
      expect(confirmed.recoveryCodes).toHaveLength(10);

      // Replaying the exact same confirm code must fail with TotpCodeReplayedError.
      await expect(
        totpService.verifyLoginCode(principalId, confirmCode.code),
      ).rejects.toBeInstanceOf(TotpCodeReplayedError);

      // 2. First MFA login (`nowStep`)
      const firstLoginCode = await device.nextCode(enrollment.secret, options);
      expect(firstLoginCode.step).toBeGreaterThan(confirmCode.step);
      await expect(
        totpService.verifyLoginCode(principalId, firstLoginCode.code),
      ).resolves.toBeUndefined();

      // 3. Post-password-reset MFA login (`nowStep + 1`)
      const postResetLoginCode = await device.nextCode(
        enrollment.secret,
        options,
      );
      expect(postResetLoginCode.step).toBeGreaterThan(firstLoginCode.step);
      await expect(
        totpService.verifyLoginCode(principalId, postResetLoginCode.code),
      ).resolves.toBeUndefined();
      expect(waitCalls).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("extracts invitation and password-reset targets and redacts all credentials, tokens, QR/otpauth URIs, secrets, recovery codes, cookies and JWTs", () => {
    const rawInviteToken = "ti_abcdefghijklmnopqrstuvwxyz0123456789";
    const inviteMail = [
      "Hello Hosted Tenant User,",
      "",
      `Accept your invitation: http://localhost:3213/invite?token=${rawInviteToken}`,
      "This invitation expires at 2026-11-24T00:00:00.000Z.",
    ].join("\n");

    const extractedInvite = extractInvitationLink(inviteMail);
    expect(extractedInvite.acceptUrl).toBe(
      `http://localhost:3213/invite?token=${rawInviteToken}`,
    );
    expect(extractedInvite.redactedAcceptUrl).toBe(
      "http://localhost:3213/invite?token=%5BREDACTED_INVITATION_TOKEN%5D",
    );

    const rawResetToken = "prt_ZYXWVUTSRQPONMLKJIHGFEDCBA9876543210";
    const resetMail = [
      "Hello,",
      "",
      `Reset your password: http://localhost:3213/reset-password?token=${rawResetToken}`,
    ].join("\n");
    const extractedReset = extractPasswordResetTarget(
      resetMail,
      "http://localhost:3214",
    );
    expect(extractedReset.resetUrl).toBe(
      `http://localhost:3214/reset-password?token=${rawResetToken}`,
    );
    expect(extractedReset.emailLinkOriginMatchedPortal).toBe(false);
    expect(extractedReset.redactedResetUrl).toBe(
      "http://localhost:3214/reset-password?token=[REDACTED_RESET_TOKEN]",
    );

    const rawSecret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
    const rawPassword = "InitialDisposablePassword!2026";
    const rawRecoveryCode = "ABCD-EF23";
    const rawJwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwcmluY2lwYWxfMSIsInJlYWxtIoidGVuYW50In0.signature1234567890";

    const unredactedEvidence = {
      inviteLink: `http://localhost:3213/invite?token=${rawInviteToken}`,
      resetLink: `http://localhost:3213/reset-password?token=${rawResetToken}`,
      otpauthUri: `otpauth://totp/DRTS:user@example.com?secret=${rawSecret}&issuer=DRTS`,
      secret: rawSecret,
      password: rawPassword,
      recoveryCodes: [rawRecoveryCode],
      cookie: `drts_tenant_session=${rawJwt}; HttpOnly`,
      nestedNote: `Used ${rawPassword} with ${rawSecret} and ${rawRecoveryCode} and ${rawJwt}`,
    };

    const redacted = redactHostedJourneySecrets(unredactedEvidence, [
      rawSecret,
      rawPassword,
      rawRecoveryCode,
      rawInviteToken,
      rawResetToken,
      rawJwt,
    ]);
    const serialized = JSON.stringify(redacted);

    expect(() =>
      assertNoLeakedSecretsInEvidence(serialized, [
        rawSecret,
        rawPassword,
        rawRecoveryCode,
        rawInviteToken,
        rawResetToken,
        rawJwt,
      ]),
    ).not.toThrow();

    const classification = buildFourPortalHostedJourneyClassification();
    expect(classification.acceptanceKey).toBe(
      "four_portal_password_hosted_rehearsal_and_real_surface_readback_classified",
    );
    expect(
      classification.fourPortalScopes.enterpriseDispatchWeb
        .inventsSeparateInvitationUri,
    ).toBe(false);
    expect(
      classification.sharedDevExistingPasswordLoginEvidence.deployDevRuns,
    ).toEqual(["44019618638", "44476190461", "44610538859"]);
    expect(classification.sharedDevExistingPasswordLoginEvidence.headSha).toBe(
      "134df5cc4a436dce36fd2359f089217665d10b80",
    );
    expect(
      classification.separateExternalAndSharedDevFormalAcceptance.trackedItems.map(
        (item) => item.id,
      ),
    ).toEqual(["PWD-LOGIN-012", "FLEET-ONB-009"]);
  });
});

describe("FOUR-PORTAL-PASSWORD-HOSTED-JOURNEY-20261123: minimal reproductions of product defects outside write_scopes", () => {
  beforeEach(() => {
    vi.stubEnv("DRTS_ENV", "development");
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("JWT_SECRET", TEST_JWT_SECRET);
    vi.stubEnv("JWT_ISSUER", "drts-local");
    vi.stubEnv("JWT_AUDIENCE", "drts-api");
    vi.stubEnv("PASSWORD_PEPPER_SECRETS_JSON", TEST_PEPPER_JSON);
    vi.stubEnv("PASSWORD_PEPPER_CURRENT_VERSION", "v1");
    vi.stubEnv("TOTP_ENCRYPTION_KEYS_JSON", TEST_TOTP_KEYS_JSON);
    vi.stubEnv("AUTH_REQUIRE_ORDINARY_LOGIN_MFA", "false");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("Minimal Repro 1 & 2: BootstrapAuthGuard blocks Agency Portal TOTP enrollment/confirm and Account Security session inventory with 403 AUTH_REALM_DENIED", async () => {
    const identityRepository = new IdentityRepository();
    const agencyDirectory = new AgencyDirectoryRepository();
    const now = new Date().toISOString();
    await agencyDirectory.create({
      agencyId: "agency_repro_1",
      agencyCode: "TPE-REPRO-1",
      displayName: "Agency Repro",
      status: "active",
      createdByPrincipalId: null,
      createdAt: now,
      updatedAt: now,
    });

    const rawInviteToken = "ai_repro_token_1234567890";
    const tokenHash = createHash("sha256").update(rawInviteToken).digest("hex");
    await identityRepository.issueAgencyInvitation({
      agencyId: "agency_repro_1",
      email: "exporter.repro@agency.example",
      roleCode: "agency_exporter",
      accessValidTo: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      tokenHash,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      issuerPrincipalId: null,
    });

    const hasher = new PasswordHashingService();
    const hashed = await hasher.hash("AgencyReproPassword!2026");
    const accepted =
      await identityRepository.acceptAgencyInvitationWithPassword(tokenHash, {
        passwordHash: hashed.hash,
        passwordAlgo: hashed.algo,
        pepperVersion: hashed.pepperVersion,
      });
    expect(accepted).toBeTruthy();

    const jwtAuthService = new JwtAuthService(
      identityRepository,
      undefined,
      undefined,
      agencyDirectory,
    );
    const tokenVersion = Math.max(
      Date.parse(accepted!.principal.updatedAt),
      Date.parse(accepted!.membership.updatedAt),
      ...accepted!.roleBindings.map((b) => Date.parse(b.updatedAt)),
    );
    const issued = await jwtAuthService.issueSessionToken(
      {
        authMode: "jwt_bearer",
        actorType: "agency_user",
        actorId: accepted!.principal.principalId,
        principalId: accepted!.principal.principalId,
        membershipId: accepted!.membership.membershipId,
        subject: accepted!.principal.principalId,
        realm: "agency",
        tenantId: null,
        agencyId: "agency_repro_1",
        roleFamilies: ["agency"],
        roles: ["agency_exporter"],
        scopes: [...AGENCY_PORTAL_READ_SCOPES, ...AGENCY_PORTAL_EXPORT_SCOPES],
        tokenVersion,
        amr: ["pwd"],
        acr: "aal1",
      },
      { expiresIn: "8h", ensurePrincipal: false, tokenVersion },
    );

    let activeDecoratorRealms: string[] | undefined = [
      "tenant",
      "agency",
      "partner",
    ];
    const guard = new BootstrapAuthGuard(
      {
        getAllAndOverride: (key: string) =>
          key === AUTH_ALLOWED_REALMS_KEY ? activeDecoratorRealms : undefined,
      } as never,
      jwtAuthService,
    );

    const runGuard = async (
      method: string,
      url: string,
      decoratorRealms?: string[],
    ) => {
      activeDecoratorRealms = decoratorRealms;
      const request: Record<string, unknown> = {
        headers: { authorization: `Bearer ${issued.token}` },
        method,
        url,
      };
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => () => undefined,
        getClass: () => class {},
      };
      try {
        await guard.canActivate(context as never);
        return { allowed: true as const, code: null, message: null };
      } catch (error) {
        const apiErr = error as ApiRequestError;
        const envelopeMessage = (
          apiErr.getResponse?.() as { error?: { message?: string } } | undefined
        )?.error?.message;
        return {
          allowed: false as const,
          status: apiErr.getStatus?.() ?? null,
          code: apiErr.code ?? null,
          message: envelopeMessage ?? apiErr.message ?? null,
        };
      }
    };

    // Repro 1: `POST /api/auth/agency/mfa/totp/enroll` & `confirm`
    // (`TotpController` is decorated with `@RequireRealms("tenant", "agency", "partner")`)
    const enrollOutcome = await runGuard(
      "POST",
      "/api/auth/agency/mfa/totp/enroll",
      ["tenant", "agency", "partner"],
    );
    const confirmOutcome = await runGuard(
      "POST",
      "/api/auth/agency/mfa/totp/confirm",
      ["tenant", "agency", "partner"],
    );
    if (!AGENCY_WRITE_ROUTE_ALLOWLIST.has("POST auth/agency/mfa/totp/enroll")) {
      expect(enrollOutcome).toMatchObject({
        allowed: false,
        status: 403,
        code: "AUTH_REALM_DENIED",
        message: "Agency sessions are read-only.",
      });
      expect(confirmOutcome).toMatchObject({
        allowed: false,
        status: 403,
        code: "AUTH_REALM_DENIED",
        message: "Agency sessions are read-only.",
      });
    } else {
      expect(enrollOutcome.allowed).toBe(true);
      expect(confirmOutcome.allowed).toBe(true);
    }

    // Repro 2: `GET /api/auth/sessions` on `/account/security`
    // (`AuthController.listOwnSessions` has no `@RequireRealms` decorator and relies on `resolveRouteAuthPolicy`)
    const sessionsPolicy = resolveRouteAuthPolicy("GET", "/api/auth/sessions");
    const sessionsOutcome = await runGuard(
      "GET",
      "/api/auth/sessions",
      undefined,
    );
    if (!sessionsPolicy?.allowedRealms.includes("agency")) {
      expect(sessionsOutcome).toMatchObject({
        allowed: false,
        status: 403,
        code: "AUTH_REALM_DENIED",
        message:
          "Agency sessions may only access routes explicitly classified for the agency realm.",
      });
    } else {
      expect(sessionsOutcome.allowed).toBe(true);
    }
  });

  it("Minimal Repro 3: JwtAuthService.verifyAccessToken rejects a password-onboarded Fleet Partner staff session when no partner_user_identity_links row exists", async () => {
    const identityRepository = new IdentityRepository();
    const tenantPartnerService = new TenantPartnerService();
    const entrySlug = "fleet-demo-001";
    const fleetPartnerId = "fleet-demo-001";
    const now = new Date().toISOString();
    const principalId = `principal_fleet_pwd_${randomUUID().replace(/-/g, "")}`;
    const membershipId = `membership_fleet_pwd_${randomUUID().replace(/-/g, "")}`;
    const roleBindingId = `role_binding_fleet_pwd_${randomUUID().replace(/-/g, "")}`;

    const repoInternal = identityRepository as unknown as {
      upsertFallbackPrincipal: (
        record: CanonicalIdentityPrincipalRecord,
      ) => CanonicalIdentityPrincipalRecord;
      fallbackMemberships: Map<string, CanonicalIdentityMembershipRecord>;
      fallbackRoleBindings: Map<string, CanonicalIdentityRoleBindingRecord>;
    };

    // Mirrors `acceptFleetStaffInvitationWithPassword` (`identity.repository.ts:6300-6309`):
    // issuer stays at `https://fleet-invitation.drts.internal` and NO
    // `partner_user_identity_links` row is created.
    repoInternal.upsertFallbackPrincipal({
      principalId,
      sourceRef: `jwt_principal:partner:${principalId}`,
      issuer: "https://fleet-invitation.drts.internal",
      subject: `fleet_invitation:${entrySlug}:fleet.repro@fleet.example`,
      principalType: "human",
      email: "fleet.repro@fleet.example",
      emailVerified: true,
      displayName: null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    repoInternal.fallbackMemberships.set(membershipId, {
      membershipId,
      sourceRef: `fleet_member:${entrySlug}:${principalId}`,
      principalId,
      realm: "partner",
      scopeRef: `fleet:${entrySlug}`,
      tenantId: null,
      partnerId: fleetPartnerId,
      status: "active",
      invitedByPrincipalId: null,
      invitationId: null,
      createdAt: now,
      updatedAt: now,
    });
    repoInternal.fallbackRoleBindings.set(roleBindingId, {
      roleBindingId,
      sourceRef: `fleet_role:${entrySlug}:${principalId}`,
      membershipId,
      roleCode: "fleet_partner_ops",
      grantedByPrincipalId: null,
      approvalId: null,
      validFrom: now,
      validTo: null,
      createdAt: now,
      updatedAt: now,
    });

    const hashed = await new PasswordHashingService().hash(
      "FleetReproPassword!2026",
    );
    await identityRepository.setPasswordCredentialForPrincipal(principalId, {
      passwordHash: hashed.hash,
      passwordAlgo: hashed.algo,
      pepperVersion: hashed.pepperVersion,
    });

    // Wire `PartnerUserIdentityLinkRepository` into `JwtAuthService` exactly as
    // `AuthModule` does in production. Because password onboarding creates no
    // Google OIDC link row, `findByDrtsPassengerId` returns `null`.
    const linkRepository = new PartnerUserIdentityLinkRepository();
    vi.spyOn(linkRepository, "findByDrtsPassengerId").mockResolvedValue(null);

    const jwtAuthService = new JwtAuthService(
      identityRepository,
      tenantPartnerService,
      undefined,
      undefined,
      linkRepository,
    );
    const totpRepository = new TotpCredentialRepository();
    const totpService = new TotpService(
      totpRepository,
      new PasswordHashingService(),
    );
    const authController = new AuthController(
      jwtAuthService,
      tenantPartnerService,
      {} as never,
      new SecurityEventsService(),
      undefined,
      undefined,
      identityRepository,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      totpService,
      totpRepository,
    );

    const loginEnvelope = (await authController.passwordLogin("partner", {
      email: "fleet.repro@fleet.example",
      password: "FleetReproPassword!2026",
      partnerId: entrySlug,
    })) as {
      data: {
        accessToken: string;
        partnerEntry: PartnerChannelEntryRecord;
      };
    };
    expect(loginEnvelope.data.accessToken).toBeTruthy();

    // Immediately verify the issued access token via `JwtAuthService.verifyAccessToken`
    // (the exact check `BootstrapAuthGuard` runs on `POST /api/auth/partner/mfa/totp/enroll`
    // and `GET /api/auth/sessions`).
    const verifiedPayload = await jwtAuthService.verifyAccessToken(
      loginEnvelope.data.accessToken,
    );

    // Current product defect in `JwtAuthService.validateFleetHumanDurableState`
    // (`apps/api/src/common/auth/jwt-auth.service.ts:1269-1285`):
    // requires `!link || link.status !== "active"`, returning `null` for any
    // password-onboarded Fleet staff member without a Google OIDC link row.
    expect(verifiedPayload).toBeNull();
  });

  it("Minimal Repro 4 & 5: Fleet Portal middleware redirects unauthenticated /invite when DRTS_FLEET_PORTAL_AUTH_REQUIRED=true, and password reset email body ignores realm", async () => {
    vi.stubEnv("DRTS_FLEET_PORTAL_AUTH_REQUIRED", "true");
    const inviteReq = new NextRequest(
      "http://localhost:3215/invite?token=fi_repro_token_12345",
    );
    const middlewareRes = fleetMiddleware(inviteReq);
    // Current product defect in `apps/fleet-partner-portal-web/middleware.ts:5-10`:
    // `/invite` is missing from `PUBLIC_PATHS`, so unauthenticated `/invite`
    // is redirected to `/login?redirect_uri=%2Finvite` when auth is required.
    expect(middlewareRes.status).toBe(307);
    expect(middlewareRes.headers.get("location")).toContain(
      "/login?redirect_uri=%2Finvite",
    );

    // Repro 5: `TenantInvitationDeliveryService.sendPasswordReset` uses a
    // single `PASSWORD_RESET_URL_BASE` regardless of `request.realm`.
    vi.stubEnv(
      "PASSWORD_RESET_URL_BASE",
      "http://localhost:3213/reset-password",
    );
    const capturedBodies: Array<{ realm: string; body: string }> = [];
    const fakeDeliveryService = {
      sendPlatformMail: vi.fn(async (req: { body: string }) => {
        capturedBodies.push({ realm: "platform_mail", body: req.body });
        return { status: "sent" };
      }),
    };
    const delivery = new TenantInvitationDeliveryService(
      fakeDeliveryService as never,
    );
    await delivery.sendPasswordReset({
      dedupeKey: "repro-agency-reset",
      realm: "agency",
      tenantId: null,
      recipientEmail: "agency.repro@bureau.example",
      expiresAt: "2026-11-24T00:00:00.000Z",
      rawToken: "prt_repro_agency_token_123456",
    });
    expect(capturedBodies).toHaveLength(1);
    // Even for `realm: "agency"`, the email link points to `localhost:3213` (tenant-console-web).
    expect(capturedBodies[0]?.body).toContain(
      "http://localhost:3213/reset-password?token=prt_repro_agency_token_123456",
    );
  });
});
