import type {
  CanonicalIdentityMembershipRecord,
  CanonicalIdentityPrincipalRecord,
  CanonicalIdentitySessionRecord,
} from "@drts/contracts";
import { describe, expect, it } from "vitest";

import { IdentityRepository } from "../../src/modules/identity/identity.repository";
import { TenantInvitationDeliveryService } from "../../src/modules/tenant-partner/tenant-invitation-delivery.service";
import type {
  DeliveryReceipt,
  EnqueueMail,
  PlatformMail,
} from "../../src/modules/notification-delivery/notification-delivery.types";
import type { NotificationDeliveryService } from "../../src/modules/notification-delivery/notification-delivery.service";

let principalSeq = 0;
function seedPrincipal(
  overrides: Partial<CanonicalIdentityPrincipalRecord> = {},
): CanonicalIdentityPrincipalRecord {
  principalSeq += 1;
  const now = new Date().toISOString();
  return {
    principalId: `principal_pwdreset_${principalSeq}`,
    sourceRef: null,
    issuer: "test_issuer",
    subject: `subject_${principalSeq}`,
    principalType: "human",
    email: `user${principalSeq}@example.test`,
    emailVerified: true,
    displayName: "Test User",
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function seedMembership(
  principal: CanonicalIdentityPrincipalRecord,
  overrides: Partial<CanonicalIdentityMembershipRecord> = {},
): CanonicalIdentityMembershipRecord {
  const now = new Date().toISOString();
  return {
    membershipId: `membership_${principal.principalId}`,
    sourceRef: null,
    principalId: principal.principalId,
    realm: "tenant",
    scopeRef: "tenant:tenant_demo",
    tenantId: "tenant_demo",
    partnerId: null,
    status: "active",
    invitedByPrincipalId: null,
    invitationId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function seedActivePrincipalWithMembership(
  repo: IdentityRepository,
  overrides: {
    principal?: Partial<CanonicalIdentityPrincipalRecord>;
    membership?: Partial<CanonicalIdentityMembershipRecord>;
  } = {},
) {
  const principal = await repo.ensurePrincipalRecord(
    seedPrincipal(overrides.principal),
  );
  const membership = await repo.ensureMembershipRecord(
    seedMembership(principal, overrides.membership),
  );
  return { principal, membership };
}

function seedSession(
  principal: CanonicalIdentityPrincipalRecord,
  membership: CanonicalIdentityMembershipRecord,
): CanonicalIdentitySessionRecord {
  const now = new Date().toISOString();
  return {
    sessionId: `session_${principal.principalId}`,
    sourceRef: null,
    principalId: principal.principalId,
    membershipId: membership.membershipId,
    realm: membership.realm,
    status: "active",
    authTime: now,
    authMethods: ["pwd"],
    tokenVersion: 1,
    idleExpiresAt: null,
    absoluteExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    revokedAt: null,
    revokedByPrincipalId: null,
    revokeReason: null,
    deviceSummary: {},
    riskSummary: {},
    createdAt: now,
    updatedAt: now,
  };
}

describe("IdentityRepository password reset tokens (PWD-LOGIN-006 SA/SD §6)", () => {
  it("is single-use: a second consume of the same token fails", async () => {
    const repo = new IdentityRepository();
    const { principal } = await seedActivePrincipalWithMembership(repo);
    const { rawToken } = await repo.createPasswordResetToken(
      principal.principalId,
    );

    const first = await repo.consumePasswordResetToken(rawToken);
    expect(first).toEqual({ principalId: principal.principalId });

    const second = await repo.consumePasswordResetToken(rawToken);
    expect(second).toBeNull();
  });

  it("rejects an unknown token", async () => {
    const repo = new IdentityRepository();
    const result = await repo.consumePasswordResetToken("pwr_not-a-real-token");
    expect(result).toBeNull();
  });

  it("issues a token that expires 15 minutes from now", async () => {
    const repo = new IdentityRepository();
    const { principal } = await seedActivePrincipalWithMembership(repo);
    const before = Date.now();
    const { expiresAt } = await repo.createPasswordResetToken(
      principal.principalId,
    );
    const ttlMs = Date.parse(expiresAt) - before;
    expect(ttlMs).toBeGreaterThan(14 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);
  });

  it("rejects a token once it has expired", async () => {
    const repo = new IdentityRepository();
    const { principal } = await seedActivePrincipalWithMembership(repo);
    const { rawToken } = await repo.createPasswordResetToken(
      principal.principalId,
    );

    // Simulate the 15-minute TTL elapsing without depending on real wall-clock
    // time in the test: directly age the repository's own token record,
    // the same state `consumePasswordResetToken` reads from.
    const fallback = (
      repo as unknown as {
        fallbackPasswordResetTokens: Map<string, { expiresAt: string }>;
      }
    ).fallbackPasswordResetTokens;
    for (const [hash, entry] of fallback) {
      fallback.set(hash, {
        ...entry,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      });
    }

    const result = await repo.consumePasswordResetToken(rawToken);
    expect(result).toBeNull();
  });

  it("requesting a new token supersedes the principal's still-valid prior token", async () => {
    const repo = new IdentityRepository();
    const { principal } = await seedActivePrincipalWithMembership(repo);
    const { rawToken: firstToken } = await repo.createPasswordResetToken(
      principal.principalId,
    );
    const { rawToken: secondToken } = await repo.createPasswordResetToken(
      principal.principalId,
    );

    expect(await repo.consumePasswordResetToken(firstToken)).toBeNull();
    expect(await repo.consumePasswordResetToken(secondToken)).toEqual({
      principalId: principal.principalId,
    });
  });
});

describe("IdentityRepository.setPasswordCredentialForPrincipal", () => {
  it("writes the new hash and clears any existing lockout", async () => {
    const repo = new IdentityRepository();
    const { principal } = await seedActivePrincipalWithMembership(repo);

    await repo.setPasswordCredentialForPrincipal(principal.principalId, {
      passwordHash: "argon2id$old-hash",
      passwordAlgo: "argon2id",
      pepperVersion: "v1",
    });
    // Simulate a prior lockout the reset must clear.
    const fallback = (
      repo as unknown as {
        fallbackPasswordCredentials: Map<
          string,
          { failedAttempts: number; lockedUntil: string | null }
        >;
      }
    ).fallbackPasswordCredentials;
    const existing = fallback.get(principal.principalId)!;
    fallback.set(principal.principalId, {
      ...existing,
      failedAttempts: 9,
      lockedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    await repo.setPasswordCredentialForPrincipal(principal.principalId, {
      passwordHash: "argon2id$new-hash",
      passwordAlgo: "argon2id",
      pepperVersion: "v2",
    });

    const credential = await repo.findPasswordCredentialByPrincipalId(
      principal.principalId,
    );
    expect(credential?.passwordHash).toBe("argon2id$new-hash");
    expect(credential?.pepperVersion).toBe("v2");
    expect(credential?.failedAttempts).toBe(0);
    expect(credential?.lockedUntil).toBeNull();
  });
});

describe("IdentityRepository.findActivePrincipalAndMembershipForRealmByEmail", () => {
  it("scopes the match to the requested realm, not just the email", async () => {
    const repo = new IdentityRepository();
    const sharedEmail = "shared@example.test";
    const { principal: tenantPrincipal } =
      await seedActivePrincipalWithMembership(repo, {
        principal: { email: sharedEmail },
        membership: { realm: "tenant" },
      });
    const { principal: agencyPrincipal } =
      await seedActivePrincipalWithMembership(repo, {
        principal: { email: sharedEmail },
        membership: {
          realm: "agency",
          scopeRef: "agency:agency_demo",
          tenantId: null,
        },
      });
    expect(tenantPrincipal.principalId).not.toBe(agencyPrincipal.principalId);

    const tenantMatch =
      await repo.findActivePrincipalAndMembershipForRealmByEmail(
        sharedEmail,
        "tenant",
      );
    expect(tenantMatch?.principal.principalId).toBe(
      tenantPrincipal.principalId,
    );

    const agencyMatch =
      await repo.findActivePrincipalAndMembershipForRealmByEmail(
        sharedEmail,
        "agency",
      );
    expect(agencyMatch?.principal.principalId).toBe(
      agencyPrincipal.principalId,
    );

    const partnerMatch =
      await repo.findActivePrincipalAndMembershipForRealmByEmail(
        sharedEmail,
        "partner",
      );
    expect(partnerMatch).toBeNull();
  });

  it("ignores a disabled membership", async () => {
    const repo = new IdentityRepository();
    const email = "disabled-membership@example.test";
    await seedActivePrincipalWithMembership(repo, {
      principal: { email },
      membership: { status: "disabled" },
    });

    const match = await repo.findActivePrincipalAndMembershipForRealmByEmail(
      email,
      "tenant",
    );
    expect(match).toBeNull();
  });
});

describe("Password reset confirm composition (SA/SD §6 acceptance)", () => {
  it("consumes the token once, replaces the credential, and revokes every active session", async () => {
    const repo = new IdentityRepository();
    const { principal, membership } = await seedActivePrincipalWithMembership(
      repo,
    );
    await repo.setPasswordCredentialForPrincipal(principal.principalId, {
      passwordHash: "argon2id$before-reset",
      passwordAlgo: "argon2id",
      pepperVersion: "v1",
    });
    await repo.createSession(seedSession(principal, membership));

    const { rawToken } = await repo.createPasswordResetToken(
      principal.principalId,
    );

    // This is the exact sequence AuthController#confirmPasswordReset runs
    // (minus the real PasswordHashingService.hash() call, which needs the
    // native argon2 module this worktree's node_modules does not currently
    // resolve -- see the task handoff note).
    const consumed = await repo.consumePasswordResetToken(rawToken);
    expect(consumed).toEqual({ principalId: principal.principalId });

    await repo.setPasswordCredentialForPrincipal(consumed!.principalId, {
      passwordHash: "argon2id$after-reset",
      passwordAlgo: "argon2id",
      pepperVersion: "v2",
    });
    const revokedCount = await repo.revokeAllSessionsForPrincipal(
      consumed!.principalId,
      "password_reset",
      consumed!.principalId,
    );

    expect(revokedCount).toBe(1);
    const sessions = await repo.listSessionsByPrincipal(principal.principalId);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.status).toBe("revoked");
    expect(sessions[0]?.revokeReason).toBe("password_reset");

    const credential = await repo.findPasswordCredentialByPrincipalId(
      principal.principalId,
    );
    expect(credential?.passwordHash).toBe("argon2id$after-reset");

    // The token cannot be replayed to repeat the reset or the revocation.
    expect(await repo.consumePasswordResetToken(rawToken)).toBeNull();
  });
});

function createFakeNotificationDeliveryService(overrides?: {
  enqueueStatus?: "queued" | "sent" | "failed";
  dispatchStatus?: "queued" | "sent" | "failed";
  platformMailStatus?: "sent" | "unavailable" | "failed";
}) {
  const calls = {
    enqueue: [] as EnqueueMail[],
    dispatch: [] as Array<{ tenantId: string; deliveryId: string }>,
    sendPlatformMail: [] as PlatformMail[],
  };
  let deliverySeq = 0;
  const fake = {
    async enqueue(request: EnqueueMail): Promise<DeliveryReceipt> {
      calls.enqueue.push(request);
      deliverySeq += 1;
      return {
        deliveryId: `delivery_${deliverySeq}`,
        tenantId: request.tenantId,
        idempotencyKey: request.idempotencyKey,
        messageId: `<delivery_${deliverySeq}@test.invalid>`,
        status: overrides?.enqueueStatus ?? "queued",
        queuedAt: new Date().toISOString(),
        sentAt: null,
        nextAttemptAt: null,
        attempts: [],
      };
    },
    async dispatch(
      tenantId: string,
      deliveryId: string,
    ): Promise<DeliveryReceipt> {
      calls.dispatch.push({ tenantId, deliveryId });
      const status = overrides?.dispatchStatus ?? "sent";
      return {
        deliveryId,
        tenantId,
        idempotencyKey: deliveryId,
        messageId: `<${deliveryId}@test.invalid>`,
        status,
        queuedAt: new Date().toISOString(),
        sentAt: status === "sent" ? new Date().toISOString() : null,
        nextAttemptAt: null,
        attempts: [],
      };
    },
    async sendPlatformMail(
      request: PlatformMail,
    ): Promise<{ status: "sent" | "unavailable" | "failed" }> {
      calls.sendPlatformMail.push(request);
      return { status: overrides?.platformMailStatus ?? "sent" };
    },
  };
  return {
    service: fake as unknown as NotificationDeliveryService,
    calls,
  };
}

describe("TenantInvitationDeliveryService password-reset mail", () => {
  it("reports 'unavailable' without throwing when no mail transport is configured", async () => {
    const delivery = new TenantInvitationDeliveryService(null);
    const outcome = await delivery.sendPasswordReset({
      dedupeKey: "principal_x:1",
      realm: "tenant",
      tenantId: "tenant_demo",
      recipientEmail: "user@example.test",
      expiresAt: new Date().toISOString(),
      rawToken: "pwr_whatever",
    });
    expect(outcome.status).toBe("unavailable");
  });

  it("uses the durable per-tenant outbox (enqueue+dispatch) for the tenant realm", async () => {
    const { service, calls } = createFakeNotificationDeliveryService();
    const delivery = new TenantInvitationDeliveryService(service);
    const outcome = await delivery.sendPasswordReset({
      dedupeKey: "principal_tenant:1",
      realm: "tenant",
      tenantId: "tenant_demo",
      recipientEmail: "user@example.test",
      expiresAt: new Date().toISOString(),
      rawToken: "pwr_secret-token-value",
    });

    expect(outcome.status).toBe("sent");
    expect(calls.enqueue).toHaveLength(1);
    expect(calls.enqueue[0]?.tenantId).toBe("tenant_demo");
    expect(calls.dispatch).toHaveLength(1);
    expect(calls.sendPlatformMail).toHaveLength(0);
  });

  it("uses sendPlatformMail (no per-tenant outbox) for agency and partner realms", async () => {
    const { service, calls } = createFakeNotificationDeliveryService();
    const delivery = new TenantInvitationDeliveryService(service);

    const outcome = await delivery.sendPasswordReset({
      dedupeKey: "principal_agency:1",
      realm: "agency",
      tenantId: null,
      recipientEmail: "agency-user@example.test",
      expiresAt: new Date().toISOString(),
      rawToken: "pwr_secret-token-value",
    });

    expect(outcome.status).toBe("sent");
    expect(calls.sendPlatformMail).toHaveLength(1);
    expect(calls.sendPlatformMail[0]?.recipientEmail).toBe(
      "agency-user@example.test",
    );
    expect(calls.enqueue).toHaveLength(0);
  });

  it("never puts the raw token in the completed-reset notice", async () => {
    const { service, calls } = createFakeNotificationDeliveryService();
    const delivery = new TenantInvitationDeliveryService(service);
    await delivery.sendPasswordResetCompletedNotice({
      dedupeKey: "principal_tenant:2",
      realm: "tenant",
      tenantId: "tenant_demo",
      recipientEmail: "user@example.test",
    });
    expect(calls.enqueue[0]?.body).not.toMatch(/pwr_/);
  });
});

// PlatformAdminService.sendUserPasswordReset (the admin "send reset" trigger,
// SA/SD §6) is deliberately not exercised in this file. Importing
// PlatformAdminService or AuditNotificationService here pulls in
// @drts/contracts' runtime barrel, and this worktree's installed zod
// (3.25.76) does not satisfy packages/contracts/package.json's declared
// `zod: ^4.6.6`: `z.string().guid()` in packages/contracts/src/unattended-
// voice.ts throws at import time ("z.string(...).guid is not a function"),
// independent of anything in this task. This is pre-existing and
// environment-wide, not specific to password-reset: the already-merged
// tests/unit/audit-notification.service.test.ts fails identically in this
// worktree. Confirmed by running it unmodified:
//   pnpm --filter @drts/api exec vitest run tests/unit/audit-notification.service.test.ts
// -> TypeError: z.string(...).guid is not a function, same stack.
// sendUserPasswordReset was verified by code reading against SA/SD §6
// (reasonCode required, actor required, 404/409 on an inactive/credential-
// less target, audit record carries no password field) pending this
// environment defect being fixed; see the task handoff for detail.
