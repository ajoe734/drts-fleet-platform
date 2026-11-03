import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { encodeStateEnvelope } from "@drts/tenant-auth/session";
import {
  AGENCY_CSRF_COOKIE_NAME,
  AGENCY_OIDC_STATE_COOKIE_NAME,
  AGENCY_PROFILE_COOKIE_NAME,
  AGENCY_SESSION_COOKIE_NAME,
} from "@drts/agency-auth/constants";
import { verifyAgencySession } from "@drts/agency-auth/verified-agency-session.server";

import {
  GET as authGet,
  POST as authPost,
} from "@/app/api/auth/[...auth]/route";
import {
  GET as proxyGet,
  POST as proxyPost,
} from "@/app/api/agency/[...path]/route";

// BUREAU-R13 agency host BFF. Only the API HTTP boundary (global fetch) is
// mocked; the real route handlers, state envelope and cookie logic run.
const ORIGIN = "http://localhost:3012";
const API = "http://localhost:3001";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function authContext(...auth: string[]) {
  return { params: Promise.resolve({ auth }) };
}

function setCookies(response: Response): string {
  return response.headers.getSetCookie().join("\n");
}

describe("Agency auth BFF route handlers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.BFF_STATE_SECRET = "test-bff-state-secret-32-chars-long-123456";
    process.env.DRTS_API_URL = API;
    delete process.env.DRTS_API_AUTH_AUDIENCE;
  });

  it("starts agency login against the agency realm and stores only an agency state cookie", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        data: {
          authorization_url:
            "https://accounts.google.com/o/oauth2/v2/auth?state=s1",
          state: "s1",
          state_token: "state-token-1",
        },
      }),
    );
    global.fetch = fetchMock;

    const response = await authGet(
      new NextRequest(
        `${ORIGIN}/api/auth/agency/login?redirect_uri=/trip-records`,
      ),
      authContext("agency", "login"),
    );

    expect(response.status).toBe(307);
    const requested = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requested.pathname).toBe("/api/auth/agency/login");
    expect(requested.searchParams.get("redirect_uri")).toBe(
      `${ORIGIN}/api/auth/agency/callback`,
    );
    const cookies = setCookies(response);
    expect(cookies).toContain(`${AGENCY_OIDC_STATE_COOKIE_NAME}=`);
    expect(cookies).not.toContain("drts_tenant_");
  });

  it("binds an invitation token through POST /api/auth/agency/invitation-login", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        data: {
          authorization_url: "https://accounts.google.com/auth",
          state: "s2",
          state_token: "state-token-2",
        },
      }),
    );
    global.fetch = fetchMock;

    const response = await authGet(
      new NextRequest(`${ORIGIN}/api/auth/agency/login?token=ai_invite_token`),
      authContext("agency", "login"),
    );

    expect(response.status).toBe(307);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `${API}/api/auth/agency/invitation-login`,
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      invitationToken: "ai_invite_token",
      redirectUri: `${ORIGIN}/api/auth/agency/callback`,
    });
  });

  it("fails closed when the API omits the state token", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ data: { authorization_url: "https://idp/auth" } }),
      );
    const response = await authGet(
      new NextRequest(`${ORIGIN}/api/auth/agency/login`),
      authContext("agency", "login"),
    );
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("AUTH_LOGIN_FAILED");
  });

  it("exchanges the callback with the agency endpoint and sets agency session, CSRF and profile cookies", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        data: {
          access_token: "agency-jwt",
          token_type: "Bearer",
          agency: { agency_id: "agency_1", display_name: "測試機關" },
          role_code: "agency_viewer",
          access_valid_to: "2027-01-01T00:00:00.000Z",
        },
      }),
    );
    global.fetch = fetchMock;
    const envelope = encodeStateEnvelope({
      stateToken: "state-token-3",
      state: "s3",
      returnUrl: "/reports/operations",
    });

    const response = await authGet(
      new NextRequest(
        `${ORIGIN}/api/auth/agency/callback?code=code-3&state=s3`,
        { headers: { cookie: `${AGENCY_OIDC_STATE_COOKIE_NAME}=${envelope}` } },
      ),
      authContext("agency", "callback"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/reports/operations`,
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `${API}/api/auth/agency/callback-session`,
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get("x-oidc-state-token")).toBe(
      "state-token-3",
    );
    const cookies = setCookies(response);
    expect(cookies).toContain(`${AGENCY_SESSION_COOKIE_NAME}=agency-jwt`);
    expect(cookies).toContain(`${AGENCY_CSRF_COOKIE_NAME}=`);
    expect(cookies).toContain(`${AGENCY_PROFILE_COOKIE_NAME}=`);
    expect(cookies).toMatch(new RegExp(`${AGENCY_OIDC_STATE_COOKIE_NAME}=;`));
    expect(cookies).not.toContain("drts_tenant_session");
  });

  it("rejects a callback without the HttpOnly state cookie", async () => {
    global.fetch = vi.fn();
    const response = await authGet(
      new NextRequest(`${ORIGIN}/api/auth/agency/callback?code=c&state=s`),
      authContext("agency", "callback"),
    );
    expect(response.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("redirects to login on a state mismatch without exchanging the code", async () => {
    global.fetch = vi.fn();
    const envelope = encodeStateEnvelope({
      stateToken: "state-token-4",
      state: "expected",
      returnUrl: "/",
    });
    const response = await authGet(
      new NextRequest(
        `${ORIGIN}/api/auth/agency/callback?code=c&state=attacker`,
        { headers: { cookie: `${AGENCY_OIDC_STATE_COOKIE_NAME}=${envelope}` } },
      ),
      authContext("agency", "callback"),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(
      "/login?error=AUTH_STATE_MISMATCH",
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("verifyAgencySession rejects a tenant-realm token even when the API says active", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        data: {
          active: true,
          identity: {
            realm: "tenant",
            actor_type: "tenant_admin",
            tenant_id: "t1",
          },
        },
      }),
    );
    const verification = await verifyAgencySession("tenant-jwt", API);
    expect(verification.session).toBeNull();
  });

  it("GET /api/auth/session clears agency cookies when the API identity is not an agency", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        data: {
          active: true,
          identity: { realm: "tenant", actor_type: "tenant_admin" },
        },
      }),
    );
    const response = await authGet(
      new NextRequest(`${ORIGIN}/api/auth/session`, {
        headers: { cookie: `${AGENCY_SESSION_COOKIE_NAME}=tenant-jwt` },
      }),
      authContext("session"),
    );
    expect(response.status).toBe(401);
    expect(setCookies(response)).toMatch(
      new RegExp(`${AGENCY_SESSION_COOKIE_NAME}=;`),
    );
  });

  it("GET /api/auth/session accepts an active agency identity bound to an agency", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        data: {
          active: true,
          identity: {
            realm: "agency",
            actor_type: "agency_user",
            agency_id: "agency_1",
            roles: ["agency_viewer"],
          },
        },
      }),
    );
    const response = await authGet(
      new NextRequest(`${ORIGIN}/api/auth/session`, {
        headers: { cookie: `${AGENCY_SESSION_COOKIE_NAME}=agency-jwt` },
      }),
      authContext("session"),
    );
    expect(response.status).toBe(200);
  });

  it("logout requires the agency CSRF token and same origin", async () => {
    global.fetch = vi.fn();
    const denied = await authPost(
      new NextRequest(`${ORIGIN}/api/auth/logout`, {
        method: "POST",
        headers: {
          origin: ORIGIN,
          cookie: `${AGENCY_SESSION_COOKIE_NAME}=agency-jwt; ${AGENCY_CSRF_COOKIE_NAME}=csrf-1`,
        },
      }),
      authContext("logout"),
    );
    expect(denied.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();

    global.fetch = vi.fn().mockResolvedValueOnce(jsonResponse({ data: {} }));
    const allowed = await authPost(
      new NextRequest(`${ORIGIN}/api/auth/logout`, {
        method: "POST",
        headers: {
          origin: ORIGIN,
          "x-csrf-token": "csrf-1",
          cookie: `${AGENCY_SESSION_COOKIE_NAME}=agency-jwt; ${AGENCY_CSRF_COOKIE_NAME}=csrf-1`,
        },
      }),
      authContext("logout"),
    );
    expect(allowed.status).toBe(200);
    expect(String(vi.mocked(global.fetch).mock.calls[0]?.[0])).toBe(
      `${API}/api/auth/logout`,
    );
    const cookies = setCookies(allowed);
    expect(cookies).toMatch(new RegExp(`${AGENCY_SESSION_COOKIE_NAME}=;`));
    expect(cookies).toMatch(new RegExp(`${AGENCY_PROFILE_COOKIE_NAME}=;`));
  });

  it("the agency API proxy only forwards agency paths with the session bearer", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { items: [] } }));
    global.fetch = fetchMock;
    const ok = await proxyGet(
      new NextRequest(`${ORIGIN}/api/agency/trip-records?month=2026-09`, {
        headers: { cookie: `${AGENCY_SESSION_COOKIE_NAME}=agency-jwt` },
      }),
      { params: Promise.resolve({ path: ["trip-records"] }) },
    );
    expect(ok.status).toBe(200);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `${API}/api/agency/trip-records?month=2026-09`,
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer agency-jwt",
    );

    const traversal = await proxyGet(
      new NextRequest(`${ORIGIN}/api/agency/x`, {
        headers: { cookie: `${AGENCY_SESSION_COOKIE_NAME}=agency-jwt` },
      }),
      { params: Promise.resolve({ path: ["..", "platform-admin"] }) },
    );
    expect(traversal.status).toBe(400);

    const noCsrf = await proxyPost(
      new NextRequest(`${ORIGIN}/api/agency/trip-records/export-jobs`, {
        method: "POST",
        body: "{}",
        headers: {
          origin: ORIGIN,
          cookie: `${AGENCY_SESSION_COOKIE_NAME}=agency-jwt; ${AGENCY_CSRF_COOKIE_NAME}=csrf-1`,
        },
      }),
      { params: Promise.resolve({ path: ["trip-records", "export-jobs"] }) },
    );
    expect(noCsrf.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
