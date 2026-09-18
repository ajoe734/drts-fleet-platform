import { describe, expect, it, vi } from "vitest";
import {
  PlatformAdminIamClient,
  createPlatformAdminIamClient,
} from "../../lib/platform-admin-iam-client";
import type { ApiClient } from "@drts/api-client";

function createMockApiClient(): ApiClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as unknown as ApiClient;
}

describe("PlatformAdminIamClient", () => {
  it("should fetch session inventory and support session revocation", async () => {
    const mockApi = createMockApiClient();
    vi.mocked(mockApi.get).mockResolvedValueOnce([
      {
        sessionId: "sess_101",
        principalId: "usr_001",
        realm: "platform",
        status: "active",
        authTime: "2026-08-13T00:00:00Z",
        authMethods: ["pwd", "mfa"],
        tokenVersion: 1,
        idleExpiresAt: "2026-08-13T01:00:00Z",
        absoluteExpiresAt: "2026-08-13T08:00:00Z",
        revokedAt: null,
        revokedByPrincipalId: null,
        revokeReason: null,
        deviceSummary: {},
        riskSummary: {},
        createdAt: "2026-08-13T00:00:00Z",
        updatedAt: "2026-08-13T00:00:00Z",
      },
    ]);
    vi.mocked(mockApi.post).mockResolvedValueOnce({
      revoked: true,
      sessionId: "sess_101",
      session: null,
    });

    const client = createPlatformAdminIamClient(mockApi);
    const sessions = await client.listSessions({ actorId: "usr_001" });

    expect(mockApi.get).toHaveBeenCalledWith("/identity/sessions?actorId=usr_001");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.sessionId).toBe("sess_101");

    const revokeRes = await client.revokeSession("sess_101", {
      reason: "security_audit",
      isCompromised: true,
    });
    expect(mockApi.post).toHaveBeenCalledWith("/identity/sessions/sess_101/revoke", {
      body: { reason: "security_audit", isCompromised: true },
    });
    expect(revokeRes.revoked).toBe(true);
  });

  it("should handle privileged role requests and step-up approvals", async () => {
    const mockApi = createMockApiClient();
    const reqRecord = {
      requestId: "req_881",
      tenantId: null,
      realm: "platform" as const,
      targetUserId: "usr_target_01",
      requestedRoleCode: "superadmin",
      previousRoleCode: "operator",
      requesterPrincipalId: "usr_req_01",
      requesterActorType: "platform_admin",
      reason: "Need superadmin for fix",
      status: "pending" as const,
      validFrom: "2026-08-13T02:00:00Z",
      version: 1,
      createdAt: "2026-08-13T02:00:00Z",
      updatedAt: "2026-08-13T02:00:00Z",
    };

    vi.mocked(mockApi.get).mockResolvedValueOnce({ items: [reqRecord] });
    vi.mocked(mockApi.post).mockResolvedValueOnce({ ...reqRecord, status: "approved" });

    const client = new PlatformAdminIamClient(mockApi);
    const requests = await client.listPrivilegedRoleRequests();

    expect(mockApi.get).toHaveBeenCalledWith("/identity/privileged-role-requests");
    expect(requests).toHaveLength(1);

    const approved = await client.approvePrivilegedRoleRequest("req_881", {
      approvalRequestId: "req_881",
      mutation: { reasonCode: "STEP_UP_APPROVED", expectedVersion: 1 },
    });
    expect(mockApi.post).toHaveBeenCalledWith(
      "/identity/privileged-role-requests/req_881/approve",
      { body: { approvalRequestId: "req_881", mutation: { reasonCode: "STEP_UP_APPROVED", expectedVersion: 1 } } },
    );
    expect(approved.status).toBe("approved");
  });

  it("should handle access review campaigns, decisions, and overdue sweeps", async () => {
    const mockApi = createMockApiClient();
    const campaign = {
      campaignId: "cmp_301",
      title: "Q3 Platform Audit",
      realm: "platform" as const,
      reviewerPrincipalId: "usr_rev_01",
      status: "active" as const,
      deadlineAt: "2026-08-20T00:00:00Z",
      overduePolicy: "auto_revoke" as const,
      createdAt: "2026-08-13T00:00:00Z",
      updatedAt: "2026-08-13T00:00:00Z",
    };

    vi.mocked(mockApi.get).mockResolvedValueOnce({ campaigns: [campaign] });
    vi.mocked(mockApi.post).mockResolvedValueOnce({ swept: 2, autoRevoked: 1 });

    const client = new PlatformAdminIamClient(mockApi);
    const list = await client.listAccessReviews({ realm: "platform" });

    expect(mockApi.get).toHaveBeenCalledWith("/platform-admin/access-reviews?realm=platform");
    expect(list).toHaveLength(1);

    const sweepResult = await client.triggerOverdueSweep();
    expect(mockApi.post).toHaveBeenCalledWith("/platform-admin/access-reviews/overdue-sweep");
    expect(sweepResult.autoRevoked).toBe(1);
  });

  it("should handle break-glass request, approval, activation, and close", async () => {
    const mockApi = createMockApiClient();
    const grant = {
      grantId: "bg_grant_99",
      requesterId: "usr_req_01",
      approverId: null,
      requestedScopes: ["platform:superadmin"],
      grantedScopes: ["platform:superadmin"],
      reasonCode: "INCIDENT_OUTAGE",
      reasonText: "Outage resolution required",
      proofReference: "proof_11",
      status: "requested" as const,
      requestedAt: "2026-08-13T03:00:00Z",
      approvedAt: null,
      activatedAt: null,
      expiresAt: null,
      closedAt: null,
      closedById: null,
      closeReason: null,
      sessionId: null,
      postUseReviewRequired: true,
      postUseReviewedAt: null,
      version: 1,
    };

    vi.mocked(mockApi.post).mockResolvedValueOnce(grant); // request
    vi.mocked(mockApi.post).mockResolvedValueOnce({
      grant: { ...grant, status: "active", sessionId: "sess_bg_1" },
      accessToken: "token_bg_secret",
      expiresAt: "2026-08-13T04:00:00Z",
      sessionBanner: "BREAK_GLASS_ACTIVE",
    }); // activate
    vi.mocked(mockApi.post).mockResolvedValueOnce({ ...grant, status: "closed" }); // close

    const client = new PlatformAdminIamClient(mockApi);

    const reqRes = await client.requestBreakGlass({
      requestedScopes: ["platform:superadmin"],
      reasonCode: "INCIDENT_OUTAGE",
      reasonText: "Outage resolution required",
      proofReference: "proof_11",
      mutation: { reasonCode: "REQUEST", expectedVersion: 1 },
    });
    expect(reqRes.grantId).toBe("bg_grant_99");

    const actRes = await client.activateBreakGlass("bg_grant_99", {
      requestId: "bg_grant_99",
      requestedScope: ["platform:superadmin"],
      requestedDurationMinutes: 30,
      mutation: { reasonCode: "ACTIVATE", expectedVersion: 1 },
    });
    expect(actRes.sessionBanner).toBe("BREAK_GLASS_ACTIVE");

    const closeRes = await client.closeBreakGlass("bg_grant_99", {
      mutation: { reasonCode: "CLOSE", expectedVersion: 1 },
    });
    expect(closeRes.status).toBe("closed");
  });
});
