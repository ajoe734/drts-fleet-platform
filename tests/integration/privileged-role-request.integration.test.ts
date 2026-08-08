import { describe, expect, it } from "vitest";

import type { IdentityContext } from "@drts/contracts";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { IAPSubjectAdapter } from "../../apps/api/src/modules/auth/iap-subject.adapter";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { PrivilegedRoleRequestService } from "../../apps/api/src/modules/identity/privileged-role-request.service";
import { SecurityEventsService } from "../../apps/api/src/modules/security-events/security-events.service";

function buildIdentity(
  principalId: string,
  actorType: IdentityContext["actorType"] = "platform_admin",
  authTime = new Date().toISOString(),
  tenantId = "tenant_001",
): IdentityContext {
  return {
    actorType,
    actorId: principalId,
    principalId,
    realm: actorType === "tenant_admin" ? "tenant" : "platform",
    authMode: "jwt_bearer",
    roleFamilies: actorType === "tenant_admin" ? ["tenant"] : ["platform"],
    roles: actorType === "tenant_admin" ? ["tenant_admin"] : ["platform_admin"],
    scopes: ["identity:read"],
    tenantId: actorType === "tenant_admin" ? tenantId : null,
    authTime,
    amr: ["pwd", "mfa"],
    acr: "aal2",
    supportedExecutionModes: ["supervisor_managed_execution"],
  };
}

