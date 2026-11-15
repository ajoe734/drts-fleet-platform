import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  AGENCY_CSRF_COOKIE_NAME,
  AGENCY_PROFILE_COOKIE_NAME,
  AGENCY_SESSION_COOKIE_NAME,
} from "@drts/agency-auth/constants";

import {
  GET as authGet,
  POST as authPost,
} from "@/app/api/auth/[...auth]/route";

/** PWD-LOGIN-009: BFF forwarding for password-login, password-reset, TOTP
 * enroll/confirm and the self-service session endpoints, agency realm. */
describe("Agency Auth BFF: password-login, password-reset, TOTP, sessions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("POST /api/auth/agency/password-login", () => {
    it("rejects a request missing email or password before calling upstream", async () => {
      global.fetch = vi.fn();
      const request = new NextRequest("http://localhost:3005/api/auth/agency/password-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "pw" }),
      });
      const response = await authPost(request, {
        params: Promise.resolve({ auth: ["agency", "password-login"] }),
      });
      expect(response.status).toBe(400);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("sets session, CSRF and profile cookies, and never echoes the access token, on success", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            access_token: "upstream-jwt",
            identity: { realm: "agency" },
            agency: { agency_id: "agency-1", display_name: "Agency One" },
            role_code: "agency_viewer",
            access_valid_to: "2027-01-01T00:00:00Z",
          },
        }),
      } as Response);

      const request = new NextRequest("http://localhost:3005/api/auth/agency/password-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", password: "correct-password" }),
      });
      const response = await authPost(request, {
        params: Promise.resolve({ auth: ["agency", "password-login"] }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(JSON.stringify(body)).not.toContain("upstream-jwt");

      const cookies = response.headers.getSetCookie();
      expect(cookies.some((c) => c.startsWith(`${AGENCY_SESSION_COOKIE_NAME}=upstream-jwt`))).toBe(true);
      expect(cookies.some((c) => c.startsWith(`${AGENCY_CSRF_COOKIE_NAME}=`))).toBe(true);
      expect(cookies.some((c) => c.startsWith(`${AGENCY_PROFILE_COOKIE_NAME}=`))).toBe(true);
    });

    it("relays the backend's generic 401 for wrong password or missing MFA code", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: "AUTHENTICATION_FAILED", message: "denied" } }),
      } as Response);

      const request = new NextRequest("http://localhost:3005/api/auth/agency/password-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", password: "wrong" }),
      });
      const response = await authPost(request, {
        params: Promise.resolve({ auth: ["agency", "password-login"] }),
      });
      expect(response.status).toBe(401);
      expect(response.headers.getSetCookie()).toHaveLength(0);
    });
  });

  describe("POST /api/auth/agency/password-reset/request and /confirm", () => {
    it("always relays 200 accepted from request", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ accepted: true }),
      } as Response);
      const request = new NextRequest("http://localhost:3005/api/auth/agency/password-reset/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "nobody@example.com" }),
      });
      const response = await authPost(request, {
        params: Promise.resolve({ auth: ["agency", "password-reset", "request"] }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ accepted: true });
    });

    it("rejects confirm when the token or password is missing", async () => {
      global.fetch = vi.fn();
      const request = new NextRequest("http://localhost:3005/api/auth/agency/password-reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "tok" }),
      });
      const response = await authPost(request, {
        params: Promise.resolve({ auth: ["agency", "password-reset", "confirm"] }),
      });
      expect(response.status).toBe(400);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/auth/agency/mfa/totp/enroll and /confirm", () => {
    it("rejects an enroll call with no session cookie", async () => {
      global.fetch = vi.fn();
      const request = new NextRequest("http://localhost:3005/api/auth/agency/mfa/totp/enroll", {
        method: "POST",
        headers: {
          origin: "http://localhost:3005",
          cookie: `${AGENCY_CSRF_COOKIE_NAME}=real-token`,
          "x-csrf-token": "real-token",
        },
      });
      const response = await authPost(request, {
        params: Promise.resolve({ auth: ["agency", "mfa", "totp", "enroll"] }),
      });
      expect(response.status).toBe(401);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("relays otpauth_uri and secret on a valid enroll call, with the session bearer forwarded", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ otpauth_uri: "otpauth://totp/DRTS:user?secret=XYZ", secret: "XYZ" }),
      } as Response);
      const request = new NextRequest("http://localhost:3005/api/auth/agency/mfa/totp/enroll", {
        method: "POST",
        headers: {
          origin: "http://localhost:3005",
          cookie: `${AGENCY_SESSION_COOKIE_NAME}=jwt; ${AGENCY_CSRF_COOKIE_NAME}=real-token`,
          "x-csrf-token": "real-token",
        },
      });
      const response = await authPost(request, {
        params: Promise.resolve({ auth: ["agency", "mfa", "totp", "enroll"] }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ otpauth_uri: "otpauth://totp/DRTS:user?secret=XYZ", secret: "XYZ" });

      const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const headers = new Headers((init as RequestInit).headers);
      expect(headers.get("Authorization")).toBe("Bearer jwt");
    });
  });

  describe("GET /api/auth/sessions and POST /api/auth/sessions/:sid/revoke", () => {
    it("requires an authenticated session for the session list", async () => {
      global.fetch = vi.fn();
      const request = new NextRequest("http://localhost:3005/api/auth/sessions");
      const response = await authGet(request, { params: Promise.resolve({ auth: ["sessions"] }) });
      expect(response.status).toBe(401);
    });

    it("rejects revoke without a valid CSRF token", async () => {
      global.fetch = vi.fn();
      const request = new NextRequest("http://localhost:3005/api/auth/sessions/s2/revoke", {
        method: "POST",
        headers: { origin: "http://localhost:3005", cookie: `${AGENCY_SESSION_COOKIE_NAME}=jwt` },
        body: JSON.stringify({}),
      });
      const response = await authPost(request, {
        params: Promise.resolve({ auth: ["sessions", "s2", "revoke"] }),
      });
      expect(response.status).toBe(403);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
