import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { BreakGlassService } from "../../apps/api/src/modules/identity/break-glass.service";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";

const mutation = {
  reasonCode: "INCIDENT",
  expectedVersion: 1,
  stepUpReference: "vault-proof-001",
};

function identity(overrides: Record<string, unknown> = {}) {
  return {
    authMode: "jwt_bearer" as const,
    actorType: "platform_admin" as const,
    actorId: "requester",
    principalId: "requester",
    realm: "platform" as const,
    tenantId: null,
    roleFamilies: ["platform"] as (
      | "platform"
      | "tenant"
      | "partner"
      | "driver"
      | "ops"
    )[],
    roles: [],
    scopes: [],
    requestId: "req-1",
    ...overrides,
  };
}

async function seedGrant(service: BreakGlassService) {
  const requester = identity();
  const approver = identity({ actorId: "approver", principalId: "approver" });
  const grant = await service.request(requester, {
    requestedScopes: ["identity:read"],
    reasonCode: "INCIDENT",
    reasonText: "Restore incident access",
    proofReference: "vault://break-glass/proof",
    mutation,
  });
  await service.approve(approver, grant.grantId, mutation);
  return { requester, approver, grant };
}

describe("BreakGlassService read authorization (additive GET routes)", () => {
  it("lets the requester view their own request", async () => {
    const service = new BreakGlassService(new IdentityRepository());
    const { requester, grant } = await seedGrant(service);
    const viewed = await service.getForViewer(requester, grant.grantId);
    expect(viewed.grantId).toBe(grant.grantId);
  });

  it("lets the assigned approver view the request", async () => {
    const service = new BreakGlassService(new IdentityRepository());
    const { approver, grant } = await seedGrant(service);
    const viewed = await service.getForViewer(approver, grant.grantId);
    expect(viewed.grantId).toBe(grant.grantId);
  });

  it("lets any caller holding identity:break-glass:approve view an unassigned request", async () => {
    const service = new BreakGlassService(new IdentityRepository());
    const { grant } = await seedGrant(service);
    const eligibleApprover = identity({
      actorId: "other-approver",
      principalId: "other-approver",
      scopes: ["identity:break-glass:approve"],
    });
    const viewed = await service.getForViewer(eligibleApprover, grant.grantId);
    expect(viewed.grantId).toBe(grant.grantId);
  });

  it("lets a platform/ops admin view any request", async () => {
    const service = new BreakGlassService(new IdentityRepository());
    const { grant } = await seedGrant(service);
    const opsAdmin = identity({
      actorId: "ops-admin",
      principalId: "ops-admin",
      realm: "ops",
      actorType: "ops_user",
    });
    const viewed = await service.getForViewer(opsAdmin, grant.grantId);
    expect(viewed.grantId).toBe(grant.grantId);
  });

  it("denies a caller who is neither requester, approver, eligible approver, nor admin", async () => {
    const service = new BreakGlassService(new IdentityRepository());
    const { grant } = await seedGrant(service);
    const bystander = identity({
      actorId: "bystander",
      principalId: "bystander",
      actorType: "tenant_admin",
      roles: [],
      scopes: [],
    });

    await expect(
      service.getForViewer(bystander, grant.grantId),
    ).rejects.toMatchObject({ code: "AUTHZ_SCOPE_DENIED" } satisfies Partial<
      ApiRequestError
    >);
  });

  it("still 404s an unknown request id regardless of caller", async () => {
    const service = new BreakGlassService(new IdentityRepository());
    const admin = identity({ realm: "ops", actorType: "ops_user" });
    await expect(
      service.getForViewer(admin, "bg_does_not_exist"),
    ).rejects.toMatchObject({ code: "IAM_BREAK_GLASS_NOT_FOUND" });
  });

  it("scopes listForViewer to the caller's own requests/approvals unless admin or eligible approver", async () => {
    const service = new BreakGlassService(new IdentityRepository());
    // Non-admin requester: no platform_admin/ops_user actorType or admin
    // roles/scopes, so isBreakGlassReadAdmin is false and listForViewer must
    // fall back to requester/approver self-scoping.
    const nonAdminRequester = identity({
      actorType: "tenant_admin",
      actorId: "self-service-requester",
      principalId: "self-service-requester",
      scopes: ["identity:break-glass:request"],
    });
    const grant = await service.request(nonAdminRequester, {
      requestedScopes: ["identity:read"],
      reasonCode: "INCIDENT",
      reasonText: "Restore incident access",
      proofReference: "vault://break-glass/proof",
      mutation,
    });
    const other = identity({
      actorType: "tenant_admin",
      actorId: "outsider",
      principalId: "outsider",
      scopes: ["identity:break-glass:request"],
    });
    const otherRequest = await service.request(other, {
      requestedScopes: ["identity:read"],
      reasonCode: "INCIDENT",
      reasonText: "Unrelated",
      proofReference: "vault://break-glass/proof-2",
      mutation,
    });

    const seenByRequester = await service.listForViewer(nonAdminRequester);
    expect(seenByRequester.map((g) => g.grantId)).toEqual([grant.grantId]);

    const opsAdmin = identity({ realm: "ops", actorType: "ops_user" });
    const seenByAdmin = await service.listForViewer(opsAdmin);
    expect(seenByAdmin.map((g) => g.grantId).sort()).toEqual(
      [grant.grantId, otherRequest.grantId].sort(),
    );
  });

  it("does not alter existing mutation authorization, SoD, or step-up enforcement", async () => {
    const service = new BreakGlassService(new IdentityRepository());
    const requester = identity();
    const grant = await service.request(requester, {
      requestedScopes: ["identity:read"],
      reasonCode: "INCIDENT",
      reasonText: "Restore incident access",
      proofReference: "vault://break-glass/proof",
      mutation,
    });
    // SoD: requester cannot approve their own request (unchanged).
    await expect(
      service.approve(requester, grant.grantId, mutation),
    ).rejects.toMatchObject({ code: "AUTH_APPROVAL_REQUIRED" });
    // Step-up: empty stepUpReference still rejected (unchanged).
    await expect(
      service.request(requester, {
        requestedScopes: ["identity:read"],
        reasonCode: "INCIDENT",
        reasonText: "Restore incident access",
        proofReference: "vault://break-glass/proof",
        mutation: { ...mutation, stepUpReference: "" },
      }),
    ).rejects.toMatchObject({ code: "IAM_STEP_UP_REQUIRED" });
  });
});
