import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  GET as authGet,
  POST as authPost,
} from "@/app/api/auth/[...auth]/route";
import {
  TENANT_SESSION_COOKIE_NAME,
  TENANT_CSRF_COOKIE_NAME,
  TENANT_CSRF_HEADER_NAME,
} from "@/lib/auth/constants";

/** PWD-LOGIN-009: BFF forwarding for password-login, password-reset, TOTP
 * enroll/confirm and the self-service session endpoints added on top of
 * PWD-LOGIN-005..008. Mirrors the existing OIDC/logout tests in
 * auth-bff-routes.test.ts: mock global.fetch, drive the exported route
 * handlers directly with a constructed NextRequest. */
describe("Tenant Auth BFF: password-login, password-reset, TOTP, sessions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("POST /api/auth/tenant/password-login", () => {
    it("rejects a request missing email or password before calling upstream", async () => {
      global.fetch = vi.fn();
      const request = new NextRequest("http://localhost:3004/api/auth/tenant/password-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com" }),
      });
      const response = await authPost(request, {
        params: Promise.resolve({ auth: ["tenant", "password-login"] }),
      });
      expect(response.status).toBe(400);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("sets session and CSRF cookies, and never echoes the access token to the browser, on success", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            access_token: "upstream-jwt",
            token_type: "Bearer",
            expires_in: "8h",
            identity: { realm: "tenant" },
          },
        }),
      } as Response);

      const request = new NextRequest("http://localhost:3004/api/auth/tenant/password-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", password: "correct-password" }),
      });
      const response = await authPost(request, {
        params: Promise.resolve({ auth: ["tenant", "password-login"] }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(JSON.stringify(body)).not.toContain("upstream-jwt");

      const cookies = response.headers.getSetCookie();
      expect(cookies.some((c) => c.startsWith(`${TENANT_SESSION_COOKIE_NAME}=upstream-jwt`))).toBe(true);
      expect(cookies.some((c) => c.startsWith(`${TENANT_CSRF_COOKIE_NAME}=`))).toBe(true);
    });

    it("relays the backend's generic 401 for wrong password or missing MFA code without inventing a different code", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: {
            code: "AUTHENTICATION_FAILED",
            message: "The email or password is incorrect, or the account is not available.",
          },
        }),
      } as Response);

      const request = new NextRequest("http://localhost:3004/api/auth/tenant/password-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", password: "wrong" }),
      });
      const response = await authPost(request, {
        params: Promise.resolve({ auth: ["tenant", "password-login"] }),
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error.code).toBe("AUTHENTICATION_FAILED");
      expect(response.headers.getSetCookie()).toHaveLength(0);
    });

    it("forwards totpCode and tenantId when supplied", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { access_token: "jwt-2" } }),
      } as Response);

      const request = new NextRequest("http://localhost:3004/api/auth/tenant/password-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "user@example.com",
          password: "correct-password",
          totpCode: "123456",
          tenantId: "tenant-acme-001",
        }),
      });
      await authPost(request, { params: Promise.resolve({ auth: ["tenant", "password-login"] }) });

      const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const sentBody = JSON.parse((init as RequestInit).body as string);
      expect(sentBody).toEqual({
        email: "user@example.com",
        password: "correct-password",
        totpCode: "123456",
        tenantId: "tenant-acme-001",
      });
    });
  });

  describe("POST /api/auth/tenant/password-reset/request and /confirm", () => {
    it("always relays 200 accepted from request, regardless of whether the account exists", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ accepted: true }),
      } as Response);

      const request = new NextRequest("http://localhost:3004/api/auth/tenant/password-reset/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "nobody@example.com" }),
      });
      const response = await authPost(request, {
        params: Promise.resolve({ auth: ["tenant", "password-reset", "request"] }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ accepted: true });
    });

    it("rejects confirm when the token or password is missing, without calling upstream", async () => {
      global.fetch = vi.fn();
      const request = new NextRequest("http://localhost:3004/api/auth/tenant/password-reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "" }),
      });
      const response = await authPost(request, {
        params: Promise.resolve({ auth: ["tenant", "password-reset", "confirm"] }),
      });
      expect(response.status).toBe(400);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("relays the revoked session count on a successful confirm", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ password_reset: true, revoked_session_count: 3 }),
      } as Response);
      const request = new NextRequest("http://localhost:3004/api/auth/tenant/password-reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "reset-token", password: "new-password-123" }),
      });
      const response = await authPost(request, {
        params: Promise.resolve({ auth: ["tenant", "password-reset", "confirm"] }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ password_reset: true, revoked_session_count: 3 });
    });
  });

  describe("POST /api/auth/tenant/mfa/totp/enroll and /confirm", () => {
    it("requires an authenticated session before calling upstream (CSRF present, no session cookie)", async () => {
      global.fetch = vi.fn();
      const request = new NextRequest("http://localhost:3004/api/auth/tenant/mfa/totp/enroll", {
        method: "POST",
        headers: {
          origin: "http://localhost:3004",
          cookie: `${TENANT_CSRF_COOKIE_NAME}=real-token`,
          [TENANT_CSRF_HEADER_NAME]: "real-token",
        },
      });
      const response = await authPost(request, {
        params: Promise.resolve({ auth: ["tenant", "mfa", "totp", "enroll"] }),
      });
      expect(response.status).toBe(401);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("rejects an authenticated enroll call with a mismatched CSRF header (origin valid, token wrong)", async () => {
      global.fetch = vi.fn();
      const request = new NextRequest("http://localhost:3004/api/auth/tenant/mfa/totp/enroll", {
        method: "POST",
        headers: {
          origin: "http://localhost:3004",
          cookie: `${TENANT_SESSION_COOKIE_NAME}=jwt; ${TENANT_CSRF_COOKIE_NAME}=real-token`,
          [TENANT_CSRF_HEADER_NAME]: "wrong-token",
        },
      });
      const response = await authPost(request, {
        params: Promise.resolve({ auth: ["tenant", "mfa", "totp", "enroll"] }),
      });
      expect(response.status).toBe(403);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("relays otpauth_uri and secret from upstream on a valid enroll call", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          otpauth_uri: "otpauth://totp/DRTS:user@example.com?secret=ABC123",
          secret: "ABC123",
        }),
      } as Response);

      const request = new NextRequest("http://localhost:3004/api/auth/tenant/mfa/totp/enroll", {
        method: "POST",
        headers: {
          origin: "http://localhost:3004",
          cookie: `${TENANT_SESSION_COOKIE_NAME}=jwt; ${TENANT_CSRF_COOKIE_NAME}=real-token`,
          [TENANT_CSRF_HEADER_NAME]: "real-token",
        },
      });
      const response = await authPost(request, {
        params: Promise.resolve({ auth: ["tenant", "mfa", "totp", "enroll"] }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        otpauth_uri: "otpauth://totp/DRTS:user@example.com?secret=ABC123",
        secret: "ABC123",
      });

      const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const headers = new Headers((init as RequestInit).headers);
      expect(headers.get("Authorization")).toBe("Bearer jwt");
    });

    it("relays one-time recovery codes from upstream on a valid confirm call", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ recovery_codes: ["code-1", "code-2"] }),
      } as Response);

      const request = new NextRequest("http://localhost:3004/api/auth/tenant/mfa/totp/confirm", {
        method: "POST",
        headers: {
          origin: "http://localhost:3004",
          "content-type": "application/json",
          cookie: `${TENANT_SESSION_COOKIE_NAME}=jwt; ${TENANT_CSRF_COOKIE_NAME}=real-token`,
          [TENANT_CSRF_HEADER_NAME]: "real-token",
        },
        body: JSON.stringify({ code: "654321" }),
      });
      const response = await authPost(request, {
        params: Promise.resolve({ auth: ["tenant", "mfa", "totp", "confirm"] }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ recovery_codes: ["code-1", "code-2"] });
    });
  });

  describe("GET /api/auth/sessions and POST /api/auth/sessions/:sid/revoke", () => {
    it("requires an authenticated session for the session list", async () => {
      global.fetch = vi.fn();
      const request = new NextRequest("http://localhost:3004/api/auth/sessions");
      const response = await authGet(request, {
        params: Promise.resolve({ auth: ["sessions"] }),
      });
      expect(response.status).toBe(401);
    });

    it("relays the masked session list on a valid request", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ session_id: "s1", realm: "tenant", is_current: true }],
      } as Response);
      const request = new NextRequest("http://localhost:3004/api/auth/sessions", {
        headers: { cookie: `${TENANT_SESSION_COOKIE_NAME}=jwt` },
      });
      const response = await authGet(request, {
        params: Promise.resolve({ auth: ["sessions"] }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([{ session_id: "s1", realm: "tenant", is_current: true }]);
    });

    it("rejects revoke without a valid CSRF token", async () => {
      global.fetch = vi.fn();
      const request = new NextRequest("http://localhost:3004/api/auth/sessions/s2/revoke", {
        method: "POST",
        headers: {
          origin: "http://localhost:3004",
          cookie: `${TENANT_SESSION_COOKIE_NAME}=jwt`,
        },
        body: JSON.stringify({}),
      });
      const response = await authPost(request, {
        params: Promise.resolve({ auth: ["sessions", "s2", "revoke"] }),
      });
      expect(response.status).toBe(403);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("forwards the target session id and reason to the upstream revoke endpoint", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ revoked: true }),
      } as Response);
      const request = new NextRequest("http://localhost:3004/api/auth/sessions/s2/revoke", {
        method: "POST",
        headers: {
          origin: "http://localhost:3004",
          "content-type": "application/json",
          cookie: `${TENANT_SESSION_COOKIE_NAME}=jwt; ${TENANT_CSRF_COOKIE_NAME}=tok`,
          [TENANT_CSRF_HEADER_NAME]: "tok",
        },
        body: JSON.stringify({}),
      });
      const response = await authPost(request, {
        params: Promise.resolve({ auth: ["sessions", "s2", "revoke"] }),
      });
      expect(response.status).toBe(200);
      const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(url).toContain("/api/auth/sessions/s2/revoke");
    });
  });
});
