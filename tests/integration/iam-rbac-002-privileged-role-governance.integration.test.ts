import { describe, expect, it, beforeEach } from "vitest";
const HttpStatus = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
};
import type { IdentityContext, CanonicalIdentitySessionRecord } from "@drts/contracts";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { PrivilegedRoleGovernanceService } from "../../apps/api/src/modules/identity/privileged-role-governance.service";

function createMockIdentity(overrides: Partial<IdentityContext> = {}): IdentityContext {
  return {
    actorType: "tenant_admin",
    actorId: "usr_requester_001",
    realm: "tenant",
    authMode: "jwt_bearer",
    roleFamilies: ["tenant"],
    roles: ["tenant_admin"],
    scopes: ["tenant:write"],
    tenantId: "ten_test_001",
    ...overrides,
  } as IdentityContext;
}

function createTestSession(overrides: Partial<CanonicalIdentitySessionRecord> = {}): CanonicalIdentitySessionRecord {
  return {
    sessionId: `sess_${Math.random()}`,
    sourceRef: "test",
    principalId: "usr_test",
    membershipId: null,
    realm: "tenant",
    status: "active",
    authTime: new Date().toISOString(),
    authMethods: ["jwt"],
    tokenVersion: 1,
    idleExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    absoluteExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    revokedAt: null,
    revokedByPrincipalId: null,
    revokeReason: null,
    deviceSummary: null,
    riskSummary: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    record: {},
    ...overrides,
  } as CanonicalIdentitySessionRecord;
}

