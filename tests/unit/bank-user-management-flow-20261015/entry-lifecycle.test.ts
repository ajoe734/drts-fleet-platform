import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CookieJar } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import * as constants from "../../../packages/tenant-auth/src/constants";
import * as authHandlers from "../../../packages/tenant-auth/src/route-handlers";
import * as sessionHelpers from "../../../packages/tenant-auth/src/session";
import * as apiFetch from "../../../packages/tenant-auth/src/api-fetch";
import * as sessionVerifier from "../../../packages/tenant-auth/src/verified-tenant-session.server";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";
const appRoot = resolve("apps/bank-console-web");
// Transpile the real branding package for the CommonJS UI loader; its ESM
// extensionless exports cannot be loaded by Node's bare require in this test.
const uiTokens = createUiModuleLoader(resolve("packages/ui-tokens"))<
  typeof import("@drts/ui-tokens")
>(resolve("packages/ui-tokens/src/index.ts"));
const load = createUiModuleLoader(appRoot, {
  "server-only": {},
  "next/server": { NextRequest, NextResponse },
  "next/headers": { cookies: async () => ({ get: () => undefined }) },
  "@drts/ui-tokens": uiTokens,
  "@drts/tenant-auth/api-fetch": apiFetch,
  "@drts/tenant-auth/verified-tenant-session.server": sessionVerifier,
  "@drts/tenant-auth/constants": constants,
  "@drts/tenant-auth": authHandlers,
  "./lib/session": {
    BANK_CONSOLE_SESSION_COOKIE: "drts_bank_console_session",
    BANK_CONSOLE_ROLE_COOKIE: "drts_bank_console_role",
  },
});
function sourcePath() {
  if (!process.env.BANK_ENTRY_REF) return resolve(appRoot, "proxy.ts");
  mkdirSync(".local/bank-user-management-flow-20261015", { recursive: true });
  const path = resolve(
    ".local/bank-user-management-flow-20261015/old-proxy.ts",
  );
  writeFileSync(
    path,
    execFileSync("git", [
      "show",
      `${process.env.BANK_ENTRY_REF}:apps/bank-console-web/proxy.ts`,
    ]),
  );
  return path;
}
const { proxy } = load<{ proxy(req: NextRequest): NextResponse }>(sourcePath());
const auth = load<ReturnType<typeof authHandlers.createTenantAuthHandlers>>(
  resolve(appRoot, "app/api/auth/[...auth]/route.ts"),
);

