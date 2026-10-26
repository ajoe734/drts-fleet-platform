import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { deepToSnakeCase } from "../../apps/api/src/common/snake-case.interceptor";
import {
  GET,
  POST,
} from "../../apps/fleet-partner-portal-web/app/api/auth/[...auth]/route";

const origin = "https://fleets.example.test";
const context = (action: string) => ({
  params: Promise.resolve({ auth: [action] }),
});
const request = (path: string, cookie?: string) =>
  new NextRequest(`${origin}/api/auth/${path}`, {
    ...(cookie ? { headers: { cookie } } : {}),
  });
const wire = (data: unknown, status = 200) =>
  new Response(JSON.stringify(deepToSnakeCase({ data })), {
    status,
    headers: { "content-type": "application/json" },
  });

afterEach(() => vi.unstubAllGlobals());

describe("Fleet production GET OIDC wire boundary (serializer, no local server)", () => {
  it("keeps opaque state in HttpOnly cookie and exchanges snake_case session for secure cookies and current session", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        if (String(url).includes("partner/login"))
          return wire({
            authorizationUrl:
              "https://issuer.example.test/authorize?state=opaque",
            stateToken: "opaque-state",
          });
        if (String(url).includes("callback-session"))
          return wire({ accessToken: "signed-session-token" });
        if (String(url).endsWith("/api/auth/session"))
          return wire({ active: true, identity: { actorId: "user-1" } });
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const login = await GET(
      request("login?redirect_uri=%2Ffleet%3Ftab%3Dhome&partner_id=entry-1"),
      context("login"),
    );
    expect(login.status).toBe(307);
    expect(login.headers.get("location")).toBe(
      "https://issuer.example.test/authorize?state=opaque",
    );
    expect(calls[0]!.url).toContain("partner_id=entry-1");
    const state = login.cookies.get("drts_oidc_state")!;
    expect(state.value).toContain("opaque-state");
    expect(state.httpOnly).toBe(true);
    expect(state.secure).toBe(true);
    expect(state.sameSite).toBe("lax");
    expect(state.path).toBe("/");
    expect(state.maxAge).toBe(600);

    const callback = await GET(
      request(
        "callback?code=real-code&state=oidc-state",
        `drts_oidc_state=${encodeURIComponent(state.value)}`,
      ),
      context("callback"),
    );
    expect(callback.status).toBe(307);
    expect(callback.headers.get("location")).toBe(`${origin}/fleet?tab=home`);
    expect(calls[1]!.init?.headers).toMatchObject({
      "x-oidc-state-token": "opaque-state",
    });
    expect(JSON.parse(String(calls[1]!.init?.body))).toMatchObject({
      code: "real-code",
      state: "oidc-state",
      callbackUrl: `${origin}/api/auth/callback`,
    });
    const sessionCookie = callback.cookies.get("drts_session")!;
    expect(sessionCookie.value).toBe("signed-session-token");
    expect(sessionCookie.httpOnly).toBe(true);
    expect(sessionCookie.secure).toBe(true);
    expect(sessionCookie.sameSite).toBe("lax");
    expect(sessionCookie.path).toBe("/");
    expect(sessionCookie.maxAge).toBe(8 * 60 * 60);
    expect(callback.cookies.get("drts_csrf")?.httpOnly).toBe(false);
    expect(callback.cookies.get("drts_oidc_state")?.value).toBe("");

    const self = await GET(
      request("session", "drts_session=signed-session-token"),
      context("session"),
    );
    expect(self.status).toBe(200);
    expect(calls[2]!.init?.headers).toMatchObject({
      Authorization: "Bearer signed-session-token",
    });
    expect(await self.json()).toMatchObject({ data: { active: true } });
    const logout = await POST(
      request("logout", "drts_session=signed-session-token"),
      context("logout"),
    );
    expect(logout.cookies.get("drts_session")?.value).toBe("");
  });

  it("accepts a serialized callback exchange independently of the login reader", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => wire({ accessToken: "canonical-token" })),
    );
    const stateCookie = encodeURIComponent(
      JSON.stringify({
        stateToken: "original-state",
        codeVerifier: "pkce-verifier",
        returnUrl: "//attacker.example.test/escape",
      }),
    );
    const response = await GET(
      request(
        "callback?code=code&state=state",
        `drts_oidc_state=${stateCookie}`,
      ),
      context("callback"),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${origin}/`);
    expect(response.cookies.get("drts_session")?.value).toBe("canonical-token");
    expect(vi.mocked(fetch).mock.calls[0]![1]).toMatchObject({
      headers: { "x-oidc-state-token": "original-state" },
    });
    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]?.body)),
    ).toMatchObject({ pkceVerifier: "pkce-verifier" });
  });

  it("denies missing state and upstream callback error without issuing a session", async () => {
    const missing = await GET(
      request("callback?code=code&state=s"),
      context("callback"),
    );
    expect(missing.status).toBe(400);
    expect(missing.cookies.get("drts_session")).toBeUndefined();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "AUTH_SESSION_EXCHANGE_DENIED",
                message: "Invalid state",
              },
            }),
            { status: 400 },
          ),
      ),
    );
    const denied = await GET(
      request(
        "callback?code=code&state=s",
        `drts_oidc_state=${encodeURIComponent(JSON.stringify({ stateToken: "wrong" }))}`,
      ),
      context("callback"),
    );
    expect(denied.status).toBe(400);
    expect(denied.cookies.get("drts_session")).toBeUndefined();
  });
});
