import { describe, expect, it, beforeEach } from "vitest";
import { IdentityContext } from "../../apps/api/src/common/auth/auth.types";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { PrivilegedRoleRequestService } from "../../apps/api/src/modules/identity/privileged-role-request.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { PlatformAdminService } from "../../apps/api/src/modules/platform-admin/platform-admin.service";
import { ApiRequestError } from "../../apps/api/src/common/api-envelope";

describe("IAM-RBAC-002 Privileged Role Request Approval Expiry and Removal Integration", () => {
  let identityRepository: IdentityRepository;
  let tenantPartnerService: TenantPartnerService;
  let platformAdminService: PlatformAdminService;
  let service: PrivilegedRoleRequestService;

  const userA: IdentityContext = {
    actorId: "usr_alice",
    userId: "usr_alice",
    email: "alice@example.com",
    realm: "tenant",
    actorType: "tenant_user",
    roles: ["tenant_admin"],
    roleFamilies: ["tenant"],
    scopes: ["*"],
    tenantId: "ten_test_001",
    authMode: "jwt",
    amr: ["mfa", "totp"],
    authTime: Math.floor(Date.now() / 1000),
  };

  const userB: IdentityContext = {
    actorId: "usr_bob",
    userId: "usr_bob",
    email: "bob@example.com",
    realm: "tenant",
    actorType: "tenant_user",
    roles: ["tenant_admin"],
    roleFamilies: ["tenant"],
    scopes: ["*"],
    tenantId: "ten_test_001",
    authMode: "jwt",
    amr: ["mfa", "totp"],
    authTime: Math.floor(Date.now() / 1000),
  };

  const userC: IdentityContext = {
    actorId: "usr_charlie",
    userId: "usr_charlie",
    email: "charlie@example.com",
    realm: "tenant",
    actorType: "tenant_user",
    roles: ["tenant_viewer"],
    roleFamilies: ["tenant"],
    scopes: ["read"],
    tenantId: "ten_test_001",
    authMode: "jwt",
    amr: ["pwd"],
    authTime: Math.floor(Date.now() / 1000),
  };

  beforeEach(() => {
    identityRepository = new IdentityRepository();

    // Mock tenant partner service with 2 active admins
    tenantPartnerService = {
      listTenantUsers: () => [
        { userId: "usr_alice", email: "alice@example.com", roleCode: "tenant_admin", status: "active" },
        { userId: "usr_bob", email: "bob@example.com", roleCode: "tenant_admin", status: "active" },
        { userId: "usr_charlie", email: "charlie@example.com", roleCode: "tenant_viewer", status: "active" },
      ],
      requireTenantUser: (tId: string, uId: string) => ({
        userId: uId,
        email: `${uId}@example.com`,
        roleCode: "tenant_viewer",
        status: "active",
      }),
      updateTenantUserRole: () => ({}),
    } as unknown as TenantPartnerService;

    platformAdminService = {
      listPlatformAdminUsers: () => [
        { userId: "usr_alice", email: "alice@example.com", roleCode: "superadmin", status: "active" },
        { userId: "usr_bob", email: "bob@example.com", roleCode: "superadmin", status: "active" },
      ],
      getPlatformAdminUser: (uId: string) => ({
        userId: uId,
        email: `${uId}@example.com`,
        roleCode: "operator",
        status: "active",
      }),
      updatePlatformAdminUserRole: () => ({}),
    } as unknown as PlatformAdminService;

    service = new PrivilegedRoleRequestService(
      identityRepository,
      tenantPartnerService,
      platformAdminService,
    );
  });

  it("1. Requester cannot approve own grant (Separation of Duties / SoD)", async () => {
    const created = await service.createRequest(
      "ten_test_001",
      {
        targetUserId: "usr_charlie",
        roleCode: "tenant_admin",
        validFrom: new Date().toISOString(),
        reasonCode: "REASON_PROMOTION",
      },
      userA,
    );

    expect(created.status).toBe("pending");
    expect(created.requestedByUserId).toBe("usr_alice");

    // Alice attempts to approve her own request -> Must fail with 403 IAM_SELF_APPROVAL_DENIED
    try {
      await service.approveRequest(
        created.requestId,
        {
          requestId: created.requestId,
          reasonCode: "SELF_APPROVE_TRY",
          expectedVersion: 1,
        },
        userA,
      );
      expect.unreachable("Should have failed self-approval check");
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.getStatus()).toBe(403);
      expect(err.code).toBe("IAM_SELF_APPROVAL_DENIED");
    }
  });

  it("2. Target user cannot approve self-escalation", async () => {
    const created = await service.createRequest(
      "ten_test_001",
      {
        targetUserId: "usr_charlie",
        roleCode: "tenant_admin",
        validFrom: new Date().toISOString(),
        reasonCode: "REASON_ELEVATION",
      },
      userA,
    );

    // Target user Charlie (with fresh MFA) attempts to approve his own grant -> Must fail with 403 IAM_SELF_ESCALATION_DENIED
    const charlieFreshMfa: IdentityContext = {
      ...userC,
      amr: ["mfa", "totp"],
      authTime: Math.floor(Date.now() / 1000),
    };

    try {
      await service.approveRequest(
        created.requestId,
        {
          requestId: created.requestId,
          reasonCode: "SELF_ESCALATION_TRY",
          expectedVersion: 1,
        },
        charlieFreshMfa,
      );
      expect.unreachable("Should have failed self-escalation check");
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.getStatus()).toBe(403);
      expect(err.code).toBe("IAM_SELF_ESCALATION_DENIED");
    }
  });

  it("3. Fresh MFA proof requirement fails without MFA and succeeds with MFA", async () => {
    const created = await service.createRequest(
      "ten_test_001",
      {
        targetUserId: "usr_charlie",
        roleCode: "tenant_admin",
        validFrom: new Date().toISOString(),
        reasonCode: "REASON_PROMOTION",
      },
      userA,
    );

    // Approver Bob without MFA claims -> Must fail with 401 IAM_STEP_UP_REQUIRED
    const bobNoMfa: IdentityContext = {
      ...userB,
      amr: ["pwd"],
      authTime: Math.floor(Date.now() / 1000),
    };

    await expect(
      service.approveRequest(
        created.requestId,
        {
          requestId: created.requestId,
          reasonCode: "APPROVE_NO_MFA",
          expectedVersion: 1,
        },
        bobNoMfa,
      ),
    ).rejects.toThrowError(ApiRequestError);

    // Approver Bob with fresh MFA -> Succeeds
    const approved = await service.approveRequest(
      created.requestId,
      {
        requestId: created.requestId,
        reasonCode: "APPROVE_WITH_MFA",
        expectedVersion: 1,
      },
      userB,
    );

    expect(approved.status).toBe("active");
    expect(approved.approvedByUserId).toBe("usr_bob");
  });

  it("4. Optimistic concurrency control (expectedVersion mismatch throws 409)", async () => {
    const created = await service.createRequest(
      "ten_test_001",
      {
        targetUserId: "usr_charlie",
        roleCode: "tenant_admin",
        validFrom: new Date().toISOString(),
        reasonCode: "REASON_PROMOTION",
      },
      userA,
    );

    // Outdated version expectedVersion = 99 -> Must fail with 409 IAM_CONCURRENCY_CONFLICT
    try {
      await service.approveRequest(
        created.requestId,
        {
          requestId: created.requestId,
          reasonCode: "APPROVE_CONFLICT",
          expectedVersion: 99,
        },
        userB,
      );
      expect.unreachable("Should have failed concurrency check");
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.getStatus()).toBe(409);
      expect(err.code).toBe("IAM_CONCURRENCY_CONFLICT");
    }
  });

  it("5. Effective window activation and automatic expiry workflow", async () => {
    const now = Date.now();
    const validFrom = new Date(now + 2000).toISOString(); // 2 seconds in future
    const validTo = new Date(now + 5000).toISOString(); // 5 seconds in future

    const created = await service.createRequest(
      "ten_test_001",
      {
        targetUserId: "usr_charlie",
        roleCode: "tenant_admin",
        validFrom,
        validTo,
        reasonCode: "FUTURE_GRANT",
      },
      userA,
    );

    // Approved by Bob while validFrom is still in future
    const approved = await service.approveRequest(
      created.requestId,
      {
        requestId: created.requestId,
        reasonCode: "APPROVE_FUTURE",
        expectedVersion: 1,
      },
      userB,
    );

    expect(approved.status).toBe("approved"); // Stays approved until validFrom

    // Process expiries before validFrom -> 0 activated
    const early = await service.processExpiries(new Date(now).toISOString());
    expect(early.activatedCount).toBe(0);

    // Process expiries when validFrom has passed (now + 3000ms) -> Activated!
    const activeResult = await service.processExpiries(new Date(now + 3000).toISOString());
    expect(activeResult.activatedCount).toBe(1);

    const activeReq = service.getRequest(created.requestId);
    expect(activeReq.status).toBe("active");

    // Process expiries when validTo has passed (now + 6000ms) -> Expired!
    const expiredResult = await service.processExpiries(new Date(now + 6000).toISOString());
    expect(expiredResult.expiredCount).toBe(1);

    const expiredReq = service.getRequest(created.requestId);
    expect(expiredReq.status).toBe("expired");
  });

  it("6. Last-Admin invariant protection prevents removing/expiring the last admin", async () => {
    // Override tenantPartnerService to have only 1 active admin
    (tenantPartnerService as any).listTenantUsers = () => [
      { userId: "usr_alice", email: "alice@example.com", roleCode: "tenant_admin", status: "active" },
      { userId: "usr_charlie", email: "charlie@example.com", roleCode: "tenant_viewer", status: "active" },
    ];

    // User B (Bob) creates a grant request for Alice
    const created = await service.createRequest(
      "ten_test_001",
      {
        targetUserId: "usr_alice",
        roleCode: "tenant_admin",
        validFrom: new Date().toISOString(),
        reasonCode: "ALICE_ADMIN_GRANT",
      },
      userB,
    );

    // Approved and active for Alice (approved by Charlie with fresh MFA)
    const charlieFreshMfa: IdentityContext = {
      ...userC,
      amr: ["mfa", "totp"],
      authTime: Math.floor(Date.now() / 1000),
    };

    const active = await service.approveRequest(
      created.requestId,
      {
        requestId: created.requestId,
        reasonCode: "APPROVE_ALICE",
        expectedVersion: 1,
      },
      charlieFreshMfa,
    );

    expect(active.status).toBe("active");

    // Attempting to remove Alice's grant when she is the last active admin -> Must fail with 422 IAM_LAST_ADMIN_INVARIANT_VIOLATED
    try {
      await service.removeGrant(
        created.requestId,
        {
          requestId: created.requestId,
          reasonCode: "REMOVE_LAST_ADMIN",
          expectedVersion: active.version,
        },
        userB,
      );
      expect.unreachable("Should have failed last-admin invariant check");
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.getStatus()).toBe(422);
      expect(err.code).toBe("IAM_LAST_ADMIN_INVARIANT_VIOLATED");
    }
  });

  it("7. Role change revokes active sessions for target principal", async () => {
    // Create active session in IdentityRepository for Charlie
    const session = await identityRepository.createSession({
      principalId: "usr_charlie",
      membershipId: "mem_charlie",
      realm: "tenant",
      status: "active",
      authTime: new Date().toISOString(),
      authMethods: ["pwd"],
      tokenVersion: 1,
      idleExpiresAt: null,
      absoluteExpiresAt: new Date(Date.now() + 86400000).toISOString(),
      deviceSummary: {},
      riskSummary: {},
    });

    expect(session.status).toBe("active");

    const created = await service.createRequest(
      "ten_test_001",
      {
        targetUserId: "usr_charlie",
        roleCode: "tenant_admin",
        validFrom: new Date().toISOString(),
        reasonCode: "PROMOTION_REVOKES_SESSIONS",
      },
      userA,
    );

    // Approve grant -> Activates role and revokes active sessions for Charlie
    await service.approveRequest(
      created.requestId,
      {
        requestId: created.requestId,
        reasonCode: "APPROVE_PROMOTION",
        expectedVersion: 1,
      },
      userB,
    );

    // Inspect session state for Charlie
    const updatedSessions = await identityRepository.listSessionsByPrincipal("usr_charlie");
    expect(updatedSessions[0].status).toBe("revoked");
    expect(updatedSessions[0].revokeReason).toBe("PRIVILEGED_ROLE_GRANTED");
  });
});
