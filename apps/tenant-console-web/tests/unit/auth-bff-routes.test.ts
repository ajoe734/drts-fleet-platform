import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  GET as authGet,
  POST as authPost,
} from "@/app/api/auth/[...auth]/route";
import {
  TENANT_SESSION_COOKIE_NAME,
  TENANT_OIDC_STATE_COOKIE_NAME,
  TENANT_CSRF_COOKIE_NAME,
  TENANT_CSRF_HEADER_NAME,
} from "@/lib/auth/constants";
import { encodeStateEnvelope } from "@/lib/auth/session";

describe("Tenant Auth BFF Route Handlers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.BFF_STATE_SECRET = "test-bff-state-secret-32-chars-long-123456";
  });

  describe("GET /api/auth/tenant/login", () => {
    it("redirects to IdP and sets signed state cookie", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authorization_url:
            "https://idp.example.com/oauth/authorize?state=upstream-state-1",
          state: "upstream-state-1",
        }),
      } as Response);

      const request = new NextRequest(
        "http://localhost:3004/api/auth/tenant/login?redirect_uri=/bookings",
      );
      const response = await authGet(request, {
        params: Promise.resolve({ auth: ["tenant", "login"] }),
      });

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "https://idp.example.com/oauth/authorize?state=upstream-state-1",
      );

      const setCookie = response.headers.get("set-cookie");
      expect(setCookie).toContain(TENANT_OIDC_STATE_COOKIE_NAME);
    });

    it("fails closed when backend login response omits stateToken/state (does NOT manufacture a constant token)", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authorization_url: "https://idp.example.com/oauth/authorize",
          // missing stateToken and state
        }),
      } as Response);

      const request = new NextRequest(
        "http://localhost:3004/api/auth/tenant/login?redirect_uri=/bookings",
      );
      const response = await authGet(request, {
        params: Promise.resolve({ auth: ["tenant", "login"] }),
      });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe("AUTH_LOGIN_FAILED");
      expect(data.message).toContain("missing API-issued state token");
    });

    it("fails closed when backend login request fails", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({
          error: { code: "IDP_UNAVAILABLE", message: "IdP unreachable" },
        }),
      } as Response);

      const request = new NextRequest(
        "http://localhost:3004/api/auth/tenant/login?redirect_uri=/bookings",
      );
      const response = await authGet(request, {
        params: Promise.resolve({ auth: ["tenant", "login"] }),
      });

      expect(response.status).toBe(502);
      const data = await response.json();
      expect(data.error).toBe("IDP_UNAVAILABLE");
    });
  });

  describe("GET /api/auth/tenant/callback", () => {
    it("exchanges code with API and sets session and csrf cookies", async () => {
      const stateEnvelope = encodeStateEnvelope({
        stateToken: "state-xyz",
        returnUrl: "/settings",
      });

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "success",
          session_token: "session-jwt-token-12345",
          user: {
            actor_id: "usr-tenant-1",
            realm: "tenant",
            tenant_id: "tenant-acme-1",
          },
        }),
      } as Response);

      const request = new NextRequest(
        "http://localhost:3004/api/auth/tenant/callback?code=oauth-code-123&state=state-xyz",
        {
          headers: {
            cookie: `${TENANT_OIDC_STATE_COOKIE_NAME}=${stateEnvelope}`,
          },
        },
      );

      const response = await authGet(request, {
        params: Promise.resolve({ auth: ["tenant", "callback"] }),
      });

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "http://localhost:3004/settings",
      );

      const cookies = response.headers.getSetCookie();
      expect(cookies.some((c) => c.includes(TENANT_SESSION_COOKIE_NAME))).toBe(
        true,
      );
      expect(cookies.some((c) => c.includes(TENANT_CSRF_COOKIE_NAME))).toBe(
        true,
      );
    });

    it("rejects callback with 400 when code is missing from query param", async () => {
      const stateEnvelope = encodeStateEnvelope({
        stateToken: "state-xyz",
        returnUrl: "/settings",
      });

      const request = new NextRequest(
        "http://localhost:3004/api/auth/tenant/callback?state=state-xyz",
        {
          headers: {
            cookie: `${TENANT_OIDC_STATE_COOKIE_NAME}=${stateEnvelope}`,
          },
        },
      );

      const response = await authGet(request, {
        params: Promise.resolve({ auth: ["tenant", "callback"] }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("AUTH_SESSION_EXCHANGE_DENIED");
      expect(data.message).toContain("Authorization code is required");
    });

    it("rejects callback with 400 when state is missing from query param (does NOT bypass comparison)", async () => {
      const stateEnvelope = encodeStateEnvelope({
        stateToken: "state-xyz",
        returnUrl: "/settings",
      });

      const request = new NextRequest(
        "http://localhost:3004/api/auth/tenant/callback?code=oauth-code-123",
        {
          headers: {
            cookie: `${TENANT_OIDC_STATE_COOKIE_NAME}=${stateEnvelope}`,
          },
        },
      );

      const response = await authGet(request, {
        params: Promise.resolve({ auth: ["tenant", "callback"] }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("AUTH_SESSION_EXCHANGE_DENIED");
      expect(data.message).toContain("Authorization state is required");
    });

    it("rejects callback with 400 when state cookie is missing", async () => {
      const request = new NextRequest(
        "http://localhost:3004/api/auth/tenant/callback?code=oauth-code-123&state=state-xyz",
      );

      const response = await authGet(request, {
        params: Promise.resolve({ auth: ["tenant", "callback"] }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("AUTH_SESSION_EXCHANGE_DENIED");
      expect(data.message).toContain("OIDC state cookie missing or expired");
    });

    it("rejects callback with 400 when state cookie contains unsigned or invalid envelope", async () => {
      const rawJson = JSON.stringify({
        stateToken: "state-xyz",
        returnUrl: "/",
      });
      const request = new NextRequest(
        "http://localhost:3004/api/auth/tenant/callback?code=oauth-code-123&state=state-xyz",
        {
          headers: {
            cookie: `${TENANT_OIDC_STATE_COOKIE_NAME}=${rawJson}`,
          },
        },
      );

      const response = await authGet(request, {
        params: Promise.resolve({ auth: ["tenant", "callback"] }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("AUTH_SESSION_EXCHANGE_DENIED");
      expect(data.message).toContain("invalid or expired");
    });

    it("rejects callback if state does not match state cookie", async () => {
      const stateEnvelope = encodeStateEnvelope({
        stateToken: "state-expected",
        returnUrl: "/settings",
      });

      const request = new NextRequest(
        "http://localhost:3004/api/auth/tenant/callback?code=oauth-code-123&state=state-mismatched",
        {
          headers: {
            cookie: `${TENANT_OIDC_STATE_COOKIE_NAME}=${stateEnvelope}`,
          },
        },
      );

      const response = await authGet(request, {
        params: Promise.resolve({ auth: ["tenant", "callback"] }),
      });

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain(
        "/login?error=AUTH_STATE_MISMATCH",
      );
    });
  });

  describe("GET /api/auth/session", () => {
    it("returns 401 when no session cookie is present", async () => {
      const request = new NextRequest("http://localhost:3004/api/auth/session");
      const response = await authGet(request, {
        params: Promise.resolve({ auth: ["session"] }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.active).toBe(false);
    });

    it("verifies session with backend and returns active identity context", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            active: true,
            identity: {
              actor_id: "usr-tenant-1",
              realm: "tenant",
              tenant_id: "tenant-acme-1",
              roles: ["tenant_admin"],
            },
          },
        }),
      } as Response);

      const request = new NextRequest(
        "http://localhost:3004/api/auth/session",
        {
          headers: {
            cookie: `${TENANT_SESSION_COOKIE_NAME}=valid-session-jwt`,
          },
        },
      );

      const response = await authGet(request, {
        params: Promise.resolve({ auth: ["session"] }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.active).toBe(true);
      expect(data.data.identity.actor_id).toBe("usr-tenant-1");
    });

    it("clears cookies when backend returns 401 (session revoked)", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ error: { code: "AUTHENTICATION_REQUIRED" } }),
            { status: 401 },
          ),
        );

      const request = new NextRequest(
        "http://localhost:3004/api/auth/session",
        {
          headers: {
            cookie: `${TENANT_SESSION_COOKIE_NAME}=revoked-session-jwt`,
          },
        },
      );

      const response = await authGet(request, {
        params: Promise.resolve({ auth: ["session"] }),
      });

      expect(response.status).toBe(401);
      const cookies = response.headers.getSetCookie();
      expect(
        cookies.some((c) => c.includes(`${TENANT_SESSION_COOKIE_NAME}=;`)),
      ).toBe(true);
    });
  });

  describe("POST /api/auth/logout and /api/auth/logout-all", () => {
    it("rejects logout request if origin is invalid (CSRF protection)", async () => {
      const request = new NextRequest("http://localhost:3004/api/auth/logout", {
        method: "POST",
        headers: {
          origin: "http://attacker.com",
          cookie: `${TENANT_SESSION_COOKIE_NAME}=jwt; ${TENANT_CSRF_COOKIE_NAME}=token123`,
          [TENANT_CSRF_HEADER_NAME]: "token123",
        },
      });

      const response = await authPost(request, {
        params: Promise.resolve({ auth: ["logout"] }),
      });

      expect(response.status).toBe(403);
    });

    it("clears session cookies and calls backend on valid logout", async () => {
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
        cookies.some((c) => c.includes(`${TENANT_SESSION_COOKIE_NAME}=;`)),
      ).toBe(true);
    });
  });
});
