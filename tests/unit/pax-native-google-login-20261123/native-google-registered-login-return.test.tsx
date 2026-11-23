// @vitest-environment jsdom
import { createHash, generateKeyPairSync } from "node:crypto";
import jwt from "jsonwebtoken";
import React, { type ReactElement } from "react";
import {
  cleanup,
  render as renderComponent,
  screen,
  waitFor,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import * as ts from "typescript";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NativePassengerSession,
  PassengerApiError,
  PassengerClient,
  PassengerNativeAuthClient,
  createNativePassengerFetch,
  type FetchOptions,
  type NativePassengerTokenPair,
} from "../../../packages/passenger-client/src/index";
import { PassengerAuthClient } from "../../../apps/passenger-app-web/lib/auth/client";
import * as bff from "../../../apps/passenger-app-web/app/api/passenger-app/[...path]/route";
import CallbackPage from "../../../apps/passenger-app-web/app/auth/callback/[provider]/page";
import * as nativeReturnModule from "../../../apps/passenger-app-web/app/auth/native-oauth-return";
import { PassengerJwtService } from "../../../apps/api/src/common/auth/passenger-jwt.service";
import { PassengerAccountController } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.controller";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { PassengerOAuthService } from "../../../apps/api/src/modules/passenger-app/oauth/passenger-oauth.service";
import type { OAuthTransactionRecord } from "../../../apps/api/src/modules/passenger-app/oauth/oauth-transaction.port";
import {
  GOOGLE_OIDC_ENDPOINTS,
  LINE_OIDC_ENDPOINTS,
} from "../../../apps/api/src/modules/auth/oidc-id-token-verifier";
import { MemoryPassengerStore } from "../pax-account-session-20261009/memory-store";
import { NextRequest } from "next/server";

const WEB_ORIGIN = "https://ride.smarttransport.tw";
const API_ORIGIN = "https://api.smarttransport.tw";
const GOOGLE_WEB_CALLBACK = `${WEB_ORIGIN}/auth/callback/google`;
const LINE_WEB_CALLBACK = `${WEB_ORIGIN}/auth/callback/line`;
const NATIVE_CALLBACK = "drtspassenger://auth/callback";
const GOOGLE_CLIENT_ID = "pax-google-web-client-id";
const GOOGLE_CLIENT_SECRET = "pax-google-web-client-secret";
const LINE_CHANNEL_ID = "pax-line-channel-id";
const LINE_CHANNEL_SECRET = "pax-line-channel-secret";
const GOOGLE_KID = "google-web-client-kid-1";

const { publicKey: googlePublicKey, privateKey: googlePrivateKey } =
  generateKeyPairSync("rsa", { modulusLength: 2048 });
const googleJwk = googlePublicKey.export({ format: "jwk" }) as {
  kty: string;
  n: string;
  e: string;
};

function signGoogleIdToken(overrides: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: "https://accounts.google.com",
      aud: GOOGLE_CLIENT_ID,
      sub: "google-passenger-sub-20261123",
      name: "智行手機乘客",
      email: "mobile.pax@example.test",
      email_verified: true,
      iat: now,
      exp: now + 300,
      ...overrides,
    },
    googlePrivateKey,
    { algorithm: "RS256", keyid: GOOGLE_KID },
  );
}

const appRequire = createRequire(
  resolve("apps/passenger-app-web/package.json"),
);
const { AppRouterContext } = appRequire(
  "next/dist/shared/lib/app-router-context.shared-runtime",
) as typeof import("next/dist/shared/lib/app-router-context.shared-runtime");
const { PathParamsContext, SearchParamsContext } = appRequire(
  "next/dist/shared/lib/hooks-client-context.shared-runtime",
) as typeof import("next/dist/shared/lib/hooks-client-context.shared-runtime");

function loadNativeLoginScreenModule() {
  const source = readFileSync(
    resolve("apps/passenger-app/components/auth/passenger-login-screen.tsx"),
    "utf8",
  );
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }).outputText;
  const exportsObj: Record<string, unknown> = {};
  const deps: Record<string, unknown> = {
    react: React,
    "react-native": {
      ActivityIndicator: "ActivityIndicator",
      Pressable: "Pressable",
      ScrollView: "ScrollView",
      StyleSheet: { create: <T,>(s: T) => s },
      Text: "Text",
      TextInput: "TextInput",
      View: "View",
    },
    "@drts/passenger-client": { PassengerApiError },
  };
  new Function("exports", "require", transpiled)(
    exportsObj,
    (id: string) => deps[id],
  );
  return exportsObj as {
    callbackFields(
      url: string,
      expectedState?: string,
    ): { code: string; state: string } | null;
  };
}
const { callbackFields } = loadNativeLoginScreenModule();

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

