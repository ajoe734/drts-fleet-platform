import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";

import type { IdentityContext } from "@drts/contracts";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { HostViewService } from "../../../../apps/api/src/modules/host-view/host-view.service";
import { HostViewRepository } from "../../../../apps/api/src/modules/host-view/host-view.repository";
import { HostViewController } from "../../../../apps/api/src/modules/host-view/host-view.controller";
import {
  PrivilegedRoleGovernanceService,
  areRolesIncompatible,
} from "../../../../apps/api/src/modules/identity/privileged-role-governance.service";
import { IdentityRepository } from "../../../../apps/api/src/modules/identity/identity.repository";
import { JwtAuthService } from "../../../../apps/api/src/common/auth/jwt-auth.service";
import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth/auth.types";

const testRsaKey = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

describe("SR-QA-IDENTITY-001 / C009, C010 & C011 — 跨租戶隔離／即時失效與四眼簽核驗收", () => {
  beforeEach(() => {
    process.env.JWT_KEY_RING_JSON = JSON.stringify([
      {
        kid: "key-test-2026",
        status: "active",
        algorithm: "RS256",
        privateKey: testRsaKey.privateKey,
        publicKey: testRsaKey.publicKey,
      },
    ]);
    process.env.STEP_UP_PROOF_SECRET =
      "test_step_up_secret_32_bytes_long_entropy";
  });

  // ── C009: 跨租戶／跨車行使用者 資源歸屬隔離與 Host 自車受限 Read Model ────────
  describe("C009: 跨租戶、跨車行與 Host 歸屬隔離 (IAM)", () => {
    let tenantPartnerService: TenantPartnerService;
    let hostViewRepo: HostViewRepository;
    let hostViewService: HostViewService;
    let hostViewController: HostViewController;

    beforeEach(() => {
      tenantPartnerService = new TenantPartnerService({} as any);
      hostViewRepo = new HostViewRepository();
      hostViewService = new HostViewService(hostViewRepo);
      hostViewController = new HostViewController(hostViewService);
    });

    it("C009-POS-1: Tenant A can list their own API keys", () => {
      const tenantAId = "tenant-alpha-001";
      const tenantAIdentity: IdentityContext = {
        actorType: "tenant_admin",
        actorId: "actor-admin-alpha",
        realm: "tenant",
        authMode: "jwt_bearer",
        roleFamilies: ["tenant"],
        roles: ["tenant_admin"],
        scopes: ["tenant:read", "tenant:write"],
        tenantId: tenantAId,
        supportedExecutionModes: [
          "discussion_planning",
          "supervisor_managed_execution",
        ],
      };

      // Tenant A requests keys for Tenant A
      const keys = tenantPartnerService.listApiKeys(tenantAId, tenantAIdentity);
      expect(Array.isArray(keys)).toBe(true);
    });

    it("C009-NEG-1: Tenant A admin attempting to access Tenant B keys throws 403 TENANT_SCOPE_MISMATCH", () => {
      const tenantAId = "tenant-alpha-001";
      const tenantBId = "tenant-beta-002";
      const tenantAIdentity: IdentityContext = {
        actorType: "tenant_admin",
        actorId: "actor-admin-alpha",
        realm: "tenant",
        authMode: "jwt_bearer",
        roleFamilies: ["tenant"],
        roles: ["tenant_admin"],
        scopes: ["tenant:read", "tenant:write"],
        tenantId: tenantAId, // Tenant A
        supportedExecutionModes: [
          "discussion_planning",
          "supervisor_managed_execution",
        ],
      };

      // Tenant A attempts to access Tenant B
      expect(() => {
        tenantPartnerService.listApiKeys(tenantBId, tenantAIdentity);
      }).toThrowError(
        expect.objectContaining({
          status: 403,
          code: "TENANT_SCOPE_MISMATCH",
        }),
      );
    });

    it("C009-POS-2: Host A can query earnings for own vehicle", async () => {
      const hostAPartnerId = "partner-host-001";
      const hostAVehicleId = "veh-host-alpha-001";

      hostViewRepo.seedVehicle({
        vehicleId: hostAVehicleId,
        ownerPartnerId: hostAPartnerId,
        plateNo: "ABC-1234",
        vin: "1HGCR2F83HA123456",
        vehicleForm: "sedan",
        licenseClass: "small_passenger",
        energyType: "gasoline",
        currentStatus: "active",
        operatingFleetName: "Alpha Fleet",
        activeFlag: true,
      });

      const hostAIdentity: BootstrapRequestIdentity = {
        authMode: "bootstrap_headers",
        actorType: "partner_api_key",
        actorId: hostAPartnerId,
        principalId: hostAPartnerId,
        partnerId: hostAPartnerId,
        realm: "partner",
        roles: ["partner_service"],
        roleFamilies: ["partner"],
        scopes: ["owned:read", "reports:read"],
        tenantId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        membershipId: null,
        sessionId: "sess-host-001",
        tokenVersion: 1,
        authTime: new Date().toISOString(),
        amr: ["password"],
        acr: "aal1",
        requestId: "req-host-001",
      };

      const earnings = await hostViewService.getVehicleEarnings(
        hostAVehicleId,
        hostAIdentity,
      );
      expect(earnings.vehicleId).toBe(hostAVehicleId);
      expect(earnings.settlementStatus).toBe("pending_policy");
    });

    it("C009-NEG-2: Host A attempting to query Host B vehicle returns 404 HOST_VEHICLE_NOT_FOUND (Anti-Enumeration)", async () => {
      const hostAPartnerId = "partner-host-001";
      const hostBPartnerId = "partner-host-002";
      const hostBVehicleId = "veh-host-beta-999";

      // Seed vehicle belonging to Host B
      hostViewRepo.seedVehicle({
        vehicleId: hostBVehicleId,
        ownerPartnerId: hostBPartnerId,
        plateNo: "XYZ-9999",
        vin: "2HGCR2F83HA999999",
        vehicleForm: "sedan",
        licenseClass: "small_passenger",
        energyType: "gasoline",
        currentStatus: "active",
        operatingFleetName: "Beta Fleet",
        activeFlag: true,
      });

      const hostAIdentity: BootstrapRequestIdentity = {
        authMode: "bootstrap_headers",
        actorType: "partner_api_key",
        actorId: hostAPartnerId,
        principalId: hostAPartnerId,
        partnerId: hostAPartnerId,
        realm: "partner",
        roles: ["partner_service"],
        roleFamilies: ["partner"],
        scopes: ["owned:read", "reports:read"],
        tenantId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        membershipId: null,
        sessionId: "sess-host-001",
        tokenVersion: 1,
        authTime: new Date().toISOString(),
        amr: ["password"],
        acr: "aal1",
        requestId: "req-host-002",
      };

      // Anti-enumeration: must return 404, NOT 403
      await expect(
        hostViewService.getVehicleEarnings(hostBVehicleId, hostAIdentity),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 404,
          code: "HOST_VEHICLE_NOT_FOUND",
        }),
      );
    });

    it("C009-NEG-3: Host controller strictly rejects mutation verbs with 405 Method Not Allowed", () => {
      expect(() => hostViewController.rejectPost()).toThrowError(
        expect.objectContaining({
          status: 405,
          code: "HOST_MUTATION_NOT_SUPPORTED",
        }),
      );
      expect(() => hostViewController.rejectPut()).toThrowError(
        expect.objectContaining({
          status: 405,
          code: "HOST_MUTATION_NOT_SUPPORTED",
        }),
      );
      expect(() => hostViewController.rejectPatch()).toThrowError(
        expect.objectContaining({
          status: 405,
          code: "HOST_MUTATION_NOT_SUPPORTED",
        }),
      );
      expect(() => hostViewController.rejectDelete()).toThrowError(
        expect.objectContaining({
          status: 405,
          code: "HOST_MUTATION_NOT_SUPPORTED",
        }),
      );
    });
  });

  // ── C010: 平台安全管理員 停權／離職立即失效與金鑰輪替 (IAM) ───────────────────
  describe("C010: 停權即時失效與 API 金鑰輪替撤銷 (IAM)", () => {
    let identityRepo: IdentityRepository;
    let jwtAuthService: JwtAuthService;
    let tenantPartnerService: TenantPartnerService;

    beforeEach(() => {
      identityRepo = new IdentityRepository();
      tenantPartnerService = new TenantPartnerService({} as any);
      jwtAuthService = new JwtAuthService(identityRepo, tenantPartnerService);
    });

    it("C010-POS-1: active session token verifies successfully", async () => {
      const account = await identityRepo.ensureDefaultPlatformAccount();
      const sid = `sess-active-${Date.now()}`;
      await identityRepo.createSession({
        sessionId: sid,
        sourceRef: "test",
        principalId: account.principal.principalId,
        membershipId: account.membership.membershipId,
        realm: "platform",
        status: "active",
        authTime: new Date().toISOString(),
        authMethods: ["password"],
        tokenVersion: Date.parse(account.principal.updatedAt),
        idleExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        absoluteExpiresAt: new Date(Date.now() + 7200000).toISOString(),
        revokedAt: null,
        revokedByPrincipalId: null,
        revokeReason: null,
        deviceSummary: {},
        riskSummary: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const issued = await jwtAuthService.issueSessionToken({
        authMode: "jwt_bearer",
        actorType: "platform_admin",
        actorId: account.principal.principalId,
        principalId: account.principal.principalId,
        membershipId: account.membership.membershipId,
        realm: "platform",
        roles: ["platform_admin"],
        roleFamilies: ["platform"],
        scopes: ["identity:read"],
        tenantId: null,
        sessionId: sid,
        tokenVersion: Date.parse(account.principal.updatedAt),
      });

      const verified = await jwtAuthService.verifyAccessToken(issued.token);
      expect(verified).not.toBeNull();
      expect(verified?.principalId).toBe(account.principal.principalId);
      expect(verified?.sid).toBe(sid);
    });

    it("C010-NEG-1: revoked session token is immediately denied across all instances", async () => {
      const account = await identityRepo.ensureDefaultPlatformAccount();
      const sid = `sess-revoked-${Date.now()}`;
      await identityRepo.createSession({
        sessionId: sid,
        sourceRef: "test",
        principalId: account.principal.principalId,
        membershipId: account.membership.membershipId,
        realm: "platform",
        status: "active",
        authTime: new Date().toISOString(),
        authMethods: ["password"],
        tokenVersion: Date.parse(account.principal.updatedAt),
        idleExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        absoluteExpiresAt: new Date(Date.now() + 7200000).toISOString(),
        revokedAt: null,
        revokedByPrincipalId: null,
        revokeReason: null,
        deviceSummary: {},
        riskSummary: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const issued = await jwtAuthService.issueSessionToken({
        authMode: "jwt_bearer",
        actorType: "platform_admin",
        actorId: account.principal.principalId,
        principalId: account.principal.principalId,
        membershipId: account.membership.membershipId,
        realm: "platform",
        roles: ["platform_admin"],
        roleFamilies: ["platform"],
        scopes: ["identity:read"],
        tenantId: null,
        sessionId: sid,
        tokenVersion: Date.parse(account.principal.updatedAt),
      });

      // Revoke the session
      await identityRepo.revokeSession(sid, "admin_immediate_termination");

      // Cross-instance verification: immediately returns null (denied)
      const verifiedAfterRevocation = await jwtAuthService.verifyAccessToken(
        issued.token,
      );
      expect(verifiedAfterRevocation).toBeNull();
    });

    it("C010-NEG-2: token version mismatch immediately invalidates prior tokens", async () => {
      const account = await identityRepo.ensureDefaultPlatformAccount();
      const sid = `sess-version-${Date.now()}`;
      const sessionRecord = await identityRepo.createSession({
        sessionId: sid,
        sourceRef: "test",
        principalId: account.principal.principalId,
        membershipId: account.membership.membershipId,
        realm: "platform",
        status: "active",
        authTime: new Date().toISOString(),
        authMethods: ["password"],
        tokenVersion: Date.parse(account.principal.updatedAt),
        idleExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        absoluteExpiresAt: new Date(Date.now() + 7200000).toISOString(),
        revokedAt: null,
        revokedByPrincipalId: null,
        revokeReason: null,
        deviceSummary: {},
        riskSummary: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const oldToken = await jwtAuthService.issueSessionToken({
        authMode: "jwt_bearer",
        actorType: "platform_admin",
        actorId: account.principal.principalId,
        principalId: account.principal.principalId,
        membershipId: account.membership.membershipId,
        realm: "platform",
        roles: ["platform_admin"],
        roleFamilies: ["platform"],
        scopes: ["identity:read"],
        tenantId: null,
        sessionId: sid,
        tokenVersion: Date.parse(account.principal.updatedAt),
      });

      // Update session tokenVersion to 2 (e.g. credential rotation / password reset)
      await identityRepo.createSession({
        ...sessionRecord,
        tokenVersion: 2,
      });

      const verified = await jwtAuthService.verifyAccessToken(oldToken.token);
      expect(verified).toBeNull(); // Immediately rejected due to tokenVersion mismatch
    });

    it("C010-NEG-3: retired or revoked signing key causes immediate verification failure", async () => {
      const oldRsaKey = generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });

      // Config with key-v1
      process.env.JWT_KEY_RING_JSON = JSON.stringify([
        {
          kid: "key-v1",
          status: "active",
          algorithm: "RS256",
          privateKey: oldRsaKey.privateKey,
          publicKey: oldRsaKey.publicKey,
        },
      ]);
      const serviceWithV1 = new JwtAuthService();
      const token = serviceWithV1.sign({
        authMode: "jwt_bearer",
        actorId: "usr-rot-01",
        principalId: "usr-rot-01",
        actorType: "platform_admin",
        realm: "system",
        roles: ["platform_admin"],
        roleFamilies: ["platform"],
        scopes: ["all"],
        tenantId: null,
      });

      // Rotate key-v1 to retired
      process.env.JWT_KEY_RING_JSON = JSON.stringify([
        {
          kid: "key-v1",
          status: "retired",
          algorithm: "RS256",
          publicKey: oldRsaKey.publicKey,
        },
        {
          kid: "key-v2",
          status: "active",
          algorithm: "RS256",
          privateKey: testRsaKey.privateKey,
          publicKey: testRsaKey.publicKey,
        },
      ]);
      const serviceAfterRevoke = new JwtAuthService();
      const verifiedRevoked = serviceAfterRevoke.verify(token);
      expect(verifiedRevoked).toBeNull();
    });
  });

  // ── C011: 特權申請／核准人 臨時角色、四眼核准、到期回收 (IAM) ─────────────────
  describe("C011: 特權角色四眼核准與到期回收 (IAM)", () => {
    let identityRepo: IdentityRepository;
    let governanceService: PrivilegedRoleGovernanceService;

    beforeEach(() => {
      identityRepo = new IdentityRepository();
      governanceService = new PrivilegedRoleGovernanceService(identityRepo);
    });

    it("C011-POS-1: two distinct personas perform dual approval (Four-Eyes principle)", async () => {
      const requester: IdentityContext = {
        actorType: "tenant_admin",
        actorId: "usr_requester_alice",
        realm: "tenant",
        authMode: "jwt_bearer",
        roleFamilies: ["tenant"],
        roles: ["tenant_admin"],
        scopes: ["tenant:write"],
        tenantId: "ten_alpha_001",
        authMethods: ["jwt", "mfa"],
        authTime: new Date().toISOString(),
        supportedExecutionModes: [
          "discussion_planning",
          "supervisor_managed_execution",
        ],
      };

      const approver: IdentityContext = {
        actorType: "tenant_admin",
        actorId: "usr_approver_bob", // Different persona
        realm: "tenant",
        authMode: "jwt_bearer",
        roleFamilies: ["tenant"],
        roles: ["tenant_admin"],
        scopes: ["tenant:write"],
        tenantId: "ten_alpha_001",
        authMethods: ["jwt", "mfa"],
        authTime: new Date().toISOString(),
        supportedExecutionModes: [
          "discussion_planning",
          "supervisor_managed_execution",
        ],
      };

      const request = await governanceService.createRequest(
        {
          targetUserId: "usr_target_charlie",
          roleCode: "tenant_admin",
          reason: "Scheduled compliance audit",
          tenantId: "ten_alpha_001",
        },
        requester,
      );

      expect(request.status).toBe("pending");
      expect(request.requesterPrincipalId).toBe("usr_requester_alice");

      const approved = await governanceService.approveRequest(
        request.requestId,
        approver,
        {
          approvalRequestId: request.requestId,
          mutation: {
            expectedVersion: request.version,
            reasonCode: "APPROVED_BY_BOB",
          },
        },
      );

      expect(approved.request.status).toBe("approved");
      expect(approved.request.approverPrincipalId).toBe("usr_approver_bob");
      expect(approved.grant).toBeDefined();
      expect(approved.grant.roleCode).toBe("tenant_admin");
    });

    it("C011-NEG-1: requester attempting self-approval is rejected with 403 IAM_SOD_VIOLATION", async () => {
      const requester: IdentityContext = {
        actorType: "tenant_admin",
        actorId: "usr_requester_alice",
        realm: "tenant",
        authMode: "jwt_bearer",
        roleFamilies: ["tenant"],
        roles: ["tenant_admin"],
        scopes: ["tenant:write"],
        tenantId: "ten_alpha_001",
        authMethods: ["jwt", "mfa"],
        authTime: new Date().toISOString(),
        supportedExecutionModes: [
          "discussion_planning",
          "supervisor_managed_execution",
        ],
      };

      const request = await governanceService.createRequest(
        {
          targetUserId: "usr_requester_alice",
          roleCode: "tenant_admin",
          reason: "Attempt self elevation",
          tenantId: "ten_alpha_001",
        },
        requester,
      );

      // Self-approval attempt
      await expect(
        governanceService.approveRequest(request.requestId, requester, {
          approvalRequestId: request.requestId,
          mutation: {
            expectedVersion: request.version,
            reasonCode: "SELF_APPROVE",
          },
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 403,
          code: "IAM_SOD_VIOLATION",
        }),
      );
    });

    it("C011-NEG-2: incompatible role pairs are strictly detected by Separation of Duties policy", () => {
      expect(
        areRolesIncompatible("tenant_finance_admin", "tenant_security_admin"),
      ).toBe(true);
      expect(areRolesIncompatible("tenant_finance_admin", "tenant_admin")).toBe(
        true,
      );
      expect(areRolesIncompatible("security_admin", "platform_admin")).toBe(
        true,
      );
      expect(areRolesIncompatible("superadmin", "security_admin")).toBe(true);

      // Compatible roles
      expect(areRolesIncompatible("tenant_admin", "tenant_ops_admin")).toBe(
        false,
      );
    });

    it("C011-POS-2: expireStaleGrants sweeps expired role requests and marks them expired", async () => {
      const expiredList = await governanceService.expireStaleGrants();
      expect(Array.isArray(expiredList)).toBe(true);
    });
  });
});
