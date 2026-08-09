import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { BreakGlassService } from "../../apps/api/src/modules/identity/break-glass.service";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";

const mutation = {
  reasonCode: "INCIDENT",
  expectedVersion: 1,
  stepUpReference: "vault-proof-001",
};
const requester = {
  authMode: "jwt_bearer" as const,
  actorType: "platform_admin" as const,
  actorId: "requester",
  principalId: "requester",
  realm: "platform" as const,
  tenantId: null,
  roleFamilies: ["platform"] as const,
  roles: ["platform_superadmin"],
  scopes: [],
  requestId: "req-1",
};
const approver = {
  ...requester,
  actorId: "approver",
  principalId: "approver",
  requestId: "req-2",
};

describe("BreakGlassService", () => {
  it("requires an independent approver and rejects scopes or TTL beyond policy", async () => {
    const service = new BreakGlassService(new IdentityRepository());
    const grant = await service.request(requester, {
      requestedScopes: ["identity:read"],
      reasonCode: "INCIDENT",
      reasonText: "Restore incident access",
      proofReference: "vault://break-glass/proof",
      mutation,
    });
    await expect(
      service.approve(requester, grant.grantId, mutation),
    ).rejects.toMatchObject({
      code: "AUTH_APPROVAL_REQUIRED",
    } satisfies Partial<ApiRequestError>);
    await service.approve(approver, grant.grantId, mutation);
    await expect(
      service.activate(requester, {
        requestId: grant.grantId,
        requestedScope: ["foundation:write"],
        requestedDurationMinutes: 10,
        mutation,
      }),
    ).rejects.toMatchObject({
      code: "AUTHZ_SCOPE_DENIED",
    } satisfies Partial<ApiRequestError>);
    await expect(
      service.activate(requester, {
        requestId: grant.grantId,
        requestedScope: ["identity:read"],
        requestedDurationMinutes: 61,
        mutation,
      }),
    ).rejects.toMatchObject({
      code: "IAM_BREAK_GLASS_TTL_INVALID",
    } satisfies Partial<ApiRequestError>);
  });

  it("expires and revokes the linked session while retaining post-use review", async () => {
    const repository = new IdentityRepository();
    const service = new BreakGlassService(repository);
    const grant = await service.request(requester, {
      requestedScopes: ["identity:read"],
      reasonCode: "INCIDENT",
      reasonText: "Restore incident access",
      proofReference: "vault://break-glass/proof",
      mutation,
    });
    await service.approve(approver, grant.grantId, mutation);
    const active = await service.activate(requester, {
      requestId: grant.grantId,
      requestedScope: ["identity:read"],
      requestedDurationMinutes: 1,
      mutation,
    });
    await repository.createSession({
      sessionId: "bg-session",
      sourceRef: "test",
      principalId: "requester",
      membershipId: null,
      realm: "platform",
      actorType: "platform_admin",
      actorId: "requester",
      tenantId: null,
      partnerId: null,
      partnerProgramId: null,
      partnerEntrySlug: null,
      currentTokenId: "token",
      roles: [],
      scopes: [],
      policyVersion: "test",
      acr: "aal2",
      audience: [],
      issuer: null,
      subject: "requester",
      status: "active",
      authTime: active.activatedAt!,
      authMethods: ["break_glass"],
      tokenVersion: 1,
      idleExpiresAt: null,
      absoluteExpiresAt: active.expiresAt!,
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: {},
      riskSummary: {},
      createdAt: active.activatedAt!,
      updatedAt: active.activatedAt!,
    });
    await service.bindSession(grant.grantId, "bg-session");
    const expired = await service.expireDue(
      new Date(Date.parse(active.expiresAt!) + 1),
    );
    expect(expired[0]).toMatchObject({
      status: "expired",
      postUseReviewRequired: true,
    });
    expect((await repository.getSession("bg-session"))?.status).toBe("revoked");
  });
});
