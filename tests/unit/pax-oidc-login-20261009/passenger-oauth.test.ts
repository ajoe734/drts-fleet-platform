import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PassengerJwtService } from "../../../apps/api/src/common/auth/passenger-jwt.service";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { PassengerOAuthController } from "../../../apps/api/src/modules/passenger-app/oauth/passenger-oauth.controller";
import { PassengerOAuthService } from "../../../apps/api/src/modules/passenger-app/oauth/passenger-oauth.service";
import type { OAuthTransactionRecord } from "../../../apps/api/src/modules/passenger-app/oauth/oauth-transaction.port";
import {
  GOOGLE_OIDC_ENDPOINTS,
  LINE_OIDC_ENDPOINTS,
} from "../../../apps/api/src/modules/auth/oidc-id-token-verifier";
import { MemoryPassengerStore } from "../pax-account-session-20261009/memory-store";

const GOOGLE_CALLBACK = "https://ride.smarttransport.tw/auth/callback/google";
const LINE_CALLBACK = "https://ride.smarttransport.tw/auth/callback/line";
const GOOGLE_CLIENT_ID = "pax-google-client-id";
const LINE_CHANNEL_ID = "pax-line-channel-id";
const LINE_CHANNEL_SECRET = "pax-line-channel-secret";

const { publicKey: googlePublicKey, privateKey: googlePrivateKey } =
  generateKeyPairSync("rsa", { modulusLength: 2048 });
const googleJwk = googlePublicKey.export({ format: "jwk" }) as {
  kty: string;
  n: string;
  e: string;
};
const GOOGLE_KID = "google-test-key";

const { publicKey: linePublicKey, privateKey: linePrivateKey } =
  generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const lineJwk = linePublicKey.export({ format: "jwk" }) as {
  kty: string;
  crv: string;
  x: string;
  y: string;
};
const LINE_KID = "line-test-key";

function signGoogleIdToken(overrides: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: "https://accounts.google.com",
      aud: GOOGLE_CLIENT_ID,
      sub: "google-subject-1",
      iat: now,
      exp: now + 300,
      ...overrides,
    },
    googlePrivateKey,
    { algorithm: "RS256", keyid: GOOGLE_KID },
  );
}
function signLineIdTokenHs256(overrides: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: "https://access.line.me",
      aud: LINE_CHANNEL_ID,
      sub: "line-subject-1",
      iat: now,
      exp: now + 300,
      ...overrides,
    },
    LINE_CHANNEL_SECRET,
    { algorithm: "HS256" },
  );
}
function signLineIdTokenEs256(overrides: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: "https://access.line.me",
      aud: LINE_CHANNEL_ID,
      sub: "line-subject-1",
      iat: now,
      exp: now + 300,
      ...overrides,
    },
    linePrivateKey,
    { algorithm: "ES256", keyid: LINE_KID },
  );
}

let googleIdTokenToReturn: string | null = null;
let lineIdTokenToReturn: string | null = null;
let tokenExchangeStatus = 200;

function jwksResponse(
  kid: string,
  jwk: Record<string, string>,
  alg: "RS256" | "ES256",
) {
  return new Response(
    JSON.stringify({
      keys: [{ ...jwk, kid, alg, use: "sig" }],
    }),
    { status: 200, headers: { "cache-control": "max-age=300" } },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T00:00:00Z"));
  vi.stubEnv("JWT_SECRET", "unit-only-passenger-session-key");
  vi.stubEnv("JWT_KEY_RING_JSON", "");
  vi.stubEnv("JWT_PRIVATE_KEY", "");
  vi.stubEnv("JWT_PUBLIC_KEY", "");
  vi.stubEnv("JWT_ALGORITHM", "HS256");
  vi.stubEnv("JWT_ALGORITHMS", "HS256");
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", GOOGLE_CLIENT_ID);
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "pax-google-client-secret");
  vi.stubEnv("LINE_CHANNEL_ID", LINE_CHANNEL_ID);
  vi.stubEnv("LINE_CHANNEL_SECRET", LINE_CHANNEL_SECRET);
  vi.stubEnv(
    "OAUTH_REDIRECT_ALLOWLIST",
    `${GOOGLE_CALLBACK},${LINE_CALLBACK}`,
  );
  googleIdTokenToReturn = null;
  lineIdTokenToReturn = null;
  tokenExchangeStatus = 200;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === GOOGLE_OIDC_ENDPOINTS.token) {
        if (tokenExchangeStatus !== 200)
          return new Response("error", { status: tokenExchangeStatus });
        return new Response(
          JSON.stringify({ id_token: googleIdTokenToReturn }),
          { status: 200 },
        );
      }
      if (url === GOOGLE_OIDC_ENDPOINTS.jwks)
        return jwksResponse(GOOGLE_KID, googleJwk, "RS256");
      if (url === LINE_OIDC_ENDPOINTS.token) {
        if (tokenExchangeStatus !== 200)
          return new Response("error", { status: tokenExchangeStatus });
        return new Response(
          JSON.stringify({ id_token: lineIdTokenToReturn }),
          { status: 200 },
        );
      }
      if (url === LINE_OIDC_ENDPOINTS.jwks)
        return jwksResponse(LINE_KID, lineJwk, "ES256");
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

