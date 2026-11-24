import { createHmac } from "node:crypto";
import type {
  CanonicalIdentityMembershipRecord,
  CanonicalIdentityPrincipalRecord,
  CanonicalIdentitySessionRecord,
} from "@drts/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

// Boundary simulation note (AI_COLLABORATION_GUIDE.md §0.7):
// 1. This VM's shared node_modules resolves zod@3.25.76 inside packages/contracts
//    instead of zod@^4.6.6, causing unrelated `packages/contracts/src/unattended-voice.ts`
//    (`z.string().guid()`) to throw at barrel import time. Stubbing that unrelated
//    voice-schema barrel leaf lets the real `@drts/contracts` identity/auth contracts,
//    `AuthController`, `PlatformAdminService`, and `AuditNotificationService` load.
// 2. This VM's shared node_modules does not have the native `argon2` or `otplib`
//    packages installed locally. Password-reset delivery, token issuance/consumption,
//    session revocation, AuthController#requestPasswordReset/#confirmPasswordReset,
//    and PlatformAdminService#sendUserPasswordReset are exercised with their real
//    production classes below; only the low-level argon2 digest primitive in
//    PasswordHashingService (and unused TotpService module import) is shimmed so
//    AuthController can be imported and executed in this worktree.
vi.mock("../../../../packages/contracts/src/unattended-voice", () => ({}));
vi.mock(
  "../../../../packages/contracts/src/voice-callback-operations",
  () => ({}),
);

vi.mock("../../src/common/auth/password-hashing.service", () => {
  class PasswordPepperNotConfiguredError extends Error {
    constructor(message = "Password pepper is not configured.") {
      super(message);
      this.name = "PasswordPepperNotConfiguredError";
    }
  }
  class PasswordHashingService {
    async hash(password: string): Promise<{
      hash: string;
      algo: "argon2id";
      pepperVersion: string;
    }> {
      const rawJson = process.env.PASSWORD_PEPPER_SECRETS_JSON?.trim();
      const currentVersion =
        process.env.PASSWORD_PEPPER_CURRENT_VERSION?.trim() || "v1";
      if (!rawJson) {
        throw new PasswordPepperNotConfiguredError();
      }
      let secrets: Record<string, string>;
      try {
        secrets = JSON.parse(rawJson) as Record<string, string>;
      } catch {
        throw new PasswordPepperNotConfiguredError();
      }
      const pepper = secrets[currentVersion];
      if (!pepper) {
        throw new PasswordPepperNotConfiguredError();
      }
      const digest = createHmac("sha256", pepper)
        .update(password)
        .digest("hex");
      return {
        hash: `argon2id$v=19$m=19456,t=2,p=1$${currentVersion}$${digest}`,
        algo: "argon2id",
        pepperVersion: currentVersion,
      };
    }
  }
  return {
    PasswordHashingService,
    PasswordPepperNotConfiguredError,
  };
});

vi.mock("../../src/modules/auth/totp.service", () => ({
  TotpService: class {},
  TotpCodeInvalidError: class extends Error {},
  TotpCodeReplayedError: class extends Error {},
  TotpKeyNotConfiguredError: class extends Error {},
  TotpNotEnrolledError: class extends Error {},
}));

vi.mock(
  "../../src/modules/notification-delivery/remote-smtp-mail.transport",
  () => ({
    RemoteSmtpMailTransport: class {},
  }),
);

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { AuthController } from "../../src/modules/auth/auth.controller";
import { IdentityRepository } from "../../src/modules/identity/identity.repository";
import { PlatformAdminService } from "../../src/modules/platform-admin/platform-admin.service";
import { SecurityEventsService } from "../../src/modules/security-events/security-events.service";
import {
  TenantInvitationDeliveryService,
  buildPasswordResetEmailBody,
  resolvePasswordResetBaseUrl,
} from "../../src/modules/tenant-partner/tenant-invitation-delivery.service";
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

function extractResetLinkFromEmailBody(body: string): URL {
  const match = /^Reset your password:\s*(\S+)$/m.exec(body);
  expect(match?.[1]).toBeTruthy();
  return new URL(match![1]!);
}