describe("PAX-NATIVE-GOOGLE-REGISTERED-LOGIN-RETURN-20261123: Google web-client HTTPS redirect bridge to same passenger native session", () => {
  const routerPush = vi.fn();
  const router: AppRouterInstance = {
    bfcacheId: "pax-native-google-return-test",
    push: routerPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  };

  function renderCallbackPage(
    provider: string,
    query: URLSearchParams,
    ui: ReactElement = <CallbackPage />,
  ) {
    return renderComponent(
      <AppRouterContext.Provider value={router}>
        <PathParamsContext.Provider value={{ provider }}>
          <SearchParamsContext.Provider value={query}>
            {ui}
          </SearchParamsContext.Provider>
        </PathParamsContext.Provider>
      </AppRouterContext.Provider>,
    );
  }

  function createEnvironment() {
    const oauthStore = new MemoryOAuthTransactionStore();
    const accountStore = new MemoryPassengerStore();
    const jwtService = new PassengerJwtService();
    const accounts = new PassengerAccountService(accountStore, jwtService);
    const accountController = new PassengerAccountController(accounts);
    const oauth = new PassengerOAuthService(oauthStore, accounts);

    const googleTokenRequests: Array<{
      grant_type: string | null;
      code: string | null;
      redirect_uri: string | null;
      client_id: string | null;
      client_secret: string | null;
      code_verifier: string | null;
    }> = [];
    const expectedAuthorizations = new Map<
      string,
      {
        redirectUri: string;
        codeChallenge: string;
        nonce: string;
        sub: string;
      }
    >();
    const bffCalls: Array<{ method: string; path: string }> = [];
    const cookieJar = new Map<string, string>();
    let nativeStoredPair: NativePassengerTokenPair | null = null;

    const handleApiRequest = async (
      url: string,
      init?: RequestInit,
    ): Promise<Response> => {
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/^\/api\/passenger-app\//, "");
      const method = (init?.method ?? "GET").toUpperCase();
      const headers = new Headers(init?.headers);
      const bearer = headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      const identity = bearer
        ? await accounts.authenticateAccessToken(bearer)
        : null;
      const rawBody = init?.body
        ? typeof init.body === "string"
          ? init.body
          : new TextDecoder().decode(init.body as ArrayBuffer)
        : "";
      const body = rawBody ? JSON.parse(rawBody) : {};

      try {
        if (path === "me" && method === "GET") {
          return Response.json(await accountController.me(identity));
        }
        if (path === "me" && method === "PATCH") {
          return Response.json(await accountController.update(identity, body));
        }
        if (path.startsWith("auth/oauth/")) {
          const [, , provider, action] = path.split("/");
          if (action === "start" && method === "POST") {
            return Response.json({
              data: await oauth.start(provider as "google", body, identity),
            });
          }
          if (action === "callback" && method === "POST") {
            return Response.json({
              data: await oauth.callback(provider as "google", body, identity),
            });
          }
        }
        return Response.json(
          { error: { code: "not_found", message: path } },
          { status: 404 },
        );
      } catch (err) {
        if (typeof err === "object" && err && "getResponse" in err) {
          const ex = err as { getResponse(): unknown; getStatus(): number };
          return Response.json(ex.getResponse(), { status: ex.getStatus() });
        }
        throw err;
      }
    };

    const browserFetch = async (url: string, options?: FetchOptions) => {
      const request = new NextRequest(new URL(url, WEB_ORIGIN), {
        method: options?.method ?? "GET",
        headers: {
          ...options?.headers,
          origin: WEB_ORIGIN,
          host: new URL(WEB_ORIGIN).host,
          cookie: [...cookieJar]
            .map(([name, value]) => `${name}=${value}`)
            .join("; "),
        },
        ...(options?.body ? { body: options.body } : {}),
      });
      const path = request.nextUrl.pathname
        .slice("/api/passenger-app/".length)
        .split("/");
      bffCalls.push({ method: request.method, path: path.join("/") });
      const handlers: Record<string, typeof bff.GET> = {
        GET: bff.GET,
        POST: bff.POST,
        PATCH: bff.PATCH,
        DELETE: bff.DELETE,
      };
      const response = await handlers[request.method]!(request, {
        params: Promise.resolve({ path }),
      });
      for (const cookie of response.cookies.getAll()) {
        if (cookie.maxAge === 0) cookieJar.delete(cookie.name);
        else cookieJar.set(cookie.name, cookie.value);
      }
      return response;
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/passenger-app/")) {
          return browserFetch(url, init as FetchOptions);
        }
        if (url === GOOGLE_OIDC_ENDPOINTS.token) {
          const params = new URLSearchParams(String(init?.body ?? ""));
          const req = {
            grant_type: params.get("grant_type"),
            code: params.get("code"),
            redirect_uri: params.get("redirect_uri"),
            client_id: params.get("client_id"),
            client_secret: params.get("client_secret"),
            code_verifier: params.get("code_verifier"),
          };
          googleTokenRequests.push(req);
          const expected = req.code
            ? expectedAuthorizations.get(req.code)
            : undefined;
          if (!expected) {
            return new Response(JSON.stringify({ error: "invalid_grant" }), {
              status: 400,
            });
          }
          // Controlled Google token endpoint enforces RFC 6749 §4.1.3 exact redirect_uri match and PKCE S256 verifier
          const actualChallenge = createHash("sha256")
            .update(req.code_verifier ?? "")
            .digest("base64url");
          if (
            req.redirect_uri !== expected.redirectUri ||
            actualChallenge !== expected.codeChallenge ||
            req.client_id !== GOOGLE_CLIENT_ID ||
            req.client_secret !== GOOGLE_CLIENT_SECRET
          ) {
            return new Response(
              JSON.stringify({ error: "redirect_uri_or_pkce_mismatch" }),
              { status: 400 },
            );
          }
          return new Response(
            JSON.stringify({
              id_token: signGoogleIdToken({
                nonce: expected.nonce,
                sub: expected.sub,
              }),
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url === GOOGLE_OIDC_ENDPOINTS.jwks) {
          return new Response(
            JSON.stringify({
              keys: [
                {
                  ...googleJwk,
                  kid: GOOGLE_KID,
                  alg: "RS256",
                  use: "sig",
                },
              ],
            }),
            { status: 200, headers: { "cache-control": "max-age=300" } },
          );
        }
        if (
          url.startsWith(`${API_ORIGIN}/api/passenger-app/`) ||
          url.startsWith("https://upstream.example.invalid/api/passenger-app/")
        ) {
          return handleApiRequest(url, init);
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      }),
    );

    const nativeStore = {
      read: vi.fn(async () =>
        nativeStoredPair ? { ...nativeStoredPair } : null,
      ),
      write: vi.fn(async (pair: NativePassengerTokenPair) => {
        nativeStoredPair = { ...pair };
      }),
      clear: vi.fn(async () => {
        nativeStoredPair = null;
      }),
    };
    const nativeAuth = new PassengerNativeAuthClient({
      baseUrl: API_ORIGIN,
      fetchFn: (url, options) =>
        handleApiRequest(url, options as unknown as RequestInit),
    });
    const nativeSession = new NativePassengerSession(nativeAuth, nativeStore);
    const nativePassenger = new PassengerClient({
      baseUrl: API_ORIGIN,
      fetchFn: createNativePassengerFetch({
        baseUrl: API_ORIGIN,
        fetchFn: (url, options) =>
          handleApiRequest(url, options as unknown as RequestInit),
        session: nativeSession,
      }),
    });
    const webClient = new PassengerAuthClient(
      new PassengerClient({ baseUrl: WEB_ORIGIN, fetchFn: browserFetch }),
    );

    return {
      oauthStore,
      accountStore,
      accounts,
      oauth,
      googleTokenRequests,
      expectedAuthorizations,
      bffCalls,
      cookieJar,
      nativeStore,
      nativeSession,
      nativePassenger,
      nativeStoredPair: () => nativeStoredPair,
      webClient,
    };
  }

  beforeEach(() => {
    routerPush.mockClear();
    vi.stubEnv("DRTS_ENV", "test");
    vi.stubEnv("DRTS_API_URL", "https://upstream.example.invalid");
    vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
    vi.stubEnv("JWT_SECRET", "unit-only-passenger-session-key");
    vi.stubEnv("JWT_KEY_RING_JSON", "");
    vi.stubEnv("JWT_PRIVATE_KEY", "");
    vi.stubEnv("JWT_PUBLIC_KEY", "");
    vi.stubEnv("JWT_ALGORITHM", "HS256");
    vi.stubEnv("JWT_ALGORITHMS", "HS256");
    vi.stubEnv("NEXT_PUBLIC_TERMS_URL", "https://legal.example.invalid/terms");
    vi.stubEnv(
      "NEXT_PUBLIC_PRIVACY_URL",
      "https://legal.example.invalid/privacy",
    );
    vi.stubEnv("NEXT_PUBLIC_TERMS_VERSION", "terms-2026");
    vi.stubEnv("NEXT_PUBLIC_PRIVACY_VERSION", "privacy-2026");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", GOOGLE_CLIENT_ID);
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", GOOGLE_CLIENT_SECRET);
    vi.stubEnv("LINE_CHANNEL_ID", LINE_CHANNEL_ID);
    vi.stubEnv("LINE_CHANNEL_SECRET", LINE_CHANNEL_SECRET);
    vi.stubEnv(
      "OAUTH_REDIRECT_ALLOWLIST",
      [NATIVE_CALLBACK, GOOGLE_WEB_CALLBACK, LINE_WEB_CALLBACK].join(","),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses the registered HTTPS callback for Google authorization and token exchange, bridges /auth/callback/google back to drtspassenger://auth/callback, and reads back the same passenger native account", async () => {
    const env = createEnvironment();
    const redirectSpy = vi
      .spyOn(nativeReturnModule, "redirectToNativePassengerApp")
      .mockImplementation(() => {});

    // 1. Native app initiates Google login with its canonical app scheme callbackUri
    const start = await env.nativeSession.oauthStart({
      provider: "google",
      redirectUri: NATIVE_CALLBACK,
      purpose: "login",
    });

    const authUrl = new URL(start.authUrl);
    expect(authUrl.origin).toBe("https://accounts.google.com");
    expect(authUrl.searchParams.get("redirect_uri")).toBe(GOOGLE_WEB_CALLBACK);
    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(start.state).toMatch(/^drtspassenger\.[A-Za-z0-9_-]{16,}$/);
    expect(authUrl.searchParams.get("state")).toBe(start.state);

    const storedTxn = env.oauthStore.rows.get(start.transactionId)!;
    expect(storedTxn.redirectUri).toBe(GOOGLE_WEB_CALLBACK);
    expect(storedTxn.stateHash).toBe(
      createHash("sha256").update(start.state).digest("hex"),
    );

    // 2. Controlled Google provider issues an authorization code bound to the exact HTTPS redirect_uri and PKCE challenge
    const googleCode = "google-auth-code-native-session-1";
    env.expectedAuthorizations.set(googleCode, {
      redirectUri: authUrl.searchParams.get("redirect_uri")!,
      codeChallenge: authUrl.searchParams.get("code_challenge")!,
      nonce: authUrl.searchParams.get("nonce")!,
      sub: "google-mobile-passenger-1",
    });

    // 3. Google redirects the system browser to the registered HTTPS callback page (/auth/callback/google)
    renderCallbackPage(
      "google",
      new URLSearchParams({
        code: googleCode,
        state: start.state,
      }),
    );

    const expectedNativeUrl = `${NATIVE_CALLBACK}?code=${encodeURIComponent(googleCode)}&state=${encodeURIComponent(start.state)}`;
    await waitFor(() =>
      expect(redirectSpy).toHaveBeenCalledExactlyOnceWith(expectedNativeUrl),
    );
    const link = screen.getByTestId(
      "native-oauth-return-link",
    ) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(expectedNativeUrl);
    // Web BFF must not be called for a native-initiated transaction
    expect(env.bffCalls).toEqual([]);
    expect(
      env.oauthStore.rows.get(start.transactionId)?.consumedAt,
    ).toBeNull();

    // 4. System browser hands the drtspassenger://auth/callback URL back to the same mobile session
    const fields = callbackFields(expectedNativeUrl, start.state);
    expect(fields).toEqual({ code: googleCode, state: start.state });

    const callbackResult = await env.nativeSession.oauthCallback({
      provider: "google",
      ...fields!,
      transactionId: start.transactionId,
    });
    expect(callbackResult.result).toBe("logged_in");

    // Verify Google token exchange used the exact same registered HTTPS redirect_uri
    expect(env.googleTokenRequests).toHaveLength(1);
    expect(env.googleTokenRequests[0]).toMatchObject({
      grant_type: "authorization_code",
      code: googleCode,
      redirect_uri: GOOGLE_WEB_CALLBACK,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code_verifier: storedTxn.codeVerifier,
    });

    // 5. Native session persisted tokens and reads back its own account from the original API
    expect(env.nativeStoredPair()?.accessToken).toBeTruthy();
    const account = await env.nativePassenger.getAccount();
    expect(account).toMatchObject({
      displayName: "智行手機乘客",
      verifiedEmail: "mobile.pax@example.test",
      status: "active",
    });
  });

  it("bridges provider cancellation (error=access_denied) back to drtspassenger://auth/callback without calling Web BFF or issuing a session", async () => {
    const env = createEnvironment();
    const redirectSpy = vi
      .spyOn(nativeReturnModule, "redirectToNativePassengerApp")
      .mockImplementation(() => {});

    const start = await env.nativeSession.oauthStart({
      provider: "google",
      redirectUri: NATIVE_CALLBACK,
      purpose: "login",
    });

    renderCallbackPage(
      "google",
      new URLSearchParams({
        error: "access_denied",
        state: start.state,
      }),
    );

    const expectedCancelUrl = `${NATIVE_CALLBACK}?error=access_denied&state=${encodeURIComponent(start.state)}`;
    await waitFor(() =>
      expect(redirectSpy).toHaveBeenCalledExactlyOnceWith(expectedCancelUrl),
    );
    expect(screen.getByTestId("native-oauth-return-status").textContent).toContain(
      "您已取消社群帳號授權",
    );
    expect(env.bffCalls).toEqual([]);
    expect(callbackFields(expectedCancelUrl, start.state)).toBeNull();
    expect(env.googleTokenRequests).toHaveLength(0);
    expect(env.nativeStoredPair()).toBeNull();
  });

  it("preserves existing Web Google login and BFF cookie transaction binding without redirecting to drtspassenger://", async () => {
    const env = createEnvironment();
    const redirectSpy = vi.spyOn(
      nativeReturnModule,
      "redirectToNativePassengerApp",
    );

    const webStart = await env.webClient.oauthStart({
      provider: "google",
      redirectUri: GOOGLE_WEB_CALLBACK,
      purpose: "login",
    });
    expect(webStart.state).not.toMatch(/^drtspassenger\./);
    expect(env.cookieJar.has("pax_oauth_txn")).toBe(true);

    const authUrl = new URL(webStart.authUrl);
    expect(authUrl.searchParams.get("redirect_uri")).toBe(GOOGLE_WEB_CALLBACK);

    const webCode = "google-auth-code-web-session-1";
    env.expectedAuthorizations.set(webCode, {
      redirectUri: GOOGLE_WEB_CALLBACK,
      codeChallenge: authUrl.searchParams.get("code_challenge")!,
      nonce: authUrl.searchParams.get("nonce")!,
      sub: "google-web-passenger-1",
    });

    renderCallbackPage(
      "google",
      new URLSearchParams({
        code: webCode,
        state: webStart.state,
      }),
    );

    await screen.findByText("歡迎加入，請同意服務條款");
    expect(redirectSpy).not.toHaveBeenCalled();
    expect(env.cookieJar.has("pax_oauth_txn")).toBe(false);
    expect(env.cookieJar.has("pax_session")).toBe(true);
    expect(env.googleTokenRequests).toHaveLength(1);
    expect(env.googleTokenRequests[0]?.redirect_uri).toBe(GOOGLE_WEB_CALLBACK);
  });

  it("keeps other providers unchanged and rejects Google native start when no HTTPS Google callback is in OAUTH_REDIRECT_ALLOWLIST", async () => {
    const env = createEnvironment();
    // LINE native custom-scheme redirect is untouched when allowlisted
    vi.stubEnv(
      "OAUTH_REDIRECT_ALLOWLIST",
      [NATIVE_CALLBACK, LINE_WEB_CALLBACK].join(","),
    );
    const lineStart = await env.oauth.start(
      "line",
      {
        provider: "line",
        redirectUri: NATIVE_CALLBACK,
        purpose: "login",
      },
      null,
    );
    expect(new URL(lineStart.authUrl).origin).toBe(
      new URL(LINE_OIDC_ENDPOINTS.authorization).origin,
    );
    expect(new URL(lineStart.authUrl).searchParams.get("redirect_uri")).toBe(
      NATIVE_CALLBACK,
    );
    expect(lineStart.state).not.toMatch(/^drtspassenger\./);

    // Google without an allowlisted HTTPS Google callback in OAUTH_REDIRECT_ALLOWLIST is rejected
    await expect(
      env.oauth.start(
        "google",
        {
          provider: "google",
          redirectUri: NATIVE_CALLBACK,
          purpose: "login",
        },
        null,
      ),
    ).rejects.toMatchObject({ code: "validation_error" });
  });
});
