import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IdentityRepository } from "../../../../apps/api/src/modules/identity/identity.repository";
import { JwtAuthService } from "../../../../apps/api/src/common/auth/jwt-auth.service";

const testRsaKey = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

// SR-AUTH-SESSION-SUPERSEDE-20261003
//
// Root cause: JwtAuthService.issueSessionToken calls
// IdentityRepository.ensurePrincipalRecord on every issuance for a workforce
// (platform/ops) principal. ensurePrincipalRecord's upsert unconditionally
// bumped `updated_at` to "now" even when nothing about the principal
// actually changed. validateDurableState folds principal/membership/role
// binding `updatedAt` into a single "durable version" fingerprint
// (computeWorkforceTokenVersion) that every session's baked-in tokenVersion
// must still match at verify time. So re-issuing a session for the same
// principal (e.g. a parallel login, or a mail-verification bootstrap flow)
// silently advanced that fingerprint and made every *other* still-active
// session for that principal fail verifyAccessToken immediately.
describe("SR-AUTH-SESSION-SUPERSEDE-20261003: re-issuing a session must not supersede other active sessions", () => {
  let identityRepo: IdentityRepository;
  let jwtAuthService: JwtAuthService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T00:00:00.000Z"));
    process.env.JWT_KEY_RING_JSON = JSON.stringify([
      {
        kid: "key-test-2026",
        status: "active",
        algorithm: "RS256",
        privateKey: testRsaKey.privateKey,
        publicKey: testRsaKey.publicKey,
      },
    ]);
    identityRepo = new IdentityRepository();
    jwtAuthService = new JwtAuthService(identityRepo);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function buildWorkforceIdentity() {
    const account = await identityRepo.ensureDefaultPlatformAccount();
    const roleBindings = await identityRepo.findRoleBindingsByMembershipId(
      account.membership.membershipId,
    );
    const identity = {
      authMode: "jwt_bearer" as const,
      actorType: "platform_admin" as const,
      actorId: account.principal.principalId,
      principalId: account.principal.principalId,
      membershipId: account.membership.membershipId,
      realm: "platform" as const,
      tenantId: null,
      roles: ["platform_admin"],
      roleFamilies: ["platform" as const],
      scopes: ["identity:read"],
    };
    return {
      identity,
      workforceVersionTimestamps: [
        account.membership.updatedAt,
        ...roleBindings.map((binding) => binding.updatedAt),
      ],
    };
  }

  it("POS-1: two sessions issued back-to-back for the same principal both stay valid when nothing about the account changed", async () => {
    const { identity, workforceVersionTimestamps } =
      await buildWorkforceIdentity();

    vi.setSystemTime(new Date("2026-10-03T00:01:00.000Z"));
    const first = await jwtAuthService.issueSessionToken(identity, {
      ensurePrincipal: true,
      workforceVersionTimestamps,
      authTime: new Date().toISOString(),
    });

    // A second session for the *same* principal is issued later (another
    // device, a parallel automation run, a mail-verification re-login).
    vi.setSystemTime(new Date("2026-10-03T00:10:00.000Z"));
    const second = await jwtAuthService.issueSessionToken(identity, {
      ensurePrincipal: true,
      workforceVersionTimestamps,
      authTime: new Date().toISOString(),
    });

    expect(first.sessionId).not.toBe(second.sessionId);

    const verifiedSecond = await jwtAuthService.verifyAccessToken(
      second.token,
    );
    expect(verifiedSecond).not.toBeNull();

    // This is the regression: issuing `second` must not have advanced the
    // durable version fingerprint out from under `first`.
    const verifiedFirst = await jwtAuthService.verifyAccessToken(first.token);
    expect(verifiedFirst).not.toBeNull();
    expect(verifiedFirst?.sid).toBe(first.sessionId);
  });

  it("NEG-1: a genuine role-binding change still invalidates previously issued sessions", async () => {
    const { identity, workforceVersionTimestamps } =
      await buildWorkforceIdentity();

    vi.setSystemTime(new Date("2026-10-03T00:01:00.000Z"));
    const issued = await jwtAuthService.issueSessionToken(identity, {
      ensurePrincipal: true,
      workforceVersionTimestamps,
      authTime: new Date().toISOString(),
    });
    expect(await jwtAuthService.verifyAccessToken(issued.token)).not.toBeNull();

    // A real change: the platform_admin role binding is revoked.
    const roleBindings = await identityRepo.findRoleBindingsByMembershipId(
      identity.membershipId!,
    );
    const binding = roleBindings[0]!;
    vi.setSystemTime(new Date("2026-10-03T00:05:00.000Z"));
    await identityRepo.ensureRoleBindingRecord({
      ...binding,
      validTo: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const verifiedAfterRevocation = await jwtAuthService.verifyAccessToken(
      issued.token,
    );
    expect(verifiedAfterRevocation).toBeNull();
  });

  it("NEG-2: a genuine principal status change still invalidates previously issued sessions", async () => {
    const { identity, workforceVersionTimestamps } =
      await buildWorkforceIdentity();

    vi.setSystemTime(new Date("2026-10-03T00:01:00.000Z"));
    const issued = await jwtAuthService.issueSessionToken(identity, {
      ensurePrincipal: true,
      workforceVersionTimestamps,
      authTime: new Date().toISOString(),
    });
    expect(await jwtAuthService.verifyAccessToken(issued.token)).not.toBeNull();

    const principal = await identityRepo.findPrincipalById(
      identity.principalId!,
    );
    vi.setSystemTime(new Date("2026-10-03T00:05:00.000Z"));
    await identityRepo.ensurePrincipalRecord({
      ...principal!,
      status: "suspended",
      updatedAt: new Date().toISOString(),
    });

    const verifiedAfterSuspension = await jwtAuthService.verifyAccessToken(
      issued.token,
    );
    expect(verifiedAfterSuspension).toBeNull();
  });
});
