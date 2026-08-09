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
    authMethods: ["jwt", "mfa"],
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
      const request = await service.createRequest(
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

      const request = await service.createRequest(
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
      await service.registerActiveGrant("usr_target_sod", "ten_alpha", "tenant_finance_admin");

      // Attempt to create request for toxic role tenant_security_admin for usr_target_sod
      await expect(
        service.createRequest(
          {
            targetUserId: "usr_target_sod",
            roleCode: "tenant_security_admin",
            reason: "Adding security admin powers",
            tenantId: "ten_alpha",
          },
          requester,
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
          code: "IAM_SOD_VIOLATION",
        }),
      );

      // Attempt to create request for toxic role tenant_admin for usr_target_sod
      await expect(
        service.createRequest(
          {
            targetUserId: "usr_target_sod",
            roleCode: "tenant_admin",
            reason: "Adding admin powers to finance admin",
            tenantId: "ten_alpha",
          },
          requester,
        ),
      ).rejects.toThrowError(
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
      const request = await service.createRequest(
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
    it("correctly handles future validFrom activation window and expiry processing", async () => {
      const nowMs = Date.now();
      const pastFrom = new Date(nowMs - 3600000).toISOString();
      const futureTo = new Date(nowMs + 3600000).toISOString();
      const pastTo = new Date(nowMs - 1000).toISOString();

      // Register an active grant valid now
      const activeGrant = await service.registerActiveGrant(
        "usr_active",
        "ten_alpha",
        "tenant_admin",
        "tenant",
        pastFrom,
        futureTo,
      );

      // Register a grant with past validTo
      const expiredGrant = await service.registerActiveGrant(
        "usr_expired",
        "ten_alpha",
        "tenant_finance_admin",
        "tenant",
        pastFrom,
        pastTo,
      );

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

      expect(expired.some((g) => g.grantId === expiredGrant.grantId)).toBe(true);

      // Verify session for expired grant was revoked
      const sessions = await identityRepo.listSessionsByPrincipal("usr_expired");
      expect(sessions[0]?.status).toBe("revoked");
      expect(sessions[0]?.revokeReason).toBe("PRIVILEGED_ROLE_EXPIRED");
    });

    it("creates pending_activation grant when validFrom is in the future and activates it later", async () => {
      const requester = createMockIdentity({ actorId: "usr_alice", tenantId: "ten_alpha" });
      const approver = createMockIdentity({ actorId: "usr_charlie_admin", tenantId: "ten_alpha" });
      const futureFrom = new Date(Date.now() + 3600000).toISOString();

      const request = await service.createRequest(
        {
          targetUserId: "usr_future_user",
          roleCode: "tenant_admin",
          reason: "Scheduled admin access",
          tenantId: "ten_alpha",
          validFrom: futureFrom,
        },
        requester,
      );

      const { grant } = await service.approveRequest(request.requestId, approver);
      expect(grant.status).toBe("pending_activation");

      // Verify user has no active grants yet
      const activeGrantsBefore = await service.getActiveGrantsForUser("usr_future_user", Date.now());
      expect(activeGrantsBefore).toHaveLength(0);

      // Simulate time passing to validFrom
      await service.expireStaleGrants(new Date(futureFrom).getTime() + 1000);

      // Verify grant is now active
      const activeGrantsAfter = await service.getActiveGrantsForUser(
        "usr_future_user",
        new Date(futureFrom).getTime() + 1000,
      );
      expect(activeGrantsAfter).toHaveLength(1);
      expect(activeGrantsAfter[0]?.roleCode).toBe("tenant_admin");
    });

    it("rejects createRequest when validFrom >= validTo or validTo is in the past", async () => {
      const requester = createMockIdentity({ actorId: "usr_alice", tenantId: "ten_alpha" });
      const nowMs = Date.now();

      // validFrom >= validTo
      await expect(
        service.createRequest(
          {
            targetUserId: "usr_target_time",
            roleCode: "tenant_admin",
            reason: "Invalid time window test",
            tenantId: "ten_alpha",
            validFrom: new Date(nowMs + 7200000).toISOString(),
            validTo: new Date(nowMs + 3600000).toISOString(),
          },
          requester,
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
          code: "IAM_INVALID_TIME_RANGE",
        }),
      );

      // validTo in the past (with validFrom earlier than validTo)
      await expect(
        service.createRequest(
          {
            targetUserId: "usr_target_time",
            roleCode: "tenant_admin",
            reason: "Past validTo test",
            tenantId: "ten_alpha",
            validFrom: new Date(nowMs - 5000).toISOString(),
            validTo: new Date(nowMs - 1000).toISOString(),
          },
          requester,
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
          code: "IAM_REQUEST_EXPIRED",
        }),
      );
    });

    it("rejects approveRequest when validTo has passed before approval and marks request expired", async () => {
      const requester = createMockIdentity({ actorId: "usr_alice", tenantId: "ten_alpha" });
      const approver = createMockIdentity({ actorId: "usr_charlie_admin", tenantId: "ten_alpha" });
      const nowMs = Date.now();

      // Seed a request whose validTo was in the future when created, but is now in the past
      const pastTo = new Date(nowMs - 1000).toISOString();
      const futureFrom = new Date(nowMs - 5000).toISOString();

      // We bypass createRequest time check by directly inserting into repo/map to simulate time progression past validTo before approval
      const request = await service.createRequest(
        {
          targetUserId: "usr_expired_before_approve",
          roleCode: "tenant_admin",
          reason: "Approval boundary test",
          tenantId: "ten_alpha",
          validFrom: futureFrom,
          validTo: new Date(nowMs + 5000).toISOString(),
        },
        requester,
      );

      // Mutate request validTo to be past nowMs to simulate time passing before approval
      (request as any).validTo = pastTo;
      if (identityRepo) {
        await identityRepo.savePrivilegedRoleRequest(request);
      }

      await expect(
        service.approveRequest(request.requestId, approver),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.CONFLICT,
          code: "IAM_REQUEST_EXPIRED",
        }),
      );

      // Request status should now be updated to expired
      const updatedReq = await service.getRequest(request.requestId, approver);
      expect(updatedReq?.status).toBe("expired");

      // No grant should have been created
      const grants = await service.listGrants("ten_alpha");
      expect(grants.some((g) => g.requestId === request.requestId)).toBe(false);
    });
  });

  describe("4. Last-Admin Invariant Protection", () => {
    it("blocks removing or demoting the last active admin for a tenant", async () => {
      const adminActor = createMockIdentity({ actorId: "usr_admin_solo", tenantId: "ten_beta" });

      // Register sole admin
      await service.registerActiveGrant("usr_admin_solo", "ten_beta", "tenant_admin");

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
      await service.registerActiveGrant("usr_admin_one", "ten_beta", "tenant_admin");
      await service.registerActiveGrant("usr_admin_two", "ten_beta", "tenant_admin");

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
      await service.registerActiveGrant("usr_admin_race_1", "ten_concurrent_admin", "tenant_admin");
      await service.registerActiveGrant("usr_admin_race_2", "ten_concurrent_admin", "tenant_admin");

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
      const remainingGrants = (await service.listGrants("ten_concurrent_admin")).filter(
        (g) => g.status === "active",
      );
      expect(remainingGrants).toHaveLength(1);
    });
  });

  describe("5. Approval Concurrency Isolation & Optimistic Locking", () => {
    it("enforces concurrency isolation and rejects second approval call with IAM_CONCURRENCY_CONFLICT", async () => {
      const requester = createMockIdentity({ actorId: "usr_alice", tenantId: "ten_gamma" });
      const approver1 = createMockIdentity({ actorId: "usr_approver_1", tenantId: "ten_gamma" });
      const approver2 = createMockIdentity({ actorId: "usr_approver_2", tenantId: "ten_gamma" });

      const request = await service.createRequest(
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

      const request = await service.createRequest(
        {
          targetUserId: "usr_eve",
          roleCode: "tenant_admin",
          reason: "Unjustified access request",
          tenantId: "ten_delta",
        },
        requester,
      );

      const rejected = await service.rejectRequest(request.requestId, rejector, {
        approvalRequestId: request.requestId,
        reason: "Access denied by security manager",
      });

      expect(rejected.status).toBe("rejected");
      expect(rejected.approvalDecision).toBe("reject");
      expect(rejected.approverPrincipalId).toBe("usr_manager");
    });

    it("rejects rejection when requester attempts to reject their own request (IAM_SOD_VIOLATION)", async () => {
      const requester = createMockIdentity({ actorId: "usr_alice", tenantId: "ten_delta" });

      const request = await service.createRequest(
        {
          targetUserId: "usr_eve",
          roleCode: "tenant_admin",
          reason: "Requester self-rejection test",
          tenantId: "ten_delta",
        },
        requester,
      );

      await expect(
        service.rejectRequest(request.requestId, requester, {
          approvalRequestId: request.requestId,
          reason: "Self rejection attempt",
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
          code: "IAM_SOD_VIOLATION",
        }),
      );
    });

    it("rejects rejection when target user attempts to reject request created for them (IAM_SOD_VIOLATION)", async () => {
      const requester = createMockIdentity({ actorId: "usr_alice", tenantId: "ten_delta" });
      const targetUser = createMockIdentity({ actorId: "usr_eve", tenantId: "ten_delta" });

      const request = await service.createRequest(
        {
          targetUserId: "usr_eve",
          roleCode: "tenant_admin",
          reason: "Target user self-rejection test",
          tenantId: "ten_delta",
        },
        requester,
      );

      await expect(
        service.rejectRequest(request.requestId, targetUser, {
          approvalRequestId: request.requestId,
          reason: "Target rejection attempt",
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
          code: "IAM_SOD_VIOLATION",
        }),
      );
    });

    it("rejects rejection when MFA step-up is missing or invalid (IAM_STEP_UP_REQUIRED)", async () => {
      const requester = createMockIdentity({ actorId: "usr_alice", tenantId: "ten_delta" });
      const noMfaRejector = createMockIdentity({
        actorId: "usr_manager",
        tenantId: "ten_delta",
        authMethods: ["jwt"], // Missing mfa
      });

      const request = await service.createRequest(
        {
          targetUserId: "usr_eve",
          roleCode: "tenant_admin",
          reason: "Step-up rejection test",
          tenantId: "ten_delta",
        },
        requester,
      );

      // Rejection without MFA or stepUpReference
      await expect(
        service.rejectRequest(request.requestId, noMfaRejector, {
          approvalRequestId: request.requestId,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.UNAUTHORIZED,
          code: "IAM_STEP_UP_REQUIRED",
        }),
      );

      // Rejection with INVALID_STEP_UP
      await expect(
        service.rejectRequest(request.requestId, noMfaRejector, {
          approvalRequestId: request.requestId,
          stepUpReference: "INVALID_STEP_UP",
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.UNAUTHORIZED,
          code: "IAM_STEP_UP_REQUIRED",
        }),
      );
    });
  });

  describe("7. Tenant Scoping, IDOR Protection & Verified MFA Step-Up", () => {
    it("prevents IDOR: tenant user cannot get or list requests from another tenant", async () => {
      const tenantAUser = createMockIdentity({ actorId: "usr_tenant_A", tenantId: "ten_A" });
      const tenantBUser = createMockIdentity({ actorId: "usr_tenant_B", tenantId: "ten_B" });

      const requestA = await service.createRequest(
        {
          targetUserId: "usr_target_A",
          roleCode: "tenant_admin",
          reason: "Tenant A request",
          tenantId: "ten_A",
        },
        tenantAUser,
      );

      // Tenant B user trying to access Request A (IDOR attempt)
      await expect(
        service.getRequest(requestA.requestId, tenantBUser),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
          code: "AUTHZ_SCOPE_DENIED",
        }),
      );

      // Tenant B user trying to list Tenant A requests
      await expect(
        service.listRequests(tenantBUser, "ten_A"),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
          code: "AUTHZ_SCOPE_DENIED",
        }),
      );
    });

    it("enforces signed tenant match when creating request or removing grant", async () => {
      const tenantAUser = createMockIdentity({ actorId: "usr_tenant_A", tenantId: "ten_A" });

      // Attempt to create request for ten_B using ten_A identity
      await expect(
        service.createRequest(
          {
            targetUserId: "usr_target",
            roleCode: "tenant_admin",
            reason: "Cross tenant attempt",
            tenantId: "ten_B",
          },
          tenantAUser,
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
          code: "AUTHZ_SCOPE_DENIED",
        }),
      );
    });

    it("rejects approval or grant removal when MFA step-up is missing or invalid", async () => {
      const noMfaApprover = createMockIdentity({
        actorId: "usr_no_mfa",
        tenantId: "ten_alpha",
        authMethods: ["jwt"], // Missing mfa
      });
      const requester = createMockIdentity({ actorId: "usr_alice", tenantId: "ten_alpha" });

      const request = await service.createRequest(
        {
          targetUserId: "usr_target_mfa",
          roleCode: "tenant_admin",
          reason: "Requires step up",
          tenantId: "ten_alpha",
        },
        requester,
      );

      // Approval attempt without MFA or stepUpReference
      await expect(
        service.approveRequest(request.requestId, noMfaApprover),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.UNAUTHORIZED,
          code: "IAM_STEP_UP_REQUIRED",
        }),
      );

      // Approval attempt with INVALID_STEP_UP
      await expect(
        service.approveRequest(request.requestId, noMfaApprover, {
          approvalRequestId: request.requestId,
          stepUpReference: "INVALID_STEP_UP",
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.UNAUTHORIZED,
          code: "IAM_STEP_UP_REQUIRED",
        }),
      );
    });
  });

  describe("8. DB Persistence via IdentityRepository", () => {
    it("persists requests and grants into IdentityRepository", async () => {
      const requester = createMockIdentity({ actorId: "usr_alice", tenantId: "ten_alpha" });
      const approver = createMockIdentity({ actorId: "usr_charlie", tenantId: "ten_alpha" });

      const request = await service.createRequest(
        {
          targetUserId: "usr_db_target",
          roleCode: "tenant_admin",
          reason: "DB persistence test",
          tenantId: "ten_alpha",
        },
        requester,
      );

      // Verify request is saved in repo
      const repoReq = await identityRepo.getPrivilegedRoleRequest(request.requestId);
      expect(repoReq).toBeDefined();
      expect(repoReq?.targetUserId).toBe("usr_db_target");

      // Approve request
      const { grant } = await service.approveRequest(request.requestId, approver);

      // Verify grant is saved in repo
      const repoGrants = await identityRepo.listPrivilegedRoleGrants("ten_alpha");
      expect(repoGrants.some((g) => g.grantId === grant.grantId)).toBe(true);
    });
  });

  describe("9. DB-Backed Concurrency & Advisory Locking Isolation", () => {
    it("enforces transaction-scoped advisory locking and last-admin invariant across concurrent DB sessions", async () => {
      const lockMap = new Map<string, Promise<void>>();
      const dbTables = {
        grants: new Map<string, any>(),
        requests: new Map<string, any>(),
        sessions: new Map<string, any>(),
      };

      const createMockClient = () => {
        let releaseLock: (() => void) | null = null;
        let heldLockKey: string | null = null;

        return {
          query: async (queryText: string, values?: any[]) => {
            const sql = queryText.trim();
            if (sql.startsWith("BEGIN")) {
              return { rows: [] };
            }
            if (sql.startsWith("COMMIT") || sql.startsWith("ROLLBACK")) {
              if (releaseLock && heldLockKey) {
                releaseLock();
                lockMap.delete(heldLockKey);
                heldLockKey = null;
                releaseLock = null;
              }
              return { rows: [] };
            }
            if (sql.includes("pg_advisory_xact_lock")) {
              const lockKey = (values?.[0] as string) || "global";
              while (lockMap.has(lockKey)) {
                await lockMap.get(lockKey);
              }
              let resolveFn!: () => void;
              const lockPromise = new Promise<void>((res) => {
                resolveFn = res;
              });
              lockMap.set(lockKey, lockPromise);
              heldLockKey = lockKey;
              releaseLock = resolveFn;
              return { rows: [] };
            }
            if (sql.includes("INSERT INTO iam.privileged_role_grants")) {
              const grantId = values?.[0];
              const recordJson = values?.[14];
              const record = typeof recordJson === "string" ? JSON.parse(recordJson) : recordJson;
              dbTables.grants.set(grantId, record);
              return { rows: [{ record }] };
            }
            if (sql.includes("SELECT record FROM iam.privileged_role_grants")) {
              const tenantId = values?.[0];
              const rows = Array.from(dbTables.grants.values())
                .filter((g) => !tenantId || g.tenantId === tenantId)
                .map((g) => ({ record: g }));
              return { rows };
            }
            if (sql.includes("UPDATE iam.identity_sessions")) {
              return { rows: [] };
            }
            return { rows: [] };
          },
          release: () => {
            if (releaseLock && heldLockKey) {
              releaseLock();
              lockMap.delete(heldLockKey);
              heldLockKey = null;
              releaseLock = null;
            }
          },
        };
      };

      const mockDbService: any = {
        isEnabled: () => true,
        connect: async () => createMockClient(),
        query: async (queryText: string, values?: any[]) => {
          const client = createMockClient();
          try {
            return await client.query(queryText, values);
          } finally {
            client.release();
          }
        },
      };

      const dbRepo = new IdentityRepository(mockDbService);
      const dbGovService = new PrivilegedRoleGovernanceService(dbRepo, undefined, mockDbService);

      const actor = createMockIdentity({ actorId: "usr_db_actor", tenantId: "ten_db_concurrent" });

      // Seed 2 active admins in DB repo
      await dbGovService.registerActiveGrant("usr_admin_db_1", "ten_db_concurrent", "tenant_admin");
      await dbGovService.registerActiveGrant("usr_admin_db_2", "ten_db_concurrent", "tenant_admin");

      // Concurrent removal attempts via DB service
      const remove1 = dbGovService.removeGrant(
        {
          targetUserId: "usr_admin_db_1",
          roleCode: "tenant_admin",
          tenantId: "ten_db_concurrent",
          reason: "DB concurrent remove 1",
        },
        actor,
      );

      const remove2 = dbGovService.removeGrant(
        {
          targetUserId: "usr_admin_db_2",
          roleCode: "tenant_admin",
          tenantId: "ten_db_concurrent",
          reason: "DB concurrent remove 2",
        },
        actor,
      );

      const results = await Promise.allSettled([remove1, remove2]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

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

      // Verify DB table still retains exactly 1 active admin
      const remainingGrants = await dbRepo.listPrivilegedRoleGrants("ten_db_concurrent");
      const activeAdmins = remainingGrants.filter((g) => g.status === "active");
      expect(activeAdmins).toHaveLength(1);
    });
  });

  describe("10. Durable Scheduler Worker Service", () => {
    it("runs background reconciliation on module init and handles tick cycle", async () => {
      const { PrivilegedRoleGovernanceSchedulerService } = await import(
        "../../apps/api/src/modules/identity/privileged-role-governance-scheduler.service"
      );

      const pastTo = new Date(Date.now() - 1000).toISOString();
      await service.registerActiveGrant(
        "usr_worker_expired",
        "ten_worker",
        "tenant_admin",
        "tenant",
        new Date(Date.now() - 3600000).toISOString(),
        pastTo,
      );

      const scheduler = new PrivilegedRoleGovernanceSchedulerService(service);
      scheduler.onModuleInit();

      // Trigger manual tick
      const count = await scheduler.tick();
      expect(count).toBeGreaterThanOrEqual(1);

      const grants = await service.listGrants("ten_worker");
      const expiredGrant = grants.find((g) => g.targetUserId === "usr_worker_expired");
      expect(expiredGrant?.status).toBe("expired");

      scheduler.onModuleDestroy();
    });
  });

  describe("11. Real DATABASE_URL-Backed Concurrent Removal Integration", () => {
    it.runIf(Boolean(process.env.DATABASE_URL))(
      "executes real pg_advisory_xact_lock transaction across concurrent connections when DATABASE_URL is set",
      async () => {
        const { DatabaseService } = await import("../../apps/api/src/common/db");
        const realDb = new DatabaseService();
        try {
          const repo = new IdentityRepository(realDb);
          const govService = new PrivilegedRoleGovernanceService(repo, undefined, realDb);
          const tenantId = `ten_real_pg_${Date.now()}`;
          const actor = createMockIdentity({ actorId: "usr_pg_actor", tenantId });

          await govService.registerActiveGrant("usr_admin_real_1", tenantId, "tenant_admin");
          await govService.registerActiveGrant("usr_admin_real_2", tenantId, "tenant_admin");

          const task1 = govService.removeGrant(
            {
              targetUserId: "usr_admin_real_1",
              roleCode: "tenant_admin",
              tenantId,
              reason: "Real PG concurrent 1",
            },
            actor,
          );

          const task2 = govService.removeGrant(
            {
              targetUserId: "usr_admin_real_2",
              roleCode: "tenant_admin",
              tenantId,
              reason: "Real PG concurrent 2",
            },
            actor,
          );

          const results = await Promise.allSettled([task1, task2]);
          const fulfilled = results.filter((r) => r.status === "fulfilled");
          const rejected = results.filter((r) => r.status === "rejected");

          expect(fulfilled).toHaveLength(1);
          expect(rejected).toHaveLength(1);

          const remaining = (await govService.listGrants(tenantId)).filter((g) => g.status === "active");
          expect(remaining).toHaveLength(1);
        } finally {
          await realDb.onModuleDestroy();
        }
      },
    );

    it.runIf(Boolean(process.env.DATABASE_URL))(
      "verifies that approveRequest marks request expired and persists the expired status in PostgreSQL database when validTo has passed",
      async () => {
        const { DatabaseService } = await import("../../apps/api/src/common/db");
        const realDb = new DatabaseService();
        try {
          const repo = new IdentityRepository(realDb);
          const govService = new PrivilegedRoleGovernanceService(repo, undefined, realDb);
          const tenantId = `ten_real_pg_exp_${Date.now()}`;
          const requester = createMockIdentity({ actorId: "usr_alice", tenantId });
          const approver = createMockIdentity({ actorId: "usr_charlie_admin", tenantId });
          const nowMs = Date.now();
          const pastTo = new Date(nowMs - 1000).toISOString();
          const futureFrom = new Date(nowMs - 5000).toISOString();

          // Seed a request whose validTo was in the future when created, but is now in the past
          const request = await govService.createRequest(
            {
              targetUserId: "usr_expired_pg_target",
              roleCode: "tenant_admin",
              reason: "PostgreSQL approval boundary test",
              tenantId,
              validFrom: futureFrom,
              validTo: new Date(nowMs + 5000).toISOString(),
            },
            requester,
          );

          // Mutate request validTo to be past nowMs to simulate time passing before approval
          (request as any).validTo = pastTo;
          await repo.savePrivilegedRoleRequest(request);

          // approveRequest should throw IAM_REQUEST_EXPIRED
          await expect(
            govService.approveRequest(request.requestId, approver),
          ).rejects.toThrowError(
            expect.objectContaining({
              status: HttpStatus.CONFLICT,
              code: "IAM_REQUEST_EXPIRED",
            }),
          );

          // Verify status stored in PostgreSQL database is 'expired'
          const storedReq = await repo.getPrivilegedRoleRequest(request.requestId);
          expect(storedReq).toBeDefined();
          expect(storedReq?.status).toBe("expired");
        } finally {
          await realDb.onModuleDestroy();
        }
      },
    );
  });

  describe("12. Server-side Approver Authorization Policy", () => {
    it("rejects approval, rejection, and removal when non-admin user with MFA attempts governance actions", async () => {
      const adminRequester = createMockIdentity({ actorId: "usr_admin_req", roles: ["tenant_admin"], tenantId: "ten_authz" });
      const nonAdminUser = createMockIdentity({ actorId: "usr_non_admin", actorType: "user", roles: ["driver"], scopes: ["identity:write"], tenantId: "ten_authz", authMethods: ["jwt", "mfa"] });

      // Create a pending request
      const request = await service.createRequest(
        {
          targetUserId: "usr_target_authz",
          roleCode: "tenant_security_admin",
          reason: "Needs security admin rights",
          tenantId: "ten_authz",
        },
        adminRequester,
      );

      // Non-admin attempts to approve -> fails 403 AUTHZ_SCOPE_DENIED
      await expect(
        service.approveRequest(request.requestId, nonAdminUser),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
          code: "AUTHZ_SCOPE_DENIED",
        }),
      );

      // Non-admin attempts to reject -> fails 403 AUTHZ_SCOPE_DENIED
      await expect(
        service.rejectRequest(request.requestId, nonAdminUser),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
          code: "AUTHZ_SCOPE_DENIED",
        }),
      );

      // Register an active grant for testing removal
      await service.registerActiveGrant("usr_target_grant", "ten_authz", "tenant_security_admin");

      // Non-admin attempts to remove -> fails 403 AUTHZ_SCOPE_DENIED
      await expect(
        service.removeGrant(
          {
            targetUserId: "usr_target_grant",
            roleCode: "tenant_security_admin",
            tenantId: "ten_authz",
            reason: "Revoke grant attempt",
          },
          nonAdminUser,
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
          code: "AUTHZ_SCOPE_DENIED",
        }),
      );
    });

    it("rejects governance actions when non-admin platform/ops identity with MFA attempts approval, rejection, or removal", async () => {
      const adminRequester = createMockIdentity({ actorId: "usr_admin_req", roles: ["tenant_admin"], tenantId: "ten_authz_ops" });
      const opsNonAdmin = createMockIdentity({
        actorId: "usr_ops_viewer",
        actorType: "ops_user",
        realm: "ops",
        roles: ["ops_viewer"],
        authMethods: ["jwt", "mfa"],
      });
      const platformNonAdmin = createMockIdentity({
        actorId: "usr_plat_operator",
        actorType: "ops_user",
        realm: "platform",
        roles: ["platform_operator"],
        authMethods: ["jwt", "mfa"],
      });

      const request = await service.createRequest(
        {
          targetUserId: "usr_target_ops_authz",
          roleCode: "tenant_admin",
          reason: "Testing ops non-admin governance rejection",
          tenantId: "ten_authz_ops",
        },
        adminRequester,
      );

      // Ops non-admin user attempts approve -> 403
      await expect(
        service.approveRequest(request.requestId, opsNonAdmin),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
          code: "AUTHZ_SCOPE_DENIED",
        }),
      );

      // Platform non-admin user attempts approve -> 403
      await expect(
        service.approveRequest(request.requestId, platformNonAdmin),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
          code: "AUTHZ_SCOPE_DENIED",
        }),
      );

      // Ops non-admin user attempts reject -> 403
      await expect(
        service.rejectRequest(request.requestId, opsNonAdmin),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
          code: "AUTHZ_SCOPE_DENIED",
        }),
      );

      // Platform non-admin user attempts remove -> 403
      await service.registerActiveGrant("usr_target_grant_ops", "ten_authz_ops", "tenant_admin");
      await expect(
        service.removeGrant(
          {
            targetUserId: "usr_target_grant_ops",
            roleCode: "tenant_admin",
            tenantId: "ten_authz_ops",
            reason: "Unauthorized remove attempt",
          },
          platformNonAdmin,
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
          code: "AUTHZ_SCOPE_DENIED",
        }),
      );
    });
  });

  describe("13. Process Expiries Endpoint System Authority Policy", () => {
    it("denies process-expiries for non-system identities and allows system identity", async () => {
      const { IdentityController } = await import(
        "../../apps/api/src/modules/identity/identity.controller"
      );
      const controller = new IdentityController(service);

      const tenantAdminUser = createMockIdentity({ actorId: "usr_tenant_admin", roles: ["tenant_admin"], realm: "tenant" });
      const systemIdentity = createMockIdentity({ actorId: "scheduler_system", actorType: "system", realm: "system" });

      // Non-system identity calls controller method -> fails 403
      await expect(
        controller.processExpiredPrivilegedRoleGrants(tenantAdminUser),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
          code: "AUTHZ_SCOPE_DENIED",
        }),
      );

      // Null identity calls controller method -> fails 403
      await expect(
        controller.processExpiredPrivilegedRoleGrants(null),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
          code: "AUTHZ_SCOPE_DENIED",
        }),
      );

      // System identity calls controller method -> succeeds
      const result = await controller.processExpiredPrivilegedRoleGrants(systemIdentity);
      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
    });
  });

  describe("14. Transactional Audit Event Requirement (IAM-AUD-001)", () => {
    it("fails privileged mutation when audit event persistence fails via recordEventRequired", async () => {
      const mockSecurityEventsService = {
        recordEventRequired: async () => {
          throw new Error("Audit log database disk full failure");
        },
      } as any;

      const failingService = new PrivilegedRoleGovernanceService(
        identityRepo,
        mockSecurityEventsService,
      );

      const requester = createMockIdentity({ actorId: "usr_alice", tenantId: "ten_audit_fail" });
      const approver = createMockIdentity({ actorId: "usr_bob", roles: ["tenant_admin"], tenantId: "ten_audit_fail" });

      // createRequest fails due to audit event failure
      await expect(
        failingService.createRequest(
          {
            targetUserId: "usr_charlie",
            roleCode: "tenant_admin",
            reason: "Audit failure test",
            tenantId: "ten_audit_fail",
          },
          requester,
        ),
      ).rejects.toThrowError("Audit log database disk full failure");

      // Verify no pending request was saved
      const requests = await failingService.listRequests(requester, "ten_audit_fail");
      expect(requests).toHaveLength(0);
    });

    it("records privileged_role.expired security audit event when approveRequest encounters expired validTo", async () => {
      const recordedEvents: any[] = [];
      const mockSecurityEventsService = {
        recordEventRequired: async (event: any) => {
          recordedEvents.push(event);
          return event;
        },
      } as any;

      const auditService = new PrivilegedRoleGovernanceService(
        identityRepo,
        mockSecurityEventsService,
      );

      const requester = createMockIdentity({ actorId: "usr_alice", tenantId: "ten_audit_exp" });
      const approver = createMockIdentity({ actorId: "usr_bob", roles: ["tenant_admin"], tenantId: "ten_audit_exp" });

      const nowMs = Date.now();
      const pastTo = new Date(nowMs - 1000).toISOString();
      const validFrom = new Date(nowMs - 5000).toISOString();

      const req = await auditService.createRequest(
        {
          targetUserId: "usr_charlie",
          roleCode: "tenant_admin",
          reason: "Audit expired test",
          tenantId: "ten_audit_exp",
          validFrom,
          validTo: new Date(nowMs + 5000).toISOString(),
        },
        requester,
      );

      (req as any).validTo = pastTo;
      await identityRepo.savePrivilegedRoleRequest(req);

      await expect(
        auditService.approveRequest(req.requestId, approver),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: HttpStatus.CONFLICT,
          code: "IAM_REQUEST_EXPIRED",
        }),
      );

      const expiredEvent = recordedEvents.find(
        (e) => e.eventType === "privileged_role.expired" && e.approvalId === req.requestId,
      );
      expect(expiredEvent).toBeDefined();
      expect(expiredEvent.actorId).toBe("usr_bob");
      expect(expiredEvent.outcome).toBe("expired");
    });

    it("records privileged_role.expired security audit event when expireStaleGrants encounters expired pending request", async () => {
      const recordedEvents: any[] = [];
      const mockSecurityEventsService = {
        recordEventRequired: async (event: any) => {
          recordedEvents.push(event);
          return event;
        },
      } as any;

      const auditService = new PrivilegedRoleGovernanceService(
        identityRepo,
        mockSecurityEventsService,
      );

      const requester = createMockIdentity({ actorId: "usr_alice", tenantId: "ten_audit_stale_req" });
      const nowMs = Date.now();
      const pastTo = new Date(nowMs - 1000).toISOString();
      const validFrom = new Date(nowMs - 5000).toISOString();

      const req = await auditService.createRequest(
        {
          targetUserId: "usr_charlie",
          roleCode: "tenant_admin",
          reason: "Audit stale request expiry test",
          tenantId: "ten_audit_stale_req",
          validFrom,
          validTo: new Date(nowMs + 5000).toISOString(),
        },
        requester,
      );

      (req as any).validTo = pastTo;
      await identityRepo.savePrivilegedRoleRequest(req);

      await auditService.expireStaleGrants(nowMs);

      const expiredEvent = recordedEvents.find(
        (e) => e.eventType === "privileged_role.expired" && e.approvalId === req.requestId,
      );
      expect(expiredEvent).toBeDefined();
      expect(expiredEvent.actorId).toBe("system");
      expect(expiredEvent.outcome).toBe("expired");
    });
  });
});

