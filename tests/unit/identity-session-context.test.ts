import { describe, expect, it, vi } from "vitest";

import { BreakGlassService } from "../../apps/api/src/modules/identity/break-glass.service";
import { IdentityController } from "../../apps/api/src/modules/identity/identity.controller";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";

const mutation = {
  reasonCode: "INCIDENT",
  expectedVersion: 1,
  stepUpReference: "vault-proof-001",
};

function session(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "sess-1",
    sourceRef: "test",
    principalId: "principal-1",
    membershipId: null,
    realm: "platform",
    actorType: "platform_admin" as const,
    actorId: "principal-1",
    tenantId: null,
    partnerId: null,
    partnerProgramId: null,
    partnerEntrySlug: null,
    currentTokenId: "token-1",
    roles: [],
    scopes: [],
    policyVersion: "test",
    acr: "aal2",
    audience: [],
    issuer: null,
    subject: "principal-1",
    status: "active" as const,
    authTime: new Date().toISOString(),
    authMethods: ["mfa"],
    tokenVersion: 1,
    idleExpiresAt: null,
    absoluteExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    revokedAt: null,
    revokedByPrincipalId: null,
    revokeReason: null,
    deviceSummary: {},
    riskSummary: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function callerIdentity(overrides: Record<string, unknown> = {}) {
  return {
    authMode: "jwt_bearer" as const,
    actorType: "platform_admin" as const,
    actorId: "principal-1",
    principalId: "principal-1",
    realm: "platform" as const,
    tenantId: null,
    sessionId: "sess-1",
    tokenVersion: 1,
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

describe("IdentityController.getSessionContext (UI17-IAM-BREAK-GLASS-READ-CONTRACT-20260925)", () => {
  it("scenario 1: legitimate same-principal active session shows as active", async () => {
    const repository = new IdentityRepository();
    await repository.createSession(session());
    const breakGlassService = new BreakGlassService(repository);
    const controller = new IdentityController(
      repository,
      undefined,
      undefined,
      undefined,
      breakGlassService,
    );

    const result = await controller.getSessionContext(callerIdentity());
    expect(result.data.sessionActive).toBe(true);
    expect(result.data.principalId).toBe("principal-1");
    expect(result.data.sessionId).toBe("sess-1");
  });

  it("scenario 2: a replaced (revoked) session is not treated as active", async () => {
    const repository = new IdentityRepository();
    await repository.createSession(session());
    // Simulate replacement: the durable session record has since been
    // revoked (e.g. a newer login/rotation superseded it), but a caller
    // still presents a token claiming the old sessionId.
    await repository.revokeSession("sess-1", "session_replaced");
    const breakGlassService = new BreakGlassService(repository);
    const controller = new IdentityController(
      repository,
      undefined,
      undefined,
      undefined,
      breakGlassService,
    );

    const result = await controller.getSessionContext(callerIdentity());
    expect(result.data.sessionActive).toBe(false);
    expect(result.data.activeBreakGlassGrants).toEqual([]);
  });

  it("scenario 2b: a session whose token version has moved on (rotated away from the caller's token) is not treated as active", async () => {
    const repository = new IdentityRepository();
    await repository.createSession(session({ tokenVersion: 2 }));
    const breakGlassService = new BreakGlassService(repository);
    const controller = new IdentityController(
      repository,
      undefined,
      undefined,
      undefined,
      breakGlassService,
    );

    // Caller's token still carries the old tokenVersion (1); the durable
    // session has rotated to 2, so this presented session must not be
    // trusted as the caller's current active session.
    const result = await controller.getSessionContext(
      callerIdentity({ tokenVersion: 1 }),
    );
    expect(result.data.sessionActive).toBe(false);
  });

  it("scenario 3: anonymous / no session is not treated as active", async () => {
    const repository = new IdentityRepository();
    const breakGlassService = new BreakGlassService(repository);
    const controller = new IdentityController(
      repository,
      undefined,
      undefined,
      undefined,
      breakGlassService,
    );

    const anonymousResult = await controller.getSessionContext(null);
    expect(anonymousResult.data.sessionActive).toBe(false);
    expect(anonymousResult.data.principalId).toBeNull();
    expect(anonymousResult.data.activeBreakGlassGrants).toEqual([]);

    const noSessionResult = await controller.getSessionContext(
      callerIdentity({ sessionId: null }),
    );
    expect(noSessionResult.data.sessionActive).toBe(false);
  });

  it("scenario 4: a legitimate sub != principal grant stays active via the new principal/session read, not silently cleared", async () => {
    const repository = new IdentityRepository();
    // The session's own subject/actorId (sub) differs from the principalId
    // that actually owns the break-glass grant -- this is the exact
    // false-negative the round-3 reopen described: an actor-only comparison
    // would incorrectly clear this grant.
    await repository.createSession(
      session({
        principalId: "principal-1",
        subject: "distinct-sub-claim",
        actorId: "distinct-sub-claim",
      }),
    );
    const breakGlassService = new BreakGlassService(repository);
    const requesterIdentity = {
      authMode: "jwt_bearer" as const,
      actorType: "platform_admin" as const,
      actorId: "distinct-sub-claim",
      principalId: "principal-1",
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
      requestId: "req-grant",
    };
    const approverIdentity = {
      ...requesterIdentity,
      actorId: "approver",
      principalId: "approver",
      requestId: "req-approve",
    };
    const grant = await breakGlassService.request(requesterIdentity, {
      requestedScopes: ["identity:read"],
      reasonCode: "INCIDENT",
      reasonText: "Restore incident access",
      proofReference: "vault://break-glass/proof",
      mutation,
    });
    await breakGlassService.approve(approverIdentity, grant.grantId, mutation);
    await breakGlassService.activate(requesterIdentity, {
      requestId: grant.grantId,
      requestedScope: ["identity:read"],
      requestedDurationMinutes: 10,
      mutation,
    });

    const controller = new IdentityController(
      repository,
      undefined,
      undefined,
      undefined,
      breakGlassService,
    );

    // Caller authenticates with sessionId "sess-1", whose token/session
    // actorId ("distinct-sub-claim") differs from the grant's requesterId
    // ("principal-1" == principalId). The read must still surface the grant.
    const result = await controller.getSessionContext(
      callerIdentity({
        actorId: "distinct-sub-claim",
        principalId: "principal-1",
        sessionId: "sess-1",
      }),
    );
    expect(result.data.sessionActive).toBe(true);
    expect(
      result.data.activeBreakGlassGrants.map(
        (g: { grantId: string }) => g.grantId,
      ),
    ).toEqual([grant.grantId]);
  });

  it("scenario 5 (round-1 R1): a grant whose own bound session was revoked/replaced is not reported active via another valid session of the same principal", async () => {
    const repository = new IdentityRepository();
    // The caller's *own* ordinary session is separate from the session bound
    // to the break-glass grant -- e.g. the caller logged in again elsewhere
    // after the grant's session was superseded.
    await repository.createSession(session({ sessionId: "ordinary-session" }));
    await repository.createSession(session({ sessionId: "grant-session" }));

    const breakGlassService = new BreakGlassService(repository);
    const requesterIdentity = {
      authMode: "jwt_bearer" as const,
      actorType: "platform_admin" as const,
      actorId: "principal-1",
      principalId: "principal-1",
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
      requestId: "req-grant",
    };
    const approverIdentity = {
      ...requesterIdentity,
      actorId: "approver",
      principalId: "approver",
      requestId: "req-approve",
    };
    const grant = await breakGlassService.request(requesterIdentity, {
      requestedScopes: ["identity:read"],
      reasonCode: "INCIDENT",
      reasonText: "Restore incident access",
      proofReference: "vault://break-glass/proof",
      mutation,
    });
    await breakGlassService.approve(approverIdentity, grant.grantId, mutation);
    await breakGlassService.activate(requesterIdentity, {
      requestId: grant.grantId,
      requestedScope: ["identity:read"],
      requestedDurationMinutes: 10,
      mutation,
    });
    await breakGlassService.bindSession(grant.grantId, "grant-session");
    await repository.revokeSession("grant-session", "session_replaced");

    const controller = new IdentityController(
      repository,
      undefined,
      undefined,
      undefined,
      breakGlassService,
    );

    const result = await controller.getSessionContext(
      callerIdentity({ sessionId: "ordinary-session" }),
    );
    expect(result.data.sessionActive).toBe(true);
    expect(result.data.activeBreakGlassGrants).toEqual([]);
  });

  it("scenario 6 (round-1 R2): an expired grant is not reported active even though its status has not yet been swept to 'expired'", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-25T14:00:00.000Z"));
      const repository = new IdentityRepository();
      await repository.createSession(session());

      const breakGlassService = new BreakGlassService(repository);
      const requesterIdentity = {
        authMode: "jwt_bearer" as const,
        actorType: "platform_admin" as const,
        actorId: "principal-1",
        principalId: "principal-1",
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
        requestId: "req-grant",
      };
      const approverIdentity = {
        ...requesterIdentity,
        actorId: "approver",
        principalId: "approver",
        requestId: "req-approve",
      };
      const grant = await breakGlassService.request(requesterIdentity, {
        requestedScopes: ["identity:read"],
        reasonCode: "INCIDENT",
        reasonText: "Restore incident access",
        proofReference: "vault://break-glass/proof",
        mutation,
      });
      await breakGlassService.approve(
        approverIdentity,
        grant.grantId,
        mutation,
      );
      await breakGlassService.activate(requesterIdentity, {
        requestId: grant.grantId,
        requestedScope: ["identity:read"],
        requestedDurationMinutes: 1,
        mutation,
      });
      await breakGlassService.bindSession(grant.grantId, "sess-1");

      const controller = new IdentityController(
        repository,
        undefined,
        undefined,
        undefined,
        breakGlassService,
      );

      // Still within the 1-minute TTL: active.
      const stillValid = await controller.getSessionContext(callerIdentity());
      expect(
        stillValid.data.activeBreakGlassGrants.map(
          (g: { grantId: string }) => g.grantId,
        ),
      ).toEqual([grant.grantId]);

      // Advance past the TTL with no explicit expireDue/close call -- the
      // grant's own `status` field is still "active" in storage.
      vi.setSystemTime(new Date("2026-09-25T14:02:00.000Z"));
      const afterExpiry = await controller.getSessionContext(
        callerIdentity(),
      );
      expect(afterExpiry.data.sessionActive).toBe(true);
      expect(afterExpiry.data.activeBreakGlassGrants).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
