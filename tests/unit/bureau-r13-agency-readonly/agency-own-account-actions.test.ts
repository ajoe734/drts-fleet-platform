import { createHash, randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import type { ExecutionContext } from "../../../apps/api/node_modules/@nestjs/common";
import { Reflector } from "../../../apps/api/node_modules/@nestjs/core";
import { generate } from "../../../apps/api/node_modules/otplib";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  AGENCY_CSRF_COOKIE_NAME,
  AGENCY_CSRF_HEADER_NAME,
  AGENCY_SESSION_COOKIE_NAME,
} from "../../../packages/agency-auth/src/constants";
import {
  AGENCY_PORTAL_EXPORT_SCOPES,
  AGENCY_PORTAL_READ_SCOPES,
} from "../../../packages/contracts/src/iam-policy-catalog";
import {
  handleListSessions,
  handleRevokeSession,
  handleTotpConfirm,
  handleTotpEnroll,
  handleTotpRegenerateRecoveryCodes,
  type PortalCredentialConfig,
} from "../../../packages/tenant-auth/src/credential-handlers";
import { generateCsrfToken } from "../../../packages/tenant-auth/src/session";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import {
  AUTH_SCOPE_PRESETS,
  getAgencyRoleScopes,
} from "../../../apps/api/src/common/auth/auth.constants";
import type {
  AuthenticatedRequestLike,
  BootstrapRequestIdentity,
} from "../../../apps/api/src/common/auth/auth.types";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { AgencyAccessAuditService } from "../../../apps/api/src/modules/agency-access/agency-access-audit.service";
import { AgencyAccessLogRepository } from "../../../apps/api/src/modules/agency-access/agency-access-log.repository";
import { AgencyDirectoryRepository } from "../../../apps/api/src/modules/agency-access/agency-directory.repository";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { AuthController } from "../../../apps/api/src/modules/auth/auth.controller";
import { TotpCredentialRepository } from "../../../apps/api/src/modules/auth/totp-credential.repository";
import { TotpController } from "../../../apps/api/src/modules/auth/totp.controller";
import {
  TotpRecoveryCodeInvalidError,
  TotpService,
} from "../../../apps/api/src/modules/auth/totp.service";
import { IdentityRepository } from "../../../apps/api/src/modules/identity/identity.repository";
import { SecurityEventsService } from "../../../apps/api/src/modules/security-events/security-events.service";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

const PRIOR_TOTP_KEYS_JSON = process.env.TOTP_ENCRYPTION_KEYS_JSON;
const KEY_V1 = randomBytes(32).toString("base64");

beforeAll(() => {
  process.env.TOTP_ENCRYPTION_KEYS_JSON = JSON.stringify({
    activeKeyId: "v1",
    keys: { v1: KEY_V1 },
  });
});

afterAll(() => {
  if (PRIOR_TOTP_KEYS_JSON === undefined) {
    delete process.env.TOTP_ENCRYPTION_KEYS_JSON;
  } else {
    process.env.TOTP_ENCRYPTION_KEYS_JSON = PRIOR_TOTP_KEYS_JSON;
  }
});

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function buildExecutionContext(
  request: AuthenticatedRequestLike,
  controllerClass: object,
  handler: (...args: never[]) => unknown,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => controllerClass,
  } as unknown as ExecutionContext;
}

