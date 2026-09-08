import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  GET as authGet,
  POST as authPost,
} from "../../../../apps/tenant-console-web/app/api/auth/[...auth]/route";
import { middleware } from "../../../../apps/tenant-console-web/middleware";
import {
  TENANT_SESSION_COOKIE_NAME,
  TENANT_OIDC_STATE_COOKIE_NAME,
  TENANT_CSRF_COOKIE_NAME,
  TENANT_CSRF_HEADER_NAME,
} from "../../../../apps/tenant-console-web/lib/auth/constants";

// SR-TENANT-LOGIN-001 regression suite.
//
// Audit finding R02 (docs/04-uat/system-remediation-20260906/source/findings.json)
// reported that the tenant login button produced a hardcoded `localhost:3104`
// OIDC callback that was rejected by the backend (400
// AUTH_SESSION_EXCHANGE_DENIED) when reached from a public Cloud Run origin.
// Reading the current implementation
// (apps/tenant-console-web/app/api/auth/[...auth]/route.ts) shows the callback
// is derived from `request.nextUrl.origin`, never a fixed host/port — this
// suite proves that behavior end-to-end against the real route handlers and
// middleware (no fixtures standing in for the code under test; only the
// upstream `fetch` to the DRTS API is mocked) and locks in the surrounding
// acceptance criteria: malicious returnTo / state-replay rejection and
// expired-session recovery.

function extractCookieValue(
  setCookieHeaders: string[],
  name: string,
): string | undefined {
  const header = setCookieHeaders.find((c: string) => c.startsWith(`${name}=`));
  if (!header) return undefined;
  const value = header.split(";")[0]?.split("=").slice(1).join("=");
  return value;
}

