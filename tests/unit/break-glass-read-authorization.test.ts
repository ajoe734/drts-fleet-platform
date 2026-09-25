import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { BootstrapAuthGuard } from "../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth/auth.types";
import { BreakGlassController } from "../../apps/api/src/modules/auth/break-glass.controller";
import {
  BREAK_GLASS_ALLOWED_SCOPES,
  BreakGlassService,
} from "../../apps/api/src/modules/identity/break-glass.service";
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
    // Explicit admin role, not bare actorType -- see round-3 R5: an ordinary
    // ops_user with no admin role/scope must NOT be treated as admin.
    const opsAdmin = identity({
      actorId: "ops-admin",
      principalId: "ops-admin",
      realm: "ops",
      actorType: "ops_user",
      roles: ["ops_admin"],
    });
    const viewed = await service.getForViewer(opsAdmin, grant.grantId);
    expect(viewed.grantId).toBe(grant.grantId);
  });

  it("round-3 R5: an ordinary ops_user bystander with no admin role/scope cannot view another principal's request", async () => {
    const service = new BreakGlassService(new IdentityRepository());
    const { grant } = await seedGrant(service);
    const ordinaryOpsUser = identity({
      actorId: "ordinary-ops",
      principalId: "ordinary-ops",
      realm: "ops",
      actorType: "ops_user",
      roles: ["ops_user"],
      scopes: ["identity:read"],
    });

    await expect(
      service.getForViewer(ordinaryOpsUser, grant.grantId),
    ).rejects.toMatchObject({ code: "AUTHZ_SCOPE_DENIED" } satisfies Partial<
      ApiRequestError
    >);
  });

  it("round-3 R5: an ordinary ops_user bystander's list excludes another principal's request", async () => {
    const service = new BreakGlassService(new IdentityRepository());
    const { grant } = await seedGrant(service);
    const ordinaryOpsUser = identity({
      actorId: "ordinary-ops",
      principalId: "ordinary-ops",
      realm: "ops",
      actorType: "ops_user",
      roles: ["ops_user"],
      scopes: ["identity:read"],
    });

    const seen = await service.listForViewer(ordinaryOpsUser);
    expect(seen.map((g) => g.grantId)).not.toContain(grant.grantId);
    expect(seen).toEqual([]);
  });

  it("round-3 R5: an ordinary ops_user requester's list is limited to their own requests", async () => {
    const service = new BreakGlassService(new IdentityRepository());
    const ordinaryOpsRequester = identity({
      actorId: "ordinary-ops-requester",
      principalId: "ordinary-ops-requester",
      realm: "ops",
      actorType: "ops_user",
      roles: ["ops_user"],
      scopes: ["identity:break-glass:request"],
    });
    const ownGrant = await service.request(ordinaryOpsRequester, {
      requestedScopes: ["identity:read"],
      reasonCode: "INCIDENT",
      reasonText: "Own request",
      proofReference: "vault://break-glass/proof-own",
      mutation,
    });
    const { grant: otherGrant } = await seedGrant(service);

    const seen = await service.listForViewer(ordinaryOpsRequester);
    expect(seen.map((g) => g.grantId)).toEqual([ownGrant.grantId]);
    expect(seen.map((g) => g.grantId)).not.toContain(otherGrant.grantId);
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

    const opsAdmin = identity({
      realm: "ops",
      actorType: "ops_user",
      roles: ["ops_admin"],
    });
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

function createTestReflector() {
  return {
    getAllAndOverride: (key: string, targets: unknown[]) => {
      for (const target of targets) {
        if (!target) continue;
        const metadata = Reflect.getMetadata(key, target);
        if (metadata !== undefined) return metadata;
      }
      return undefined;
    },
  };
}

function createTestExecutionContext(
  // `prototype: any` (not `Record<string, unknown>`) so the concrete
  // controller class -- whose prototype has no index signature -- is
  // structurally assignable.
  controllerClass: { prototype: any },
  handlerName: string,
  request: unknown,
) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getClass: () => controllerClass,
    getHandler: () => controllerClass.prototype[handlerName],
  };
}

// Round-1 R3: the two new GET routes must be reachable by a legitimate
// activated break-glass session, which only ever carries
// BREAK_GLASS_ALLOWED_SCOPES (never foundation:read). Every test above calls
// BreakGlassService methods directly and so never exercised the guard's
// merged route policy, which is exactly how a `platform-admin/` generic
// fallback requiring foundation:read slipped in ahead of this task's routes.
describe("BreakGlassController GET routes reachable by an activated break-glass session (guard-level, round-1 R3)", () => {
  const ORIGINAL_ENV = { ...process.env };
  let jwtAuthService: JwtAuthService;
  let guard: BootstrapAuthGuard;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.APP_ENV = "production";
    process.env.JWT_SECRET = "unit-test-jwt-secret-key-min-32-chars-long";
    process.env.JWT_ISSUER = "drts";
    process.env.JWT_AUDIENCE = "drts-api";
    jwtAuthService = new JwtAuthService();
    guard = new BootstrapAuthGuard(createTestReflector() as never, jwtAuthService);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  async function makeBreakGlassBearerRequest(
    overrides: Partial<BootstrapRequestIdentity>,
    method: string,
    url: string,
  ) {
    const identity: BootstrapRequestIdentity = {
      authMode: "jwt_bearer",
      actorType: "platform_admin",
      actorId: "requester",
      principalId: "requester",
      subject: "requester",
      realm: "platform",
      tenantId: null,
      roleFamilies: ["platform"],
      roles: ["break_glass"],
      // An activated break-glass grant only ever holds
      // BREAK_GLASS_ALLOWED_SCOPES -- notably never foundation:read.
      scopes: [...BREAK_GLASS_ALLOWED_SCOPES],
      requestId: "req-break-glass",
      ...overrides,
    } as BootstrapRequestIdentity;

    const issued = await jwtAuthService.issueSessionToken(identity);
    return {
      headers: { authorization: `Bearer ${issued.token}` },
      method,
      url,
      originalUrl: url,
      identity,
    };
  }

  it("lets an activated break-glass session (no foundation:read) list requests", async () => {
    const req = await makeBreakGlassBearerRequest(
      {},
      "GET",
      "/api/platform-admin/break-glass/requests",
    );
    const ctx = createTestExecutionContext(
      BreakGlassController,
      "listRequests",
      req,
    );
    await expect(guard.canActivate(ctx as never)).resolves.toBe(true);
  });

  it("lets an activated break-glass session (no foundation:read) read a single request", async () => {
    const req = await makeBreakGlassBearerRequest(
      {},
      "GET",
      "/api/platform-admin/break-glass/requests/bg_example",
    );
    const ctx = createTestExecutionContext(
      BreakGlassController,
      "getRequest",
      req,
    );
    await expect(guard.canActivate(ctx as never)).resolves.toBe(true);
  });

  it("still denies an unrelated realm for the new GET routes (realm restriction unchanged)", async () => {
    const req = await makeBreakGlassBearerRequest(
      { realm: "tenant", actorType: "tenant_admin", tenantId: "tenant-1" },
      "GET",
      "/api/platform-admin/break-glass/requests",
    );
    const ctx = createTestExecutionContext(
      BreakGlassController,
      "listRequests",
      req,
    );
    await expect(guard.canActivate(ctx as never)).rejects.toMatchObject({
      code: "AUTH_REALM_DENIED",
    });
  });
});