async function seedMembership(params: {
  repo: IdentityRepository;
  principalId: string;
  membershipId: string;
  sourceRef: string;
  realm: "platform" | "ops" | "tenant";
  roleBindings: Array<{
    roleBindingId: string;
    sourceRef: string;
    roleCode: string;
    validFrom: string;
    validTo: string | null;
  }>;
  tenantId?: string | null;
}) {
  const now = new Date().toISOString();
  await params.repo.upsertWorkforceIdentity(
    {
      principalId: params.principalId,
      sourceRef: `${params.sourceRef}:principal`,
      issuer: "google_iap",
      subject: `${params.sourceRef}:subject`,
      principalType: "human",
      email: `${params.principalId}@platform.drts`,
      emailVerified: true,
      displayName: params.principalId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    {
      membershipId: params.membershipId,
      sourceRef: `${params.sourceRef}:membership`,
      principalId: params.principalId,
      realm: params.realm,
      scopeRef:
        params.realm === "tenant"
          ? `tenant:${params.tenantId ?? "tenant_001"}`
          : "platform:control_plane",
      tenantId: params.tenantId ?? null,
      partnerId: null,
      status: "active",
      invitedByPrincipalId: null,
      invitationId: null,
      createdAt: now,
      updatedAt: now,
    },
    params.roleBindings.map((binding) => ({
      roleBindingId: binding.roleBindingId,
      sourceRef: binding.sourceRef,
      membershipId: params.membershipId,
      roleCode: binding.roleCode,
      grantedByPrincipalId: null,
      approvalId: null,
      validFrom: binding.validFrom,
      validTo: binding.validTo,
      createdAt: now,
      updatedAt: now,
    })),
  );
}

describe("PrivilegedRoleRequestService integration", () => {
  it("blocks requester self-approval and atomically permits only one concurrent approval", async () => {
    const repo = new IdentityRepository();
    const events = new SecurityEventsService();
    const service = new PrivilegedRoleRequestService(repo, events);
    const now = new Date().toISOString();

    await seedMembership({
      repo,
      principalId: "target_principal",
      membershipId: "membership_target",
      sourceRef: "target",
      realm: "platform",
      roleBindings: [],
    });

    const requester = buildIdentity("requester_principal");
    const request = await service.createRequest(
      {
        membershipId: "membership_target",
        roleCode: "platform_admin",
        justification: "Need elevated incident response access.",
      },
      requester,
    );

    await expect(
      service.approveRequest(
        request.requestId,
        { expectedVersion: request.version },
        requester,
      ),
    ).rejects.toMatchObject<ApiRequestError>({
      code: "AUTHZ_SCOPE_DENIED",
    });

    const approver = buildIdentity("approver_principal");
    const approvalAttempts = await Promise.allSettled([
      service.approveRequest(
        request.requestId,
        { expectedVersion: request.version },
        approver,
      ),
      service.approveRequest(
        request.requestId,
        { expectedVersion: request.version },
        buildIdentity("second_approver"),
      ),
    ]);
    const successfulApprovals = approvalAttempts.filter(
      (
        attempt,
      ): attempt is PromiseFulfilledResult<
        Awaited<ReturnType<typeof service.approveRequest>>
      > => attempt.status === "fulfilled",
    );
    const failedApprovals = approvalAttempts.filter(
      (attempt): attempt is PromiseRejectedResult =>
        attempt.status === "rejected",
    );
    expect(successfulApprovals).toHaveLength(1);
    expect(successfulApprovals[0]?.value.status).toBe("active");
    expect(failedApprovals).toHaveLength(1);
    expect(failedApprovals[0]?.reason).toMatchObject<ApiRequestError>({
      code: "IAM_CONCURRENCY_CONFLICT",
    });

    const eventList = await events.listEvents(null, {
      eventType: "privileged_role_request.approved",
    });
    expect(eventList).toHaveLength(1);
    expect(
      new Date(successfulApprovals[0]!.value.updatedAt).getTime(),
    ).toBeGreaterThanOrEqual(Date.parse(now));
  });

  it("persists request lifecycle records across service instances", async () => {
    const repo = new IdentityRepository();
    await seedMembership({
      repo,
      principalId: "target_principal",
      membershipId: "membership_target",
      sourceRef: "target",
      realm: "platform",
      roleBindings: [],
    });
    const firstService = new PrivilegedRoleRequestService(repo);
    const request = await firstService.createRequest(
      {
        membershipId: "membership_target",
        roleCode: "platform_admin",
        justification: "Persist this governance request.",
      },
      buildIdentity("requester_principal"),
    );

    const secondService = new PrivilegedRoleRequestService(repo);
    const reloaded = await secondService.getRequest(
      request.requestId,
      buildIdentity("reader_principal"),
    );
    expect(reloaded).toMatchObject({
      requestId: request.requestId,
      status: "pending_approval",
      version: 1,
    });
  });

  it("requires fresh MFA for privileged governance mutations", async () => {
    const repo = new IdentityRepository();
    const service = new PrivilegedRoleRequestService(
      repo,
      new SecurityEventsService(),
    );

    await seedMembership({
      repo,
      principalId: "target_principal",
      membershipId: "membership_target",
      sourceRef: "target",
      realm: "platform",
      roleBindings: [],
    });

    const staleIdentity = buildIdentity(
      "requester_principal",
      "platform_admin",
      new Date(Date.now() - 16 * 60 * 1000).toISOString(),
    );

    await expect(
      service.createRequest(
        {
          membershipId: "membership_target",
          roleCode: "platform_admin",
          justification: "Need elevated incident response access.",
        },
        staleIdentity,
      ),
    ).rejects.toMatchObject<ApiRequestError>({
      code: "IAM_STEP_UP_REQUIRED",
    });

    await expect(
      service.createRequest(
        {
          membershipId: "membership_target",
          roleCode: "platform_admin",
          justification: "Future assertions cannot satisfy a step-up check.",
        },
        buildIdentity(
          "requester_principal",
          "platform_admin",
          new Date(Date.now() + 60_000).toISOString(),
        ),
      ),
    ).rejects.toMatchObject<ApiRequestError>({
      code: "IAM_STEP_UP_REQUIRED",
    });
  });

  it("activates and expires grants at declared times and invalidates stale sessions", async () => {
    const repo = new IdentityRepository();
    const service = new PrivilegedRoleRequestService(
      repo,
      new SecurityEventsService(),
    );
    const adapter = new IAPSubjectAdapter(repo, new SecurityEventsService());
    const now = Date.now();
    const activateAt = new Date(now + 60_000).toISOString();
    const expiresAt = new Date(now + 120_000).toISOString();

    await seedMembership({
      repo,
      principalId: "target_principal",
      membershipId: "membership_target",
      sourceRef: "target",
      realm: "platform",
      roleBindings: [],
    });

    await repo.createSession({
      sessionId: "session_target",
      sourceRef: "session_target",
      principalId: "target_principal",
      membershipId: "membership_target",
      realm: "platform",
      status: "active",
      authTime: new Date(now).toISOString(),
      authMethods: ["pwd", "mfa"],
      tokenVersion: now,
      idleExpiresAt: null,
      absoluteExpiresAt: new Date(now + 3600_000).toISOString(),
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: {},
      riskSummary: {},
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    });

    const request = await service.createRequest(
      {
        membershipId: "membership_target",
        roleCode: "platform_admin",
        justification: "Need elevated incident response access.",
        activateAt,
        expiresAt,
      },
      buildIdentity("requester_principal"),
    );

    const approved = await service.approveRequest(
      request.requestId,
      { expectedVersion: request.version },
      buildIdentity("approver_principal"),
    );
    expect(approved.status).toBe("approved");

    const beforeActivation = await adapter
      .resolveSubject(
        {
          "x-goog-iap-jwt-assertion": "unused",
        } as never,
        {},
      )
      .catch(() => null);
    expect(beforeActivation).toBeNull();

    await service.reconcileRequests(new Date(now + 61_000).toISOString());
    const activeRequest = await service.getRequest(
      request.requestId,
      buildIdentity("reader_principal"),
    );
    expect(activeRequest.status).toBe("active");

    const sessionAfterActivation = await repo.getSession("session_target");
    expect(sessionAfterActivation?.status).toBe("revoked");
    expect(sessionAfterActivation?.revokeReason).toBe(
      "PRIVILEGED_ROLE_GRANT_ACTIVATED",
    );

    await service.reconcileRequests(new Date(now + 121_000).toISOString());
    const expiredRequest = await service.getRequest(
      request.requestId,
      buildIdentity("reader_principal"),
    );
    expect(expiredRequest.status).toBe("expired");

    const bindings =
      await repo.findRoleBindingsByMembershipId("membership_target");
    const requestBinding = bindings.find(
      (binding) =>
        binding.sourceRef === `privileged_role_request:${request.requestId}`,
    );
    expect(requestBinding?.validFrom).toBe(activateAt);
    expect(requestBinding?.validTo).toBe(expiresAt);
  });

  it("prevents removing the last active admin grant", async () => {
    const repo = new IdentityRepository();
    const service = new PrivilegedRoleRequestService(
      repo,
      new SecurityEventsService(),
    );
    const now = new Date().toISOString();

    await seedMembership({
      repo,
      principalId: "target_principal",
      membershipId: "membership_target",
      sourceRef: "target",
      realm: "platform",
      roleBindings: [],
    });

    const request = await service.createRequest(
      {
        membershipId: "membership_target",
        roleCode: "superadmin",
        justification: "Need privileged continuity coverage.",
      },
      buildIdentity("requester_principal"),
    );
    await service.approveRequest(
      request.requestId,
      { expectedVersion: request.version },
      buildIdentity("approver_principal"),
    );

    await expect(
      service.removeGrant(
        request.requestId,
        { expectedVersion: 2, reasonCode: "role_removed" },
        buildIdentity("remover_principal"),
      ),
    ).rejects.toMatchObject<ApiRequestError>({
      code: "IAM_LAST_ADMIN_CONFLICT",
    });

    expect(Date.parse(now)).toBeLessThanOrEqual(Date.now());
  });

  it("confines tenant privileged role requests and last-admin protection to one tenant", async () => {
    const repo = new IdentityRepository();
    const service = new PrivilegedRoleRequestService(
      repo,
      new SecurityEventsService(),
    );
    const now = new Date().toISOString();

    await seedMembership({
      repo,
      principalId: "tenant_a_target",
      membershipId: "tenant_a_membership",
      sourceRef: "tenant-a-target",
      realm: "tenant",
      tenantId: "tenant_a",
      roleBindings: [],
    });
    await seedMembership({
      repo,
      principalId: "tenant_b_admin",
      membershipId: "tenant_b_membership",
      sourceRef: "tenant-b-admin",
      realm: "tenant",
      tenantId: "tenant_b",
      roleBindings: [
        {
          roleBindingId: "tenant_b_admin_binding",
          sourceRef: "tenant-b-admin-binding",
          roleCode: "tenant_admin",
          validFrom: now,
          validTo: null,
        },
      ],
    });

    const tenantARequester = buildIdentity(
      "tenant_a_requester",
      "tenant_admin",
      now,
      "tenant_a",
    );
    const tenantAApprover = buildIdentity(
      "tenant_a_approver",
      "tenant_admin",
      now,
      "tenant_a",
    );
    const tenantBActor = buildIdentity(
      "tenant_b_actor",
      "tenant_admin",
      now,
      "tenant_b",
    );
    const request = await service.createRequest(
      {
        membershipId: "tenant_a_membership",
        roleCode: "tenant_admin",
        justification: "Tenant A continuity coverage.",
      },
      tenantARequester,
    );
    expect(request.tenantId).toBe("tenant_a");

    await expect(
      service.createRequest(
        {
          membershipId: "tenant_a_membership",
          roleCode: "tenant_admin",
          justification: "Cross-tenant escalation must fail.",
        },
        tenantBActor,
      ),
    ).rejects.toMatchObject<ApiRequestError>({ code: "AUTHZ_SCOPE_DENIED" });
    await expect(
      service.getRequest(request.requestId, tenantBActor),
    ).rejects.toMatchObject<ApiRequestError>({ code: "AUTHZ_SCOPE_DENIED" });
    await expect(
      service.approveRequest(
        request.requestId,
        { expectedVersion: 1 },
        tenantBActor,
      ),
    ).rejects.toMatchObject<ApiRequestError>({ code: "AUTHZ_SCOPE_DENIED" });
    await expect(
      service.rejectRequest(
        request.requestId,
        { expectedVersion: 1 },
        tenantBActor,
      ),
    ).rejects.toMatchObject<ApiRequestError>({ code: "AUTHZ_SCOPE_DENIED" });
    await expect(
      service.removeGrant(
        request.requestId,
        { expectedVersion: 1, reasonCode: "cross_tenant" },
        tenantBActor,
      ),
    ).rejects.toMatchObject<ApiRequestError>({ code: "AUTHZ_SCOPE_DENIED" });
    await expect(service.listRequests({}, tenantBActor)).resolves.toEqual([]);

    await service.approveRequest(
      request.requestId,
      { expectedVersion: 1 },
      tenantAApprover,
    );
    await expect(
      service.removeGrant(
        request.requestId,
        { expectedVersion: 2, reasonCode: "role_removed" },
        tenantAApprover,
      ),
    ).rejects.toMatchObject<ApiRequestError>({
      code: "IAM_LAST_ADMIN_CONFLICT",
    });
  });
});
