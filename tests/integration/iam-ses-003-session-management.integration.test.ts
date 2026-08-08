import { describe, expect, it, beforeEach } from "vitest";
import { AuthController } from "../../apps/api/src/modules/auth/auth.controller";
import { IdentityController } from "../../apps/api/src/modules/identity/identity.controller";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { DriverDeviceSessionService } from "../../apps/api/src/modules/auth/driver-device-session.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { SecurityEventsService } from "../../apps/api/src/modules/security-events/security-events.service";
import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth";
import type { CanonicalIdentitySessionRecord } from "@drts/contracts";
import {
  maskIpAddress,
  maskDeviceSummary,
  maskRiskSummary,
  maskSessionRecord,
  validateCsrfHeader,
} from "../../apps/api/src/modules/auth/session-masking.utility";

describe("Session Management (IAM-SES-003)", () => {
  let identityRepository: IdentityRepository;
  let securityEventsService: SecurityEventsService;
  let authController: AuthController;
  let identityController: IdentityController;
  let jwtAuthService: JwtAuthService;

  const tenantAdminIdentity: BootstrapRequestIdentity = {
    authMode: "jwt_bearer",
    actorType: "tenant_admin",
    actorId: "usr_tenant_admin_1",
    principalId: "prn_tenant_admin_1",
    membershipId: "mem_tenant_1",
    subject: "usr_tenant_admin_1",
    realm: "tenant",
    tenantId: "tenant_alpha",
    roleFamilies: ["tenant"],
    roles: ["tenant_admin"],
    scopes: ["identity:users:write", "identity:sessions:read"],
    sessionId: "sid_admin_session_1",
    tokenId: "jti_admin_token_1",
    tokenVersion: 1000,
    requestId: "req_test_1",
  };

  const regularUserIdentity: BootstrapRequestIdentity = {
    authMode: "jwt_bearer",
    actorType: "ops_user",
    actorId: "usr_regular_1",
    principalId: "prn_user_1",
    membershipId: "mem_user_1",
    subject: "usr_regular_1",
    realm: "tenant",
    tenantId: "tenant_alpha",
    roleFamilies: ["tenant"],
    roles: ["tenant_viewer"],
    scopes: ["identity:read"],
    sessionId: "sid_user_session_1",
    tokenId: "jti_user_token_1",
    tokenVersion: 2000,
    requestId: "req_test_2",
  };

  const platformAdminIdentity: BootstrapRequestIdentity = {
    authMode: "jwt_bearer",
    actorType: "platform_admin",
    actorId: "usr_platform_admin",
    principalId: "prn_platform_admin",
    membershipId: "mem_platform_1",
    subject: "usr_platform_admin",
    realm: "platform",
    tenantId: null,
    roleFamilies: ["platform"],
    roles: ["platform_superadmin"],
    scopes: ["platform:superadmin"],
    sessionId: "sid_platform_session",
    tokenId: "jti_platform_token",
    tokenVersion: 3000,
    requestId: "req_test_3",
  };

  beforeEach(() => {
    identityRepository = new IdentityRepository(undefined);
    securityEventsService = new SecurityEventsService();
    jwtAuthService = new JwtAuthService(identityRepository);
    const tenantPartnerService = new TenantPartnerService(undefined as any);
    const driverDeviceSessionService = new DriverDeviceSessionService(
      jwtAuthService,
      undefined as any,
      undefined,
      undefined,
      identityRepository,
    );

    authController = new AuthController(
      jwtAuthService,
      tenantPartnerService,
      driverDeviceSessionService,
      identityRepository,
      securityEventsService,
    );

    identityController = new IdentityController(
      identityRepository,
      securityEventsService,
    );
  });

  describe("Session Masking Utilities", () => {
    it("should mask IPv4 and IPv6 addresses correctly", () => {
      expect(maskIpAddress("192.168.1.100")).toBe("192.168.***.***");
      expect(maskIpAddress("10.0.0.1")).toBe("10.0.***.***");
      expect(maskIpAddress("2001:db8:85a3::8a2e:370:7334")).toBe("2001:db8:****:****");
      expect(maskIpAddress(null)).toBeNull();
      expect(maskIpAddress("")).toBeNull();
    });

    it("should mask sensitive hardware serials and IP in device summary", () => {
      const unmasked = {
        deviceId: "dev_12345",
        ipAddress: "192.168.1.50",
        serialNumber: "SN123456789",
        model: "iPhone 15",
      };
      const masked = maskDeviceSummary(unmasked);
      expect(masked.ipAddress).toBe("192.168.***.***");
      expect(masked.serialNumber).toBe("SN***89");
      expect(masked.model).toBe("iPhone 15");
      expect(masked.deviceId).toBe("dev_12345");
    });

    it("should mask risk summary IPs", () => {
      const risk = {
        sourceIp: "10.0.4.15",
        score: 0.1,
      };
      const masked = maskRiskSummary(risk);
      expect(masked.sourceIp).toBe("10.0.***.***");
      expect(masked.score).toBe(0.1);
    });
  });

  describe("CSRF Protection Helper", () => {
    it("should allow valid non-empty CSRF header", () => {
      expect(() =>
        validateCsrfHeader({ "x-csrf-token": "valid_csrf_token_abc123" }),
      ).not.toThrow();
    });

    it("should reject invalid CSRF header values", () => {
      expect(() =>
        validateCsrfHeader({ "x-csrf-token": "invalid" }),
      ).toThrow(ApiRequestError);

      expect(() =>
        validateCsrfHeader({ "x-csrf-token": "bad_token" }),
      ).toThrow(ApiRequestError);
    });

    it("should reject cookie session mutations missing CSRF header", () => {
      expect(() =>
        validateCsrfHeader({
          cookie: "session_id=sid_12345",
          "x-auth-mode": "cookie",
        }),
      ).toThrow(ApiRequestError);
    });

    it("should enforce controller-level CSRF denial on logout, logoutAll, revokeSelfSession, and revokeAdminSession", async () => {
      const cookieHeader = { cookie: "session_id=sid_user_session_1", "x-auth-mode": "cookie" };

      // authController.logout with missing CSRF
      await expect(
        authController.logout(
          regularUserIdentity,
          { reason: "logout_test" },
          { headers: cookieHeader },
          "req_csrf_1",
        ),
      ).rejects.toThrow(ApiRequestError);

      // authController.logout with invalid CSRF token
      await expect(
        authController.logout(
          regularUserIdentity,
          { reason: "logout_test" },
          { headers: { ...cookieHeader, "x-csrf-token": "invalid" } },
          "req_csrf_2",
        ),
      ).rejects.toThrow(ApiRequestError);

      // authController.logoutAll with missing CSRF
      await expect(
        authController.logoutAll(
          regularUserIdentity,
          { reason: "logout_all_test" },
          { headers: cookieHeader },
          "req_csrf_3",
        ),
      ).rejects.toThrow(ApiRequestError);

      // authController.revokeSelfSession with missing CSRF
      await expect(
        authController.revokeSelfSession(
          regularUserIdentity,
          "sid_user_session_1",
          { reason: "revoke_test" },
          { headers: cookieHeader },
          "req_csrf_4",
        ),
      ).rejects.toThrow(ApiRequestError);

      // identityController.revokeAdminSession with missing CSRF
      await expect(
        identityController.revokeAdminSession(
          tenantAdminIdentity,
          "sid_user_session_1",
          { reason: "admin_revoke_test" },
          { headers: cookieHeader },
          "req_csrf_5",
        ),
      ).rejects.toThrow(ApiRequestError);
    });
  });

  describe("Self Session Operations", () => {
    it("should logout current session and revoke it in repository", async () => {
      const sessionRecord: CanonicalIdentitySessionRecord = {
        sessionId: "sid_user_session_1",
        sourceRef: "jwt_session:sid_user_session_1",
        principalId: "prn_user_1",
        membershipId: "mem_user_1",
        realm: "tenant",
        tenantId: "tenant_alpha",
        status: "active",
        authTime: new Date().toISOString(),
        authMethods: ["tenant_bootstrap_fixture"],
        tokenVersion: 2000,
        idleExpiresAt: null,
        absoluteExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        revokedAt: null,
        revokedByPrincipalId: null,
        revokeReason: null,
        deviceSummary: { ipAddress: "192.168.1.10" },
        riskSummary: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await identityRepository.createSession(sessionRecord);

      const res = await authController.logout(
        regularUserIdentity,
        { reason: "user_clicked_logout" },
        { headers: {} },
        "req_logout_1",
      );

      expect(res.data.revoked).toBe(true);
      expect(res.data.sessionId).toBe("sid_user_session_1");

      const fetched = await identityRepository.getSession("sid_user_session_1");
      expect(fetched?.status).toBe("revoked");
      expect(fetched?.revokeReason).toBe("user_clicked_logout");
    });

    it("should reject token verification once session is revoked", async () => {
      process.env.JWT_SECRET = "test_secret_key_material_at_least_32_chars_long_12345";
      const issued = await jwtAuthService.issueSessionToken({
        authMode: "jwt_bearer",
        actorType: "ops_user",
        actorId: "usr_rev_test",
        principalId: "prn_rev_test",
        subject: "usr_rev_test",
        realm: "tenant",
        tenantId: "tenant_alpha",
        roleFamilies: ["tenant"],
        roles: ["tenant_user"],
        scopes: ["read"],
        requestId: "req_rev_tok",
      });

      const beforeLogoutPayload = await jwtAuthService.verifyAccessToken(issued.token);
      expect(beforeLogoutPayload).not.toBeNull();
      expect(beforeLogoutPayload?.sid).toBe(issued.sessionId);

      await identityRepository.revokeSession(issued.sessionId, "logout", "prn_rev_test");

      const afterLogoutPayload = await jwtAuthService.verifyAccessToken(issued.token);
      expect(afterLogoutPayload).toBeNull();
    });

    it("should logout-all active sessions for the principal", async () => {
      const session1: CanonicalIdentitySessionRecord = {
        sessionId: "sid_multi_1",
        sourceRef: "jwt_session:sid_multi_1",
        principalId: "prn_user_1",
        membershipId: "mem_user_1",
        realm: "tenant",
        tenantId: "tenant_alpha",
        status: "active",
        authTime: new Date().toISOString(),
        authMethods: ["tenant_bootstrap_fixture"],
        tokenVersion: 2001,
        idleExpiresAt: null,
        absoluteExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        revokedAt: null,
        revokedByPrincipalId: null,
        revokeReason: null,
        deviceSummary: {},
        riskSummary: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const session2: CanonicalIdentitySessionRecord = {
        ...session1,
        sessionId: "sid_multi_2",
        sourceRef: "jwt_session:sid_multi_2",
        tokenVersion: 2002,
      };
      await identityRepository.createSession(session1);
      await identityRepository.createSession(session2);

      const res = await authController.logoutAll(
        regularUserIdentity,
        { reason: "security_logout_all" },
        { headers: {} },
        "req_logout_all",
      );

      expect(res.data.revokedCount).toBe(2);
      expect(res.data.sessionIds).toContain("sid_multi_1");
      expect(res.data.sessionIds).toContain("sid_multi_2");

      const s1 = await identityRepository.getSession("sid_multi_1");
      const s2 = await identityRepository.getSession("sid_multi_2");
      expect(s1?.status).toBe("revoked");
      expect(s2?.status).toBe("revoked");
    });

    it("should list self active sessions with masked summaries", async () => {
      const sessionRecord: CanonicalIdentitySessionRecord = {
        sessionId: "sid_user_session_1",
        sourceRef: "jwt_session:sid_user_session_1",
        principalId: "prn_user_1",
        membershipId: "mem_user_1",
        realm: "tenant",
        tenantId: "tenant_alpha",
        status: "active",
        authTime: new Date().toISOString(),
        authMethods: ["tenant_bootstrap_fixture"],
        tokenVersion: 2000,
        idleExpiresAt: null,
        absoluteExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        revokedAt: null,
        revokedByPrincipalId: null,
        revokeReason: null,
        deviceSummary: { ipAddress: "172.16.0.45", serialNumber: "ABCD123456" },
        riskSummary: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await identityRepository.createSession(sessionRecord);

      const res = await authController.listSelfSessions(
        regularUserIdentity,
        "req_list_1",
      );

      expect(res.data.length).toBe(1);
      const s = res.data[0]!;
      expect(s.sessionId).toBe("sid_user_session_1");
      expect(s.isCurrent).toBe(true);
      expect(s.deviceSummary.ipAddress).toBe("172.16.***.***");
      expect(s.deviceSummary.serialNumber).toBe("AB***56");
    });

    it("should fail remote revoke with 409 IAM_CONCURRENCY_CONFLICT if expectedVersion mismatches", async () => {
      const sessionRecord: CanonicalIdentitySessionRecord = {
        sessionId: "sid_version_test",
        sourceRef: "jwt_session:sid_version_test",
        principalId: "prn_user_1",
        membershipId: "mem_user_1",
        realm: "tenant",
        tenantId: "tenant_alpha",
        status: "active",
        authTime: new Date().toISOString(),
        authMethods: ["tenant_bootstrap_fixture"],
        tokenVersion: 2000,
        idleExpiresAt: null,
        absoluteExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        revokedAt: null,
        revokedByPrincipalId: null,
        revokeReason: null,
        deviceSummary: {},
        riskSummary: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await identityRepository.createSession(sessionRecord);

      await expect(
        authController.revokeSelfSession(
          regularUserIdentity,
          "sid_version_test",
          { expectedVersion: 9999, reason: "concurrency_test" },
          { headers: {} },
          "req_rev_1",
        ),
      ).rejects.toThrow(ApiRequestError);
    });
  });

  describe("Admin Session Operations and Tenant Boundary", () => {
    it("should allow tenant admin to query sessions in their own tenant", async () => {
      const sessionInTenant: CanonicalIdentitySessionRecord = {
        sessionId: "sid_in_alpha",
        sourceRef: "jwt_session:sid_in_alpha",
        principalId: "prn_other_user",
        membershipId: "mem_other",
        realm: "tenant",
        tenantId: "tenant_alpha",
        status: "active",
        authTime: new Date().toISOString(),
        authMethods: ["tenant_bootstrap_fixture"],
        tokenVersion: 100,
        idleExpiresAt: null,
        absoluteExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        revokedAt: null,
        revokedByPrincipalId: null,
        revokeReason: null,
        deviceSummary: { ipAddress: "10.0.1.20" },
        riskSummary: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await identityRepository.createSession(sessionInTenant);

      const res = await identityController.listAdminSessions(
        tenantAdminIdentity,
        {},
        "req_admin_list",
      );

      expect(res.data.length).toBe(1);
      expect(res.data[0]!.sessionId).toBe("sid_in_alpha");
      expect(res.data[0]!.deviceSummary.ipAddress).toBe("10.0.***.***");
    });

    it("should reject tenant admin querying sessions for a different tenant with 403 RESOURCE_SCOPE_DENIED", async () => {
      await expect(
        identityController.listAdminSessions(
          tenantAdminIdentity,
          { tenantId: "tenant_beta" },
          "req_admin_list_denied",
        ),
      ).rejects.toThrow(ApiRequestError);
    });

    it("should reject non-admin user querying admin sessions with 403 AUTHZ_SCOPE_DENIED", async () => {
      await expect(
        identityController.listAdminSessions(
          regularUserIdentity,
          {},
          "req_non_admin_denied",
        ),
      ).rejects.toThrow(ApiRequestError);
    });

    it("should allow tenant admin to revoke session in their own tenant", async () => {
      const targetSession: CanonicalIdentitySessionRecord = {
        sessionId: "sid_target_revoke",
        sourceRef: "jwt_session:sid_target_revoke",
        principalId: "prn_target",
        membershipId: "mem_target",
        realm: "tenant",
        tenantId: "tenant_alpha",
        status: "active",
        authTime: new Date().toISOString(),
        authMethods: ["tenant_bootstrap_fixture"],
        tokenVersion: 500,
        idleExpiresAt: null,
        absoluteExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        revokedAt: null,
        revokedByPrincipalId: null,
        revokeReason: null,
        deviceSummary: {},
        riskSummary: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await identityRepository.createSession(targetSession);

      const res = await identityController.revokeAdminSession(
        tenantAdminIdentity,
        "sid_target_revoke",
        { reason: "admin_revocation", expectedVersion: 500 },
        { headers: {} },
        "req_admin_revoke",
      );

      expect(res.data.revoked).toBe(true);
      expect(res.data.sessionId).toBe("sid_target_revoke");

      const fetched = await identityRepository.getSession("sid_target_revoke");
      expect(fetched?.status).toBe("revoked");
    });

    it("should reject tenant admin revoking session outside their tenant with 403 RESOURCE_SCOPE_DENIED", async () => {
      const otherTenantSession: CanonicalIdentitySessionRecord = {
        sessionId: "sid_other_tenant",
        sourceRef: "jwt_session:sid_other_tenant",
        principalId: "prn_other_tenant_user",
        membershipId: "mem_other_tenant",
        realm: "tenant",
        tenantId: "tenant_beta",
        status: "active",
        authTime: new Date().toISOString(),
        authMethods: ["tenant_bootstrap_fixture"],
        tokenVersion: 600,
        idleExpiresAt: null,
        absoluteExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        revokedAt: null,
        revokedByPrincipalId: null,
        revokeReason: null,
        deviceSummary: {},
        riskSummary: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await identityRepository.createSession(otherTenantSession);

      await expect(
        identityController.revokeAdminSession(
          tenantAdminIdentity,
          "sid_other_tenant",
          { reason: "cross_tenant_revoke_attempt" },
          { headers: {} },
          "req_cross_tenant_denied",
        ),
      ).rejects.toThrow(ApiRequestError);
    });

    it("should allow platform admin to revoke sessions across any tenant", async () => {
      const sessionInBeta: CanonicalIdentitySessionRecord = {
        sessionId: "sid_beta_session",
        sourceRef: "jwt_session:sid_beta_session",
        principalId: "prn_beta_user",
        membershipId: "mem_beta",
        realm: "tenant",
        tenantId: "tenant_beta",
        status: "active",
        authTime: new Date().toISOString(),
        authMethods: ["tenant_bootstrap_fixture"],
        tokenVersion: 700,
        idleExpiresAt: null,
        absoluteExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        revokedAt: null,
        revokedByPrincipalId: null,
        revokeReason: null,
        deviceSummary: {},
        riskSummary: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await identityRepository.createSession(sessionInBeta);

      const res = await identityController.revokeAdminSession(
        platformAdminIdentity,
        "sid_beta_session",
        { reason: "platform_admin_override", isCompromised: true },
        { headers: {} },
        "req_platform_admin_revoke",
      );

      expect(res.data.revoked).toBe(true);
      const fetched = await identityRepository.getSession("sid_beta_session");
      expect(fetched?.status).toBe("revoked");
    });

    it("should reject identity:sessions:read callers from revoking admin sessions (403 AUTHZ_SCOPE_DENIED)", async () => {
      const readOnlyIdentity: BootstrapRequestIdentity = {
        authMode: "jwt_bearer",
        actorType: "ops_user",
        actorId: "usr_read_only",
        principalId: "prn_read_only",
        membershipId: "mem_ops_read",
        subject: "usr_read_only",
        realm: "ops",
        tenantId: null,
        roleFamilies: ["ops"],
        roles: ["ops_viewer"],
        scopes: ["identity:sessions:read"],
        sessionId: "sid_ops_viewer_session",
        tokenId: "jti_ops_viewer_token",
        tokenVersion: 4000,
        requestId: "req_test_read_only",
      };

      const targetSession: CanonicalIdentitySessionRecord = {
        sessionId: "sid_target_read_only_revoke",
        sourceRef: "jwt_session:sid_target_read_only_revoke",
        principalId: "prn_target_2",
        membershipId: "mem_target_2",
        realm: "tenant",
        tenantId: "tenant_alpha",
        status: "active",
        authTime: new Date().toISOString(),
        authMethods: ["tenant_bootstrap_fixture"],
        tokenVersion: 800,
        idleExpiresAt: null,
        absoluteExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        revokedAt: null,
        revokedByPrincipalId: null,
        revokeReason: null,
        deviceSummary: {},
        riskSummary: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await identityRepository.createSession(targetSession);

      // Call identityController.revokeAdminSession -> must be rejected because scopes only has identity:sessions:read
      await expect(
        identityController.revokeAdminSession(
          readOnlyIdentity,
          "sid_target_read_only_revoke",
          { reason: "read_only_revoke_attempt" },
          { headers: {} },
          "req_read_only_revoke_denied",
        ),
      ).rejects.toThrow(ApiRequestError);

      // Call authController.revokeSelfSession for non-self session -> must be rejected
      await expect(
        authController.revokeSelfSession(
          readOnlyIdentity,
          "sid_target_read_only_revoke",
          { reason: "read_only_remote_revoke_attempt" },
          { headers: {} },
          "req_read_only_remote_revoke_denied",
        ),
      ).rejects.toThrow(ApiRequestError);
    });

    it("should reject non-admin ops/platform callers from remote-revoking another user's session in authController (403 AUTHZ_SCOPE_DENIED)", async () => {
      const opsUserWithoutAdmin: BootstrapRequestIdentity = {
        authMode: "jwt_bearer",
        actorType: "ops_user",
        actorId: "usr_ops_user_plain",
        principalId: "prn_ops_user_plain",
        membershipId: "mem_ops_plain",
        subject: "usr_ops_user_plain",
        realm: "ops",
        tenantId: null,
        roleFamilies: ["ops"],
        roles: ["ops_user"],
        scopes: ["ops:read"],
        sessionId: "sid_plain_ops_session",
        tokenId: "jti_plain_ops_token",
        tokenVersion: 5000,
        requestId: "req_test_ops_plain",
      };

      const targetSession: CanonicalIdentitySessionRecord = {
        sessionId: "sid_target_remote_revoke",
        sourceRef: "jwt_session:sid_target_remote_revoke",
        principalId: "prn_victim_user",
        membershipId: "mem_victim",
        realm: "tenant",
        tenantId: "tenant_alpha",
        status: "active",
        authTime: new Date().toISOString(),
        authMethods: ["tenant_bootstrap_fixture"],
        tokenVersion: 900,
        idleExpiresAt: null,
        absoluteExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        revokedAt: null,
        revokedByPrincipalId: null,
        revokeReason: null,
        deviceSummary: {},
        riskSummary: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await identityRepository.createSession(targetSession);

      await expect(
        authController.revokeSelfSession(
          opsUserWithoutAdmin,
          "sid_target_remote_revoke",
          { reason: "unauthorized_remote_revoke" },
          { headers: {} },
          "req_ops_plain_remote_revoke_denied",
        ),
      ).rejects.toThrow(ApiRequestError);
    });

    it("should reject tenant and platform admins from remote-revoking non-self sessions via authController.revokeSelfSession (403 AUTHZ_SCOPE_DENIED)", async () => {
      const targetSession: CanonicalIdentitySessionRecord = {
        sessionId: "sid_target_admin_remote_attempt",
        sourceRef: "jwt_session:sid_target_admin_remote_attempt",
        principalId: "prn_victim_user_2",
        membershipId: "mem_victim_2",
        realm: "tenant",
        tenantId: "tenant_alpha",
        status: "active",
        authTime: new Date().toISOString(),
        authMethods: ["tenant_bootstrap_fixture"],
        tokenVersion: 950,
        idleExpiresAt: null,
        absoluteExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        revokedAt: null,
        revokedByPrincipalId: null,
        revokeReason: null,
        deviceSummary: {},
        riskSummary: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await identityRepository.createSession(targetSession);

      // Tenant admin trying to call authController.revokeSelfSession for non-self session
      await expect(
        authController.revokeSelfSession(
          tenantAdminIdentity,
          "sid_target_admin_remote_attempt",
          { reason: "tenant_admin_self_endpoint_bypassing_admin_rail" },
          { headers: {} },
          "req_tenant_admin_self_revoke_bypass_denied",
        ),
      ).rejects.toThrow(ApiRequestError);

      // Platform admin trying to call authController.revokeSelfSession for non-self session
      await expect(
        authController.revokeSelfSession(
          platformAdminIdentity,
          "sid_target_admin_remote_attempt",
          { reason: "platform_admin_self_endpoint_bypassing_admin_rail" },
          { headers: {} },
          "req_platform_admin_self_revoke_bypass_denied",
        ),
      ).rejects.toThrow(ApiRequestError);
    });
  });
});
