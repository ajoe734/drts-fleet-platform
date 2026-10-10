import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PassengerJwtService } from "../../../apps/api/src/common/auth/passenger-jwt.service";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { PassengerOAuthService } from "../../../apps/api/src/modules/passenger-app/oauth/passenger-oauth.service";
import type { OAuthTransactionRecord } from "../../../apps/api/src/modules/passenger-app/oauth/oauth-transaction.port";
import { listConfiguredAuthProviders } from "../../../apps/api/src/modules/passenger-app/oauth/oauth-provider.config";
import {
  FacebookDataDeletionService,
  verifyFacebookSignedRequest,
} from "../../../apps/api/src/modules/passenger-app/oauth/facebook-data-deletion.service";
import { FacebookDataDeletionController } from "../../../apps/api/src/modules/passenger-app/oauth/facebook-data-deletion.controller";
import { MemoryPassengerStore } from "../pax-account-session-20261009/memory-store";

const CALLBACK = "https://ride.smarttransport.tw/auth/callback/facebook";
const APP_ID = "123456";
const APP_SECRET = "unit-only-facebook-app-secret";
const USER_ID = "998877";

class Transactions {
  rows = new Map<string, OAuthTransactionRecord>();
  async insert(row: OAuthTransactionRecord) {
    this.rows.set(row.transactionId, structuredClone(row));
  }
  async claim(id: string, now: string) {
    const row = this.rows.get(id);
    if (!row || row.consumedAt || row.expiresAt <= now) return null;
    row.consumedAt = now;
    return structuredClone(row);
  }
}
function fixture() {
  const store = new MemoryPassengerStore();
  const jwt = new PassengerJwtService();
  const accounts = new PassengerAccountService(store, jwt);
  const transactions = new Transactions();
  const oauth = new PassengerOAuthService(transactions, accounts);
  const deletion = new FacebookDataDeletionService(store);
  return {
    store,
    jwt,
    accounts,
    transactions,
    oauth,
    deletion,
    controller: new FacebookDataDeletionController(deletion),
  };
}
function signedRequest(
  payload: unknown = { algorithm: "HMAC-SHA256", user_id: USER_ID },
  key = APP_SECRET,
) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${createHmac("sha256", key).update(encoded).digest("base64url")}.${encoded}`;
}
let tokenBody: unknown;
let debugBody: unknown;
let meBody: unknown;
let failPath: string | undefined;
let failMode: "http" | "network" | "json";
let expectedChallenge: string;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T00:00:00Z"));
  for (const [key, value] of Object.entries({
    FACEBOOK_APP_ID: APP_ID,
    FACEBOOK_APP_SECRET: APP_SECRET,
    FACEBOOK_DATA_DELETION_STATUS_ORIGIN: "https://api.example.test",
    OAUTH_REDIRECT_ALLOWLIST: CALLBACK,
    JWT_SECRET: "unit-only-passenger-session-key",
    JWT_KEY_RING_JSON: "",
    JWT_PRIVATE_KEY: "",
    JWT_PUBLIC_KEY: "",
    JWT_ALGORITHM: "HS256",
    JWT_ALGORITHMS: "HS256",
  }))
    vi.stubEnv(key, value);
  tokenBody = { access_token: "unit-access-token" };
  debugBody = {
    data: {
      app_id: APP_ID,
      is_valid: true,
      user_id: USER_ID,
      expires_at: Date.now() / 1000 + 3600,
    },
  };
  meBody = {
    id: USER_ID,
    name: "Facebook Passenger",
    email: "same@example.test",
  };
  failPath = undefined;
  failMode = "http";
  expectedChallenge = "";
  // Only Meta transport is stubbed. OAuth parsing, state claim, proof creation,
  // token validation, account/session logic and signed-request logic are real.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (raw: string, init: RequestInit) => {
      const url = new URL(raw);
      expect(url.origin).toBe("https://graph.facebook.com");
      expect(init.redirect).toBe("error");
      if (url.pathname.endsWith(failPath ?? "__no_failure__")) {
        if (failMode === "network") throw new Error("unit transport failure");
        if (failMode === "json") return new Response("not-json");
        return new Response("unit error", { status: 400 });
      }
      if (url.pathname.endsWith("/oauth/access_token")) {
        const params = new URLSearchParams(init.body as string);
        expect(params.get("client_secret")).toBe(APP_SECRET);
        expect(params.get("redirect_uri")).toBe(CALLBACK);
        expect(
          createHash("sha256")
            .update(params.get("code_verifier")!)
            .digest("base64url"),
        ).toBe(expectedChallenge);
        return new Response(JSON.stringify(tokenBody));
      }
      if (url.pathname.endsWith("/debug_token")) {
        expect(url.searchParams.get("input_token")).toBe("unit-access-token");
        expect(init.headers).toMatchObject({
          Authorization: `Bearer ${APP_ID}|${APP_SECRET}`,
        });
        return new Response(JSON.stringify(debugBody));
      }
      if (url.pathname.endsWith("/me")) {
        expect(url.searchParams.get("fields")).toBe("id,name,email");
        expect(url.searchParams.get("appsecret_proof")).toBe(
          createHmac("sha256", APP_SECRET)
            .update("unit-access-token")
            .digest("hex"),
        );
        expect(init.headers).toMatchObject({
          Authorization: "Bearer unit-access-token",
        });
        return new Response(JSON.stringify(meBody));
      }
      throw new Error(`unexpected stub request ${url.pathname}`);
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function start(
  f: ReturnType<typeof fixture>,
  purpose: "login" | "link" = "login",
  identity: ReturnType<PassengerJwtService["verify"]> = null,
) {
  const result = await f.oauth.start(
    "facebook",
    { provider: "facebook", redirectUri: CALLBACK, purpose },
    identity,
  );
  expectedChallenge = new URL(result.authUrl).searchParams.get(
    "code_challenge",
  )!;
  return result;
}
function callback(
  f: ReturnType<typeof fixture>,
  s: Awaited<ReturnType<typeof start>>,
  identity: ReturnType<PassengerJwtService["verify"]> = null,
  overrides = {},
) {
  return f.oauth.callback(
    "facebook",
    {
      provider: "facebook",
      code: "unit-code",
      state: s.state,
      transactionId: s.transactionId,
      ...overrides,
    },
    identity,
  );
}
async function owner(
  f: ReturnType<typeof fixture>,
  subject = "owner@example.test",
) {
  const account = await f.accounts.findOrCreateByIdentity("email", subject);
  const session = await f.accounts.issueSession(account.drtsPassengerId);
  return { account, session, identity: f.jwt.verify(session.accessToken)! };
}

describe("Facebook OAuth through production transaction and account services", () => {
  it.each(["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"])(
    "requires complete config: %s",
    async (key) => {
      vi.stubEnv(key, " ");
      const f = fixture();
      expect(listConfiguredAuthProviders()).not.toContain("facebook");
      await expect(start(f)).rejects.toMatchObject({
        code: "unsupported_provider",
      });
      await expect(
        f.oauth.callback("facebook", {}, null),
      ).rejects.toMatchObject({ code: "unsupported_provider" });
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("advertises a configured provider; authorization URL contains code/state/PKCE but no secret", async () => {
    expect(listConfiguredAuthProviders()).toContain("facebook");
    const f = fixture();
    const s = await start(f);
    const url = new URL(s.authUrl);
    expect(url.hostname).toBe("www.facebook.com");
    expect(url.searchParams.get("scope")).toBe("public_profile,email");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe(s.state);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(s.authUrl).not.toContain(APP_SECRET);
    expect(url.searchParams.has("nonce")).toBe(false);
    expect(f.transactions.rows.get(s.transactionId)!.stateHash).not.toBe(
      s.state,
    );
  });
  it("verifies debug_token and /me proof, creates an account, signs sessions and reuses the identity", async () => {
    const f = fixture();
    const a = await callback(f, await start(f));
    expect(a.result).toBe("logged_in");
    if (a.result !== "logged_in") throw new Error("missing session");
    expect(
      await f.accounts.authenticateAccessToken(a.accessToken),
    ).toMatchObject({ drtsPassengerId: a.drtsPassengerId });
    expect(f.store.accounts.get(a.drtsPassengerId)).toMatchObject({
      displayName: "Facebook Passenger",
    });
    expect(
      f.store.accounts.get(a.drtsPassengerId)!.verifiedEmail,
    ).toBeUndefined();
    const b = await callback(f, await start(f));
    expect(b).toMatchObject({ drtsPassengerId: a.drtsPassengerId });
    expect(f.store.accounts.size).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(6);
  });
  it.each([undefined, "same@example.test"])(
    "email %j does not merge into an email account",
    async (email) => {
      const f = fixture();
      const existing = await owner(f, "same@example.test");
      meBody = { id: USER_ID, email };
      const result = await callback(f, await start(f));
      expect(result).not.toMatchObject({
        drtsPassengerId: existing.account.drtsPassengerId,
      });
      expect(f.store.accounts.size).toBe(2);
    },
  );
  it.each([
    { is_valid: false },
    { is_valid: "true" },
    { app_id: "wrong-app" },
    { user_id: "" },
    { user_id: null },
    { user_id: 998877 },
    { expires_at: 1 },
    { expires_at: "tomorrow" },
    { data_access_expires_at: 1 },
  ])(
    "rejects invalid debug_token %j before account mutation",
    async (fields) => {
      debugBody = {
        data: { app_id: APP_ID, is_valid: true, user_id: USER_ID, ...fields },
      };
      const f = fixture();
      await expect(callback(f, await start(f))).rejects.toMatchObject({
        code: "invalid_grant",
      });
      expect(f.store.accounts.size).toBe(0);
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );
  it.each([{}, null, { access_token: "" }, { access_token: 123 }])(
    "rejects unusable token response %j",
    async (body) => {
      tokenBody = body;
      const f = fixture();
      await expect(callback(f, await start(f))).rejects.toMatchObject({
        code: "invalid_grant",
      });
      expect(f.store.accounts.size).toBe(0);
    },
  );
  it.each([null, {}, { id: "other-user" }, { id: "123" }])(
    "rejects /me subject mismatch %j",
    async (body) => {
      meBody = body;
      const f = fixture();
      await expect(callback(f, await start(f))).rejects.toMatchObject({
        code: "invalid_grant",
      });
      expect(f.store.accounts.size).toBe(0);
    },
  );
  it.each(["/oauth/access_token", "/debug_token", "/me"])(
    "maps HTTP, network and malformed JSON failures at %s to invalid_grant",
    async (path) => {
      for (const mode of ["http", "network", "json"] as const) {
        failPath = path;
        failMode = mode;
        const f = fixture();
        await expect(callback(f, await start(f))).rejects.toMatchObject({
          code: "invalid_grant",
        });
        expect(f.store.accounts.size).toBe(0);
      }
    },
  );
  it.each(["state", "provider", "pkce", "expired", "id", "extra-input"])(
    "rejects %s corruption without external calls",
    async (kind) => {
      const f = fixture();
      const s = await start(f);
      const row = f.transactions.rows.get(s.transactionId)!;
      const overrides: Record<string, unknown> = {};
      if (kind === "state") overrides.state = "wrong";
      if (kind === "provider") row.provider = "google";
      if (kind === "pkce") row.codeVerifier = "A".repeat(43);
      if (kind === "expired") vi.advanceTimersByTime(600_001);
      if (kind === "id") overrides.transactionId = "not-a-uuid";
      if (kind === "extra-input") overrides.code_verifier = "attacker";
      await expect(callback(f, s, null, overrides)).rejects.toMatchObject({
        code: "invalid_grant",
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("consumes even a failed grant so it cannot be replayed", async () => {
    const f = fixture();
    const s = await start(f);
    await expect(
      callback(f, s, null, { state: "wrong" }),
    ).rejects.toMatchObject({ code: "invalid_grant" });
    await expect(callback(f, s)).rejects.toMatchObject({
      code: "invalid_grant",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects redirects outside exact allowlist", async () => {
    const f = fixture();
    await expect(
      f.oauth.start(
        "facebook",
        {
          provider: "facebook",
          redirectUri: `${CALLBACK}?next=evil`,
          purpose: "login",
        },
        null,
      ),
    ).rejects.toMatchObject({ code: "validation_error" });
    expect(f.transactions.rows.size).toBe(0);
  });
  it("links only an explicit session-bound account and issues no new session", async () => {
    const f = fixture();
    const a = await owner(f);
    const s = await start(f, "link", a.identity);
    expect(await callback(f, s, a.identity)).toEqual({ result: "linked" });
    expect(
      (await f.store.findIdentity("facebook", USER_ID))!.drtsPassengerId,
    ).toBe(a.account.drtsPassengerId);
    expect(f.store.sessions.size).toBe(1);
  });
  it.each(["anonymous", "switched", "logout", "deleted"])(
    "rejects %s linking without adding an identity",
    async (kind) => {
      const f = fixture();
      const a = await owner(f);
      if (kind === "anonymous") {
        await expect(start(f, "link")).rejects.toMatchObject({
          code: "unauthorized",
        });
        return;
      }
      const s = await start(f, "link", a.identity);
      let identity = a.identity;
      if (kind === "switched")
        identity = (await owner(f, "other@example.test")).identity;
      if (kind === "logout") await f.accounts.logout(a.session.refreshToken);
      if (kind === "deleted") await f.accounts.deleteAccount(a.identity);
      await expect(callback(f, s, identity)).rejects.toMatchObject({
        code: "unauthorized",
      });
      expect(await f.store.findIdentity("facebook", USER_ID)).toBeNull();
    },
  );
  it("rejects identity already linked to a different account", async () => {
    const f = fixture();
    const original = await f.accounts.findOrCreateByIdentity(
      "facebook",
      USER_ID,
    );
    const a = await owner(f);
    await expect(
      callback(f, await start(f, "link", a.identity), a.identity),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(
      (await f.store.findIdentity("facebook", USER_ID))!.drtsPassengerId,
    ).toBe(original.drtsPassengerId);
  });
});

describe("Facebook signed_request deletion and completion receipt", () => {
  it.each(["email", "google", "sole-facebook"] as const)(
    "rejects an in-flight Facebook callback when deletion commits before issuance (%s)",
    async (remainingProvider) => {
      const f = fixture();
      const a =
        remainingProvider === "sole-facebook"
          ? await f.accounts.findOrCreateByIdentity("facebook", USER_ID)
          : await f.accounts.findOrCreateByIdentity(
              remainingProvider,
              remainingProvider === "email"
                ? "owner@example.test"
                : "google-owner",
            );
      const oldSession = await f.accounts.issueSession(a.drtsPassengerId);
      if (remainingProvider !== "sole-facebook")
        await f.accounts.linkIdentity(
          f.jwt.verify(oldSession.accessToken),
          "facebook",
          USER_ID,
        );
      let reached!: () => void;
      const atIssuance = new Promise<void>((resolve) => {
        reached = resolve;
      });
      let resume!: () => void;
      const afterDeletion = new Promise<void>((resolve) => {
        resume = resolve;
      });
      const realIssue = f.accounts.issueSession.bind(f.accounts);
      // Scheduling only: account, JWT, deletion and session logic remain real.
      const gate = vi
        .spyOn(f.accounts, "issueSession")
        .mockImplementation(async (...args) => {
          reached();
          await afterDeletion;
          return realIssue(...args);
        });
      const pending = callback(f, await start(f)).then(
        (result) => ({ result, error: null }),
        (error: unknown) => ({ result: null, error }),
      );
      await atIssuance; // Lookup has committed; issuance has not started.
      try {
        const receipt = await f.controller.delete({
          signed_request: signedRequest(),
        });
        expect(f.controller.status(receipt.confirmation_code).status).toBe(
          "completed",
        );
        expect(await f.store.findIdentity("facebook", USER_ID)).toBeNull();
        expect(
          await f.accounts.authenticateAccessToken(oldSession.accessToken),
        ).toBeNull();
      } finally {
        resume();
      }
      const outcome = await pending;
      gate.mockRestore();
      if (outcome.result?.result === "logged_in")
        expect(
          await f.accounts.authenticateAccessToken(outcome.result.accessToken),
        ).toBeNull();
      expect(outcome.error).toMatchObject({ code: "unauthorized" });
      expect(outcome.result).toBeNull();
      expect([...f.store.sessions.values()].every((s) => s.revokedAt)).toBe(
        true,
      );
      if (remainingProvider !== "sole-facebook") {
        // A new proof through the retained identity still resolves the original account.
        const remaining = await f.accounts.findOrCreateByIdentity(
          remainingProvider,
          remainingProvider === "email" ? "owner@example.test" : "google-owner",
        );
        expect(remaining.drtsPassengerId).toBe(a.drtsPassengerId);
        const fresh = await f.accounts.issueSession(remaining.drtsPassengerId);
        expect(
          await f.accounts.authenticateAccessToken(fresh.accessToken),
        ).not.toBeNull();
      } else {
        expect(f.store.accounts.get(a.drtsPassengerId)!.status).toBe("deleted");
      }
    },
  );
  it("revokes a Facebook session when issuance commits before deletion, even before callback returns", async () => {
    const f = fixture();
    const a = await owner(f);
    await f.accounts.linkIdentity(a.identity, "facebook", USER_ID);
    let reached!: () => void;
    const committed = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let resume!: () => void;
    const afterDeletion = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const realIssue = f.accounts.issueSession.bind(f.accounts);
    vi.spyOn(f.accounts, "issueSession").mockImplementation(async (...args) => {
      const session = await realIssue(...args);
      reached();
      await afterDeletion;
      return session;
    });
    const pending = callback(f, await start(f));
    await committed;
    try {
      await f.controller.delete({ signed_request: signedRequest() });
    } finally {
      resume();
    }
    const result = await pending;
    expect(result.result).toBe("logged_in");
    if (result.result !== "logged_in") throw new Error("Expected login result");
    expect(result.drtsPassengerId).toBe(a.account.drtsPassengerId);
    expect(
      await f.accounts.authenticateAccessToken(result.accessToken),
    ).toBeNull();
    await expect(f.accounts.refresh(result.refreshToken)).rejects.toMatchObject(
      { code: "invalid_grant" },
    );
    expect(
      await f.accounts.authenticateAccessToken(a.session.accessToken),
    ).toBeNull();
    expect(await f.store.findIdentity("facebook", USER_ID)).toBeNull();
  });
  it.each([
    undefined,
    "",
    "a.b.c",
    "!!.e30",
    signedRequest({}, "wrong-key"),
    signedRequest({ algorithm: "SHA256", user_id: USER_ID }),
    signedRequest({ algorithm: "HMAC-SHA256", user_id: "" }),
    signedRequest({ algorithm: "HMAC-SHA256", user_id: 998877 }),
    signedRequest(null),
    signedRequest([]),
  ])(
    "rejects malformed or forged signed_request %j before DB work",
    async (raw) => {
      const f = fixture();
      await expect(
        f.controller.delete({ signed_request: raw }),
      ).rejects.toMatchObject({ code: "invalid_signed_request" });
      expect(f.store.commits).toBe(0);
    },
  );
  it("uses the encoded payload bytes as HMAC input and rejects payload/signature tampering", () => {
    const raw = signedRequest();
    expect(verifyFacebookSignedRequest(raw, APP_SECRET)).toBe(USER_ID);
    const [sig, payload] = raw.split(".");
    expect(() =>
      verifyFacebookSignedRequest(`${sig}.${payload}A`, APP_SECRET),
    ).toThrow();
    expect(() =>
      verifyFacebookSignedRequest(`${sig!.slice(1)}.${payload}`, APP_SECRET),
    ).toThrow();
    expect(() =>
      verifyFacebookSignedRequest(`${sig}=.${payload}`, APP_SECRET),
    ).toThrow();
  });
  it("deletes the sole identity, anonymizes account and revokes existing access/refresh sessions", async () => {
    const f = fixture();
    const account = await f.accounts.findOrCreateByIdentity(
      "facebook",
      USER_ID,
      { displayName: "Name" },
    );
    const session = await f.accounts.issueSession(
      account.drtsPassengerId,
      "personal-UA",
    );
    await f.accounts.updateMe(f.jwt.verify(session.accessToken), {
      contactPhone: "+886912345678",
      contactConsent: true,
    });
    const reply = await f.controller.delete({
      signed_request: signedRequest(),
    });
    expect(Object.keys(reply).sort()).toEqual(["confirmation_code", "url"]);
    expect(reply.confirmation_code).toMatch(/^[0-9a-f]{112}$/);
    expect(reply.url).toBe(
      `https://api.example.test/api/passenger-app/auth/facebook/data-deletion/status/${reply.confirmation_code}`,
    );
    const deleted = f.store.accounts.get(account.drtsPassengerId)!;
    expect(deleted).toMatchObject({
      status: "deleted",
      contactConsent: false,
      contactPhoneVerified: false,
    });
    expect(deleted.displayName).toBeUndefined();
    expect(deleted.contactPhone).toBeUndefined();
    expect(f.store.logins.size).toBe(0);
    expect([...f.store.sessions.values()][0]).toMatchObject({
      deviceUa: null,
      revokedAt: expect.any(String),
    });
    expect(
      await f.accounts.authenticateAccessToken(session.accessToken),
    ).toBeNull();
    await expect(
      f.accounts.refresh(session.refreshToken),
    ).rejects.toMatchObject({ code: "invalid_grant" });
    // New worker instance proves this is independent of volatile process memory.
    expect(
      new FacebookDataDeletionService(new MemoryPassengerStore()).status(
        reply.confirmation_code,
      ),
    ).toEqual({
      confirmation_code: reply.confirmation_code,
      status: "completed",
    });
    expect(JSON.stringify(reply)).not.toContain(USER_ID);
  });
  it("preserves other login methods and profile, but revokes every existing family", async () => {
    const f = fixture();
    const a = await owner(f);
    await f.accounts.linkIdentity(a.identity, "facebook", USER_ID);
    await f.accounts.issueSession(a.account.drtsPassengerId);
    await f.controller.delete({ signed_request: signedRequest() });
    expect(f.store.accounts.get(a.account.drtsPassengerId)!.status).toBe(
      "active",
    );
    expect(
      await f.store.findIdentity("email", "owner@example.test"),
    ).not.toBeNull();
    expect(await f.store.findIdentity("facebook", USER_ID)).toBeNull();
    expect([...f.store.sessions.values()].every((s) => s.revokedAt)).toBe(true);
    // Remaining verified login may establish a fresh family.
    const fresh = await f.accounts.issueSession(a.account.drtsPassengerId);
    expect(
      await f.accounts.authenticateAccessToken(fresh.accessToken),
    ).not.toBeNull();
  });
  it("is idempotent for unknown/deleted identities and reveals no subject in status", async () => {
    const f = fixture();
    const a = await f.accounts.findOrCreateByIdentity("facebook", USER_ID);
    const r1 = await f.controller.delete({ signed_request: signedRequest() });
    const deletedAt = f.store.accounts.get(a.drtsPassengerId)!.deletedAt;
    vi.advanceTimersByTime(1000);
    const r2 = await f.controller.delete({ signed_request: signedRequest() });
    expect(f.store.accounts.get(a.drtsPassengerId)!.deletedAt).toBe(deletedAt);
    expect(r1.confirmation_code).not.toBe(r2.confirmation_code);
    const unknown = await f.controller.delete({
      signed_request: signedRequest({
        algorithm: "HMAC-SHA256",
        user_id: "123123",
      }),
    });
    expect(f.controller.status(unknown.confirmation_code)).toEqual({
      confirmation_code: unknown.confirmation_code,
      status: "completed",
    });
  });
  it("does not delete an account unrelated to the Facebook subject", async () => {
    const f = fixture();
    const untouched = await owner(f);
    await f.accounts.findOrCreateByIdentity("facebook", USER_ID);
    await f.controller.delete({ signed_request: signedRequest() });
    expect(
      await f.accounts.authenticateAccessToken(untouched.session.accessToken),
    ).not.toBeNull();
    expect(
      f.store.accounts.get(untouched.account.drtsPassengerId)!.status,
    ).toBe("active");
  });
  it("rolls back mutations and produces no confirmation if storage fails", async () => {
    const f = fixture();
    const a = await f.accounts.findOrCreateByIdentity("facebook", USER_ID);
    const session = await f.accounts.issueSession(a.drtsPassengerId);
    vi.spyOn(f.store, "anonymize").mockRejectedValue(
      new Error("unit DB failure"),
    );
    await expect(
      f.controller.delete({ signed_request: signedRequest() }),
    ).rejects.toThrow("unit DB failure");
    expect(f.store.accounts.get(a.drtsPassengerId)!.status).toBe("active");
    expect(
      await f.accounts.authenticateAccessToken(session.accessToken),
    ).not.toBeNull();
    expect(await f.store.findIdentity("facebook", USER_ID)).not.toBeNull();
  });
  it.each([
    "",
    "http://api.example.test",
    "https://api.example.test/child",
    "https://user:pass@api.example.test",
    "https://api.example.test?next=evil",
  ])(
    "rejects unsafe or missing status origin %j before mutations",
    async (origin) => {
      vi.stubEnv("FACEBOOK_DATA_DELETION_STATUS_ORIGIN", origin);
      const f = fixture();
      await expect(
        f.controller.delete({ signed_request: signedRequest() }),
      ).rejects.toMatchObject({ code: "unavailable" });
      expect(f.store.commits).toBe(0);
    },
  );
  it("rejects unknown or tampered receipts and a signed_request reused as a receipt", async () => {
    const f = fixture();
    const r = await f.controller.delete({ signed_request: signedRequest() });
    for (const invalid of [
      "unknown",
      "a".repeat(112),
      `${r.confirmation_code.slice(0, -1)}${r.confirmation_code.endsWith("0") ? "1" : "0"}`,
      signedRequest(),
    ]) {
      expect(() => f.controller.status(invalid)).toThrow(
        expect.objectContaining({ code: "not_found" }),
      );
    }
  });
});
