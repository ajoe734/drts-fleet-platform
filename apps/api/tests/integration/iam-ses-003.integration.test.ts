import { describe, expect, it, beforeAll, afterAll } from "vitest";

import { DatabaseService } from "../../src/common/db";
import { JwtAuthService } from "../../src/common/auth/jwt-auth.service";
import { IdentityRepository } from "../../src/modules/identity/identity.repository";
import { SecurityEventsRepository } from "../../src/modules/security-events/security-events.repository";
import { SecurityEventsService } from "../../src/modules/security-events/security-events.service";
import { AuthController } from "../../src/modules/auth/auth.controller";
import { IdentityController } from "../../src/modules/identity/identity.controller";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";
import { DriverDeviceSessionService } from "../../src/modules/auth/driver-device-session.service";
import { maskDeviceSummary, maskIpAddress } from "../../src/common/auth/session-masking.util";
import type { CanonicalIdentitySessionRecord } from "@drts/contracts";

const DATABASE_URL = process.env.DATABASE_URL;

async function ensureTestPrincipal(
  database: DatabaseService | undefined,
  principalId: string,
) {
  if (!database) return;
  await database.query(
    `
      INSERT INTO iam.identity_principals (
        principal_id, source_ref, issuer, subject, principal_type, email_normalized, email_verified, display_name, account_status, created_at, updated_at, record
      ) VALUES (
        $1, $1, 'drts_identity', $1, 'human', $2, true, 'Test Principal', 'active', NOW(), NOW(), '{}'::jsonb
      )
      ON CONFLICT (principal_id) DO NOTHING
    `,
    [
      principalId,
      `${principalId.toLowerCase()}@example.com`,
    ],
  );
}