describe("PORTAL-PASSWORD-RESET-EMAIL-ROUTING-20261123: realm-routed reset email links, existing callers, and legacy config compatibility", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("routes tenant, agency, and partner reset links to each realm's trusted portal /reset-password page even when PASSWORD_RESET_URL_BASE points to tenant", async () => {
    vi.stubEnv(
      "TENANT_INVITATION_ACCEPT_URL_BASE",
      "https://tenant.portal.example.test/api/auth/tenant/login",
    );
    vi.stubEnv(
      "AGENCY_INVITATION_ACCEPT_URL_BASE",
      "https://agency.portal.example.test/invite",
    );
    vi.stubEnv(
      "FLEET_INVITATION_ACCEPT_URL_BASE",
      "https://fleet.portal.example.test/invite",
    );
    vi.stubEnv(
      "PASSWORD_RESET_URL_BASE",
      "https://tenant.portal.example.test/reset-password",
    );

    const { service, calls } = createFakeNotificationDeliveryService();
    const delivery = new TenantInvitationDeliveryService(service);

    await delivery.sendPasswordReset({
      dedupeKey: "routing_tenant:1",
      realm: "tenant",
      tenantId: "tenant_demo",
      recipientEmail: "tenant-member@example.test",
      expiresAt: "2026-11-23T04:00:00.000Z",
      rawToken: "pwr_tenant_token_001",
    });
    await delivery.sendPasswordReset({
      dedupeKey: "routing_agency:1",
      realm: "agency",
      tenantId: null,
      recipientEmail: "agency-member@example.test",
      expiresAt: "2026-11-23T04:00:00.000Z",
      rawToken: "pwr_agency_token_001",
    });
    await delivery.sendPasswordReset({
      dedupeKey: "routing_partner:1",
      realm: "partner",
      tenantId: null,
      recipientEmail: "fleet-member@example.test",
      expiresAt: "2026-11-23T04:00:00.000Z",
      rawToken: "pwr_partner_token_001",
    });

    const tenantUrl = extractResetLinkFromEmailBody(calls.enqueue[0]!.body);
    expect(tenantUrl.origin).toBe("https://tenant.portal.example.test");
    expect(tenantUrl.pathname).toBe("/reset-password");
    expect(tenantUrl.searchParams.get("token")).toBe("pwr_tenant_token_001");

    const agencyUrl = extractResetLinkFromEmailBody(
      calls.sendPlatformMail[0]!.body,
    );
    expect(agencyUrl.origin).toBe("https://agency.portal.example.test");
    expect(agencyUrl.pathname).toBe("/reset-password");
    expect(agencyUrl.searchParams.get("token")).toBe("pwr_agency_token_001");

    const partnerUrl = extractResetLinkFromEmailBody(
      calls.sendPlatformMail[1]!.body,
    );
    expect(partnerUrl.origin).toBe("https://fleet.portal.example.test");
    expect(partnerUrl.pathname).toBe("/reset-password");
    expect(partnerUrl.searchParams.get("token")).toBe("pwr_partner_token_001");
  });

  it("preserves legacy single-URL PASSWORD_RESET_URL_BASE behavior when no per-portal invitation URL is configured", async () => {
    vi.stubEnv("TENANT_INVITATION_ACCEPT_URL_BASE", "");
    vi.stubEnv("AGENCY_INVITATION_ACCEPT_URL_BASE", "");
    vi.stubEnv("FLEET_INVITATION_ACCEPT_URL_BASE", "");
    vi.stubEnv(
      "PASSWORD_RESET_URL_BASE",
      "https://legacy-single.example.test/reset-password?lang=zh-TW",
    );

    const { service, calls } = createFakeNotificationDeliveryService();
    const delivery = new TenantInvitationDeliveryService(service);

    await delivery.sendPasswordReset({
      dedupeKey: "legacy_tenant:1",
      realm: "tenant",
      tenantId: "tenant_demo",
      recipientEmail: "tenant@example.test",
      expiresAt: "2026-11-23T04:00:00.000Z",
      rawToken: "pwr_legacy_tenant",
    });
    await delivery.sendPasswordReset({
      dedupeKey: "legacy_agency:1",
      realm: "agency",
      tenantId: null,
      recipientEmail: "agency@example.test",
      expiresAt: "2026-11-23T04:00:00.000Z",
      rawToken: "pwr_legacy_agency",
    });
    await delivery.sendPasswordReset({
      dedupeKey: "legacy_partner:1",
      realm: "partner",
      tenantId: null,
      recipientEmail: "partner@example.test",
      expiresAt: "2026-11-23T04:00:00.000Z",
      rawToken: "pwr_legacy_partner",
    });

    expect(calls.enqueue[0]?.body).toContain(
      "Reset your password: https://legacy-single.example.test/reset-password?lang=zh-TW&token=pwr_legacy_tenant",
    );
    expect(calls.sendPlatformMail[0]?.body).toContain(
      "Reset your password: https://legacy-single.example.test/reset-password?lang=zh-TW&token=pwr_legacy_agency",
    );
    expect(calls.sendPlatformMail[1]?.body).toContain(
      "Reset your password: https://legacy-single.example.test/reset-password?lang=zh-TW&token=pwr_legacy_partner",
    );
  });

  it("falls back to 'Password reset code: <rawToken>' when a realm's portal configuration is missing or invalid without cross-routing to another realm or fabricating a domain", async () => {
    vi.stubEnv(
      "TENANT_INVITATION_ACCEPT_URL_BASE",
      "https://tenant.portal.example.test/invite",
    );
    vi.stubEnv("AGENCY_INVITATION_ACCEPT_URL_BASE", "");
    vi.stubEnv("FLEET_INVITATION_ACCEPT_URL_BASE", "javascript:alert(1)");
    vi.stubEnv(
      "PASSWORD_RESET_URL_BASE",
      "https://tenant.portal.example.test/reset-password",
    );

    const { service, calls } = createFakeNotificationDeliveryService();
    const delivery = new TenantInvitationDeliveryService(service);

    await delivery.sendPasswordReset({
      dedupeKey: "missing_agency:1",
      realm: "agency",
      tenantId: null,
      recipientEmail: "agency-missing@example.test",
      expiresAt: "2026-11-23T04:00:00.000Z",
      rawToken: "pwr_agency_code_only",
    });
    await delivery.sendPasswordReset({
      dedupeKey: "invalid_partner:1",
      realm: "partner",
      tenantId: null,
      recipientEmail: "partner-invalid@example.test",
      expiresAt: "2026-11-23T04:00:00.000Z",
      rawToken: "pwr_partner_code_only",
    });

    expect(calls.sendPlatformMail[0]?.body).toContain(
      "Password reset code: pwr_agency_code_only",
    );
    expect(calls.sendPlatformMail[0]?.body).not.toContain(
      "Reset your password:",
    );
    expect(calls.sendPlatformMail[0]?.body).not.toContain("smarttransport.tw");

    expect(calls.sendPlatformMail[1]?.body).toContain(
      "Password reset code: pwr_partner_code_only",
    );
    expect(calls.sendPlatformMail[1]?.body).not.toContain(
      "Reset your password:",
    );
    expect(calls.sendPlatformMail[1]?.body).not.toContain("smarttransport.tw");

    expect(
      resolvePasswordResetBaseUrl("tenant", {
        PASSWORD_RESET_URL_BASE:
          "https://tenant.portal.example.test/reset-password",
        AGENCY_INVITATION_ACCEPT_URL_BASE:
          "https://agency.portal.example.test/invite",
        FLEET_INVITATION_ACCEPT_URL_BASE:
          "https://fleet.portal.example.test/invite",
      }),
    ).toBe("https://tenant.portal.example.test/reset-password");
    expect(
      buildPasswordResetEmailBody(
        {
          dedupeKey: "direct_unconfigured:1",
          realm: "tenant",
          tenantId: "tenant_demo",
          recipientEmail: "unconfigured@example.test",
          expiresAt: "2026-11-23T04:00:00.000Z",
          rawToken: "pwr_direct_unconfigured",
        },
        {},
      ),
    ).toContain("Password reset code: pwr_direct_unconfigured");
  });

  it("self-service caller (AuthController.requestPasswordReset -> confirmPasswordReset) delivers realm-specific links to a simulated inbox and confirms each user's own token (including shared tenant/enterprise accounts)", async () => {
    vi.stubEnv(
      "TENANT_INVITATION_ACCEPT_URL_BASE",
      "https://tenant.portal.example.test/invite",
    );
    vi.stubEnv(
      "AGENCY_INVITATION_ACCEPT_URL_BASE",
      "https://agency.portal.example.test/invite",
    );
    vi.stubEnv(
      "FLEET_INVITATION_ACCEPT_URL_BASE",
      "https://fleet.portal.example.test/invite",
    );
    vi.stubEnv(
      "PASSWORD_PEPPER_SECRETS_JSON",
      JSON.stringify({ v1: "test-self-service-pepper-secret-32chars!" }),
    );
    vi.stubEnv("PASSWORD_PEPPER_CURRENT_VERSION", "v1");

    const repo = new IdentityRepository();
    const securityEvents = new SecurityEventsService();
    const { service: fakeNotificationService, calls } =
      createFakeNotificationDeliveryService();
    const deliveryService = new TenantInvitationDeliveryService(
      fakeNotificationService,
    );

    const controller = new AuthController(
      {} as never,
      {} as never,
      {} as never,
      securityEvents,
      undefined,
      undefined,
      repo,
    );
    (
      controller as unknown as {
        passwordResetDelivery: TenantInvitationDeliveryService;
      }
    ).passwordResetDelivery = deliveryService;

    const { principal: tenantPrincipal, membership: tenantMembership } =
      await seedActivePrincipalWithMembership(repo, {
        principal: { email: "shared-tenant-enterprise@example.test" },
        membership: {
          realm: "tenant",
          scopeRef: "tenant:tenant_shared_001",
          tenantId: "tenant_shared_001",
        },
      });
    const { principal: agencyPrincipal, membership: agencyMembership } =
      await seedActivePrincipalWithMembership(repo, {
        principal: { email: "agency-self@example.test" },
        membership: {
          realm: "agency",
          scopeRef: "agency:agency_001",
          tenantId: null,
        },
      });
    const { principal: partnerPrincipal, membership: partnerMembership } =
      await seedActivePrincipalWithMembership(repo, {
        principal: { email: "fleet-self@example.test" },
        membership: {
          realm: "partner",
          scopeRef: "partner:fleet_001",
          tenantId: null,
          partnerId: "fleet_001",
        },
      });

    for (const [principal, membership] of [
      [tenantPrincipal, tenantMembership],
      [agencyPrincipal, agencyMembership],
      [partnerPrincipal, partnerMembership],
    ] as const) {
      await repo.setPasswordCredentialForPrincipal(principal.principalId, {
        passwordHash: "argon2id$initial-hash",
        passwordAlgo: "argon2id",
        pepperVersion: "v1",
      });
      await repo.createSession(seedSession(principal, membership));
    }

    const tenantReqRes = await controller.requestPasswordReset(
      "tenant",
      { email: "shared-tenant-enterprise@example.test" },
      "req_self_tenant",
    );
    const agencyReqRes = await controller.requestPasswordReset(
      "agency",
      { email: "agency-self@example.test" },
      "req_self_agency",
    );
    const partnerReqRes = await controller.requestPasswordReset(
      "partner",
      { email: "fleet-self@example.test" },
      "req_self_partner",
    );

    expect(tenantReqRes.data).toEqual({ accepted: true });
    expect(agencyReqRes.data).toEqual({ accepted: true });
    expect(partnerReqRes.data).toEqual({ accepted: true });

    expect(calls.enqueue).toHaveLength(1);
    expect(calls.sendPlatformMail).toHaveLength(2);

    const tenantResetUrl = extractResetLinkFromEmailBody(
      calls.enqueue[0]!.body,
    );
    expect(tenantResetUrl.origin).toBe("https://tenant.portal.example.test");
    expect(tenantResetUrl.pathname).toBe("/reset-password");
    const tenantToken = tenantResetUrl.searchParams.get("token")!;
    expect(tenantToken).toMatch(/^pwr_/);

    const agencyResetUrl = extractResetLinkFromEmailBody(
      calls.sendPlatformMail[0]!.body,
    );
    expect(agencyResetUrl.origin).toBe("https://agency.portal.example.test");
    expect(agencyResetUrl.pathname).toBe("/reset-password");
    const agencyToken = agencyResetUrl.searchParams.get("token")!;
    expect(agencyToken).toMatch(/^pwr_/);

    const partnerResetUrl = extractResetLinkFromEmailBody(
      calls.sendPlatformMail[1]!.body,
    );
    expect(partnerResetUrl.origin).toBe("https://fleet.portal.example.test");
    expect(partnerResetUrl.pathname).toBe("/reset-password");
    const partnerToken = partnerResetUrl.searchParams.get("token")!;
    expect(partnerToken).toMatch(/^pwr_/);

    // Confirm each user's reset token against their realm's confirm endpoint
    // (tenant-console-web and enterprise-dispatch-web both post to
    // /api/auth/tenant/password-reset/confirm for the shared tenant account).
    const tenantConfirm = await controller.confirmPasswordReset(
      "tenant",
      { token: tenantToken, password: "NewSharedTenantEnterprisePass!2026" },
      "req_confirm_tenant",
    );
    const agencyConfirm = await controller.confirmPasswordReset(
      "agency",
      { token: agencyToken, password: "NewAgencyPortalPassword!2026" },
      "req_confirm_agency",
    );
    const partnerConfirm = await controller.confirmPasswordReset(
      "partner",
      { token: partnerToken, password: "NewFleetPartnerPassword!2026" },
      "req_confirm_partner",
    );

    expect(tenantConfirm.data).toEqual({
      passwordReset: true,
      revokedSessionCount: 1,
    });
    expect(agencyConfirm.data).toEqual({
      passwordReset: true,
      revokedSessionCount: 1,
    });
    expect(partnerConfirm.data).toEqual({
      passwordReset: true,
      revokedSessionCount: 1,
    });

    for (const principal of [
      tenantPrincipal,
      agencyPrincipal,
      partnerPrincipal,
    ]) {
      const updatedCred = await repo.findPasswordCredentialByPrincipalId(
        principal.principalId,
      );
      expect(updatedCred?.passwordHash).not.toBe("argon2id$initial-hash");
      const sessions = await repo.listSessionsByPrincipal(
        principal.principalId,
      );
      expect(sessions[0]?.status).toBe("revoked");
      expect(sessions[0]?.revokeReason).toBe("password_reset");
    }
  });

  it("admin caller (PlatformAdminService.sendUserPasswordReset) delivers realm-specific links for tenant, agency, and partner users and each user's token confirms their password reset", async () => {
    vi.stubEnv(
      "TENANT_INVITATION_ACCEPT_URL_BASE",
      "https://tenant.portal.example.test/api/auth/tenant/login",
    );
    vi.stubEnv(
      "AGENCY_INVITATION_ACCEPT_URL_BASE",
      "https://agency.portal.example.test/invite",
    );
    vi.stubEnv(
      "FLEET_INVITATION_ACCEPT_URL_BASE",
      "https://fleet.portal.example.test/invite",
    );
    vi.stubEnv(
      "PASSWORD_PEPPER_SECRETS_JSON",
      JSON.stringify({ v1: "test-admin-caller-pepper-secret-32chars!" }),
    );
    vi.stubEnv("PASSWORD_PEPPER_CURRENT_VERSION", "v1");

    const repo = new IdentityRepository();
    const auditService = new AuditNotificationService();
    const { service: fakeNotificationService, calls } =
      createFakeNotificationDeliveryService();
    const deliveryService = new TenantInvitationDeliveryService(
      fakeNotificationService,
    );

    const platformAdminService = new PlatformAdminService(
      auditService,
      undefined,
      repo,
    );
    (
      platformAdminService as unknown as {
        passwordResetDelivery: TenantInvitationDeliveryService;
      }
    ).passwordResetDelivery = deliveryService;

    const controller = new AuthController(
      {} as never,
      {} as never,
      {} as never,
      new SecurityEventsService(),
      undefined,
      undefined,
      repo,
    );
    (
      controller as unknown as {
        passwordResetDelivery: TenantInvitationDeliveryService;
      }
    ).passwordResetDelivery = deliveryService;

    const { principal: tenantPrincipal } =
      await seedActivePrincipalWithMembership(repo, {
        principal: { email: "admin-target-tenant@example.test" },
        membership: {
          realm: "tenant",
          scopeRef: "tenant:tenant_admin_target",
          tenantId: "tenant_admin_target",
        },
      });
    const { principal: agencyPrincipal } =
      await seedActivePrincipalWithMembership(repo, {
        principal: { email: "admin-target-agency@example.test" },
        membership: {
          realm: "agency",
          scopeRef: "agency:agency_admin_target",
          tenantId: null,
        },
      });
    const { principal: partnerPrincipal } =
      await seedActivePrincipalWithMembership(repo, {
        principal: { email: "admin-target-partner@example.test" },
        membership: {
          realm: "partner",
          scopeRef: "partner:fleet_admin_target",
          tenantId: null,
          partnerId: "fleet_admin_target",
        },
      });

    for (const principal of [
      tenantPrincipal,
      agencyPrincipal,
      partnerPrincipal,
    ]) {
      await repo.setPasswordCredentialForPrincipal(principal.principalId, {
        passwordHash: "argon2id$before-admin-reset",
        passwordAlgo: "argon2id",
        pepperVersion: "v1",
      });
    }

    const tenantSend = await platformAdminService.sendUserPasswordReset(
      tenantPrincipal.principalId,
      { reasonCode: "support_ticket_tenant_reset" },
      "req_admin_tenant",
      "principal_platform_admin_1",
    );
    const agencySend = await platformAdminService.sendUserPasswordReset(
      agencyPrincipal.principalId,
      { reasonCode: "support_ticket_agency_reset" },
      "req_admin_agency",
      "principal_platform_admin_1",
    );
    const partnerSend = await platformAdminService.sendUserPasswordReset(
      partnerPrincipal.principalId,
      { reasonCode: "support_ticket_partner_reset" },
      "req_admin_partner",
      "principal_platform_admin_1",
    );

    expect(tenantSend).toEqual({ sent: true });
    expect(agencySend).toEqual({ sent: true });
    expect(partnerSend).toEqual({ sent: true });

    const tenantUrl = extractResetLinkFromEmailBody(calls.enqueue[0]!.body);
    expect(tenantUrl.origin).toBe("https://tenant.portal.example.test");
    expect(tenantUrl.pathname).toBe("/reset-password");
    const tenantToken = tenantUrl.searchParams.get("token")!;

    const agencyUrl = extractResetLinkFromEmailBody(
      calls.sendPlatformMail[0]!.body,
    );
    expect(agencyUrl.origin).toBe("https://agency.portal.example.test");
    expect(agencyUrl.pathname).toBe("/reset-password");
    const agencyToken = agencyUrl.searchParams.get("token")!;

    const partnerUrl = extractResetLinkFromEmailBody(
      calls.sendPlatformMail[1]!.body,
    );
    expect(partnerUrl.origin).toBe("https://fleet.portal.example.test");
    expect(partnerUrl.pathname).toBe("/reset-password");
    const partnerToken = partnerUrl.searchParams.get("token")!;

    // Verify audit records never expose raw tokens or password fields.
    const audits = auditService.listAuditLogs();
    const resetAudits = audits.filter(
      (entry) => entry.actionName === "send_user_password_reset",
    );
    expect(resetAudits).toHaveLength(3);
    expect(JSON.stringify(resetAudits)).not.toContain(tenantToken);
    expect(JSON.stringify(resetAudits)).not.toContain(agencyToken);
    expect(JSON.stringify(resetAudits)).not.toContain(partnerToken);

    // Each recipient's token issued by admin sendUserPasswordReset is accepted
    // by their own realm's confirmPasswordReset endpoint.
    expect(
      (
        await controller.confirmPasswordReset("tenant", {
          token: tenantToken,
          password: "AdminTriggeredTenantPass!2026",
        })
      ).data,
    ).toEqual({ passwordReset: true, revokedSessionCount: 0 });
    expect(
      (
        await controller.confirmPasswordReset("agency", {
          token: agencyToken,
          password: "AdminTriggeredAgencyPass!2026",
        })
      ).data,
    ).toEqual({ passwordReset: true, revokedSessionCount: 0 });
    expect(
      (
        await controller.confirmPasswordReset("partner", {
          token: partnerToken,
          password: "AdminTriggeredPartnerPass!2026",
        })
      ).data,
    ).toEqual({ passwordReset: true, revokedSessionCount: 0 });
  });
});
