import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFixture, origin } from "./fixture";
import * as bff from "../../../apps/passenger-app-web/app/api/passenger-app/[...path]/route";
let f: ReturnType<typeof createFixture>;
beforeEach(() => {
  f = createFixture();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const oauthProviders = ["google", "facebook", "line"] as const;
const oauthCases = oauthProviders.flatMap((provider) =>
  (["login", "link"] as const).map((purpose) => ({ provider, purpose })),
);
async function start(
  provider: (typeof oauthProviders)[number],
  purpose: "login" | "link",
) {
  if (purpose === "link") await f.signIn("email");
  return f.client.oauthStart({
    provider,
    purpose,
    redirectUri: `${origin}/auth/callback/${provider}`,
  });
}

describe("complete OAuth transport binding matrix", () => {
  it.each(oauthCases)(
    "$provider $purpose success retains matching authenticated purpose and one-use state",
    async ({ provider, purpose }) => {
      const response = await start(provider, purpose);
      const result = await f.client.oauthCallback(provider, {
        state: response.state,
        code: "code",
      });
      expect(result.result).toBe(purpose === "login" ? "logged_in" : "linked");
      const callback = f.calls.find((call) => call.path.endsWith("/callback"))!;
      expect(callback.body).toEqual({
        provider,
        state: response.state,
        transactionId: response.transactionId,
        code: "code",
      });
      expect(
        callback.headers.get("authorization")?.startsWith("Bearer ") ?? false,
      ).toBe(purpose === "link");
      expect(f.jar.has("pax_oauth_txn")).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(/accessToken|refreshToken/);
      await expect(
        f.client.oauthCallback(provider, {
          state: response.state,
          code: "code",
        }),
      ).rejects.toMatchObject({ code: "invalid_grant" });
    },
  );
  it.each(oauthCases)(
    "$provider $purpose disabled rejects before creating a transaction",
    async ({ provider, purpose }) => {
      f.enabled = f.enabled.filter((enabled) => enabled !== provider);
      await expect(start(provider, purpose)).rejects.toMatchObject({
        code: "unsupported_provider",
      });
      expect(f.jar.has("pax_oauth_txn")).toBe(false);
    },
  );
  it.each(oauthCases)(
    "$provider $purpose provider rejection clears binding",
    async ({ provider, purpose }) => {
      const response = await start(provider, purpose);
      await expect(
        f.client.oauthCallback(provider, {
          state: response.state,
          error: "access_denied",
        }),
      ).rejects.toMatchObject({ code: "access_denied" });
      expect(f.jar.has("pax_oauth_txn")).toBe(false);
      expect(f.calls.some((call) => call.path.endsWith("/callback"))).toBe(
        false,
      );
    },
  );
  it.each(oauthCases)(
    "$provider $purpose upstream callback failure clears binding without refresh/replay",
    async ({ provider, purpose }) => {
      const response = await start(provider, purpose);
      f.oauthError = "invalid_grant";
      await expect(
        f.client.oauthCallback(provider, {
          state: response.state,
          code: "code",
        }),
      ).rejects.toMatchObject({ code: "invalid_grant" });
      expect(f.jar.has("pax_oauth_txn")).toBe(false);
      expect(f.calls.some((call) => call.path === "auth/refresh")).toBe(false);
    },
  );
  it.each([
    "missing",
    "expired",
    "provider",
    "state",
    "logout",
    "switch",
  ] as const)(
    "rejects %s binding before the external upstream",
    async (mismatch) => {
      const response = await start("google", "link");
      let provider: (typeof oauthProviders)[number] = "google";
      let state = response.state;
      if (mismatch === "missing") f.jar.delete("pax_oauth_txn");
      if (mismatch === "expired") {
        const binding = JSON.parse(f.jar.get("pax_oauth_txn")!);
        binding.expiresAt = Date.now() - 1;
        f.jar.set("pax_oauth_txn", JSON.stringify(binding));
      }
      if (mismatch === "provider") provider = "line";
      if (mismatch === "state") state = "wrong-state";
      if (mismatch === "logout") await f.client.logout();
      if (mismatch === "switch") await f.signIn("email", "other@example.test");
      const count = f.calls.length;
      await expect(
        f.client.oauthCallback(provider, { state, code: "code" }),
      ).rejects.toMatchObject({ code: "invalid_grant" });
      expect(f.calls).toHaveLength(count);
    },
  );
  it("upstream durable one-use also rejects a copied link cookie", async () => {
    const response = await start("line", "link");
    const saved = f.jar.get("pax_oauth_txn")!;
    await f.client.oauthCallback("line", {
      state: response.state,
      code: "code",
    });
    f.jar.set("pax_oauth_txn", saved);
    await expect(
      f.client.oauthCallback("line", { state: response.state, code: "code" }),
    ).rejects.toMatchObject({ code: "invalid_grant" });
    expect(f.jar.has("pax_oauth_txn")).toBe(false);
  });
});

describe("account transport ownership and mutation boundaries", () => {
  it("actual formal profile/consent/identities/unlink/delete/logout operations all reach authorized endpoints", async () => {
    await f.signIn();
    await f.client.updateAccount({
      displayName: "Passenger",
      contactPhone: "0912345678",
      termsVersion: "terms-2026",
      privacyVersion: "privacy-2026",
    });
    const identity = await f.accounts.authenticateAccessToken(
      f.jar.get("pax_session")!,
    );
    await f.accounts.linkIdentity(identity, "email", "extra@example.test");
    const identities = await f.client.getIdentities();
    await f.client.unlinkIdentity({
      identityId: identities.identities.find(
        (item) => item.provider === "email",
      )!.identityId,
    });
    expect((await f.client.getAccount()).displayName).toBe("Passenger");
    const result = await f.client.deleteAccount();
    expect(result.success).toBe(true);
    expect(f.jar.has("pax_session")).toBe(false);
    await f.signIn("line", "other");
    await f.client.logout();
    expect(f.jar.has("pax_refresh")).toBe(false);
  });
  it("cannot unlink a foreign account identity", async () => {
    const a = await f.signIn();
    const b = await f.accounts.findOrCreateByIdentity(
      "email",
      "foreign@example.test",
    );
    const foreign = [...f.accountStore.logins.values()].find(
      (identity) => identity.drtsPassengerId === b.drtsPassengerId,
    )!;
    await expect(
      f.client.unlinkIdentity({ identityId: foreign.identityId }),
    ).rejects.toMatchObject({ status: 404 });
    expect((await f.client.getAccount()).drtsPassengerId).toBe(
      a.drtsPassengerId,
    );
  });
  it("formal server last_identity_error is preserved", async () => {
    await f.signIn();
    const id = (await f.client.getIdentities()).identities[0]!.identityId;
    await expect(
      f.client.unlinkIdentity({ identityId: id }),
    ).rejects.toMatchObject({ code: "last_identity_error" });
  });
  it.each([
    { method: "POST", path: ["me"] },
    { method: "PATCH", path: ["me", "consent"] },
    { method: "POST", path: ["me", "identities"] },
    { method: "GET", path: ["me", "identities", "id"] },
    { method: "DELETE", path: ["me", "someone-else"] },
    { method: "DELETE", path: ["me", "identities", "%252fadmin"] },
    { method: "DELETE", path: ["me", "identities", "bad:id"] },
    { method: "DELETE", path: ["me", "identities", ".."] },
  ])("rejects wrong method/path $method $path", async ({ method, path }) => {
    const req = new NextRequest(
      `${origin}/api/passenger-app/${path.join("/")}`,
      { method, headers: { origin } },
    );
    const handler =
      method === "GET"
        ? bff.GET
        : method === "PATCH"
          ? bff.PATCH
          : method === "DELETE"
            ? bff.DELETE
            : bff.POST;
    const res = await handler(req, { params: Promise.resolve({ path }) });
    expect(res.status).toBe(404);
    expect(f.calls).toHaveLength(0);
  });
  it.each(["PATCH", "DELETE"])("rejects cross-origin %s", async (method) => {
    const req = new NextRequest(`${origin}/api/passenger-app/me`, {
      method,
      headers: { origin: "https://evil.example.invalid" },
    });
    const res = await (method === "PATCH" ? bff.PATCH : bff.DELETE)(req, {
      params: Promise.resolve({ path: ["me"] }),
    });
    expect(res.status).toBe(403);
    expect(f.calls).toHaveLength(0);
  });
});

describe("formal OTP challenge, purpose and session transport", () => {
  it.each(["phone", "email"] as const)(
    "%s login preserves formal challenge and never invents transactionId",
    async (provider) => {
      const target = provider === "phone" ? "0912345678" : "pax@example.test";
      const response = await f.client.requestOtp({
        provider,
        target,
        purpose: "login",
      });
      expect(response.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const result = await f.client.login({
        provider,
        target,
        challenge: response.challenge,
        code: f.codes.at(-1)!,
      });
      expect(result).toEqual({ result: "logged_in" });
      expect(f.jar.has("pax_session")).toBe(true);
    },
  );
  it.each(["link", "verify_contact_phone"] as const)(
    "%s never succeeds anonymously or after account/session change",
    async (purpose) => {
      await expect(
        f.client.requestOtp({
          provider: "phone",
          target: "0912345678",
          purpose,
        }),
      ).rejects.toMatchObject({ code: "unauthorized" });
      await f.signIn();
      const response = await f.client.requestOtp({
        provider: "phone",
        target: "0912345678",
        purpose,
      });
      const code = f.codes.at(-1)!;
      await f.signIn("email", "other@example.test");
      await expect(
        f.client.login({
          provider: "phone",
          target: "0912345678",
          challenge: response.challenge,
          code,
        }),
      ).rejects.toMatchObject({ code: "invalid_code" });
    },
  );
  it("logout burns authenticated contact proof without degrading to login", async () => {
    await f.signIn();
    const response = await f.client.requestOtp({
      provider: "phone",
      target: "0912345678",
      purpose: "verify_contact_phone",
    });
    const code = f.codes.at(-1)!;
    await f.client.logout();
    await expect(
      f.client.login({
        provider: "phone",
        target: "0912345678",
        challenge: response.challenge,
        code,
      }),
    ).rejects.toMatchObject({ code: "invalid_code" });
    expect(f.jar.has("pax_session")).toBe(false);
  });
});