describe("IAM-SES-003 Session Inventory, Logout, & Boundary-Safe Admin Revoke Integration", () => {
  let database: DatabaseService | undefined;
  let identityRepo: IdentityRepository;
  let securityEventsRepo: SecurityEventsRepository | undefined;
  let securityEventsService: SecurityEventsService;
  let jwtAuthService: JwtAuthService;
  let authController: AuthController;
  let identityController: IdentityController;

  beforeAll(() => {
    process.env.JWT_SECRET = "integration_jwt_secret_key_32chars_minimum!";
    process.env.JWT_ISSUER = "https://auth.drts.internal";
    process.env.JWT_AUDIENCE = "https://api.drts.internal";
    process.env.JWT_ALGORITHMS = "HS256";
    process.env.JWT_POLICY_VERSION = "auth.jwt-session.integration.v1";

    if (DATABASE_URL) {
      database = new DatabaseService();
      identityRepo = new IdentityRepository(database);
      securityEventsRepo = new SecurityEventsRepository(database);
    } else {
      identityRepo = new IdentityRepository();
    }

    securityEventsService = new SecurityEventsService(securityEventsRepo);
    jwtAuthService = new JwtAuthService(identityRepo);

    const tenantPartnerService = new TenantPartnerService();
    const driverDeviceSessionService = new DriverDeviceSessionService();

    authController = new AuthController(
      jwtAuthService,
      tenantPartnerService,
      driverDeviceSessionService,
      securityEventsService,
      undefined,
      undefined,
      identityRepo,
    );

    identityController = new IdentityController(identityRepo, securityEventsService);
  });

  afterAll(async () => {
    if (database) {
      await database.onModuleDestroy();
    }
  });

  it("0. Device and IP masking helper unit tests", () => {
    expect(maskIpAddress("192.168.1.150")).toBe("192.168.1.0/24");
    expect(maskIpAddress("10.0.8.42, 172.16.0.1")).toBe("10.0.8.0/24");
    expect(maskIpAddress("2001:db8:85a3:8d3:1319:8a2e:370:7348")).toBe("2001:db8::/64");

    const masked = maskDeviceSummary({
      ip: "192.168.1.150",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      browser: "Chrome",
      os: "macOS",
      deviceType: "desktop",
      deviceId: "device_id_abcdef123456789",
    });

    expect(masked.ipPrefix).toBe("192.168.1.0/24");
    expect(masked.userAgentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect((masked as Record<string, unknown>).ip).toBeUndefined();
    expect((masked as Record<string, unknown>).userAgent).toBeUndefined();
  });

  it("1. Self session inventory returns masked device and IP summaries", async () => {
    const now = new Date().toISOString();
    const principalId = `usr_inv_${Date.now()}`;
    const sid = `sid_inv_${Date.now()}`;

    await ensureTestPrincipal(database, principalId);

    const session: CanonicalIdentitySessionRecord = {
      sessionId: sid,
      sourceRef: `ref_${sid}`,
      principalId,
      membershipId: null,
      realm: "tenant",
      actorType: "tenant_admin",
      actorId: principalId,
      tenantId: "tenant_alpha",
      status: "active",
      authTime: now,
      authMethods: ["oidc"],
      tokenVersion: 1,
      idleExpiresAt: null,
      absoluteExpiresAt: new Date(Date.now() + 86400000).toISOString(),
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: {
        ip: "192.168.1.188",
        userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
        browser: "Chrome",
        os: "Linux",
        deviceType: "desktop",
      },
      riskSummary: {},
      createdAt: now,
      updatedAt: now,
    };

    await identityRepo.createSession(session);

    const identity = {
      authMode: "jwt_bearer" as const,
      actorType: "tenant_admin" as const,
      actorId: principalId,
      principalId,
      realm: "tenant" as const,
      tenantId: "tenant_alpha",
      roleFamilies: ["tenant" as const],
      roles: ["tenant_admin"],
      scopes: ["identity:sessions:read"],
      sessionId: sid,
    };

    const res = await authController.listSelfSessions(identity, "req_inv_01");
    expect(res.data.items).toBeDefined();

    const foundSession = res.data.items.find((item) => item.sessionId === sid);
    expect(foundSession).toBeDefined();
    expect(foundSession?.deviceSummary.ipPrefix).toBe("192.168.1.0/24");
    expect(foundSession?.deviceSummary.userAgentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(foundSession?.isCurrentSession).toBe(true);
  });

  it("2. Self logout revokes session and rejects old token", async () => {
    const now = new Date().toISOString();
    const principalId = `usr_logout_${Date.now()}`;
    const sid = `sid_logout_${Date.now()}`;

    await ensureTestPrincipal(database, principalId);

    await identityRepo.createSession({
      sessionId: sid,
      sourceRef: `ref_${sid}`,
      principalId,
      membershipId: null,
      realm: "tenant",
      actorType: "tenant_admin",
      actorId: principalId,
      tenantId: "tenant_alpha",
      status: "active",
      authTime: now,
      authMethods: ["oidc"],
      tokenVersion: 1,
      idleExpiresAt: null,
      absoluteExpiresAt: new Date(Date.now() + 86400000).toISOString(),
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: { ip: "10.0.0.1" },
      riskSummary: {},
      createdAt: now,
      updatedAt: now,
    });

    const tokenObj = await jwtAuthService.issueSessionToken({
      actorType: "tenant_admin",
      actorId: principalId,
      principalId,
      realm: "tenant",
      tenantId: "tenant_alpha",
      roleFamilies: ["tenant"],
      roles: ["tenant_admin"],
      scopes: ["identity:sessions:read"],
      sessionId: sid,
      tokenVersion: 1,
      authTime: now,
      amr: ["oidc"],
    });

    const identity = {
      authMode: "jwt_bearer" as const,
      actorType: "tenant_admin" as const,
      actorId: principalId,
      principalId,
      realm: "tenant" as const,
      tenantId: "tenant_alpha",
      roleFamilies: ["tenant" as const],
      roles: ["tenant_admin"],
      scopes: ["identity:sessions:read"],
      sessionId: sid,
    };

    const logoutRes = await authController.logout(
      identity,
      { reason: "User requested logout" },
      { headers: {} },
      "req_logout_01",
    );

    expect(logoutRes.data.success).toBe(true);

    const updatedSession = await identityRepo.getSession(sid);
    expect(updatedSession?.status).toBe("revoked");
    expect(updatedSession?.revokeReason).toBe("User requested logout");

    const verifiedPayload = await jwtAuthService.verifyAccessToken(tokenObj.token);
    expect(verifiedPayload).toBeNull();
  });

  it("3. Self logout-all revokes all sessions for principal", async () => {
    const now = new Date().toISOString();
    const principalId = `usr_logout_all_${Date.now()}`;
    const sid1 = `sid_la1_${Date.now()}`;
    const sid2 = `sid_la2_${Date.now()}`;
    const sid3 = `sid_la3_${Date.now()}`;

    await ensureTestPrincipal(database, principalId);

    for (const sid of [sid1, sid2, sid3]) {
      await identityRepo.createSession({
        sessionId: sid,
        sourceRef: `ref_${sid}`,
        principalId,
        membershipId: null,
        realm: "tenant",
        actorType: "tenant_admin",
        actorId: principalId,
        tenantId: "tenant_alpha",
        status: "active",
        authTime: now,
        authMethods: ["oidc"],
        tokenVersion: 1,
        idleExpiresAt: null,
        absoluteExpiresAt: new Date(Date.now() + 86400000).toISOString(),
        revokedAt: null,
        revokedByPrincipalId: null,
        revokeReason: null,
        deviceSummary: { ip: "10.0.0.2" },
        riskSummary: {},
        createdAt: now,
        updatedAt: now,
      });
    }

    const identity = {
      authMode: "jwt_bearer" as const,
      actorType: "tenant_admin" as const,
      actorId: principalId,
      principalId,
      realm: "tenant" as const,
      tenantId: "tenant_alpha",
      roleFamilies: ["tenant" as const],
      roles: ["tenant_admin"],
      scopes: ["identity:sessions:read"],
      sessionId: sid3,
    };

    const logoutAllRes = await authController.logoutAll(
      identity,
      { keepCurrentSession: true, reason: "Security concern" },
      { headers: {} },
      "req_la_01",
    );

    expect(logoutAllRes.data.count).toBe(2);

    expect((await identityRepo.getSession(sid1))?.status).toBe("revoked");
    expect((await identityRepo.getSession(sid2))?.status).toBe("revoked");
    expect((await identityRepo.getSession(sid3))?.status).toBe("active");

    const fullLogoutRes = await authController.logoutAll(
      identity,
      { keepCurrentSession: false, reason: "Full reset" },
      { headers: {} },
      "req_la_02",
    );

    expect(fullLogoutRes.data.count).toBe(1);
    expect((await identityRepo.getSession(sid3))?.status).toBe("revoked");
  });

  it("4. Admin remote revoke enforces tenant boundary and reason requirement", async () => {
    const now = new Date().toISOString();
    const principalAlpha = `usr_alpha_${Date.now()}`;
    const sidAlpha = `sid_alpha_${Date.now()}`;

    const principalBeta = `usr_beta_${Date.now()}`;
    const sidBeta = `sid_beta_${Date.now()}`;

    await ensureTestPrincipal(database, principalAlpha);
    await ensureTestPrincipal(database, principalBeta);

    await identityRepo.createSession({
      sessionId: sidAlpha,
      sourceRef: `ref_${sidAlpha}`,
      principalId: principalAlpha,
      membershipId: null,
      realm: "tenant",
      actorType: "tenant_admin",
      actorId: principalAlpha,
      tenantId: "tenant_alpha",
      status: "active",
      authTime: now,
      authMethods: ["oidc"],
      tokenVersion: 1,
      idleExpiresAt: null,
      absoluteExpiresAt: new Date(Date.now() + 86400000).toISOString(),
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: { ip: "172.16.0.1" },
      riskSummary: {},
      createdAt: now,
      updatedAt: now,
    });

    await identityRepo.createSession({
      sessionId: sidBeta,
      sourceRef: `ref_${sidBeta}`,
      principalId: principalBeta,
      membershipId: null,
      realm: "tenant",
      actorType: "tenant_admin",
      actorId: principalBeta,
      tenantId: "tenant_beta",
      status: "active",
      authTime: now,
      authMethods: ["oidc"],
      tokenVersion: 1,
      idleExpiresAt: null,
      absoluteExpiresAt: new Date(Date.now() + 86400000).toISOString(),
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: { ip: "172.16.0.2" },
      riskSummary: {},
      createdAt: now,
      updatedAt: now,
    });

    const adminAlphaIdentity = {
      authMode: "jwt_bearer" as const,
      actorType: "tenant_admin" as const,
      actorId: principalAlpha,
      principalId: principalAlpha,
      realm: "tenant" as const,
      tenantId: "tenant_alpha",
      roleFamilies: ["tenant" as const],
      roles: ["tenant_admin"],
      scopes: ["identity:sessions:read"],
      sessionId: sidAlpha,
    };

    // Negative: Self-service endpoint rejects remote admin revoke -> 403 AUTHZ_SCOPE_DENIED
    await expect(
      authController.revokeSelfSession(
        sidBeta,
        adminAlphaIdentity,
        { reason: "Attempt remote revoke via self endpoint" },
        { headers: {} },
        "req_admin_00",
      ),
    ).rejects.toSatisfy(
      (err: any) => err.code === "AUTHZ_SCOPE_DENIED" || err.response?.error?.code === "AUTHZ_SCOPE_DENIED",
    );

    const platformAdminIdentity = {
      authMode: "jwt_bearer" as const,
      actorType: "platform_admin" as const,
      actorId: "usr_platform_admin_001",
      principalId: "usr_platform_admin_001",
      realm: "platform" as const,
      tenantId: null,
      roleFamilies: ["platform" as const],
      roles: ["platform_superadmin"],
      scopes: ["identity:sessions:write"],
      sessionId: "sid_platform_admin_001",
    };

    // Negative: Self-service endpoint rejects remote platform admin revoke -> 403 AUTHZ_SCOPE_DENIED
    await expect(
      authController.revokeSelfSession(
        sidBeta,
        platformAdminIdentity,
        { reason: "Attempt platform admin remote revoke via self endpoint" },
        { headers: {} },
        "req_admin_platform_00",
      ),
    ).rejects.toSatisfy(
      (err: any) => err.code === "AUTHZ_SCOPE_DENIED" || err.response?.error?.code === "AUTHZ_SCOPE_DENIED",
    );

    // Negative: Admin remote revoke without reason -> 400 Bad Request
    await expect(
      identityController.revokeAdminSession(
        sidAlpha,
        adminAlphaIdentity,
        { reason: "" },
        { headers: {} },
        "req_admin_01",
      ),
    ).rejects.toSatisfy(
      (err: any) => err.code === "IAM_REASON_REQUIRED" || err.response?.error?.code === "IAM_REASON_REQUIRED",
    );

    // Negative: Admin remote revoke across tenant boundary -> 403 Forbidden
    await expect(
      identityController.revokeAdminSession(
        sidBeta,
        adminAlphaIdentity,
        { reason: "Remote revoke" },
        { headers: {} },
        "req_admin_02",
      ),
    ).rejects.toSatisfy(
      (err: any) => err.code === "AUTHZ_REALM_DENIED" || err.response?.error?.code === "AUTHZ_REALM_DENIED",
    );

    // Negative: Tenant admin list sessions outside tenant -> 403 Forbidden
    await expect(
      identityController.listAdminSessions(
        adminAlphaIdentity,
        "tenant_beta",
        undefined,
        undefined,
        undefined,
        "req_admin_03",
      ),
    ).rejects.toSatisfy(
      (err: any) => err.code === "AUTHZ_REALM_DENIED" || err.response?.error?.code === "AUTHZ_REALM_DENIED",
    );

    // Positive: Admin remote revoke within tenant -> 200 OK
    const validRevokeRes = await identityController.revokeAdminSession(
      sidAlpha,
      adminAlphaIdentity,
      { reason: "Admin remote revoke for security compliance" },
      { headers: {} },
      "req_admin_04",
    );

    expect(validRevokeRes.data.status).toBe("revoked");

    const updatedAlpha = await identityRepo.getSession(sidAlpha);
    expect(updatedAlpha?.status).toBe("revoked");
    expect(updatedAlpha?.revokeReason).toBe("Admin remote revoke for security compliance");
  });

  it("5. CSRF protection rejects browser cookie session mutation without CSRF header", async () => {
    const now = new Date().toISOString();
    const principalId = `usr_csrf_${Date.now()}`;
    const sid = `sid_csrf_${Date.now()}`;

    await ensureTestPrincipal(database, principalId);

    await identityRepo.createSession({
      sessionId: sid,
      sourceRef: `ref_${sid}`,
      principalId,
      membershipId: null,
      realm: "tenant",
      actorType: "tenant_admin",
      actorId: principalId,
      tenantId: "tenant_alpha",
      status: "active",
      authTime: now,
      authMethods: ["oidc"],
      tokenVersion: 1,
      idleExpiresAt: null,
      absoluteExpiresAt: new Date(Date.now() + 86400000).toISOString(),
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: { ip: "10.0.0.99" },
      riskSummary: {},
      createdAt: now,
      updatedAt: now,
    });

    const cookieIdentity = {
      authMode: "cookie" as never,
      actorType: "tenant_admin" as const,
      actorId: principalId,
      principalId,
      realm: "tenant" as const,
      tenantId: "tenant_alpha",
      roleFamilies: ["tenant" as const],
      roles: ["tenant_admin"],
      scopes: ["identity:sessions:read"],
      sessionId: sid,
    };

    await expect(
      authController.logout(
        cookieIdentity,
        { reason: "CSRF check" },
        { headers: { cookie: "drts_session=abc" } },
        "req_csrf_01",
      ),
    ).rejects.toSatisfy(
      (err: any) => err.code === "CSRF_TOKEN_INVALID" || err.response?.error?.code === "CSRF_TOKEN_INVALID",
    );
  });

  it("6. expectedVersion concurrency check rejects version mismatch with 409 IAM_CONCURRENCY_CONFLICT", async () => {
    const now = new Date().toISOString();
    const principalId = `usr_version_${Date.now()}`;
    const sid = `sid_version_${Date.now()}`;

    await ensureTestPrincipal(database, principalId);

    await identityRepo.createSession({
      sessionId: sid,
      sourceRef: `ref_${sid}`,
      principalId,
      membershipId: null,
      realm: "tenant",
      actorType: "tenant_admin",
      actorId: principalId,
      tenantId: "tenant_alpha",
      status: "active",
      authTime: now,
      authMethods: ["oidc"],
      tokenVersion: 5,
      idleExpiresAt: null,
      absoluteExpiresAt: new Date(Date.now() + 86400000).toISOString(),
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: { ip: "10.0.0.88" },
      riskSummary: {},
      createdAt: now,
      updatedAt: now,
    });

    const identity = {
      authMode: "jwt_bearer" as const,
      actorType: "tenant_admin" as const,
      actorId: principalId,
      principalId,
      realm: "tenant" as const,
      tenantId: "tenant_alpha",
      roleFamilies: ["tenant" as const],
      roles: ["tenant_admin"],
      scopes: ["identity:sessions:read", "identity:sessions:write"],
      sessionId: sid,
    };

    // Negative: wrong expectedVersion -> 409 IAM_CONCURRENCY_CONFLICT
    await expect(
      authController.revokeSelfSession(
        sid,
        identity,
        { reason: "Wrong version attempt", expectedVersion: 3 },
        { headers: {} },
        "req_ver_01",
      ),
    ).rejects.toSatisfy(
      (err: any) =>
        err.code === "IAM_CONCURRENCY_CONFLICT" ||
        err.response?.error?.code === "IAM_CONCURRENCY_CONFLICT",
    );

    // Positive: matching expectedVersion -> 200 OK
    const revokeRes = await authController.revokeSelfSession(
      sid,
      identity,
      { reason: "Correct version revoke", expectedVersion: 5 },
      { headers: {} },
      "req_ver_02",
    );

    expect(revokeRes.data.status).toBe("revoked");
  });

  it("7. Concurrent revokes on same session: only one succeeds, second gets 409 IAM_CONCURRENCY_CONFLICT", async () => {
    const now = new Date().toISOString();
    const principalId = `usr_concurrent_${Date.now()}`;
    const sid = `sid_concurrent_${Date.now()}`;

    await ensureTestPrincipal(database, principalId);

    await identityRepo.createSession({
      sessionId: sid,
      sourceRef: `ref_${sid}`,
      principalId,
      membershipId: null,
      realm: "tenant",
      actorType: "tenant_admin",
      actorId: principalId,
      tenantId: "tenant_alpha",
      status: "active",
      authTime: now,
      authMethods: ["oidc"],
      tokenVersion: 1,
      idleExpiresAt: null,
      absoluteExpiresAt: new Date(Date.now() + 86400000).toISOString(),
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: { ip: "10.0.0.77" },
      riskSummary: {},
      createdAt: now,
      updatedAt: now,
    });

    const identity = {
      authMode: "jwt_bearer" as const,
      actorType: "tenant_admin" as const,
      actorId: principalId,
      principalId,
      realm: "tenant" as const,
      tenantId: "tenant_alpha",
      roleFamilies: ["tenant" as const],
      roles: ["tenant_admin"],
      scopes: ["identity:sessions:read", "identity:sessions:write"],
      sessionId: sid,
    };

    // First revoke succeeds
    const firstRes = await authController.revokeSelfSession(
      sid,
      identity,
      { reason: "First revoke" },
      { headers: {} },
      "req_conc_01",
    );
    expect(firstRes.data.status).toBe("revoked");

    // Second revoke fails atomically with 409 IAM_CONCURRENCY_CONFLICT
    await expect(
      authController.revokeSelfSession(
        sid,
        identity,
        { reason: "Second concurrent revoke" },
        { headers: {} },
        "req_conc_02",
      ),
    ).rejects.toSatisfy(
      (err: any) =>
        err.code === "IAM_CONCURRENCY_CONFLICT" ||
        err.response?.error?.code === "IAM_CONCURRENCY_CONFLICT",
    );
  });
});
