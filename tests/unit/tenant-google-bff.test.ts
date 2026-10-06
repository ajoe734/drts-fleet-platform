import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as tenant from "../../apps/tenant-console-web/app/api/auth/[...auth]/route";
import * as dispatch from "../../apps/enterprise-dispatch-web/app/api/auth/[...auth]/route";
import {
  TENANT_CSRF_COOKIE_NAME,
  TENANT_OIDC_STATE_COOKIE_NAME,
  TENANT_SESSION_COOKIE_NAME,
} from "../../apps/tenant-console-web/lib/auth/constants";
import { verifyEnterpriseTenantSession } from "../../apps/enterprise-dispatch-web/lib/enterprise-session.server";
import { encodeStateEnvelope } from "../../apps/tenant-console-web/lib/auth/session";

const context = (...auth: string[]) => ({ params: Promise.resolve({ auth }) });
const cookie = (response: Response, name: string) =>
  response.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${name}=`))!
    .split(";")[0]!;

describe.each([
  {
    name: "tenant",
    handlers: tenant,
    origin: "https://tenant.smarttransport.tw",
    failurePath: "/login",
  },
  {
    name: "dispatch",
    handlers: dispatch,
    origin: "https://dispatch.smarttransport.tw",
    failurePath: "/auth-required",
  },
  {
    name: "dispatch run.app",
    handlers: dispatch,
    origin: "https://drts-dev-enterprise-dispatch-web-test.a.run.app",
    failurePath: "/auth-required",
  },
])("$name host-local tenant login", ({ handlers, origin, failurePath }) => {
  beforeEach(() => {
    vi.stubEnv("DRTS_API_URL", "https://api-test.a.run.app");
    vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
    vi.stubEnv(
      "BFF_STATE_SECRET",
      "test-secret-for-bff-envelope-32-characters",
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("keeps the app-specific failure route and does not exchange mismatched state", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const state = encodeStateEnvelope({
      stateToken: "expected",
      returnUrl: "/",
    });
    const response = await handlers.GET(
      new NextRequest(
        `${origin}/api/auth/tenant/callback?code=code&state=wrong`,
        {
          headers: { cookie: `${TENANT_OIDC_STATE_COOKIE_NAME}=${state}` },
        },
      ),
      context("tenant", "callback"),
    );
    const redirect = new URL(response.headers.get("location")!);
    expect(redirect.origin).toBe(origin);
    expect(redirect.pathname).toBe(failurePath);
    expect(redirect.searchParams.get("error")).toBe("AUTH_STATE_MISMATCH");
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    { active: true, identity: { realm: "platform", tenant_id: "tenant-1" } },
    { active: true, identity: { realm: "tenant", tenant_id: "" } },
    { active: false, identity: { realm: "tenant", tenant_id: "tenant-1" } },
  ])(
    "rejects invalid session authority and clears session/CSRF cookies: %j",
    async (data) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL) =>
          url.toString().includes("metadata.google.internal")
            ? new Response("cloud-run-proof")
            : Response.json({ data }),
        ),
      );
      const response = await handlers.GET(
        new NextRequest(`${origin}/api/auth/session`, {
          headers: { cookie: `${TENANT_SESSION_COOKIE_NAME}=session` },
        }),
        context("session"),
      );
      expect(response.status).toBe(401);
      expect(cookie(response, TENANT_SESSION_COOKIE_NAME)).toBe(
        `${TENANT_SESSION_COOKIE_NAME}=`,
      );
      expect(cookie(response, TENANT_CSRF_COOKIE_NAME)).toBe(
        `${TENANT_CSRF_COOKIE_NAME}=`,
      );
    },
  );

  it("uses the same PKCE API, verifies session, and revokes on logout-all without sharing cookies", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const target = url.toString();
        calls.push({ url: target, ...(init ? { init } : {}) });
        if (target.includes("metadata.google.internal"))
          return new Response("cloud-run-proof");
        if (target.includes("/tenant/login"))
          return Response.json({
            data: {
              authorization_url:
                "https://accounts.google.com/o/oauth2/v2/auth?state=oauth-state",
              state: "oauth-state",
              state_token: "opaque-api-state",
            },
          });
        if (target.endsWith("callback-session"))
          return Response.json({ data: { access_token: "tenant-session" } });
        if (target.endsWith("/session"))
          return Response.json({
            data: {
              active: true,
              identity: { realm: "tenant", tenant_id: "tenant-1" },
            },
          });
        return Response.json({ success: true });
      }),
    );
    const login = await handlers.GET(
      new NextRequest(`${origin}/api/auth/tenant/login?return_url=/bookings`),
      context("tenant", "login"),
    );
    expect(login.status).toBe(307);
    const backend = calls.find((call) => call.url.includes("/tenant/login"))!;
    expect(new URL(backend.url).searchParams.get("redirect_uri")).toBe(
      `${origin}/api/auth/tenant/callback`,
    );
    expect(
      new Headers(backend.init?.headers).get("x-serverless-authorization"),
    ).toBe("Bearer cloud-run-proof");
    const callback = await handlers.GET(
      new NextRequest(
        `${origin}/api/auth/tenant/callback?code=code&state=oauth-state`,
        { headers: { cookie: cookie(login, TENANT_OIDC_STATE_COOKIE_NAME) } },
      ),
      context("tenant", "callback"),
    );
    expect(callback.headers.get("location")).toBe(`${origin}/bookings`);
    const sessionCookie = cookie(callback, TENANT_SESSION_COOKIE_NAME);
    for (const value of callback.headers.getSetCookie())
      expect(value).not.toMatch(/Domain=/i);
    expect(
      callback.headers
        .getSetCookie()
        .find((value) => value.startsWith(`${TENANT_SESSION_COOKIE_NAME}=`)),
    ).toMatch(/HttpOnly/i);
    const checked = await handlers.GET(
      new NextRequest(`${origin}/api/auth/session`, {
        headers: { cookie: sessionCookie },
      }),
      context("session"),
    );
    expect(checked.status).toBe(200);
    expect(await verifyEnterpriseTenantSession("tenant-session")).toMatchObject(
      { session: { tenantId: "tenant-1" } },
    );
    const csrfCookie = cookie(callback, TENANT_CSRF_COOKIE_NAME);
    const logout = await handlers.POST(
      new NextRequest(`${origin}/api/auth/logout-all`, {
        method: "POST",
        headers: {
          origin,
          cookie: `${sessionCookie}; ${csrfCookie}`,
          "x-csrf-token": csrfCookie.split("=")[1]!,
        },
      }),
      context("logout-all"),
    );
    expect(logout.status).toBe(200);
    expect(cookie(logout, TENANT_SESSION_COOKIE_NAME)).toBe(
      `${TENANT_SESSION_COOKIE_NAME}=`,
    );
    const revocation = calls.find((call) => call.url.endsWith("/logout-all"))!;
    expect(new Headers(revocation.init?.headers).get("authorization")).toBe(
      "Bearer tenant-session",
    );
    expect(JSON.stringify(await checked.json())).not.toContain(
      "cloud-run-proof",
    );
  });

  it("keeps invitation proof out of Google redirects and requires browser state on callback", async () => {
    const api = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (url.toString().includes("metadata.google.internal"))
        return new Response("cloud-run-proof");
      expect(url.toString()).toBe(
        "https://api-test.a.run.app/api/auth/tenant/invitation-login",
      );
      expect(init?.method).toBe("POST");
      expect(JSON.parse(init?.body as string)).toMatchObject({
        invitationToken: "private-invitation",
        redirectUri: `${origin}/api/auth/tenant/callback`,
      });
      return Response.json({
        data: {
          authorization_url:
            "https://accounts.google.com/o/oauth2/v2/auth?state=oauth-state",
          state: "oauth-state",
          state_token: "opaque-api-state",
        },
      });
    });
    vi.stubGlobal("fetch", api);
    const login = await handlers.GET(
      new NextRequest(
        `${origin}/api/auth/tenant/login?token=private-invitation`,
      ),
      context("tenant", "login"),
    );
    expect(login.headers.get("location")).not.toContain("private-invitation");
    expect(login.headers.get("referrer-policy")).toBe("no-referrer");
    expect(login.headers.getSetCookie().join()).not.toContain(
      "private-invitation",
    );
    const missingState = await handlers.GET(
      new NextRequest(
        `${origin}/api/auth/tenant/callback?code=code&state=oauth-state`,
      ),
      context("tenant", "callback"),
    );
    expect(missingState.status).toBe(400);
    const forbidden = await handlers.POST(
      new NextRequest(`${origin}/api/auth/logout`, {
        method: "POST",
        headers: { origin: "https://other.example" },
      }),
      context("logout"),
    );
    expect(forbidden.status).toBe(403);
  });

  it.each(["http", "network"])(
    "does not claim global logout when revocation fails (%s)",
    async (failure) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL) => {
          if (url.toString().includes("metadata.google.internal"))
            return new Response("cloud-run-proof");
          if (failure === "network") throw new Error("API unavailable");
          return new Response("Unavailable", { status: 503 });
        }),
      );
      const response = await handlers.POST(
        new NextRequest(`${origin}/api/auth/logout-all`, {
          method: "POST",
          headers: {
            origin,
            cookie: `${TENANT_SESSION_COOKIE_NAME}=session; ${TENANT_CSRF_COOKIE_NAME}=csrf`,
            "x-csrf-token": "csrf",
          },
        }),
        context("logout-all"),
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: "AUTH_LOGOUT_ALL_UNAVAILABLE",
      });
      expect(response.headers.getSetCookie()).toEqual([]);
    },
  );
});
