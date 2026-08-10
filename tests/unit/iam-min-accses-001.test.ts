import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { getTenantRoleScopes } from "../../apps/api/src/common/auth/auth.constants";
import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth/auth.types";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { AuthController } from "../../apps/api/src/modules/auth/auth.controller";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

function createTestHarness() {
  const auditNotificationService = new AuditNotificationService();
  const tenantPartnerService = new TenantPartnerService(
    auditNotificationService,
  );
  const identityRepository = new IdentityRepository();
  const jwtAuthService = new JwtAuthService(
    identityRepository,
    tenantPartnerService,
  );
  const authController = new AuthController(
    jwtAuthService,
    tenantPartnerService,
    {} as never,
  );

  return {
    auditNotificationService,
    tenantPartnerService,
    identityRepository,
    jwtAuthService,
    authController,
  };
}

function makeMockIdentity(
  actorId: string,
  principalId: string,
  sessionId?: string,
): BootstrapRequestIdentity {
  return {
    authMode: "jwt_bearer",
    actorType: "tenant_admin",
    actorId,
    principalId,
    sessionId: sessionId ?? null,
    realm: "tenant",
    tenantId: "t1",
    roleFamilies: ["tenant"],
    roles: ["tenant_admin"],
    scopes: [],
    requestId: "test-req-id",
  };
}

async function expectApiError(
  fn: () => Promise<unknown> | unknown,
  statusCode: number,
  code: string,
) {
  try {
    await fn();
    throw new Error(`Expected ApiRequestError with code ${code}, but succeeded`);
  } catch (err) {
    expect(err).toBeInstanceOf(ApiRequestError);
    if (err instanceof ApiRequestError) {
      expect(err.getStatus()).toBe(statusCode);
      expect(err.code).toBe(code);
    }
  }
}

