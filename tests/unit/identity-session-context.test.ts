import { generate } from "otplib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { AgencyDirectoryRepository } from "../../apps/api/src/modules/agency-access/agency-directory.repository";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { AuthController } from "../../apps/api/src/modules/auth/auth.controller";
import { TotpCredentialRepository } from "../../apps/api/src/modules/auth/totp-credential.repository";
import { TotpService } from "../../apps/api/src/modules/auth/totp.service";
import { BreakGlassService } from "../../apps/api/src/modules/identity/break-glass.service";
import { IdentityController } from "../../apps/api/src/modules/identity/identity.controller";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { SecurityEventsService } from "../../apps/api/src/modules/security-events/security-events.service";
import {
  TenantInvitationDeliveryService,
  type TenantInvitationDeliveryRequest,
} from "../../apps/api/src/modules/tenant-partner/tenant-invitation-delivery.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

// PWD-LOGIN-008 (SA/SD §7/§8): fixture for driving a real password+TOTP
// login (`AuthController.passwordLogin` -> `resolvePasswordLoginAmr` ->
// `JwtAuthService.issueSessionToken` -> `IdentityRepository.createSession`)
// so scenario 8 below exercises `getSessionContext` against a session the
// real issuer produced, not one seeded directly into the repository.
const PRIOR_ENV = { ...process.env };
const CORRECT_PASSWORD = "correct horse battery staple";
const TOTP_KEY_V1 = Buffer.alloc(
  32,
  "identity-session-context-totp-key",
).toString("base64");

beforeAll(() => {
  process.env.APP_ENV = "local";
  process.env.AUTH_MODE = "local";
  process.env.JWT_SECRET = "test_jwt_secret_key_32_characters_long_min!";
  process.env.PASSWORD_PEPPER_SECRETS_JSON = JSON.stringify({
    v1: "identity-session-context-test-pepper-32chars!",
  });
  process.env.PASSWORD_PEPPER_CURRENT_VERSION = "v1";
  process.env.TOTP_ENCRYPTION_KEYS_JSON = JSON.stringify({
    activeKeyId: "v1",
    keys: { v1: TOTP_KEY_V1 },
  });
});

afterAll(() => {
  process.env = { ...PRIOR_ENV };
});

class CapturingInvitationDelivery extends TenantInvitationDeliveryService {
  readonly tokens = new Map<string, string>();

  override async send(request: TenantInvitationDeliveryRequest) {
    this.tokens.set(request.invitationId, request.rawToken);
    return super.send(request);
  }
}