class MemoryOAuthTransactionStore {
  rows = new Map<string, OAuthTransactionRecord>();
  async insert(record: OAuthTransactionRecord) {
    this.rows.set(record.transactionId, structuredClone(record));
  }
  async claim(transactionId: string, now: string) {
    const row = this.rows.get(transactionId);
    if (!row || row.consumedAt || Date.parse(row.expiresAt) <= Date.parse(now))
      return null;
    row.consumedAt = now;
    return structuredClone(row);
  }
}

function fixture() {
  const oauthStore = new MemoryOAuthTransactionStore();
  const accountStore = new MemoryPassengerStore();
  const tokens = new PassengerJwtService();
  const accounts = new PassengerAccountService(accountStore, tokens);
  const oauth = new PassengerOAuthService(oauthStore, accounts);
  const controller = new PassengerOAuthController(oauth);
  return { oauthStore, accountStore, accounts, oauth, controller };
}
async function signedIn(f: ReturnType<typeof fixture>, phone = "+886900000001") {
  const account = await f.accounts.findOrCreateByIdentity("phone", phone, {});
  const session = await f.accounts.issueSession(account.drtsPassengerId, "ua");
  const identity = (await f.accounts.authenticateAccessToken(session.accessToken))!;
  return { account, session, identity };
}

describe("GET /passenger-app/auth/providers", () => {
  it("reports google/line disabled until both client id and secret are set, and never reports facebook", async () => {
    const { controller } = fixture();
    expect((await controller.providers()).data.providers).toEqual(
      expect.arrayContaining(["google", "line"]),
    );
    vi.stubEnv("LINE_CHANNEL_SECRET", "");
    const after = fixture();
    expect((await after.controller.providers()).data.providers).not.toContain(
      "line",
    );
    expect((await after.controller.providers()).data.providers).not.toContain(
      "facebook",
    );
  });
});

