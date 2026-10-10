import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PassengerJwtService } from "../../../apps/api/src/common/auth/passenger-jwt.service";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { PassengerAccountController } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.controller";
import { MemoryPassengerStore } from "./memory-store";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T18:00:00Z"));
  vi.stubEnv("JWT_SECRET", "unit-only-passenger-session-key");
  vi.stubEnv("JWT_KEY_RING_JSON", "");
  vi.stubEnv("JWT_PRIVATE_KEY", "");
  vi.stubEnv("JWT_PUBLIC_KEY", "");
  vi.stubEnv("JWT_ALGORITHM", "HS256");
  vi.stubEnv("JWT_ALGORITHMS", "HS256");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function fixture() {
  const store = new MemoryPassengerStore();
  const tokens = new PassengerJwtService();
  const service = new PassengerAccountService(store, tokens);
  return {
    store,
    tokens,
    service,
    controller: new PassengerAccountController(service),
  };
}
async function signedIn(f = fixture(), subject = "google-user-1") {
  const account = await f.service.findOrCreateByIdentity("google", subject, {
    displayName: "乘客",
    verifiedEmail: "passenger@example.test",
  });
  const session = await f.service.issueSession(
    account.drtsPassengerId,
    "unit device",
  );
  const identity = (await f.service.authenticateAccessToken(
    session.accessToken,
  ))!;
  return { ...f, account, session, identity };
}