// Run the actual Bank wrapper, shared handlers/state signing and transport.
// Only backend login/exchange responses are simulated; no socket is opened.
async function pendingLogin() {
  vi.stubEnv("BFF_STATE_SECRET", "bank-entry-regression-state-secret");
  vi.stubEnv("DRTS_API_URL", "https://api.example");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  const network = vi.fn(async (url: string, init?: RequestInit) => {
    const target = new URL(url);
    expect(target.origin).toBe("https://api.example");
    if (target.pathname === "/api/auth/tenant/login") {
      return Response.json({
        authorization_url: "https://provider.example/authorize?state=pending",
        state_token: "api-issued-state-token",
        state: "pending",
      });
    }
    if (target.pathname === "/api/auth/tenant/callback-session") {
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("x-oidc-state-token")).toBe(
        "api-issued-state-token",
      );
      return Response.json({ session_token: "new-managed-session" });
    }
    throw new Error(`Unexpected network request: ${url}`);
  });
  vi.stubGlobal("fetch", network);
  const jar = new CookieJar();
  const origin = "https://bank.example";
  const request = (path: string, headers: Record<string, string> = {}) =>
    new NextRequest(`${origin}${path}`, {
      headers: {
        ...headers,
        cookie: jar.getCookieStringSync(`${origin}${path}`),
      },
    });
  const apply = (response: NextResponse, url: string) => {
    for (const cookie of response.headers.getSetCookie()) {
      jar.setCookieSync(cookie, url);
    }
  };
  const login = request("/api/auth/tenant/login?return_url=/users");
  expect(proxy(login).headers.get("x-middleware-next")).toBe("1");
  const response = await auth.GET(login, {
    params: Promise.resolve({ auth: ["tenant", "login"] }),
  });
  expect(response.status).toBe(307);
  apply(response, login.url);
  const state = jar
    .getCookiesSync(`${origin}/api/auth/tenant/callback`)
    .find((cookie) => cookie.key === constants.TENANT_OIDC_STATE_COOKIE_NAME);
  expect(state?.path).toBe("/api/auth");
  expect(sessionHelpers.decodeStateEnvelope(state?.value)?.state).toBe(
    "pending",
  );
  const callback = async () => {
    const req = request("/api/auth/tenant/callback?code=code&state=pending");
    expect(proxy(req).headers.get("x-middleware-next")).toBe("1");
    const res = await auth.GET(req, {
      params: Promise.resolve({ auth: ["tenant", "callback"] }),
    });
    apply(res, req.url);
    return res;
  };
  return {
    jar,
    origin,
    request,
    apply,
    callback,
    network,
    state: state?.value,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Bank actual proxy managed-session entry lifecycle", () => {
  it.each(["/login", "/users"])(
    "document sign-out at %s cancels pending login before callback exchange",
    async (path) => {
      const flow = await pendingLogin();
      const req = flow.request(`${path}?signedOut=1`, {
        "sec-fetch-dest": "document",
      });
      // The /api/auth state is absent from a page request, but must still be
      // deleted at its original path by the page's Set-Cookie response.
      expect(req.cookies.has(constants.TENANT_OIDC_STATE_COOKIE_NAME)).toBe(
        false,
      );
      flow.apply(proxy(req), req.url);
      const callback = await flow.callback();
      expect(callback.status).toBe(400);
      expect(await callback.json()).toMatchObject({
        error: "AUTH_SESSION_EXCHANGE_DENIED",
      });
      expect(flow.network).toHaveBeenCalledTimes(1);
      expect(
        flow.jar.getCookieStringSync(`${flow.origin}/api/auth`),
      ).not.toContain(`${constants.TENANT_OIDC_STATE_COOKIE_NAME}=`);
      expect(
        flow.jar.getCookieStringSync(`${flow.origin}/users`),
      ).not.toContain(`${constants.TENANT_SESSION_COOKIE_NAME}=`);
      expect(
        callback.cookies.get(constants.TENANT_SESSION_COOKIE_NAME),
      ).toBeUndefined();
    },
  );
  it.each(["/login", "/users"])(
    "prefetch at %s retains pending login and its legitimate callback",
    async (path) => {
      const flow = await pendingLogin();
      const req = flow.request(`${path}?signedOut=1`, {
        "sec-fetch-dest": "empty",
      });
      const response = proxy(req);
      expect(response.cookies.getAll()).toEqual([]);
      flow.apply(response, req.url);
      expect(
        flow.jar
          .getCookiesSync(`${flow.origin}/api/auth/tenant/callback`)
          .find(
            (cookie) => cookie.key === constants.TENANT_OIDC_STATE_COOKIE_NAME,
          )?.value,
      ).toBe(flow.state);
      const callback = await flow.callback();
      expect(callback.status).toBe(307);
      expect(callback.headers.get("location")).toBe(`${flow.origin}/users`);
      expect(flow.network).toHaveBeenCalledTimes(2);
      expect(flow.jar.getCookieStringSync(`${flow.origin}/users`)).toContain(
        `${constants.TENANT_SESSION_COOKIE_NAME}=new-managed-session`,
      );
      expect(
        flow.jar.getCookieStringSync(`${flow.origin}/api/auth`),
      ).not.toContain(`${constants.TENANT_OIDC_STATE_COOKIE_NAME}=`);
    },
  );
  it.each([
    "tenant/login",
    "tenant/callback",
    "session",
    "logout",
    "logout-all",
  ])("signed-out marker must allow existing auth endpoint %s", (path) => {
    const response = proxy(
      new NextRequest(`https://bank.example/api/auth/${path}`, {
        method: path.startsWith("logout") ? "POST" : "GET",
        headers: { cookie: "drts_bank_console_signed_out=1" },
      }),
    );
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
  it("a newly issued managed cookie reaches /users even after display logout", () => {
    const response = proxy(
      new NextRequest("https://bank.example/users", {
        headers: {
          cookie: "drts_bank_console_signed_out=1; drts_tenant_session=managed",
        },
      }),
    );
    expect(response.headers.get("location")).toBeNull();
  });
  it("explicit visible sign-out clears every local authority cookie", () => {
    const response = proxy(
      new NextRequest("https://bank.example/users?signedOut=1", {
        headers: {
          cookie:
            "drts_tenant_session=managed; drts_tenant_csrf=csrf; drts_tenant_oidc_state=state",
        },
      }),
    );
    for (const name of [
      constants.TENANT_SESSION_COOKIE_NAME,
      constants.TENANT_CSRF_COOKIE_NAME,
      constants.TENANT_OIDC_STATE_COOKIE_NAME,
    ]) {
      expect(response.cookies.get(name)?.value).toBe("");
    }
  });
  it("background prefetch never clears either display or managed authority cookies", () => {
    const response = proxy(
      new NextRequest("https://bank.example/users?signedOut=1", {
        headers: {
          cookie:
            "drts_tenant_session=managed; drts_bank_console_session=display",
          "sec-fetch-dest": "empty",
        },
      }),
    );
    expect(response.cookies.getAll()).toEqual([]);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("the existing signed-out redirect remains for ordinary pages and unrelated APIs", () => {
    for (const path of ["/users", "/api/users", "/api/unrelated"]) {
      const response = proxy(
        new NextRequest(`https://bank.example${path}`, {
          headers: { cookie: "drts_bank_console_signed_out=1" },
        }),
      );
      expect(response.headers.get("location")).toBe(
        "https://bank.example/login?signedOut=1",
      );
    }
  });
});