describe("OAuth start: provider gating, allowlist, link binding", () => {
  it("rejects facebook and any provider missing full env config as unsupported_provider", async () => {
    const { oauth } = fixture();
    await expect(
      oauth.start("facebook", {
        provider: "facebook",
        redirectUri: GOOGLE_CALLBACK,
        purpose: "login",
      }, null),
    ).rejects.toMatchObject({ code: "unsupported_provider" });
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "");
    const { oauth: disabled } = fixture();
    await expect(
      disabled.start("google", {
        provider: "google",
        redirectUri: GOOGLE_CALLBACK,
        purpose: "login",
      }, null),
    ).rejects.toMatchObject({ code: "unsupported_provider" });
  });

  it("rejects a redirect URI outside the configured allowlist", async () => {
    const { oauth } = fixture();
    await expect(
      oauth.start("google", {
        provider: "google",
        redirectUri: "https://evil.example/callback",
        purpose: "login",
      }, null),
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("accepts the exact allowlisted redirect URI", async () => {
    const { oauth } = fixture();
    const res = await oauth.start("google", {
      provider: "google",
      redirectUri: GOOGLE_CALLBACK,
      purpose: "login",
    }, null);
    expect(res.authUrl).toContain(encodeURIComponent(GOOGLE_CALLBACK));
    expect(res.transactionId).toBeTruthy();
    expect(res.state).toBeTruthy();
  });

  it("rejects body/path provider mismatch", async () => {
    const { oauth } = fixture();
    await expect(
      oauth.start("google", {
        provider: "line",
        redirectUri: GOOGLE_CALLBACK,
        purpose: "login",
      }, null),
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("requires an active passenger session to start a purpose=link transaction", async () => {
    const { oauth } = fixture();
    await expect(
      oauth.start("google", {
        provider: "google",
        redirectUri: GOOGLE_CALLBACK,
        purpose: "link",
      }, null),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("binds a link transaction to the caller's own account at start time", async () => {
    const f = fixture();
    const { identity, account } = await signedIn(f);
    const res = await f.oauth.start("google", {
      provider: "google",
      redirectUri: GOOGLE_CALLBACK,
      purpose: "link",
    }, identity);
    expect(f.oauthStore.rows.get(res.transactionId)?.drtsPassengerId).toBe(
      account.drtsPassengerId,
    );
  });
});

describe("OAuth callback: Google/LINE exchange and ID token verification", () => {
  it("logs in with a fresh account on first Google sign-in and burns the transaction on reuse", async () => {
    const f = fixture();
    const start = await f.oauth.start("google", {
      provider: "google",
      redirectUri: GOOGLE_CALLBACK,
      purpose: "login",
    }, null);
    const nonce = f.oauthStore.rows.get(start.transactionId)!.nonce;
    googleIdTokenToReturn = signGoogleIdToken({ nonce });

    const result = await f.oauth.callback("google", {
      provider: "google",
      code: "auth-code-1",
      state: start.state,
      transactionId: start.transactionId,
    }, null);
    expect(result).toMatchObject({ result: "logged_in" });
    expect((result as { accessToken: string }).accessToken).toBeTruthy();

    await expect(
      f.oauth.callback("google", {
        provider: "google",
        code: "auth-code-1",
        state: start.state,
        transactionId: start.transactionId,
      }, null),
    ).rejects.toMatchObject({ code: "invalid_grant" });
  });

  it("logs in an existing account by (provider, subject) rather than creating a second one", async () => {
    const f = fixture();
    const first = await f.oauth.start("google", {
      provider: "google",
      redirectUri: GOOGLE_CALLBACK,
      purpose: "login",
    }, null);
    googleIdTokenToReturn = signGoogleIdToken({
      nonce: f.oauthStore.rows.get(first.transactionId)!.nonce,
    });
    const firstLogin = (await f.oauth.callback("google", {
      provider: "google",
      code: "c1",
      state: first.state,
      transactionId: first.transactionId,
    }, null)) as { drtsPassengerId: string };

    const second = await f.oauth.start("google", {
      provider: "google",
      redirectUri: GOOGLE_CALLBACK,
      purpose: "login",
    }, null);
    googleIdTokenToReturn = signGoogleIdToken({
      nonce: f.oauthStore.rows.get(second.transactionId)!.nonce,
    });
    const secondLogin = (await f.oauth.callback("google", {
      provider: "google",
      code: "c2",
      state: second.state,
      transactionId: second.transactionId,
    }, null)) as { drtsPassengerId: string };
    expect(secondLogin.drtsPassengerId).toBe(firstLogin.drtsPassengerId);
  });

  it("verifies a LINE HS256 (channel secret) ID token and logs in", async () => {
    const f = fixture();
    const start = await f.oauth.start("line", {
      provider: "line",
      redirectUri: LINE_CALLBACK,
      purpose: "login",
    }, null);
    lineIdTokenToReturn = signLineIdTokenHs256({
      nonce: f.oauthStore.rows.get(start.transactionId)!.nonce,
    });
    const result = await f.oauth.callback("line", {
      provider: "line",
      code: "line-code",
      state: start.state,
      transactionId: start.transactionId,
    }, null);
    expect(result).toMatchObject({ result: "logged_in" });
  });

  it("also verifies a LINE ES256 (LINE JWKS, native/SDK/LIFF login) ID token", async () => {
    const f = fixture();
    const start = await f.oauth.start("line", {
      provider: "line",
      redirectUri: LINE_CALLBACK,
      purpose: "login",
    }, null);
    lineIdTokenToReturn = signLineIdTokenEs256({
      nonce: f.oauthStore.rows.get(start.transactionId)!.nonce,
    });
    const result = await f.oauth.callback("line", {
      provider: "line",
      code: "line-code-es256",
      state: start.state,
      transactionId: start.transactionId,
    }, null);
    expect(result).toMatchObject({ result: "logged_in" });
  });

  it("verifies Google ID tokens against Google's own JWKS even when a legacy OIDC_JWKS_URI is configured for tenant/partner OIDC", async () => {
    const f = fixture();
    vi.stubEnv("OIDC_JWKS_URI", "https://legacy.example.test/jwks");
    const start = await f.oauth.start("google", {
      provider: "google",
      redirectUri: GOOGLE_CALLBACK,
      purpose: "login",
    }, null);
    googleIdTokenToReturn = signGoogleIdToken({
      nonce: f.oauthStore.rows.get(start.transactionId)!.nonce,
    });
    const result = await f.oauth.callback("google", {
      provider: "google",
      code: "c",
      state: start.state,
      transactionId: start.transactionId,
    }, null);
    expect(result).toMatchObject({ result: "logged_in" });
  });

  it("verifies LINE ES256 ID tokens against LINE's own JWKS even when a legacy OIDC_JWKS_JSON offline fixture is configured", async () => {
    const f = fixture();
    vi.stubEnv("OIDC_JWKS_JSON", JSON.stringify({ keys: [] }));
    const start = await f.oauth.start("line", {
      provider: "line",
      redirectUri: LINE_CALLBACK,
      purpose: "login",
    }, null);
    lineIdTokenToReturn = signLineIdTokenEs256({
      nonce: f.oauthStore.rows.get(start.transactionId)!.nonce,
    });
    const result = await f.oauth.callback("line", {
      provider: "line",
      code: "line-code-es256",
      state: start.state,
      transactionId: start.transactionId,
    }, null);
    expect(result).toMatchObject({ result: "logged_in" });
  });

  it("sends a PKCE code_verifier to the token endpoint that hashes to the code_challenge issued at /start", async () => {
    const f = fixture();
    const start = await f.oauth.start("google", {
      provider: "google",
      redirectUri: GOOGLE_CALLBACK,
      purpose: "login",
    }, null);
    const stored = f.oauthStore.rows.get(start.transactionId)!;
    googleIdTokenToReturn = signGoogleIdToken({ nonce: stored.nonce });
    await f.oauth.callback("google", {
      provider: "google",
      code: "c",
      state: start.state,
      transactionId: start.transactionId,
    }, null);
    const tokenCall = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.find(
      (call) => call[0] === GOOGLE_OIDC_ENDPOINTS.token,
    );
    const body = new URLSearchParams(
      (tokenCall![1] as RequestInit).body as string,
    );
    expect(
      createHash("sha256").update(body.get("code_verifier")!).digest("base64url"),
    ).toBe(stored.codeChallenge);
  });

  it("does not merge accounts by matching email across different providers/subjects", async () => {
    const f = fixture();
    const g = await f.oauth.start("google", {
      provider: "google",
      redirectUri: GOOGLE_CALLBACK,
      purpose: "login",
    }, null);
    googleIdTokenToReturn = signGoogleIdToken({
      nonce: f.oauthStore.rows.get(g.transactionId)!.nonce,
      email: "same@example.com",
      email_verified: true,
    });
    const googleLogin = (await f.oauth.callback("google", {
      provider: "google",
      code: "c1",
      state: g.state,
      transactionId: g.transactionId,
    }, null)) as { drtsPassengerId: string };

    const l = await f.oauth.start("line", {
      provider: "line",
      redirectUri: LINE_CALLBACK,
      purpose: "login",
    }, null);
    lineIdTokenToReturn = signLineIdTokenHs256({
      nonce: f.oauthStore.rows.get(l.transactionId)!.nonce,
      sub: "line-subject-distinct-from-google",
      email: "same@example.com",
      email_verified: true,
    });
    const lineLogin = (await f.oauth.callback("line", {
      provider: "line",
      code: "c2",
      state: l.state,
      transactionId: l.transactionId,
    }, null)) as { drtsPassengerId: string };

    expect(lineLogin.drtsPassengerId).not.toBe(googleLogin.drtsPassengerId);
  });

  it("rejects a LINE HS256 ID token with the wrong nonce as invalid_grant", async () => {
    const f = fixture();
    const start = await f.oauth.start("line", {
      provider: "line",
      redirectUri: LINE_CALLBACK,
      purpose: "login",
    }, null);
    lineIdTokenToReturn = signLineIdTokenHs256({ nonce: "not-the-real-nonce" });
    await expect(
      f.oauth.callback("line", {
        provider: "line",
        code: "line-code",
        state: start.state,
        transactionId: start.transactionId,
      }, null),
    ).rejects.toMatchObject({ code: "invalid_grant" });
  });

  it("rejects a LINE HS256 ID token signed with the wrong channel secret (forged signature)", async () => {
    const f = fixture();
    const start = await f.oauth.start("line", {
      provider: "line",
      redirectUri: LINE_CALLBACK,
      purpose: "login",
    }, null);
    const nonce = f.oauthStore.rows.get(start.transactionId)!.nonce;
    lineIdTokenToReturn = jwt.sign(
      {
        iss: "https://access.line.me",
        aud: LINE_CHANNEL_ID,
        sub: "line-subject-1",
        nonce,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
      },
      "wrong-channel-secret",
      { algorithm: "HS256" },
    );
    await expect(
      f.oauth.callback("line", {
        provider: "line",
        code: "line-code",
        state: start.state,
        transactionId: start.transactionId,
      }, null),
    ).rejects.toMatchObject({ code: "invalid_grant" });
  });

  it("rejects a LINE ES256 ID token with the wrong nonce as invalid_grant", async () => {
    const f = fixture();
    const start = await f.oauth.start("line", {
      provider: "line",
      redirectUri: LINE_CALLBACK,
      purpose: "login",
    }, null);
    lineIdTokenToReturn = signLineIdTokenEs256({ nonce: "not-the-real-nonce" });
    await expect(
      f.oauth.callback("line", {
        provider: "line",
        code: "line-code-es256",
        state: start.state,
        transactionId: start.transactionId,
      }, null),
    ).rejects.toMatchObject({ code: "invalid_grant" });
  });

  it("rejects a LINE ES256 ID token signed by a different key (forged signature)", async () => {
    const f = fixture();
    const start = await f.oauth.start("line", {
      provider: "line",
      redirectUri: LINE_CALLBACK,
      purpose: "login",
    }, null);
    const nonce = f.oauthStore.rows.get(start.transactionId)!.nonce;
    const forged = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    lineIdTokenToReturn = jwt.sign(
      {
        iss: "https://access.line.me",
        aud: LINE_CHANNEL_ID,
        sub: "line-subject-1",
        nonce,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
      },
      forged.privateKey,
      { algorithm: "ES256", keyid: LINE_KID },
    );
    await expect(
      f.oauth.callback("line", {
        provider: "line",
        code: "line-code-es256",
        state: start.state,
        transactionId: start.transactionId,
      }, null),
    ).rejects.toMatchObject({ code: "invalid_grant" });
  });

  it("rejects a malformed (non-uuid) transactionId before any transaction store lookup", async () => {
    const f = fixture();
    const claimSpy = vi.spyOn(f.oauthStore, "claim");
    await expect(
      f.oauth.callback("google", {
        provider: "google",
        code: "c",
        state: "s",
        transactionId: "not-a-real-transaction",
      }, null),
    ).rejects.toMatchObject({ code: "invalid_grant" });
    expect(claimSpy).not.toHaveBeenCalled();
  });

  it("rejects a well-formed but unknown uuid transactionId only after a transaction store lookup", async () => {
    const f = fixture();
    const claimSpy = vi.spyOn(f.oauthStore, "claim");
    await expect(
      f.oauth.callback("google", {
        provider: "google",
        code: "c",
        state: "s",
        transactionId: randomUUID(),
      }, null),
    ).rejects.toMatchObject({ code: "invalid_grant" });
    expect(claimSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["wrong state", (s: { state: string }) => ({ ...s, state: "tampered-state" })],
    ["unknown transactionId", (s: { transactionId: string }) => ({ ...s, transactionId: "not-a-real-transaction" })],
  ])("rejects callback with %s as invalid_grant", async (_label, mutate) => {
    const f = fixture();
    const start = await f.oauth.start("google", {
      provider: "google",
      redirectUri: GOOGLE_CALLBACK,
      purpose: "login",
    }, null);
    googleIdTokenToReturn = signGoogleIdToken({
      nonce: f.oauthStore.rows.get(start.transactionId)!.nonce,
    });
    const base = { provider: "google", code: "c", state: start.state, transactionId: start.transactionId };
    await expect(
      f.oauth.callback("google", mutate(base as never), null),
    ).rejects.toMatchObject({ code: "invalid_grant" });
  });

  it("rejects an expired transaction even with an otherwise-valid callback", async () => {
    const f = fixture();
    const start = await f.oauth.start("google", {
      provider: "google",
      redirectUri: GOOGLE_CALLBACK,
      purpose: "login",
    }, null);
    googleIdTokenToReturn = signGoogleIdToken({
      nonce: f.oauthStore.rows.get(start.transactionId)!.nonce,
    });
    vi.advanceTimersByTime(11 * 60 * 1000);
    await expect(
      f.oauth.callback("google", {
        provider: "google",
        code: "c",
        state: start.state,
        transactionId: start.transactionId,
      }, null),
    ).rejects.toMatchObject({ code: "invalid_grant" });
  });

  it.each([
    ["wrong issuer", () => ({ iss: "https://attacker.example" })],
    ["wrong audience", () => ({ aud: "someone-elses-client-id" })],
    ["wrong nonce", () => ({ nonce: "not-the-real-nonce" })],
    // Computed inside the factory, not the array literal: the array is
    // evaluated once at describe-collection time, before beforeEach installs
    // the fake clock, so a value baked in here would be "expired" relative
    // to the real wall clock but not necessarily relative to the mocked one.
    [
      "expired id token",
      () => ({
        iat: Math.floor(Date.now() / 1000) - 1000,
        exp: Math.floor(Date.now() / 1000) - 400,
      }),
    ],
    ["missing sub", () => ({ sub: undefined })],
  ])("rejects an ID token with %s as invalid_grant", async (_label, makeClaims) => {
    const f = fixture();
    const start = await f.oauth.start("google", {
      provider: "google",
      redirectUri: GOOGLE_CALLBACK,
      purpose: "login",
    }, null);
    const nonce = f.oauthStore.rows.get(start.transactionId)!.nonce;
    googleIdTokenToReturn = signGoogleIdToken({ nonce, ...makeClaims() });
    await expect(
      f.oauth.callback("google", {
        provider: "google",
        code: "c",
        state: start.state,
        transactionId: start.transactionId,
      }, null),
    ).rejects.toMatchObject({ code: "invalid_grant" });
  });

  it("rejects an ID token signed by a different key (forged signature)", async () => {
    const f = fixture();
    const start = await f.oauth.start("google", {
      provider: "google",
      redirectUri: GOOGLE_CALLBACK,
      purpose: "login",
    }, null);
    const nonce = f.oauthStore.rows.get(start.transactionId)!.nonce;
    const forged = generateKeyPairSync("rsa", { modulusLength: 2048 });
    googleIdTokenToReturn = jwt.sign(
      {
        iss: "https://accounts.google.com",
        aud: GOOGLE_CLIENT_ID,
        sub: "google-subject-1",
        nonce,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
      },
      forged.privateKey,
      { algorithm: "RS256", keyid: GOOGLE_KID },
    );
    await expect(
      f.oauth.callback("google", {
        provider: "google",
        code: "c",
        state: start.state,
        transactionId: start.transactionId,
      }, null),
    ).rejects.toMatchObject({ code: "invalid_grant" });
  });

  it("propagates a provider-side token endpoint rejection as invalid_grant", async () => {
    const f = fixture();
    const start = await f.oauth.start("google", {
      provider: "google",
      redirectUri: GOOGLE_CALLBACK,
      purpose: "login",
    }, null);
    tokenExchangeStatus = 400;
    await expect(
      f.oauth.callback("google", {
        provider: "google",
        code: "c",
        state: start.state,
        transactionId: start.transactionId,
      }, null),
    ).rejects.toMatchObject({ code: "invalid_grant" });
  });
});

describe("OAuth callback: linking", () => {
  it("links a new provider identity to the account that started the transaction", async () => {
    const f = fixture();
    const { identity, account } = await signedIn(f);
    const start = await f.oauth.start("google", {
      provider: "google",
      redirectUri: GOOGLE_CALLBACK,
      purpose: "link",
    }, identity);
    googleIdTokenToReturn = signGoogleIdToken({
      nonce: f.oauthStore.rows.get(start.transactionId)!.nonce,
    });
    const result = await f.oauth.callback("google", {
      provider: "google",
      code: "c",
      state: start.state,
      transactionId: start.transactionId,
    }, identity);
    expect(result).toEqual({ result: "linked" });
    const linked = await f.accountStore.findIdentity("google", "google-subject-1");
    expect(linked?.drtsPassengerId).toBe(account.drtsPassengerId);
  });

  it("rejects completing a link transaction under a different (or absent) passenger session", async () => {
    const f = fixture();
    const owner = await signedIn(f);
    const start = await f.oauth.start("google", {
      provider: "google",
      redirectUri: GOOGLE_CALLBACK,
      purpose: "link",
    }, owner.identity);
    googleIdTokenToReturn = signGoogleIdToken({
      nonce: f.oauthStore.rows.get(start.transactionId)!.nonce,
    });
    await expect(
      f.oauth.callback("google", {
        provider: "google",
        code: "c",
        state: start.state,
        transactionId: start.transactionId,
      }, null),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("rejects completing a link transaction while authenticated as a different live passenger account (not just signed out)", async () => {
    const f = fixture();
    const owner = await signedIn(f, "+886900000001");
    const intruder = await signedIn(f, "+886900000002");
    const start = await f.oauth.start("google", {
      provider: "google",
      redirectUri: GOOGLE_CALLBACK,
      purpose: "link",
    }, owner.identity);
    googleIdTokenToReturn = signGoogleIdToken({
      nonce: f.oauthStore.rows.get(start.transactionId)!.nonce,
    });
    await expect(
      f.oauth.callback("google", {
        provider: "google",
        code: "c",
        state: start.state,
        transactionId: start.transactionId,
      }, intruder.identity),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("rejects completing a link transaction once the caller's session has been revoked (logout)", async () => {
    const f = fixture();
    const owner = await signedIn(f);
    const start = await f.oauth.start("google", {
      provider: "google",
      redirectUri: GOOGLE_CALLBACK,
      purpose: "link",
    }, owner.identity);
    googleIdTokenToReturn = signGoogleIdToken({
      nonce: f.oauthStore.rows.get(start.transactionId)!.nonce,
    });
    await f.accounts.logout(owner.session.refreshToken);
    await expect(
      f.oauth.callback("google", {
        provider: "google",
        code: "c",
        state: start.state,
        transactionId: start.transactionId,
      }, owner.identity),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("rejects linking an identity already owned by a different account", async () => {
    const f = fixture();
    const existingGoogleUser = await f.accounts.findOrCreateByIdentity(
      "google",
      "google-subject-1",
      {},
    );
    const other = await signedIn(f);
    const start = await f.oauth.start("google", {
      provider: "google",
      redirectUri: GOOGLE_CALLBACK,
      purpose: "link",
    }, other.identity);
    googleIdTokenToReturn = signGoogleIdToken({
      nonce: f.oauthStore.rows.get(start.transactionId)!.nonce,
    });
    await expect(
      f.oauth.callback("google", {
        provider: "google",
        code: "c",
        state: start.state,
        transactionId: start.transactionId,
      }, other.identity),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(
      (await f.accountStore.findIdentity("google", "google-subject-1"))
        ?.drtsPassengerId,
    ).toBe(existingGoogleUser.drtsPassengerId);
  });
});