describe("IAM-MIN-ACCSES-001 minimum account lifecycle and session logout/revocation", () => {
  it("criterion 1: origin/dev has persistent platform account in identity repository", async () => {
    const { identityRepository } = createTestHarness();
    const seeded = await identityRepository.ensureDefaultPlatformAccount();

    expect(seeded.principal).toBeDefined();
    expect(seeded.principal.principalId).toBe("principal_platform_admin_default");
    expect(seeded.principal.email).toBe("platform-admin@platform.drts");
    expect(seeded.principal.status).toBe("active");

    expect(seeded.membership).toBeDefined();
    expect(seeded.membership.realm).toBe("platform");
    expect(seeded.membership.status).toBe("active");

    const foundPrincipal = await identityRepository.findPrincipalById(
      "principal_platform_admin_default",
    );
    expect(foundPrincipal).toBeDefined();
    expect(foundPrincipal?.status).toBe("active");
  });

  it("criterion 2: tenant accounts support invite, enable, disable, and role change", async () => {
    const { tenantPartnerService } = createTestHarness();
    const tenantId = "tenant-lifecycle-001";

    // 1. Invite / Create
    const invitedUser = await tenantPartnerService.createTenantUser(
      tenantId,
      {
        email: "user.lifecycle@acme.test",
        displayName: "Lifecycle Test User",
        roleCode: "tenant_viewer",
      },
      "req-invite-001",
    );
    expect(invitedUser.email).toBe("user.lifecycle@acme.test");
    expect(invitedUser.roleCode).toBe("tenant_viewer");

    // 2. Change Role to Tenant Ops Admin & set active status (Enable)
    const enabledUser = await tenantPartnerService.updateTenantUserRole(
      tenantId,
      invitedUser.userId,
      {
        roleCode: "tenant_ops_admin",
        status: "active",
      },
      "req-enable-001",
    );
    expect(enabledUser.roleCode).toBe("tenant_ops_admin");
    expect(enabledUser.status).toBe("active");

    // 3. Disable tenant user
    const disabledUser = await tenantPartnerService.updateTenantUserRole(
      tenantId,
      invitedUser.userId,
      {
        roleCode: "tenant_ops_admin",
        status: "suspended",
      },
      "req-disable-001",
    );
    expect(disabledUser.status).toBe("suspended");
  });

  it("criterion 3a: protects the last active administrator for a tenant from removal or demotion", async () => {
    const { tenantPartnerService } = createTestHarness();
    const tenantId = "tenant-last-admin-001";

    const adminUser = await tenantPartnerService.createTenantUser(
      tenantId,
      {
        email: "sole.admin@acme.test",
        displayName: "Sole Admin",
        roleCode: "tenant_admin",
      },
      "req-sole-admin-001",
    );

    // Make active
    await tenantPartnerService.updateTenantUserRole(
      tenantId,
      adminUser.userId,
      { roleCode: "tenant_admin", status: "active" },
      "req-sole-admin-active",
    );

    // Attempting to demote sole admin to tenant_viewer should fail with 400 CANNOT_REMOVE_LAST_ADMIN
    await expectApiError(
      () =>
        tenantPartnerService.updateTenantUserRole(
          tenantId,
          adminUser.userId,
          { roleCode: "tenant_viewer", status: "active" },
          "req-demote-sole-admin",
        ),
      400,
      "CANNOT_REMOVE_LAST_ADMIN",
    );

    // Attempting to disable sole admin should fail
    await expectApiError(
      () =>
        tenantPartnerService.updateTenantUserRole(
          tenantId,
          adminUser.userId,
          { roleCode: "tenant_admin", status: "suspended" },
          "req-disable-sole-admin",
        ),
      400,
      "CANNOT_REMOVE_LAST_ADMIN",
    );

    // Add 2nd admin
    const admin2 = await tenantPartnerService.createTenantUser(
      tenantId,
      {
        email: "second.admin@acme.test",
        displayName: "Second Admin",
        roleCode: "tenant_admin",
      },
      "req-admin-2",
    );
    await tenantPartnerService.updateTenantUserRole(
      tenantId,
      admin2.userId,
      { roleCode: "tenant_admin", status: "active" },
      "req-admin2-active",
    );

    // Demoting one of the two admins should now succeed
    const demoted = await tenantPartnerService.updateTenantUserRole(
      tenantId,
      adminUser.userId,
      { roleCode: "tenant_ops_admin", status: "active" },
      "req-demote-one-of-two",
    );
    expect(demoted.roleCode).toBe("tenant_ops_admin");
  });

  it("criterion 3b: prohibits self-elevation of roles", async () => {
    const { tenantPartnerService } = createTestHarness();
    const tenantId = "tenant-self-elevate-001";

    const viewerUser = await tenantPartnerService.createTenantUser(
      tenantId,
      {
        email: "viewer@acme.test",
        displayName: "Viewer User",
        roleCode: "tenant_viewer",
      },
      "req-user-001",
    );
    await tenantPartnerService.updateTenantUserRole(
      tenantId,
      viewerUser.userId,
      { roleCode: "tenant_viewer", status: "active" },
      "req-user-active",
    );

    // Attempting self-elevation from tenant_viewer to tenant_admin should be forbidden (403 SELF_ELEVATION_FORBIDDEN)
    await expectApiError(
      () =>
        tenantPartnerService.updateTenantUserRole(
          tenantId,
          viewerUser.userId,
          { roleCode: "tenant_admin", status: "active" },
          "req-self-elevate-admin",
          {
            actorType: "tenant_admin",
            actorId: viewerUser.userId,
            realm: "tenant",
            authMode: "jwt_bearer",
            roleFamilies: ["tenant"],
            roles: ["tenant_viewer"],
            scopes: [],
            tenantId,
            supportedExecutionModes: ["supervisor_managed_execution"],
          },
        ),
      403,
      "SELF_ELEVATION_FORBIDDEN",
    );

    // Attempting self-elevation from tenant_viewer to tenant_ops_admin should also be forbidden
    await expectApiError(
      () =>
        tenantPartnerService.updateTenantUserRole(
          tenantId,
          viewerUser.userId,
          { roleCode: "tenant_ops_admin", status: "active" },
          "req-self-elevate-ops",
          {
            actorType: "tenant_admin",
            actorId: viewerUser.userId,
            realm: "tenant",
            authMode: "jwt_bearer",
            roleFamilies: ["tenant"],
            roles: ["tenant_viewer"],
            scopes: [],
            tenantId,
            supportedExecutionModes: ["supervisor_managed_execution"],
          },
        ),
      403,
      "SELF_ELEVATION_FORBIDDEN",
    );

    // Attempting self-elevation from tenant_viewer to tenant_finance_admin should also be forbidden
    await expectApiError(
      () =>
        tenantPartnerService.updateTenantUserRole(
          tenantId,
          viewerUser.userId,
          { roleCode: "tenant_finance_admin", status: "active" },
          "req-self-elevate-finance",
          {
            actorType: "tenant_admin",
            actorId: viewerUser.userId,
            realm: "tenant",
            authMode: "jwt_bearer",
            roleFamilies: ["tenant"],
            roles: ["tenant_viewer"],
            scopes: [],
            tenantId,
            supportedExecutionModes: ["supervisor_managed_execution"],
          },
        ),
      403,
      "SELF_ELEVATION_FORBIDDEN",
    );

    // Setup an ops admin user
    const opsUser = await tenantPartnerService.createTenantUser(
      tenantId,
      {
        email: "ops@acme.test",
        displayName: "Ops User",
        roleCode: "tenant_ops_admin",
      },
      "req-user-ops",
    );
    await tenantPartnerService.updateTenantUserRole(
      tenantId,
      opsUser.userId,
      { roleCode: "tenant_ops_admin", status: "active" },
      "req-ops-active",
    );

    // Attempting self-elevation from tenant_ops_admin to tenant_admin should be forbidden
    await expectApiError(
      () =>
        tenantPartnerService.updateTenantUserRole(
          tenantId,
          opsUser.userId,
          { roleCode: "tenant_admin", status: "active" },
          "req-ops-self-elevate-admin",
          {
            actorType: "tenant_admin",
            actorId: opsUser.userId,
            realm: "tenant",
            authMode: "jwt_bearer",
            roleFamilies: ["tenant"],
            roles: ["tenant_ops_admin"],
            scopes: [],
            tenantId,
            supportedExecutionModes: ["supervisor_managed_execution"],
          },
        ),
      403,
      "SELF_ELEVATION_FORBIDDEN",
    );
  });

  it("criterion 4: provides current device logout and all devices logout", async () => {
    const { authController, identityRepository } = createTestHarness();

    // 1. Setup session records
    const session1 = await identityRepository.createSession({
      sessionId: "session_device_1",
      sourceRef: "jwt_session:session_device_1",
      principalId: "principal_user_123",
      membershipId: "mem_123",
      realm: "tenant",
      status: "active",
      authTime: new Date().toISOString(),
      authMethods: ["jwt_bearer"],
      tokenVersion: 100,
      idleExpiresAt: null,
      absoluteExpiresAt: new Date(Date.now() + 3600000).toISOString(),
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: {},
      riskSummary: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(session1.status).toBe("active");

    // Logout current device
    const logoutRes = await authController.logout(
      makeMockIdentity("user_123", "principal_user_123", "session_device_1"),
      "req-logout-001",
    );

    expect(logoutRes.data.loggedOut).toBe(true);
    const updatedS1 = await identityRepository.getSession("session_device_1");
    expect(updatedS1?.status).toBe("revoked");

    // 2. Logout all
    await identityRepository.createSession({
      sessionId: "session_device_2",
      sourceRef: "jwt_session:session_device_2",
      principalId: "principal_user_123",
      membershipId: "mem_123",
      realm: "tenant",
      status: "active",
      authTime: new Date().toISOString(),
      authMethods: ["jwt_bearer"],
      tokenVersion: 100,
      idleExpiresAt: null,
      absoluteExpiresAt: new Date(Date.now() + 3600000).toISOString(),
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: {},
      riskSummary: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const logoutAllRes = await authController.logoutAll(
      makeMockIdentity("user_123", "principal_user_123", "session_device_2"),
      "req-logout-all-001",
    );

    expect(logoutAllRes.data.loggedOutAll).toBe(true);
    const updatedS2 = await identityRepository.getSession("session_device_2");
    expect(updatedS2?.status).toBe("revoked");
  });

  it("criterion 5: self-service revocation endpoint cannot revoke other users' sessions", async () => {
    const { authController, identityRepository } = createTestHarness();

    // Create session belonging to User B
    await identityRepository.createSession({
      sessionId: "session_user_b",
      sourceRef: "jwt_session:session_user_b",
      principalId: "principal_user_b",
      membershipId: "mem_b",
      realm: "tenant",
      status: "active",
      authTime: new Date().toISOString(),
      authMethods: ["jwt_bearer"],
      tokenVersion: 100,
      idleExpiresAt: null,
      absoluteExpiresAt: new Date(Date.now() + 3600000).toISOString(),
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: {},
      riskSummary: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // User A attempts to revoke User B's session -> Must be forbidden (403 SESSION_REVOCATION_FORBIDDEN)
    await expectApiError(
      () =>
        authController.revokeSessionSelf(
          makeMockIdentity("user_a", "principal_user_a", "session_user_a"),
          { sessionId: "session_user_b" },
          "req-revoke-other-001",
        ),
      403,
      "SESSION_REVOCATION_FORBIDDEN",
    );

    // User B revokes User B's session -> Subevent succeeds
    const revokeSelfRes = await authController.revokeSessionSelf(
      makeMockIdentity("user_b", "principal_user_b", "session_user_b"),
      { sessionId: "session_user_b" },
      "req-revoke-self-001",
    );
    expect(revokeSelfRes.data.revoked).toBe(true);
  });

  it("criterion 6: disabling user or changing role invalidates old session tokens", async () => {
    process.env.JWT_SECRET = "test-secret-key-12345678901234567890";

    const { jwtAuthService, tenantPartnerService } = createTestHarness();
    const tenantId = "tenant-sess-inv-001";

    const user = await tenantPartnerService.createTenantUser(
      tenantId,
      {
        email: "session.inv@acme.test",
        displayName: "Session Inv User",
        roleCode: "tenant_viewer",
      },
      "req-sess-inv-user",
    );
    const activeUser = await tenantPartnerService.updateTenantUserRole(
      tenantId,
      user.userId,
      { roleCode: "tenant_viewer", status: "active" },
      "req-sess-inv-active",
    );

    const tokenVersion = Date.parse(activeUser.updatedAt);
    const viewerScopes = [...(getTenantRoleScopes("tenant_viewer") ?? [])];
    const issuedSession = await jwtAuthService.issueSessionToken(
      {
        authMode: "jwt_bearer",
        actorType: "tenant_admin",
        actorId: activeUser.userId,
        principalId: activeUser.userId,
        subject: activeUser.userId,
        realm: "tenant",
        tenantId,
        roleFamilies: ["tenant"],
        roles: ["tenant_viewer"],
        scopes: viewerScopes,
        requestId: "req-issue-001",
      },
      {
        tokenVersion,
      },
    );

    // Verify token is initially valid
    const initialPayload = await jwtAuthService.verifyAccessToken(
      issuedSession.token,
    );
    expect(initialPayload).not.toBeNull();
    expect(initialPayload?.sub).toBe(activeUser.userId);

    // 1. Changing role updates updatedAt and invalidates the old token
    await tenantPartnerService.updateTenantUserRole(
      tenantId,
      activeUser.userId,
      { roleCode: "tenant_ops_admin", status: "active" },
      "req-role-change",
    );

    const payloadAfterRoleChange = await jwtAuthService.verifyAccessToken(
      issuedSession.token,
    );
    expect(payloadAfterRoleChange).toBeNull();

    // Re-issue new token with new role and updated tokenVersion
    const updatedUser = tenantPartnerService.findTenantUser(
      tenantId,
      activeUser.userId,
    )!;
    const newTokenVersion = Date.parse(updatedUser.updatedAt);
    const opsAdminScopes = [...(getTenantRoleScopes("tenant_ops_admin") ?? [])];
    const newSession = await jwtAuthService.issueSessionToken(
      {
        authMode: "jwt_bearer",
        actorType: "tenant_admin",
        actorId: updatedUser.userId,
        principalId: updatedUser.userId,
        subject: updatedUser.userId,
        realm: "tenant",
        tenantId,
        roleFamilies: ["tenant"],
        roles: ["tenant_ops_admin"],
        scopes: opsAdminScopes,
        requestId: "req-issue-002",
      },
      {
        tokenVersion: newTokenVersion,
      },
    );

    const newPayload = await jwtAuthService.verifyAccessToken(
      newSession.token,
    );
    expect(newPayload).not.toBeNull();

    // 2. Disabling the user invalidates the new token
    await tenantPartnerService.updateTenantUserRole(
      tenantId,
      updatedUser.userId,
      { roleCode: "tenant_ops_admin", status: "suspended" },
      "req-disable-user",
    );

    const payloadAfterDisable = await jwtAuthService.verifyAccessToken(
      newSession.token,
    );
    expect(payloadAfterDisable).toBeNull();
  });

  it("criterion 7: enforces tenant-scope isolation on tenant user creation and role updates (rejects cross-tenant mutations for tenant principals but allows platform/system exception)", async () => {
    const { tenantPartnerService } = createTestHarness();
    const targetTenant = "tenant-target-001";

    const tenantAIdentity = {
      actorType: "tenant_admin" as const,
      actorId: "user_tenant_a",
      realm: "tenant" as const,
      authMode: "jwt_bearer" as const,
      roleFamilies: ["tenant" as const],
      roles: ["tenant_admin"],
      scopes: [],
      tenantId: "tenant-other-999",
      supportedExecutionModes: ["supervisor_managed_execution" as const],
    };

    // 1. Cross-tenant user creation attempt by tenant principal must fail (403 TENANT_SCOPE_MISMATCH)
    await expectApiError(
      () =>
        tenantPartnerService.createTenantUser(
          targetTenant,
          {
            email: "cross.tenant@acme.test",
            displayName: "Cross Tenant User",
            roleCode: "tenant_viewer",
          },
          "req-cross-create",
          tenantAIdentity,
        ),
      403,
      "TENANT_SCOPE_MISMATCH",
    );

    // 2. Setup user under targetTenant as system/platform admin
    const platformIdentity = {
      actorType: "platform_admin" as const,
      actorId: "platform_user_1",
      realm: "platform" as const,
      authMode: "jwt_bearer" as const,
      roleFamilies: ["platform" as const],
      roles: ["platform_admin"],
      scopes: [],
      tenantId: null,
      supportedExecutionModes: ["supervisor_managed_execution" as const],
    };

    const targetUser = await tenantPartnerService.createTenantUser(
      targetTenant,
      {
        email: "target.user@acme.test",
        displayName: "Target Tenant User",
        roleCode: "tenant_viewer",
      },
      "req-platform-create",
      platformIdentity,
    );
    expect(targetUser.email).toBe("target.user@acme.test");

    // 3. Cross-tenant role update attempt by tenant principal must fail (403 TENANT_SCOPE_MISMATCH)
    await expectApiError(
      () =>
        tenantPartnerService.updateTenantUserRole(
          targetTenant,
          targetUser.userId,
          {
            roleCode: "tenant_ops_admin",
            status: "active",
          },
          "req-cross-update",
          tenantAIdentity,
        ),
      403,
      "TENANT_SCOPE_MISMATCH",
    );

    // 4. System principal exception allows user creation and role updates across tenants
    const systemIdentity = {
      actorType: "system" as const,
      actorId: "system_service_1",
      realm: "system" as const,
      authMode: "jwt_bearer" as const,
      roleFamilies: ["platform" as const],
      roles: ["system_admin"],
      scopes: [],
      tenantId: null,
      supportedExecutionModes: ["supervisor_managed_execution" as const],
    };

    const updatedUserBySystem = await tenantPartnerService.updateTenantUserRole(
      targetTenant,
      targetUser.userId,
      {
        roleCode: "tenant_ops_admin",
        status: "active",
      },
      "req-system-update",
      systemIdentity,
    );
    expect(updatedUserBySystem.roleCode).toBe("tenant_ops_admin");
    expect(updatedUserBySystem.status).toBe("active");
  });

  it("criterion 8: default platform account maintains stable updatedAt across re-initialization and module init", async () => {
    const { identityRepository: repo1 } = createTestHarness();
    const seeded1 = await repo1.ensureDefaultPlatformAccount();
    const initialUpdatedAt = seeded1.principal.updatedAt;

    // Create second instance and copy state to simulate persistent backend restart
    const { identityRepository: repo2 } = createTestHarness();
    await repo2.onModuleInit();

    for (const principal of repo1.listPrincipals()) {
      await repo2.ensurePrincipalRecord(principal);
    }
    for (const membership of repo1.listMemberships()) {
      await repo2.ensureMembershipRecord(membership);
    }
    for (const binding of repo1.listRoleBindings()) {
      await repo2.ensureRoleBindingRecord(binding);
    }

    const reseeded2 = await repo2.ensureDefaultPlatformAccount();
    await repo2.onModuleInit();

    expect(reseeded2.principal.updatedAt).toBe(initialUpdatedAt);
    expect(reseeded2.membership.updatedAt).toBe(initialUpdatedAt);

    const reloadedPrincipal = await repo2.findPrincipalById(
      "principal_platform_admin_default",
    );
    expect(reloadedPrincipal?.updatedAt).toBe(initialUpdatedAt);
  });
});