describe("passenger identity linkage and account ownership", () => {
  it("looks up provider + subject only and does not merge equal verified email or phone attributes", async () => {
    const { service } = fixture();
    const attrs = {
      verifiedEmail: "shared@example.test",
      verifiedPhone: "+886912345678",
    };
    const google = await service.findOrCreateByIdentity(
      "google",
      "external-1",
      attrs,
    );
    const facebook = await service.findOrCreateByIdentity(
      "facebook",
      "external-1",
      attrs,
    );
    const email = await service.findOrCreateByIdentity(
      "email",
      attrs.verifiedEmail,
    );
    const phone = await service.findOrCreateByIdentity(
      "phone",
      attrs.verifiedPhone,
    );
    expect(
      new Set([google, facebook, email, phone].map((a) => a.drtsPassengerId))
        .size,
    ).toBe(4);
    expect(
      (await service.findOrCreateByIdentity("google", "external-1"))
        .drtsPassengerId,
    ).toBe(google.drtsPassengerId);
  });
  it("serializes simultaneous first-login requests into one identity/account", async () => {
    const { service, store } = fixture();
    const results = await Promise.all([
      service.findOrCreateByIdentity("line", "same"),
      service.findOrCreateByIdentity("line", "same"),
    ]);
    expect(results[0]?.drtsPassengerId).toBe(results[1]?.drtsPassengerId);
    expect(store.accounts.size).toBe(1);
    expect(store.logins.size).toBe(1);
  });
  it("rechecks the identity after waiting on the account lock so a concurrent unlink cannot log back into the former account", async () => {
    const f = await signedIn();
    await f.service.linkIdentity(f.identity, "email", "remaining@example.test");
    const original = [...f.store.logins.values()].find(
      (i) => i.provider === "google",
    )!;
    // Persistence boundary simulates unlink committing while login waits for the account lock.
    vi.spyOn(f.store, "lockAccount").mockImplementationOnce(async (id) => {
      f.store.logins.delete(original.identityId);
      return structuredClone(f.store.accounts.get(id) ?? null);
    });
    const loggedIn = await f.service.findOrCreateByIdentity(
      "google",
      "google-user-1",
    );
    expect(loggedIn.drtsPassengerId).not.toBe(f.account.drtsPassengerId);
    expect(
      (
        await f.service.findOrCreateByIdentity(
          "email",
          "remaining@example.test",
        )
      ).drtsPassengerId,
    ).toBe(f.account.drtsPassengerId);
  });
  it("requires an active session to link and refuses an identity owned by another account", async () => {
    const f = await signedIn();
    await expect(
      f.service.linkIdentity(null, "line", "new"),
    ).rejects.toMatchObject({ code: "unauthorized" });
    await f.service.findOrCreateByIdentity("line", "taken");
    await expect(
      f.service.linkIdentity(f.identity, "line", "taken"),
    ).rejects.toMatchObject({ code: "conflict" });
    const linked = await f.service.linkIdentity(f.identity, "line", "new");
    expect(linked.drtsPassengerId).toBe(f.account.drtsPassengerId);
    expect(await f.service.linkIdentity(f.identity, "line", "new")).toEqual(
      linked,
    );
    expect(
      (await f.service.findOrCreateByIdentity("line", "new")).drtsPassengerId,
    ).toBe(f.account.drtsPassengerId);
  });
  it("prevents removal of the last login and hides identities belonging to other accounts", async () => {
    const f = await signedIn();
    const first = [...f.store.logins.values()][0]!;
    await expect(
      f.service.unlinkIdentity(f.identity, first.identityId),
    ).rejects.toMatchObject({ code: "last_identity_error" });
    const other = await signedIn(f, "other-user");
    const foreign = [...f.store.logins.values()].find(
      (i) => i.drtsPassengerId === other.account.drtsPassengerId,
    )!;
    await expect(
      f.service.unlinkIdentity(f.identity, foreign.identityId),
    ).rejects.toMatchObject({ code: "not_found" });
    const linked = await f.service.linkIdentity(
      f.identity,
      "email",
      "linked@example.test",
    );
    await f.service.unlinkIdentity(f.identity, linked.identityId);
    const { identities } = await f.service.listIdentities(f.identity);
    expect(identities).toEqual([{ ...first, subject: "[linked]" }]);
    expect(
      (await f.service.getMe(f.identity)).account.verifiedEmail,
    ).toBeUndefined();
  });
  it("rejects a session-shaped identity for an active account with no persisted session", async () => {
    const f = await signedIn();
    f.store.sessions.clear();
    const before = structuredClone([...f.store.logins.values()]);
    await expect(
      f.service.linkIdentity(f.identity, "line", "sessionless"),
    ).rejects.toMatchObject({ code: "unauthorized" });
    expect([...f.store.logins.values()]).toEqual(before);
  });
  it("rejects a different account's session even when the caller switches all account claims", async () => {
    const f = await signedIn();
    const other = await signedIn(f, "other-session-owner");
    await expect(
      f.service.linkIdentity(
        {
          ...f.identity,
          actorId: other.account.drtsPassengerId,
          subject: other.account.drtsPassengerId,
          drtsPassengerId: other.account.drtsPassengerId,
        },
        "line",
        "cross-account",
      ),
    ).rejects.toMatchObject({ code: "unauthorized" });
    expect(await f.store.findIdentity("line", "cross-account")).toBeNull();
  });
  it("blocks linking with logged-out, expired-access or mismatched subject identities", async () => {
    const f = await signedIn();
    await expect(
      f.service.linkIdentity(
        { ...f.identity, subject: "another-account" },
        "line",
        "wrong-subject",
      ),
    ).rejects.toMatchObject({ code: "unauthorized" });
    await expect(
      f.service.linkIdentity(
        { ...f.identity, actorId: "other" },
        "line",
        "new",
      ),
    ).rejects.toMatchObject({ code: "unauthorized" });
    vi.advanceTimersByTime(15 * 60 * 1000);
    await expect(
      f.service.linkIdentity(f.identity, "line", "new"),
    ).rejects.toMatchObject({ code: "unauthorized" });
    const refreshed = await f.service.refresh(f.session.refreshToken);
    const identity = (await f.service.authenticateAccessToken(
      refreshed.accessToken,
    ))!;
    await f.service.logout(refreshed.refreshToken);
    await expect(
      f.service.linkIdentity(identity, "line", "new"),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });
  it("serializes concurrent unlink requests so one login always remains", async () => {
    const f = await signedIn();
    const linked = await f.service.linkIdentity(
      f.identity,
      "email",
      "remaining@example.test",
    );
    const original = [...f.store.logins.values()].find(
      (i) => i.provider === "google",
    )!;
    const results = await Promise.allSettled([
      f.service.unlinkIdentity(f.identity, original.identityId),
      f.service.unlinkIdentity(f.identity, linked.identityId),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await f.service.listIdentities(f.identity)).identities,
    ).toHaveLength(1);
    const rejected = results.find(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "last_identity_error" });
  });
  it("does not accept injected account/verification/status fields from proof attributes", async () => {
    const f = fixture();
    await expect(
      f.service.findOrCreateByIdentity("google", "subject", {
        status: "active",
        drtsPassengerId: "victim",
      } as never),
    ).rejects.toMatchObject({ code: "validation_error" });
    expect(f.store.accounts.size).toBe(0);
  });
});