async function createFixture() {
  const repo = new IdentityRepository();
  const directory = new AgencyDirectoryRepository();
  const accessLogs = new AgencyAccessLogRepository();
  const securityEvents = new SecurityEventsService();
  const totpRepo = new TotpCredentialRepository();
  const totpService = new TotpService(totpRepo);
  const totpController = new TotpController(totpService);

  const now = new Date().toISOString();
  for (const [agencyId, agencyCode] of [
    ["agency_a", "TEST-A"],
    ["agency_b", "TEST-B"],
  ] as const) {
    await directory.create({
      agencyId,
      agencyCode,
      displayName: `Test Agency ${agencyCode}`,
      status: "active",
      createdByPrincipalId: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  const tenantPartnerService = new TenantPartnerService(
    new AuditNotificationService(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    repo,
    repo,
  );
  const signer = new JwtAuthService(
    repo,
    tenantPartnerService,
    undefined,
    directory,
  );
  const guard = new BootstrapAuthGuard(
    new Reflector(),
    signer,
    undefined,
    undefined,
    undefined,
    securityEvents,
    undefined,
    undefined,
    undefined,
    new AgencyAccessAuditService(accessLogs),
  );

  const authController = new AuthController(
    signer,
    tenantPartnerService,
    {} as never,
    securityEvents,
    undefined,
    undefined,
    repo,
    undefined,
    undefined,
    undefined,
    undefined,
    directory,
    totpService,
    totpRepo,
  );

  async function onboardAgencyMember(options: {
    agencyId: string;
    email: string;
    subject: string;
    roleCode: "agency_viewer" | "agency_exporter";
    validTo?: string;
  }) {
    const rawInvite = `inv_${options.agencyId}_${options.subject}`;
    await repo.issueAgencyInvitation({
      agencyId: options.agencyId,
      email: options.email,
      roleCode: options.roleCode,
      accessValidTo:
        options.validTo ??
        new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      tokenHash: hash(rawInvite),
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      issuerPrincipalId: null,
    });
    const accepted = await repo.acceptAgencyOidcInvitation(hash(rawInvite), {
      issuer: "https://accounts.google.com",
      subject: options.subject,
      email: options.email,
    });
    if (!accepted) {
      throw new Error("Failed to accept agency invitation in fixture");
    }
    return accepted;
  }

  async function issueAgencySession(
    accepted: NonNullable<
      Awaited<ReturnType<IdentityRepository["acceptAgencyOidcInvitation"]>>
    >,
    options: {
      amr?: string[];
      authTime?: string;
      userAgent?: string;
      ipAddress?: string;
    } = {},
  ) {
    const snapshot = (await repo.findAgencyMembershipForPrincipal(
      accepted.principal.principalId,
    ))!;
    const roleCode = snapshot.roleBindings[0]!.roleCode;
    const scopes = [...(getAgencyRoleScopes(roleCode) ?? [])];
    const tokenVersion = Math.max(
      ...[
        snapshot.principal.updatedAt,
        snapshot.membership.updatedAt,
        ...snapshot.roleBindings.map((binding) => binding.updatedAt),
      ].map((value) => Date.parse(value)),
    );
    const authTime = options.authTime ?? new Date().toISOString();
    const amr = options.amr ?? ["pwd"];
    const issued = await signer.issueSessionToken(
      {
        authMode: "jwt_bearer",
        actorType: "agency_user",
        actorId: snapshot.principal.principalId,
        principalId: snapshot.principal.principalId,
        membershipId: snapshot.membership.membershipId,
        subject: snapshot.principal.subject,
        realm: "agency",
        tenantId: null,
        agencyId: snapshot.agencyId,
        roleFamilies: ["agency"],
        roles: [roleCode],
        scopes,
        tokenVersion,
        authTime,
        amr,
        acr: "aal1",
        requestId: null,
      },
      {
        expiresIn: "8h",
        ensurePrincipal: false,
        tokenVersion,
        ...(options.userAgent ? { userAgent: options.userAgent } : {}),
        ...(options.ipAddress ? { ipAddress: options.ipAddress } : {}),
      },
    );
    return {
      token: issued.token,
      sessionId: issued.sessionId,
      snapshot,
    };
  }

  async function activateGuard(
    method: string,
    url: string,
    token: string | undefined,
    controllerClass: object,
    handler: (...args: never[]) => unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<BootstrapRequestIdentity> {
    const request: AuthenticatedRequestLike = {
      method,
      originalUrl: url,
      url,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        "x-request-id": "req-agency-own-account",
        ...extraHeaders,
      },
    };
    const allowed = await guard.canActivate(
      buildExecutionContext(request, controllerClass, handler),
    );
    expect(allowed).toBe(true);
    expect(request.identity).toBeDefined();
    return request.identity as BootstrapRequestIdentity;
  }

  return {
    repo,
    directory,
    accessLogs,
    totpRepo,
    totpService,
    totpController,
    authController,
    tenantPartnerService,
    signer,
    guard,
    onboardAgencyMember,
    issueAgencySession,
    activateGuard,
  };
}

describe("AGENCY-OWN-ACCOUNT-PASSWORD-JOURNEY-20261123 agency own-account TOTP and session actions", () => {
  beforeEach(() => {
    vi.stubEnv("DRTS_ENV", "development");
    vi.stubEnv("JWT_SECRET", "test-session-secret-32-characters-long");
    vi.stubEnv("JWT_ISSUER", "https://drts-session.example");
    vi.stubEnv(
      "PASSWORD_PEPPER_SECRETS_JSON",
      JSON.stringify({ v1: "agency-own-account-pepper-32chars!" }),
    );
    vi.stubEnv("PASSWORD_PEPPER_CURRENT_VERSION", "v1");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("allows an agency member to accept a password invitation, log in, enroll and confirm TOTP, re-login with TOTP, and regenerate recovery codes through real BootstrapAuthGuard, AuthController, and TotpController", async () => {
    const f = await createFixture();
    vi.useFakeTimers({ toFake: ["Date"] });
    const rawInviteToken = "agency-pwd-invite-token-001";
    const email = "pwd-inspector@agency-a.example";
    const password = "correct horse battery staple";
    await f.repo.issueAgencyInvitation({
      agencyId: "agency_a",
      email,
      roleCode: "agency_viewer",
      accessValidTo: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      tokenHash: hash(rawInviteToken),
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      issuerPrincipalId: null,
    });
    const accepted =
      await f.tenantPartnerService.acceptAgencyInvitationWithPassword({
        invitationToken: rawInviteToken,
        password,
      });
    expect(accepted.accepted).toBe(true);

    const firstLogin = (await f.authController.passwordLogin("agency", {
      email,
      password,
    })) as {
      data: {
        accessToken: string;
        identity: { principalId: string; sessionId: string; amr: string[] };
      };
    };
    expect(firstLogin.data.identity.amr).toEqual(["pwd"]);

    // 1. Start TOTP enrollment via POST /api/auth/agency/mfa/totp/enroll
    const enrollIdentity = await f.activateGuard(
      "POST",
      "/api/auth/agency/mfa/totp/enroll",
      firstLogin.data.accessToken,
      TotpController,
      TotpController.prototype.enroll,
    );
    const enrollEnvelope = await f.totpController.enroll(
      "agency",
      enrollIdentity,
      {},
      "req-totp-enroll",
    );
    expect(enrollEnvelope.data.secret).toMatch(/^[A-Z2-7]+=*$/);
    expect(enrollEnvelope.data.otpauthUri).toContain("otpauth://totp/");
    expect(enrollEnvelope.data.otpauthUri).toContain("agency%3A");

    // 2. Confirm TOTP enrollment via POST /api/auth/agency/mfa/totp/confirm
    const confirmCode = await generate({ secret: enrollEnvelope.data.secret });
    const confirmIdentity = await f.activateGuard(
      "POST",
      "/api/auth/agency/mfa/totp/confirm",
      firstLogin.data.accessToken,
      TotpController,
      TotpController.prototype.confirm,
    );
    const confirmEnvelope = await f.totpController.confirm(
      "agency",
      confirmIdentity,
      { code: confirmCode },
      {},
      "req-totp-confirm",
    );
    expect(confirmEnvelope.data.recoveryCodes).toHaveLength(10);
    const initialRecoveryCodes = confirmEnvelope.data.recoveryCodes;

    // 3. Recovery-code regeneration requires a fresh trusted-MFA session (password-only session is denied with 403 MFA_REQUIRED)
    const regenBeforeMfaIdentity = await f.activateGuard(
      "POST",
      "/api/auth/agency/mfa/totp/recovery-codes/regenerate",
      firstLogin.data.accessToken,
      TotpController,
      TotpController.prototype.regenerateRecoveryCodes,
    );
    await expect(
      f.totpController.regenerateRecoveryCodes(
        "agency",
        regenBeforeMfaIdentity,
        {},
        "req-totp-regen-denied",
      ),
    ).rejects.toMatchObject({
      code: "MFA_REQUIRED",
    });

    // 4. Subsequent password login without TOTP is denied once TOTP is confirmed; with a fresh TOTP code it issues an MFA-verified session (amr: ["pwd", "otp"])
    await expect(
      f.authController.passwordLogin("agency", { email, password }),
    ).rejects.toBeInstanceOf(ApiRequestError);

    // Move the login verification window past the code consumed during enrollment.
    vi.setSystemTime(Date.now() + 60_000);
    const mfaLogin = await f.authController.passwordLogin("agency", {
      email,
      password,
      totpCode: await generate({ secret: enrollEnvelope.data.secret }),
    });
    expect(mfaLogin.data.identity.amr).toEqual(["pwd", "otp"]);
    const regenIdentity = await f.activateGuard(
      "POST",
      "/api/auth/agency/mfa/totp/recovery-codes/regenerate",
      mfaLogin.data.accessToken,
      TotpController,
      TotpController.prototype.regenerateRecoveryCodes,
    );
    const regenEnvelope = await f.totpController.regenerateRecoveryCodes(
      "agency",
      regenIdentity,
      {},
      "req-totp-regen-ok",
    );
    expect(regenEnvelope.data.recoveryCodes).toHaveLength(10);
    expect(
      regenEnvelope.data.recoveryCodes.some((code) =>
        initialRecoveryCodes.includes(code),
      ),
    ).toBe(false);

    await expect(
      f.totpService.verifyRecoveryCode(
        firstLogin.data.identity.principalId,
        initialRecoveryCodes[0]!,
      ),
    ).rejects.toBeInstanceOf(TotpRecoveryCodeInvalidError);
  });

  it("allows an agency member to list their own active login sessions and revoke a specified own session through real BootstrapAuthGuard and AuthController", async () => {
    const f = await createFixture();
    const viewer = await f.onboardAgencyMember({
      agencyId: "agency_a",
      email: "viewer@agency-a.example",
      subject: "agency-a-viewer-sessions",
      roleCode: "agency_viewer",
    });
    const colleague = await f.onboardAgencyMember({
      agencyId: "agency_a",
      email: "colleague@agency-a.example",
      subject: "agency-a-colleague-sessions",
      roleCode: "agency_exporter",
    });

    const primarySession = await f.issueAgencySession(viewer, {
      amr: ["pwd", "totp"],
      userAgent: "Mozilla/5.0 (Agency Workstation 1)",
      ipAddress: "203.0.113.10",
    });
    const secondarySession = await f.issueAgencySession(viewer, {
      amr: ["pwd", "totp"],
      userAgent: "Mozilla/5.0 (Agency Laptop 2)",
      ipAddress: "203.0.113.20",
    });
    const colleagueSession = await f.issueAgencySession(colleague, {
      amr: ["pwd", "totp"],
    });

    // 1. GET /api/auth/sessions lists only the caller's own active sessions
    const listIdentity = await f.activateGuard(
      "GET",
      "/api/auth/sessions",
      primarySession.token,
      AuthController,
      AuthController.prototype.listSelfSessions,
    );
    const listEnvelope = await f.authController.listSelfSessions(
      listIdentity,
      "req-list-sessions",
    );
    expect(listEnvelope.data).toHaveLength(2);
    expect(listEnvelope.data.map((s) => s.sessionId).sort()).toEqual(
      [primarySession.sessionId, secondarySession.sessionId].sort(),
    );
    expect(
      listEnvelope.data.find((s) => s.sessionId === primarySession.sessionId)
        ?.isCurrent,
    ).toBe(true);
    expect(
      listEnvelope.data.find((s) => s.sessionId === secondarySession.sessionId)
        ?.isCurrent,
    ).toBe(false);
    expect(
      listEnvelope.data.some((s) => s.sessionId === colleagueSession.sessionId),
    ).toBe(false);

    // 2. POST /api/auth/sessions/:sid/revoke revokes the caller's specified secondary session
    const revokeUrl = `/api/auth/sessions/${encodeURIComponent(secondarySession.sessionId)}/revoke`;
    const revokeIdentity = await f.activateGuard(
      "POST",
      revokeUrl,
      primarySession.token,
      AuthController,
      AuthController.prototype.revokeSelfSession,
    );
    const revokeEnvelope = await f.authController.revokeSelfSession(
      revokeIdentity,
      secondarySession.sessionId,
      { reason: "user_initiated" },
      { headers: { "x-request-id": "req-revoke-own" } } as never,
      "req-revoke-own",
    );
    expect(revokeEnvelope.data).toMatchObject({
      revoked: true,
      sessionId: secondarySession.sessionId,
    });

    // The revoked secondary session token is immediately rejected by JwtAuthService / BootstrapAuthGuard
    expect(await f.signer.verifyAccessToken(secondarySession.token)).toBeNull();
    await expect(
      f.activateGuard(
        "GET",
        "/api/auth/sessions",
        secondarySession.token,
        AuthController,
        AuthController.prototype.listSelfSessions,
      ),
    ).rejects.toMatchObject({
      code: "JWT_INVALID",
    });

    // Primary session remains active and now sees only 1 active session
    const afterListEnvelope = await f.authController.listSelfSessions(
      listIdentity,
      "req-list-sessions-after",
    );
    expect(afterListEnvelope.data.map((s) => s.sessionId)).toEqual([
      primarySession.sessionId,
    ]);
  });

  it("denies cross-account session revocation, cross-realm TOTP writes, and administrative identity session endpoints", async () => {
    const f = await createFixture();
    const viewerA = await f.onboardAgencyMember({
      agencyId: "agency_a",
      email: "viewer-a@agency.example",
      subject: "viewer-a-sub",
      roleCode: "agency_viewer",
    });
    const exporterA = await f.onboardAgencyMember({
      agencyId: "agency_a",
      email: "exporter-a@agency.example",
      subject: "exporter-a-sub",
      roleCode: "agency_exporter",
    });
    const viewerB = await f.onboardAgencyMember({
      agencyId: "agency_b",
      email: "viewer-b@agency.example",
      subject: "viewer-b-sub",
      roleCode: "agency_viewer",
    });

    const sessionViewerA = await f.issueAgencySession(viewerA);
    const sessionExporterA = await f.issueAgencySession(exporterA);
    const sessionViewerB = await f.issueAgencySession(viewerB);

    // 1. Cross-account session revocation (same agency colleague or other agency) is denied with 403 AUTHZ_SCOPE_DENIED
    for (const targetSid of [
      sessionViewerA.sessionId,
      sessionViewerB.sessionId,
    ]) {
      const callerIdentity = await f.activateGuard(
        "POST",
        `/api/auth/sessions/${targetSid}/revoke`,
        sessionExporterA.token,
        AuthController,
        AuthController.prototype.revokeSelfSession,
      );
      await expect(
        f.authController.revokeSelfSession(
          callerIdentity,
          targetSid,
          { reason: "attempt_cross_account_revoke" },
          { headers: {} } as never,
          "req-cross-revoke",
        ),
      ).rejects.toMatchObject({
        code: "AUTHZ_SCOPE_DENIED",
      });
    }

    // Both target sessions remain active
    expect(
      await f.signer.verifyAccessToken(sessionViewerA.token),
    ).not.toBeNull();
    expect(
      await f.signer.verifyAccessToken(sessionViewerB.token),
    ).not.toBeNull();

    // 2. Cross-realm TOTP endpoints (/api/auth/tenant/... and /api/auth/partner/...) are denied at BootstrapAuthGuard with 403 AUTH_REALM_DENIED
    for (const crossRealmPath of [
      "/api/auth/tenant/mfa/totp/enroll",
      "/api/auth/tenant/mfa/totp/confirm",
      "/api/auth/tenant/mfa/totp/recovery-codes/regenerate",
      "/api/auth/partner/mfa/totp/enroll",
      "/api/auth/partner/mfa/totp/confirm",
      "/api/auth/partner/mfa/totp/recovery-codes/regenerate",
    ]) {
      await expect(
        f.activateGuard(
          "POST",
          crossRealmPath,
          sessionExporterA.token,
          TotpController,
          TotpController.prototype.enroll,
        ),
      ).rejects.toMatchObject({
        code: "AUTH_REALM_DENIED",
      });
    }

    // 3. Administrative session inventory/revocation (/api/identity/sessions) and legacy non-param /api/auth/sessions/revoke stay denied with 403 AUTH_REALM_DENIED
    for (const [method, adminPath] of [
      ["GET", "/api/identity/sessions"],
      ["POST", `/api/identity/sessions/${sessionViewerA.sessionId}/revoke`],
      ["POST", "/api/auth/sessions/revoke"],
    ] as const) {
      await expect(
        f.activateGuard(
          method,
          adminPath,
          sessionExporterA.token,
          AuthController,
          AuthController.prototype.listSelfSessions,
        ),
      ).rejects.toMatchObject({
        code: "AUTH_REALM_DENIED",
      });
    }
  });

  it("preserves durable-state revocation on expired/deactivated/suspended agency memberships and preserves agency read-only business boundaries without adding role scopes", async () => {
    // 1. Role and actor scope catalogs remain strictly read/export with no new permissions added
    expect([...(getAgencyRoleScopes("agency_viewer") ?? [])].sort()).toEqual(
      [...AGENCY_PORTAL_READ_SCOPES].sort(),
    );
    expect([...(getAgencyRoleScopes("agency_exporter") ?? [])].sort()).toEqual(
      [...AGENCY_PORTAL_READ_SCOPES, ...AGENCY_PORTAL_EXPORT_SCOPES].sort(),
    );
    expect([...AUTH_SCOPE_PRESETS.agency_user].sort()).toEqual(
      [...AGENCY_PORTAL_READ_SCOPES].sort(),
    );

    const f = await createFixture();
    const viewer = await f.onboardAgencyMember({
      agencyId: "agency_a",
      email: "boundary-viewer@agency.example",
      subject: "boundary-viewer-sub",
      roleCode: "agency_viewer",
    });
    const exporter = await f.onboardAgencyMember({
      agencyId: "agency_a",
      email: "boundary-exporter@agency.example",
      subject: "boundary-exporter-sub",
      roleCode: "agency_exporter",
    });

    const viewerSession = await f.issueAgencySession(viewer);
    const exporterSession = await f.issueAgencySession(exporter);

    // 2. Business and operational write routes remain denied for agency sessions (403 AUTH_REALM_DENIED)
    for (const [method, routeUrl] of [
      ["POST", "/api/orders"],
      ["POST", "/api/incidents"],
      ["POST", "/api/platform-admin/agencies"],
      ["POST", "/api/regulatory-registry/vehicles"],
      ["POST", "/api/tenant/webhooks"],
      ["PATCH", "/api/driver-settings"],
    ] as const) {
      await expect(
        f.activateGuard(
          method,
          routeUrl,
          exporterSession.token,
          AuthController,
          AuthController.prototype.listSelfSessions,
        ),
      ).rejects.toMatchObject({
        code: "AUTH_REALM_DENIED",
      });
    }

    // 3. Viewer still cannot create trip-record export jobs (403 AUTH_SCOPE_DENIED)
    await expect(
      f.activateGuard(
        "POST",
        "/api/agency/trip-records/export-jobs",
        viewerSession.token,
        AuthController,
        AuthController.prototype.listSelfSessions,
      ),
    ).rejects.toMatchObject({
      code: "AUTH_SCOPE_DENIED",
    });

    // 4. Expired access period immediately invalidates own-account TOTP and session routes (401 JWT_INVALID)
    const viewerBinding = viewerSession.snapshot.roleBindings[0]!;
    await f.repo.ensureRoleBindingRecord({
      ...viewerBinding,
      validTo: new Date(Date.now() - 1000).toISOString(),
      updatedAt: viewerBinding.updatedAt,
    });
    for (const [method, url, ctrl, handler] of [
      [
        "GET",
        "/api/auth/sessions",
        AuthController,
        AuthController.prototype.listSelfSessions,
      ],
      [
        "POST",
        `/api/auth/sessions/${viewerSession.sessionId}/revoke`,
        AuthController,
        AuthController.prototype.revokeSelfSession,
      ],
      [
        "POST",
        "/api/auth/agency/mfa/totp/enroll",
        TotpController,
        TotpController.prototype.enroll,
      ],
    ] as const) {
      try {
        await f.activateGuard(method, url, viewerSession.token, ctrl, handler);
        throw new Error(`Expected ${method} ${url} to fail for expired access`);
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        expect((error as ApiRequestError).getStatus()).toBe(401);
        expect((error as ApiRequestError).code).toBe("JWT_INVALID");
      }
    }

    // 5. Deactivated membership or suspended agency immediately invalidates exporter session on own-account routes
    await f.repo.deactivateAgencyMembership(
      "agency_a",
      exporterSession.snapshot.membership.membershipId,
      null,
    );
    await expect(
      f.activateGuard(
        "GET",
        "/api/auth/sessions",
        exporterSession.token,
        AuthController,
        AuthController.prototype.listSelfSessions,
      ),
    ).rejects.toMatchObject({
      code: "JWT_INVALID",
    });
  });

  it("connects the formal agency BFF credential forwarders (TOTP enroll, confirm, recovery-code regenerate, and self sessions) end-to-end through real BootstrapAuthGuard and controllers", async () => {
    const f = await createFixture();
    const member = await f.onboardAgencyMember({
      agencyId: "agency_a",
      email: "bff-chain@agency-a.example",
      subject: "agency-a-bff-chain",
      roleCode: "agency_viewer",
    });
    const colleague = await f.onboardAgencyMember({
      agencyId: "agency_a",
      email: "bff-colleague@agency-a.example",
      subject: "agency-a-bff-colleague",
      roleCode: "agency_exporter",
    });

    const pwdSession = await f.issueAgencySession(member, {
      amr: ["pwd"],
      authTime: new Date().toISOString(),
    });
    const secondOwnSession = await f.issueAgencySession(member, {
      amr: ["pwd", "otp"],
      authTime: new Date().toISOString(),
    });
    const colleagueSession = await f.issueAgencySession(colleague, {
      amr: ["pwd", "otp"],
      authTime: new Date().toISOString(),
    });

    const bffConfig: PortalCredentialConfig = {
      realm: "agency",
      sessionCookieName: AGENCY_SESSION_COOKIE_NAME,
      csrfCookieName: AGENCY_CSRF_COOKIE_NAME,
      csrfHeaderName: AGENCY_CSRF_HEADER_NAME,
      apiBaseUrl: "https://api.example",
      fetchImpl: async (url, init) => {
        const parsed = new URL(url);
        const method = (init?.method ?? "GET").toUpperCase();
        const headers = new Headers(init?.headers);
        const authHeader = headers.get("Authorization") ?? "";
        const bearer = authHeader.startsWith("Bearer ")
          ? authHeader.slice("Bearer ".length)
          : undefined;
        const bodyObj =
          typeof init?.body === "string" && init.body
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : {};

        try {
          if (
            method === "POST" &&
            parsed.pathname === "/api/auth/agency/mfa/totp/enroll"
          ) {
            const identity = await f.activateGuard(
              "POST",
              parsed.pathname,
              bearer,
              TotpController,
              TotpController.prototype.enroll,
            );
            const res = await f.totpController.enroll(
              "agency",
              identity,
              {},
              "req-bff-enroll",
            );
            return new Response(
              JSON.stringify({
                data: {
                  otpauth_uri: res.data.otpauthUri,
                  secret: res.data.secret,
                },
              }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          }
          if (
            method === "POST" &&
            parsed.pathname === "/api/auth/agency/mfa/totp/confirm"
          ) {
            const identity = await f.activateGuard(
              "POST",
              parsed.pathname,
              bearer,
              TotpController,
              TotpController.prototype.confirm,
            );
            const res = await f.totpController.confirm(
              "agency",
              identity,
              { code: String(bodyObj.code ?? "") },
              {},
              "req-bff-confirm",
            );
            return new Response(
              JSON.stringify({
                data: { recovery_codes: res.data.recoveryCodes },
              }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          }
          if (
            method === "POST" &&
            parsed.pathname ===
              "/api/auth/agency/mfa/totp/recovery-codes/regenerate"
          ) {
            const identity = await f.activateGuard(
              "POST",
              parsed.pathname,
              bearer,
              TotpController,
              TotpController.prototype.regenerateRecoveryCodes,
            );
            const res = await f.totpController.regenerateRecoveryCodes(
              "agency",
              identity,
              {},
              "req-bff-regen",
            );
            return new Response(
              JSON.stringify({
                data: { recovery_codes: res.data.recoveryCodes },
              }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          }
          if (method === "GET" && parsed.pathname === "/api/auth/sessions") {
            const identity = await f.activateGuard(
              "GET",
              parsed.pathname,
              bearer,
              AuthController,
              AuthController.prototype.listSelfSessions,
            );
            const res = await f.authController.listSelfSessions(
              identity,
              "req-bff-sessions",
            );
            return new Response(JSON.stringify(res), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          const revokeMatch = parsed.pathname.match(
            /^\/api\/auth\/sessions\/([^/]+)\/revoke$/,
          );
          if (method === "POST" && revokeMatch && revokeMatch[1]) {
            const sid = decodeURIComponent(revokeMatch[1]);
            const identity = await f.activateGuard(
              "POST",
              parsed.pathname,
              bearer,
              AuthController,
              AuthController.prototype.revokeSelfSession,
            );
            const res = await f.authController.revokeSelfSession(
              identity,
              sid,
              { reason: String(bodyObj.reason ?? "user_initiated") },
              { headers: {} } as never,
              "req-bff-revoke",
            );
            return new Response(JSON.stringify(res), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          return new Response(
            JSON.stringify({ error: "AUTH_ENDPOINT_NOT_FOUND" }),
            { status: 404, headers: { "content-type": "application/json" } },
          );
        } catch (error) {
          if (error instanceof ApiRequestError) {
            return new Response(
              JSON.stringify({
                error: { code: error.code, message: error.message },
              }),
              {
                status: error.getStatus(),
                headers: { "content-type": "application/json" },
              },
            );
          }
          throw error;
        }
      },
    };

    const csrf = generateCsrfToken();
    const makePost = (
      path: string,
      sessionToken: string,
      body: Record<string, unknown> = {},
      includeCsrf = true,
    ) =>
      new NextRequest(`https://agency.example${path}`, {
        method: "POST",
        headers: {
          origin: "https://agency.example",
          cookie: `${AGENCY_SESSION_COOKIE_NAME}=${sessionToken}; ${AGENCY_CSRF_COOKIE_NAME}=${csrf}`,
          ...(includeCsrf ? { [AGENCY_CSRF_HEADER_NAME]: csrf } : {}),
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });

    // 1. BFF enroll -> Guard -> TotpController.enroll
    const enrollRes = await handleTotpEnroll(
      makePost("/api/auth/agency/mfa/totp/enroll", pwdSession.token),
      bffConfig,
    );
    expect(enrollRes.status).toBe(200);
    const enrollBody = (await enrollRes.json()) as {
      data: { otpauth_uri: string; secret: string };
    };
    expect(enrollBody.data.secret.length).toBeGreaterThanOrEqual(16);

    // 2. BFF confirm -> Guard -> TotpController.confirm
    const totpCode = await generate({ secret: enrollBody.data.secret });
    const confirmRes = await handleTotpConfirm(
      makePost("/api/auth/agency/mfa/totp/confirm", pwdSession.token, {
        code: totpCode,
      }),
      bffConfig,
    );
    expect(confirmRes.status).toBe(200);
    const confirmBody = (await confirmRes.json()) as {
      data: { recovery_codes: string[] };
    };
    expect(confirmBody.data.recovery_codes).toHaveLength(10);

    // 3. BFF recovery-code regenerate enforces CSRF and rejects password-only session with 403 MFA_REQUIRED
    const noCsrfRegenRes = await handleTotpRegenerateRecoveryCodes(
      makePost(
        "/api/auth/agency/mfa/totp/recovery-codes/regenerate",
        secondOwnSession.token,
        {},
        false,
      ),
      bffConfig,
    );
    expect(noCsrfRegenRes.status).toBe(403);

    const pwdOnlyRegenRes = await handleTotpRegenerateRecoveryCodes(
      makePost(
        "/api/auth/agency/mfa/totp/recovery-codes/regenerate",
        pwdSession.token,
      ),
      bffConfig,
    );
    expect(pwdOnlyRegenRes.status).toBe(403);
    expect(await pwdOnlyRegenRes.json()).toMatchObject({
      error: { code: "MFA_REQUIRED" },
    });

    // 4. BFF recovery-code regenerate with fresh trusted-MFA session succeeds and replaces recovery codes
    const mfaRegenRes = await handleTotpRegenerateRecoveryCodes(
      makePost(
        "/api/auth/agency/mfa/totp/recovery-codes/regenerate",
        secondOwnSession.token,
      ),
      bffConfig,
    );
    expect(mfaRegenRes.status).toBe(200);
    const mfaRegenBody = (await mfaRegenRes.json()) as {
      data: { recovery_codes: string[] };
    };
    expect(mfaRegenBody.data.recovery_codes).toHaveLength(10);
    expect(
      mfaRegenBody.data.recovery_codes.some((c) =>
        confirmBody.data.recovery_codes.includes(c),
      ),
    ).toBe(false);

    // 5. BFF session list & own/cross-principal session revocation
    const listRes = await handleListSessions(
      new NextRequest("https://agency.example/api/auth/sessions", {
        headers: {
          cookie: `${AGENCY_SESSION_COOKIE_NAME}=${secondOwnSession.token}`,
        },
      }),
      bffConfig,
    );
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      data: Array<{ sessionId: string }>;
    };
    expect(listBody.data.map((s) => s.sessionId).sort()).toEqual(
      [pwdSession.sessionId, secondOwnSession.sessionId].sort(),
    );

    const crossRevokeRes = await handleRevokeSession(
      makePost(
        `/api/auth/sessions/${colleagueSession.sessionId}/revoke`,
        secondOwnSession.token,
      ),
      colleagueSession.sessionId,
      bffConfig,
    );
    expect(crossRevokeRes.status).toBe(403);
    expect(await crossRevokeRes.json()).toMatchObject({
      error: { code: "AUTHZ_SCOPE_DENIED" },
    });

    const ownRevokeRes = await handleRevokeSession(
      makePost(
        `/api/auth/sessions/${pwdSession.sessionId}/revoke`,
        secondOwnSession.token,
      ),
      pwdSession.sessionId,
      bffConfig,
    );
    expect(ownRevokeRes.status).toBe(200);
    expect(await f.signer.verifyAccessToken(pwdSession.token)).toBeNull();
  });
});