describe("SR-TENANT-LOGIN-001: tenant login callback + error recovery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.BFF_STATE_SECRET = "test-bff-state-secret-32-chars-long-123456";
  });

  it("R02 regression: login from a public origin produces a callback derived from that origin, not a hardcoded localhost:3104", async () => {
    const publicOrigin = "https://tenant.console.drts.example.com";
    let capturedBackendUrl = "";

    global.fetch = vi.fn().mockImplementationOnce(async (url: string) => {
      capturedBackendUrl = url;
      return {
        ok: true,
        json: async () => ({
          authorization_url: "https://idp.example.com/oauth/authorize?state=s1",
          state: "s1",
        }),
      } as Response;
    });

    const request = new NextRequest(
      `${publicOrigin}/api/auth/tenant/login?redirect_uri=/dashboard`,
    );
    const response = await authGet(request, {
      params: Promise.resolve({ auth: ["tenant", "login"] }),
    });

    expect(response.status).toBe(307);

    const backendUrl = new URL(capturedBackendUrl);
    const redirectUri = backendUrl.searchParams.get("redirect_uri");
    expect(redirectUri).toBe(`${publicOrigin}/api/auth/tenant/callback`);
    expect(redirectUri).not.toContain("localhost:3104");
    expect(redirectUri).not.toContain("localhost");
  });

  it("rejects a malicious returnTo end-to-end: attacker redirect_uri at login never survives to the post-callback redirect", async () => {
    const origin = "https://tenant.console.drts.example.com";
    const attackerTarget = "https://evil-attacker.example/steal";

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorization_url: "https://idp.example.com/oauth/authorize?state=s2",
        state: "s2",
      }),
    } as Response);

    const loginRequest = new NextRequest(
      `${origin}/api/auth/tenant/login?redirect_uri=${encodeURIComponent(attackerTarget)}`,
    );
    const loginResponse = await authGet(loginRequest, {
      params: Promise.resolve({ auth: ["tenant", "login"] }),
    });
    expect(loginResponse.status).toBe(307);

    const stateEnvelope = extractCookieValue(
      loginResponse.headers.getSetCookie(),
      TENANT_OIDC_STATE_COOKIE_NAME,
    );
    expect(stateEnvelope).toBeTruthy();

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "success",
        session_token: "session-jwt-attacker-case",
      }),
    } as Response);

    const callbackRequest = new NextRequest(
      `${origin}/api/auth/tenant/callback?code=oauth-code&state=s2`,
      {
        headers: {
          cookie: `${TENANT_OIDC_STATE_COOKIE_NAME}=${stateEnvelope}`,
        },
      },
    );
    const callbackResponse = await authGet(callbackRequest, {
      params: Promise.resolve({ auth: ["tenant", "callback"] }),
    });

    expect(callbackResponse.status).toBe(307);
    const location = callbackResponse.headers.get("location");
    expect(location).toBe(`${origin}/`);
    expect(location).not.toContain("evil-attacker.example");
  });

  it("rejects OIDC state replay: a consumed callback cannot be replayed once its state cookie is cleared", async () => {
    const origin = "https://tenant.console.drts.example.com";

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorization_url: "https://idp.example.com/oauth/authorize?state=s3",
        state: "s3",
      }),
    } as Response);

    const loginResponse = await authGet(
      new NextRequest(`${origin}/api/auth/tenant/login?redirect_uri=/settings`),
      { params: Promise.resolve({ auth: ["tenant", "login"] }) },
    );
    const stateEnvelope = extractCookieValue(
      loginResponse.headers.getSetCookie(),
      TENANT_OIDC_STATE_COOKIE_NAME,
    );
    expect(stateEnvelope).toBeTruthy();

    const callbackUrl = `${origin}/api/auth/tenant/callback?code=oauth-code&state=s3`;

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "success",
        session_token: "session-jwt-first-use",
      }),
    } as Response);

    const firstResponse = await authGet(
      new NextRequest(callbackUrl, {
        headers: {
          cookie: `${TENANT_OIDC_STATE_COOKIE_NAME}=${stateEnvelope}`,
        },
      }),
      { params: Promise.resolve({ auth: ["tenant", "callback"] }) },
    );
    expect(firstResponse.status).toBe(307);

    const clearedStateCookie = firstResponse.headers
      .getSetCookie()
      .find((c: string) => c.startsWith(`${TENANT_OIDC_STATE_COOKIE_NAME}=`));
    expect(clearedStateCookie).toBeTruthy();
    expect(clearedStateCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);

    // Replay: identical callback URL, but the one-time state cookie the
    // browser held has already been cleared by the first exchange.
    const replayResponse = await authGet(new NextRequest(callbackUrl), {
      params: Promise.resolve({ auth: ["tenant", "callback"] }),
    });

    expect(replayResponse.status).toBe(400);
    const replayData = await replayResponse.json();
    expect(replayData.error).toBe("AUTH_SESSION_EXCHANGE_DENIED");
  });

  it("rejects a forged/guessed state parameter without exchanging a session", async () => {
    const origin = "https://tenant.console.drts.example.com";

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorization_url: "https://idp.example.com/oauth/authorize?state=s4",
        state: "s4",
      }),
    } as Response);

    const loginResponse = await authGet(
      new NextRequest(`${origin}/api/auth/tenant/login?redirect_uri=/settings`),
      { params: Promise.resolve({ auth: ["tenant", "login"] }) },
    );
    const stateEnvelope = extractCookieValue(
      loginResponse.headers.getSetCookie(),
      TENANT_OIDC_STATE_COOKIE_NAME,
    );

    const exchangeSpy = vi.fn();
    global.fetch = exchangeSpy;

    const forgedResponse = await authGet(
      new NextRequest(
        `${origin}/api/auth/tenant/callback?code=oauth-code&state=attacker-guessed-state`,
        {
          headers: {
            cookie: `${TENANT_OIDC_STATE_COOKIE_NAME}=${stateEnvelope}`,
          },
        },
      ),
      { params: Promise.resolve({ auth: ["tenant", "callback"] }) },
    );

    expect(forgedResponse.status).toBe(307);
    expect(forgedResponse.headers.get("location")).toContain(
      "/login?error=AUTH_STATE_MISMATCH",
    );
    expect(exchangeSpy).not.toHaveBeenCalled();
  });

  it("recovers from an expired/revoked session without a dead end or open redirect", async () => {
    const origin = "https://tenant.console.drts.example.com";

    // 1. The session probe reports the upstream session is gone.
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { code: "AUTHENTICATION_REQUIRED" } }),
          { status: 401 },
        ),
      );

    const sessionResponse = await authGet(
      new NextRequest(`${origin}/api/auth/session`, {
        headers: { cookie: `${TENANT_SESSION_COOKIE_NAME}=expired-jwt` },
      }),
      { params: Promise.resolve({ auth: ["session"] }) },
    );

    expect(sessionResponse.status).toBe(401);
    const clearedCookies = sessionResponse.headers.getSetCookie();
    expect(
      clearedCookies.some((c: string) =>
        c.startsWith(`${TENANT_SESSION_COOKIE_NAME}=;`),
      ),
    ).toBe(true);

    // 2. The next protected-page navigation, now cookie-less, must be
    // recoverable — bounced to /login with a same-origin redirect_uri, not
    // stuck or redirected off-site.
    const protectedRequest = new NextRequest(`${origin}/bookings?tab=active`);
    const middlewareResponse = middleware(protectedRequest);

    expect(middlewareResponse.status).toBe(307);
    const loginRedirect = new URL(middlewareResponse.headers.get("location")!);
    expect(loginRedirect.origin).toBe(origin);
    expect(loginRedirect.pathname).toBe("/login");
    expect(loginRedirect.searchParams.get("redirect_uri")).toBe(
      "/bookings?tab=active",
    );
  });

  it("controlled logout clears the session, CSRF, and OIDC-state cookies together", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    const request = new NextRequest("http://localhost:3004/api/auth/logout", {
      method: "POST",
      headers: {
        origin: "http://localhost:3004",
        cookie: `${TENANT_SESSION_COOKIE_NAME}=jwt; ${TENANT_CSRF_COOKIE_NAME}=token123`,
        [TENANT_CSRF_HEADER_NAME]: "token123",
      },
    });

    const response = await authPost(request, {
      params: Promise.resolve({ auth: ["logout"] }),
    });

    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    expect(
      cookies.some((c: string) =>
        c.startsWith(`${TENANT_SESSION_COOKIE_NAME}=;`),
      ),
    ).toBe(true);
    expect(
      cookies.some((c: string) => c.startsWith(`${TENANT_CSRF_COOKIE_NAME}=;`)),
    ).toBe(true);
    expect(
      cookies.some((c: string) =>
        c.startsWith(`${TENANT_OIDC_STATE_COOKIE_NAME}=;`),
      ),
    ).toBe(true);
  });
});