function createLoginFixture() {
  const identityRepository = new IdentityRepository();
  const agencyDirectoryRepository = new AgencyDirectoryRepository();
  const securityEventsService = new SecurityEventsService();
  const totpCredentialRepository = new TotpCredentialRepository();
  const totpService = new TotpService(totpCredentialRepository);
  const delivery = new CapturingInvitationDelivery();
  const tenantPartnerService = new TenantPartnerService(
    new AuditNotificationService(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    identityRepository,
    identityRepository,
    delivery,
  );
  const jwtAuthService = new JwtAuthService(
    identityRepository,
    tenantPartnerService,
    undefined,
    agencyDirectoryRepository,
  );
  const authController = new AuthController(
    jwtAuthService,
    tenantPartnerService,
    {} as never,
    securityEventsService,
    undefined,
    undefined,
    identityRepository,
    undefined,
    undefined,
    undefined,
    undefined,
    agencyDirectoryRepository,
    totpService,
    totpCredentialRepository,
  );
  return {
    identityRepository,
    tenantPartnerService,
    delivery,
    totpService,
    authController,
  };
}

async function createActiveTenantPasswordUser(
  fixture: ReturnType<typeof createLoginFixture>,
  options: { tenantId: string; email: string },
) {
  await fixture.tenantPartnerService.createTenantUser(options.tenantId, {
    email: options.email,
    displayName: "Identity Session Context Fixture",
    roleCode: "tenant_viewer",
  });
  const invitation = fixture.identityRepository
    .listInvitations()
    .find(
      (candidate) =>
        candidate.email.toLowerCase() === options.email.toLowerCase(),
    )!;
  const rawToken = fixture.delivery.tokens.get(invitation.invitationId)!;
  await fixture.tenantPartnerService.acceptTenantInvitationWithPassword({
    invitationToken: rawToken,
    password: CORRECT_PASSWORD,
  });
  const principal = fixture.identityRepository
    .listPrincipals()
    .find(
      (candidate) =>
        candidate.email?.toLowerCase() === options.email.toLowerCase(),
    )!;
  return { principal };
}

async function enrollAndConfirmTotp(
  totpService: TotpService,
  principalId: string,
): Promise<{ secret: string }> {
  const enrollment = await totpService.enroll(
    principalId,
    "tenant:identity-session-context-fixture",
  );
  const confirmCode = await generate({ secret: enrollment.secret });
  await totpService.confirm(principalId, confirmCode);
  return { secret: enrollment.secret };
}

/** Advances past the step `confirm()` already consumed so the next
 * generated code lands on a fresh, unused 30s step. */
async function freshLoginCode(secret: string): Promise<string> {
  const nextStepEpoch = (Math.floor(Date.now() / 30_000) + 1) * 30;
  return generate({ secret, epoch: nextStepEpoch });
}

type PasswordLoginEnvelope = {
  data: {
    identity: {
      sessionId?: string;
      tokenVersion?: number;
      amr?: string[];
    };
  };
};

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
    // Bind the grant to the live session, mirroring what
    // BreakGlassController.activate does after a successful token issuance
    // (round-3 R6: an unbound grant must not be a valid "active" fixture --
    // listActiveGrantsForPrincipal fails closed on a missing sessionId).
    await breakGlassService.bindSession(grant.grantId, "sess-1");

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
      const afterExpiry = await controller.getSessionContext(callerIdentity());
      expect(afterExpiry.data.sessionActive).toBe(true);
      expect(afterExpiry.data.activeBreakGlassGrants).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("scenario 7 (round-3 R6): a grant left status='active' by a failed activation with no bound session is not reported active", async () => {
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
    await breakGlassService.approve(approverIdentity, grant.grantId, mutation);
    // Mirror BreakGlassController.activate up to the point where token
    // issuance fails: the grant is left in storage with status "active" but
    // `sessionId` is never set because bindSession is never reached.
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

    const result = await controller.getSessionContext(callerIdentity());
    expect(result.data.sessionActive).toBe(true);
    expect(result.data.activeBreakGlassGrants).toEqual([]);
  });

  // PWD-LOGIN-008 (SA/SD §8): a password(+TOTP) login issues its session
  // through the exact same `JwtAuthService.issueSessionToken` ->
  // `createSession` path as the Google OIDC login, only with
  // `authMethods: ["pwd", "otp"]` instead of an OIDC `amr`. This endpoint
  // must recognize that session identically to every scenario above -- it
  // never branches on login method. Driven through the real entry chain
  // (`AuthController.passwordLogin`) rather than a hand-seeded session row,
  // so this also proves `resolvePasswordLoginAmr`'s real-verified `amr`
  // reaches a session `getSessionContext` recognizes as active.
  it("scenario 8 (PWD-LOGIN-008): a password+TOTP session (authMethods ['pwd','otp']) is recognized as active identically to an OIDC session", async () => {
    const loginFixture = createLoginFixture();
    const tenantId = "tenant-identity-session-context-pwd008";
    const { principal } = await createActiveTenantPasswordUser(loginFixture, {
      tenantId,
      email: "pwd008-context@example.com",
    });
    const { secret } = await enrollAndConfirmTotp(
      loginFixture.totpService,
      principal.principalId,
    );
    const totpCode = await freshLoginCode(secret);

    const envelope = (await loginFixture.authController.passwordLogin(
      "tenant",
      {
        email: "pwd008-context@example.com",
        password: CORRECT_PASSWORD,
        tenantId,
        totpCode,
      },
    )) as PasswordLoginEnvelope;
    expect(envelope.data.identity.amr).toEqual(["pwd", "otp"]);

    const issuedSessionId = envelope.data.identity.sessionId!;
    const issuedPrincipalId = principal.principalId;
    const issuedTokenVersion = envelope.data.identity.tokenVersion!;
    const stored =
      await loginFixture.identityRepository.getSession(issuedSessionId);
    expect(stored?.authMethods).toEqual(["pwd", "otp"]);
    expect(stored?.principalId).toBe(issuedPrincipalId);

    const breakGlassService = new BreakGlassService(
      loginFixture.identityRepository,
    );
    const controller = new IdentityController(
      loginFixture.identityRepository,
      undefined,
      undefined,
      undefined,
      breakGlassService,
    );

    const result = await controller.getSessionContext(
      callerIdentity({
        principalId: issuedPrincipalId,
        sessionId: issuedSessionId,
        tokenVersion: issuedTokenVersion,
      }),
    );
    expect(result.data.sessionActive).toBe(true);
    expect(result.data.principalId).toBe(issuedPrincipalId);
    expect(result.data.sessionId).toBe(issuedSessionId);
  });
});