describe("IAM-RBAC-002 Privileged Role Governance Integration", () => {
  let identityRepo: IdentityRepository;
  let service: PrivilegedRoleGovernanceService;

  beforeEach(() => {
    identityRepo = new IdentityRepository();
    service = new PrivilegedRoleGovernanceService(identityRepo);
  });

  describe("1. Separation of Duties (SoD) & No Self-Approval", () => {
    it("rejects approval when requester attempts to approve their own privileged role request", async () => {
      const requester = createMockIdentity({ actorId: "usr_alice", tenantId: "ten_alpha" });
      const request = service.createRequest(
        {
          targetUserId: "usr_alice",
          roleCode: "tenant_admin",
          reason: "Needs elevated admin rights for audit",
          tenantId: "ten_alpha",
        },
        requester,
      );

      expect(request.status).toBe("pending");
      expect(request.requesterPrincipalId).toBe("usr_alice");

      // Self-approval attempt
      await expect(
        service.approveRequest(request.requestId, requester),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
          code: "IAM_SOD_VIOLATION",
        }),
      );
    });

    it("rejects approval when target user attempts to approve request created for them by another", async () => {
      const requester = createMockIdentity({ actorId: "usr_bob", tenantId: "ten_alpha" });
      const targetUser = createMockIdentity({ actorId: "usr_alice", tenantId: "ten_alpha" });

      const request = service.createRequest(
        {
          targetUserId: "usr_alice",
          roleCode: "tenant_finance_admin",
          reason: "Role upgrade request",
          tenantId: "ten_alpha",
        },
        requester,
      );

      // Target user trying to self-approve
      await expect(
        service.approveRequest(request.requestId, targetUser),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
          code: "IAM_SOD_VIOLATION",
        }),
      );
    });

    it("rejects request or approval for toxic/incompatible role combinations (SoD policy)", async () => {
      const requester = createMockIdentity({ actorId: "usr_alice", tenantId: "ten_alpha" });

      // Seed active grant tenant_finance_admin for usr_target_sod
      service.registerActiveGrant("usr_target_sod", "ten_alpha", "tenant_finance_admin");

      // Attempt to create request for toxic role tenant_security_admin for usr_target_sod
      expect(() =>
        service.createRequest(
          {
            targetUserId: "usr_target_sod",
            roleCode: "tenant_security_admin",
            reason: "Adding security admin powers",
            tenantId: "ten_alpha",
          },
          requester,
        ),
      ).toThrowError(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
          code: "IAM_SOD_VIOLATION",
        }),
      );

      // Attempt to create request for toxic role tenant_admin for usr_target_sod
      expect(() =>
        service.createRequest(
          {
            targetUserId: "usr_target_sod",
            roleCode: "tenant_admin",
            reason: "Adding admin powers to finance admin",
            tenantId: "ten_alpha",
          },
          requester,
        ),
      ).toThrowError(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
          code: "IAM_SOD_VIOLATION",
        }),
      );
    });
  });

  describe("2. Independent Approval & Stale Session Invalidation", () => {
    it("allows an independent approver to approve grant and revokes target user's active sessions", async () => {
      const requester = createMockIdentity({ actorId: "usr_alice", tenantId: "ten_alpha" });
      const approver = createMockIdentity({ actorId: "usr_charlie_admin", tenantId: "ten_alpha" });

      // Create an active session for the target user in IdentityRepository
      const targetSession = await identityRepo.createSession(
        createTestSession({
          sessionId: "sess_target_001",
          principalId: "usr_bob",
          actorId: "usr_bob",
          realm: "tenant",
          roles: ["tenant_viewer"],
          scopes: ["tenant:read"],
          tenantId: "ten_alpha",
        }),
      );

      expect(targetSession.status).toBe("active");

      // Submit privileged role request for usr_bob
      const request = service.createRequest(
        {
          targetUserId: "usr_bob",
          roleCode: "tenant_admin",
          reason: "Promotion to tenant admin",
          tenantId: "ten_alpha",
        },
        requester,
      );

      // Independent approval by usr_charlie_admin
      const { request: approvedRequest, grant } = await service.approveRequest(
        request.requestId,
        approver,
      );

      expect(approvedRequest.status).toBe("approved");
      expect(approvedRequest.approverPrincipalId).toBe("usr_charlie_admin");
      expect(grant.status).toBe("active");
      expect(grant.roleCode).toBe("tenant_admin");

      // Verify that active session for usr_bob was revoked upon role change
      const sessions = await identityRepo.listSessionsByPrincipal("usr_bob");
      const revokedSession = sessions.find((s) => s.sessionId === "sess_target_001");
      expect(revokedSession).toBeDefined();
      expect(revokedSession?.status).toBe("revoked");
      expect(revokedSession?.revokeReason).toBe("PRIVILEGED_ROLE_APPROVED");
    });
  });

  describe("3. Time-Bound Activation & Expiry (validFrom / validTo)", () => {
    it("correctly identifies active grants vs future/expired grants based on validFrom and validTo", async () => {
      const nowMs = Date.now();
      const pastFrom = new Date(nowMs - 3600000).toISOString();
      const futureTo = new Date(nowMs + 3600000).toISOString();
      const pastTo = new Date(nowMs - 1000).toISOString();

      // Register an active grant valid now
      const activeGrant = service.registerActiveGrant("usr_active", "ten_alpha", "tenant_admin");
      activeGrant.validFrom = pastFrom;
      activeGrant.validTo = futureTo;
      (service as any).grants.set(activeGrant.grantId, activeGrant);

      // Manually add a grant with past validTo
      const expiredGrant = service.registerActiveGrant("usr_expired", "ten_alpha", "tenant_finance_admin");
      expiredGrant.validTo = pastTo;
      (service as any).grants.set(expiredGrant.grantId, expiredGrant);

      // Create session for expired user
      await identityRepo.createSession(
        createTestSession({
          sessionId: "sess_expired_user",
          principalId: "usr_expired",
          actorId: "usr_expired",
          realm: "tenant",
          roles: ["tenant_finance_admin"],
          scopes: ["tenant:read"],
          tenantId: "ten_alpha",
        }),
      );

      // Run automatic expiry processing
      const expired = await service.expireStaleGrants(nowMs);

      expect(expired).toHaveLength(1);
      expect(expired[0]?.grantId).toBe(expiredGrant.grantId);
      expect(expired[0]?.status).toBe("expired");

      // Verify session for expired grant was revoked
      const sessions = await identityRepo.listSessionsByPrincipal("usr_expired");
      expect(sessions[0]?.status).toBe("revoked");
      expect(sessions[0]?.revokeReason).toBe("PRIVILEGED_ROLE_EXPIRED");
    });
  });

  describe("4. Last-Admin Invariant Protection", () => {
    it("blocks removing or demoting the last active admin for a tenant", async () => {
      const adminActor = createMockIdentity({ actorId: "usr_admin_solo", tenantId: "ten_beta" });

      // Register sole admin
      service.registerActiveGrant("usr_admin_solo", "ten_beta", "tenant_admin");

      // Attempt to remove sole admin
      await expect(
        service.removeGrant(
          {
            targetUserId: "usr_admin_solo",
            roleCode: "tenant_admin",
            tenantId: "ten_beta",
            reason: "Offboarding attempt",
          },
          adminActor,
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.CONFLICT,
          code: "IAM_LAST_ADMIN_PROTECTION",
        }),
      );
    });

    it("allows removing an admin when another active admin exists for the tenant", async () => {
      const adminActor = createMockIdentity({ actorId: "usr_admin_two", tenantId: "ten_beta" });

      // Register two admins
      service.registerActiveGrant("usr_admin_one", "ten_beta", "tenant_admin");
      service.registerActiveGrant("usr_admin_two", "ten_beta", "tenant_admin");

      // Remove admin one
      const removed = await service.removeGrant(
        {
          targetUserId: "usr_admin_one",
          roleCode: "tenant_admin",
          tenantId: "ten_beta",
          reason: "Role demotion",
        },
        adminActor,
      );

      expect(removed.status).toBe("removed");
    });

    it("prevents concurrent-removal race when removing last 2 admins simultaneously", async () => {
      const actor = createMockIdentity({ actorId: "usr_actor", tenantId: "ten_concurrent_admin" });

      // Seed exactly 2 active admins for tenant ten_concurrent_admin
      service.registerActiveGrant("usr_admin_race_1", "ten_concurrent_admin", "tenant_admin");
      service.registerActiveGrant("usr_admin_race_2", "ten_concurrent_admin", "tenant_admin");

      // Concurrent removal attempts for both admins
      const remove1 = service.removeGrant(
        {
          targetUserId: "usr_admin_race_1",
          roleCode: "tenant_admin",
          tenantId: "ten_concurrent_admin",
          reason: "Simultaneous removal attempt 1",
        },
        actor,
      );

      const remove2 = service.removeGrant(
        {
          targetUserId: "usr_admin_race_2",
          roleCode: "tenant_admin",
          tenantId: "ten_concurrent_admin",
          reason: "Simultaneous removal attempt 2",
        },
        actor,
      );

      const results = await Promise.allSettled([remove1, remove2]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Exactly one removal succeeds and one is rejected due to atomic last-admin protection
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      if (rejected[0]?.status === "rejected") {
        expect(rejected[0].reason).toEqual(
          expect.objectContaining({
            status: HttpStatus.CONFLICT,
            code: "IAM_LAST_ADMIN_PROTECTION",
          }),
        );
      }

      // Verify that at least 1 active admin remains
      const remainingGrants = service.listGrants("ten_concurrent_admin").filter((g) => g.status === "active");
      expect(remainingGrants).toHaveLength(1);
    });
  });

  describe("5. Approval Concurrency Isolation & Optimistic Locking", () => {
    it("enforces concurrency isolation and rejects second approval call with IAM_CONCURRENCY_CONFLICT", async () => {
      const requester = createMockIdentity({ actorId: "usr_alice", tenantId: "ten_gamma" });
      const approver1 = createMockIdentity({ actorId: "usr_approver_1", tenantId: "ten_gamma" });
      const approver2 = createMockIdentity({ actorId: "usr_approver_2", tenantId: "ten_gamma" });

      const request = service.createRequest(
        {
          targetUserId: "usr_dave",
          roleCode: "tenant_security_admin",
          reason: "Security operational escalation",
          tenantId: "ten_gamma",
        },
        requester,
      );

      expect(request.version).toBe(1);

      // First approver approves with expectedVersion 1
      const { request: app1 } = await service.approveRequest(
        request.requestId,
        approver1,
        { approvalRequestId: request.requestId, mutation: { reasonCode: "GOV_APPROVE", expectedVersion: 1 } },
      );

      expect(app1.status).toBe("approved");
      expect(app1.version).toBe(2);

      // Second approver attempts to approve the same request
      await expect(
        service.approveRequest(
          request.requestId,
          approver2,
          { approvalRequestId: request.requestId, mutation: { reasonCode: "GOV_APPROVE", expectedVersion: 1 } },
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.CONFLICT,
          code: "IAM_CONCURRENCY_CONFLICT",
        }),
      );
    });
  });

  describe("6. Rejection Workflow", () => {
    it("allows independent actor to reject a request", async () => {
      const requester = createMockIdentity({ actorId: "usr_alice", tenantId: "ten_delta" });
      const rejector = createMockIdentity({ actorId: "usr_manager", tenantId: "ten_delta" });

      const request = service.createRequest(
        {
          targetUserId: "usr_eve",
          roleCode: "tenant_admin",
          reason: "Unjustified access request",
          tenantId: "ten_delta",
        },
        requester,
      );

      const rejected = service.rejectRequest(request.requestId, rejector, {
        approvalRequestId: request.requestId,
        reason: "Access denied by security manager",
      });

      expect(rejected.status).toBe("rejected");
      expect(rejected.approvalDecision).toBe("reject");
      expect(rejected.approverPrincipalId).toBe("usr_manager");
    });
  });
});