describe("refresh rotation, replay, logout and expiration", () => {
  it("issues a 15-minute JWT, 30-day refresh family, stores hashes and rotates without extending absolute expiry", async () => {
    const f = await signedIn();
    const payload = jwt.decode(f.session.accessToken) as jwt.JwtPayload;
    expect(payload.exp! - payload.iat!).toBe(900);
    const first = [...f.store.sessions.values()][0]!;
    expect(Date.parse(first.expiresAt) - Date.parse(first.createdAt)).toBe(
      30 * 86400000,
    );
    expect(first.refreshTokenHash).toBe(
      createHash("sha256").update(f.session.refreshToken).digest("hex"),
    );
    expect(JSON.stringify([...f.store.sessions.values()])).not.toContain(
      f.session.refreshToken,
    );
    vi.advanceTimersByTime(86400000);
    const next = await f.service.refresh(f.session.refreshToken);
    expect(next.refreshToken).not.toBe(f.session.refreshToken);
    expect(next.accessToken).not.toBe(f.session.accessToken);
    const rows = [...f.store.sessions.values()];
    expect(rows[0]?.consumedAt).toBeTruthy();
    expect(rows[1]?.expiresAt).toBe(first.expiresAt);
    expect(
      await f.service.authenticateAccessToken(next.accessToken),
    ).toMatchObject({ drtsPassengerId: f.account.drtsPassengerId });
  });
  it("commits whole-family revocation on replay and immediately rejects both access and successor refresh", async () => {
    const f = await signedIn();
    const separate = await f.service.issueSession(f.account.drtsPassengerId);
    const next = await f.service.refresh(f.session.refreshToken);
    const commits = f.store.commits;
    await expect(
      f.service.refresh(f.session.refreshToken),
    ).rejects.toMatchObject({ code: "invalid_grant" });
    expect(f.store.commits).toBe(commits + 1);
    expect(
      await f.service.authenticateAccessToken(f.session.accessToken),
    ).toBeNull();
    expect(
      await f.service.authenticateAccessToken(next.accessToken),
    ).toBeNull();
    await expect(f.service.refresh(next.refreshToken)).rejects.toMatchObject({
      code: "invalid_grant",
    });
    expect(
      await f.service.authenticateAccessToken(separate.accessToken),
    ).not.toBeNull();
  });
  it("concurrent refresh requests trigger replay rather than leaving two live successors", async () => {
    const f = await signedIn();
    const results = await Promise.allSettled([
      f.service.refresh(f.session.refreshToken),
      f.service.refresh(f.session.refreshToken),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const won = results.find(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<{ accessToken: string }>;
    expect(
      await f.service.authenticateAccessToken(won.value.accessToken),
    ).toBeNull();
    expect([...f.store.sessions.values()].every((s) => s.revokedAt)).toBe(true);
  });
  it("logout revokes the supplied family, including when called with an older consumed refresh", async () => {
    const f = await signedIn();
    const next = await f.service.refresh(f.session.refreshToken);
    const other = await f.service.issueSession(f.account.drtsPassengerId);
    expect(await f.service.logout(f.session.refreshToken)).toEqual({
      success: true,
    });
    expect(
      await f.service.authenticateAccessToken(next.accessToken),
    ).toBeNull();
    await expect(f.service.refresh(next.refreshToken)).rejects.toMatchObject({
      code: "invalid_grant",
    });
    expect(
      await f.service.authenticateAccessToken(other.accessToken),
    ).not.toBeNull();
    expect(await f.service.logout(f.session.refreshToken)).toEqual({
      success: true,
    });
  });
  it.each(["reuse-first", "rotation-first"])(
    "revokes every successor when consumed-token reuse races a successor rotation (%s; unit persistence boundary)",
    async (order) => {
      const f = await signedIn();
      const successor = await f.service.refresh(f.session.refreshToken);
      const operations =
        order === "reuse-first"
          ? [f.session.refreshToken, successor.refreshToken]
          : [successor.refreshToken, f.session.refreshToken];
      const results = await Promise.allSettled(
        operations.map((token) => f.service.refresh(token)),
      );
      for (const result of results) {
        if (result.status === "fulfilled") {
          expect(
            await f.service.authenticateAccessToken(result.value.accessToken),
          ).toBeNull();
          await expect(
            f.service.refresh(result.value.refreshToken),
          ).rejects.toMatchObject({ code: "invalid_grant" });
        }
      }
      expect([...f.store.sessions.values()].every((s) => s.revokedAt)).toBe(
        true,
      );
      expect(
        await f.service.authenticateAccessToken(successor.accessToken),
      ).toBeNull();
    },
  );
  it("propagates revocation write failures and permits a retry without falsely reporting logout success", async () => {
    const f = await signedIn();
    vi.spyOn(f.store, "revokeFamily").mockRejectedValueOnce(
      new Error("revocation write failed"),
    );
    await expect(f.service.logout(f.session.refreshToken)).rejects.toThrow(
      "revocation write failed",
    );
    expect(f.store.rollbacks).toBe(1);
    expect(
      await f.service.authenticateAccessToken(f.session.accessToken),
    ).not.toBeNull(); // Failed transaction is reported as failure, never success.
    await f.service.logout(f.session.refreshToken);
    expect(
      await f.service.authenticateAccessToken(f.session.accessToken),
    ).toBeNull();
  });
  it("logoutAll revokes all devices on that account and preserves a different account", async () => {
    const f = await signedIn();
    const device = await f.service.issueSession(f.account.drtsPassengerId);
    const other = await signedIn(f, "other");
    await f.service.logoutAll(f.identity);
    expect(
      await f.service.authenticateAccessToken(device.accessToken),
    ).toBeNull();
    await expect(
      f.service.refresh(f.session.refreshToken),
    ).rejects.toMatchObject({ code: "invalid_grant" });
    expect(
      await f.service.authenticateAccessToken(other.session.accessToken),
    ).not.toBeNull();
  });
  it("rejects at access and refresh expiration boundaries, unknown and malformed refresh", async () => {
    const f = await signedIn();
    vi.advanceTimersByTime(900000);
    expect(
      await f.service.authenticateAccessToken(f.session.accessToken),
    ).toBeNull();
    vi.advanceTimersByTime(30 * 86400000 - 900000);
    await expect(
      f.service.refresh(f.session.refreshToken),
    ).rejects.toMatchObject({ code: "invalid_grant" });
    await expect(f.service.refresh("x".repeat(43))).rejects.toMatchObject({
      code: "invalid_grant",
    });
    await expect(f.service.refresh("not-a-token")).rejects.toMatchObject({
      code: "invalid_grant",
    });
  });
  it("rolls back refresh consumption if signing fails", async () => {
    const f = await signedIn();
    const before = structuredClone([...f.store.sessions.values()]);
    vi.spyOn(f.tokens, "sign").mockImplementationOnce(() => {
      throw new Error("key unavailable");
    });
    await expect(f.service.refresh(f.session.refreshToken)).rejects.toThrow(
      "key unavailable",
    );
    expect([...f.store.sessions.values()]).toEqual(before);
    expect(f.store.rollbacks).toBe(1);
    expect(await f.service.refresh(f.session.refreshToken)).toHaveProperty(
      "accessToken",
    );
  });
  it("suspended accounts cannot login, issue sessions, refresh or use existing access", async () => {
    const f = await signedIn();
    f.store.accounts.get(f.account.drtsPassengerId)!.status = "suspended";
    await expect(
      f.service.findOrCreateByIdentity("google", "google-user-1"),
    ).rejects.toMatchObject({ code: "unauthorized" });
    await expect(
      f.service.issueSession(f.account.drtsPassengerId),
    ).rejects.toMatchObject({ code: "unauthorized" });
    await expect(
      f.service.refresh(f.session.refreshToken),
    ).rejects.toMatchObject({ code: "invalid_grant" });
    expect(
      await f.service.authenticateAccessToken(f.session.accessToken),
    ).toBeNull();
  });
});

describe("profile, deletion and API boundary", () => {
  it("saves consent versions and contact changes as unverified; only proof method can mark verified", async () => {
    const f = await signedIn();
    const updated = await f.controller.update(f.identity, {
      display_name: "新名稱",
      contact_phone: "+886912345678",
      terms_version: "terms-v1",
      privacy_version: "privacy-v1",
      fee_acknowledgement_version: "fee-v1",
      contact_consent: true,
    });
    expect(updated.data.account).toMatchObject({
      displayName: "新名稱",
      contactPhoneVerified: false,
      contactConsent: true,
      termsVersion: "terms-v1",
      privacyVersion: "privacy-v1",
      feeAcknowledgementVersion: "fee-v1",
    });
    await f.service.verifyContactPhone(f.identity, "+886912345678");
    expect(
      (await f.service.updateMe(f.identity, { displayName: "Name" })).account
        .contactPhoneVerified,
    ).toBe(true);
    expect(
      (await f.service.updateMe(f.identity, { contactPhone: "+886922222222" }))
        .account.contactPhoneVerified,
    ).toBe(false);
    await f.service.linkIdentity(f.identity, "phone", "+886933333333");
    await f.controller.update(f.identity, { contact_phone: "+886944444444" });
    expect((await f.controller.me(f.identity)).data.account).toMatchObject({
      verifiedPhone: "+886933333333",
      verifiedEmail: "passenger@example.test",
      contactPhone: "+886944444444",
      contactPhoneVerified: false,
      contactConsent: true,
      termsVersion: "terms-v1",
      privacyVersion: "privacy-v1",
      feeAcknowledgementVersion: "fee-v1",
    });
  });
  it.each([
    { drts_passenger_id: "victim" },
    { status: "deleted" },
    { contact_phone_verified: true },
    { verified_email: "new@example.test" },
    { display_name: "A", displayName: "B" },
    { contactConsent: "true" },
    { termsVersion: "" },
    { displayName: "A".repeat(101) },
    { contactPhone: "123" },
  ])("rejects mass assignment or invalid profile values: %j", async (body) => {
    const f = await signedIn();
    await expect(f.controller.update(f.identity, body)).rejects.toMatchObject({
      code: "validation_error",
    });
    expect((await f.service.getMe(f.identity)).account.displayName).toBe(
      "乘客",
    );
  });
  it("soft deletes and anonymizes the authenticated account, revokes every session and removes login subjects", async () => {
    const f = await signedIn();
    await f.service.updateMe(f.identity, {
      contactPhone: "+886912345678",
      termsVersion: "terms-v1",
      contactConsent: true,
    });
    await f.service.linkIdentity(f.identity, "email", "linked@example.test");
    const device = await f.service.issueSession(f.account.drtsPassengerId);
    const other = await signedIn(f, "other");
    const result = await f.controller.remove(f.identity);
    expect(result.data).toEqual({ success: true });
    const deleted = f.store.accounts.get(f.account.drtsPassengerId)!;
    expect(deleted).toMatchObject({
      drtsPassengerId: f.account.drtsPassengerId,
      status: "deleted",
      contactPhoneVerified: false,
      contactConsent: false,
      termsVersion: "terms-v1",
      createdAt: f.account.createdAt,
    });
    expect(deleted.deletedAt).toBeTruthy();
    expect(deleted.displayName).toBeUndefined();
    expect(deleted.contactPhone).toBeUndefined();
    expect(deleted.verifiedEmail).toBeUndefined();
    expect(deleted.verifiedPhone).toBeUndefined();
    expect(
      [...f.store.logins.values()].filter(
        (i) => i.drtsPassengerId === deleted.drtsPassengerId,
      ),
    ).toHaveLength(0);
    expect(
      [...f.store.sessions.values()]
        .filter((s) => s.drtsPassengerId === deleted.drtsPassengerId)
        .every((s) => s.revokedAt && s.deviceUa === null),
    ).toBe(true);
    expect(
      await f.service.authenticateAccessToken(device.accessToken),
    ).toBeNull();
    await expect(f.service.refresh(device.refreshToken)).rejects.toMatchObject({
      code: "invalid_grant",
    });
    await expect(f.service.getMe(f.identity)).rejects.toMatchObject({
      code: "unauthorized",
    });
    await expect(
      f.service.issueSession(deleted.drtsPassengerId),
    ).rejects.toMatchObject({ code: "unauthorized" });
    await expect(
      f.service.linkIdentity(f.identity, "line", "deleted-account-link"),
    ).rejects.toMatchObject({ code: "unauthorized" });
    expect(
      await f.service.authenticateAccessToken(other.session.accessToken),
    ).not.toBeNull();
    const recreated = await f.service.findOrCreateByIdentity(
      "google",
      "google-user-1",
    );
    expect(recreated.drtsPassengerId).not.toBe(deleted.drtsPassengerId);
  });
  it("accepts snake-case refresh/logout credentials and never echoes them in profile/identity/error responses", async () => {
    const f = await signedIn();
    const next = await f.controller.refreshSession({
      refresh_token: f.session.refreshToken,
    });
    const profile = await f.controller.me(f.identity);
    const identities = await f.controller.identities(f.identity);
    const serialized = JSON.stringify([profile, identities]);
    expect(serialized).not.toContain(f.session.refreshToken);
    expect(serialized).not.toContain(next.data.accessToken);
    expect(serialized).not.toContain("google-user-1");
    expect(
      (await f.controller.logout({ refresh_token: next.data.refreshToken }))
        .data,
    ).toEqual({ success: true });
    try {
      await f.controller.refreshSession({
        refresh_token: next.data.refreshToken,
      });
    } catch (e) {
      expect(JSON.stringify(e)).not.toContain(next.data.refreshToken);
    }
  });
});
