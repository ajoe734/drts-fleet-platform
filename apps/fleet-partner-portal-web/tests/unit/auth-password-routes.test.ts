import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET as authGet, POST as authPost } from "@/app/api/auth/[...auth]/route";

/** PWD-LOGIN-009: BFF forwarding for password-login, password-reset, TOTP
 * enroll/confirm, self-service sessions and logout-all, partner realm. */
describe("Fleet Auth BFF: password-login, password-reset, TOTP, sessions, logout-all", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.DRTS_FLEET_PARTNER_ID = "partner-test-1";
  });

  describe("POST /api/auth/password-login", () => {
    it("rejects a request missing email or password before calling upstream", async () => {
      global.fetch = vi.fn();
      const request = new NextRequest("http://localhost:3007/api/auth/password-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "pw" }),
      });
      const response = await authPost(request, { params: Promise.resolve({ auth: ["password-login"] }) });
      expect(response.status).toBe(400);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("sets session and CSRF cookies without echoing the access token, on success", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { access_token: "upstream-jwt" } }),
      } as Response);

      const request = new NextRequest("http://localhost:3007/api/auth/password-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", password: "correct-password" }),
      });
      const response = await authPost(request, { params: Promise.resolve({ auth: ["password-login"] }) });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(JSON.stringify(body)).not.toContain("upstream-jwt");
      const cookies = response.headers.getSetCookie();
      expect(cookies.some((c) => c.startsWith("drts_session=upstream-jwt"))).toBe(true);
      expect(cookies.some((c) => c.startsWith("drts_csrf="))).toBe(true);

      const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const sentBody = JSON.parse((init as RequestInit).body as string);
      expect(sentBody.partnerId).toBe("partner-test-1");
    });

    it("relays the backend's generic 401", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: "AUTHENTICATION_FAILED" } }),
      } as Response);
      const request = new NextRequest("http://localhost:3007/api/auth/password-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", password: "wrong" }),
      });
      const response = await authPost(request, { params: Promise.resolve({ auth: ["password-login"] }) });
      expect(response.status).toBe(401);
      expect(response.headers.getSetCookie()).toHaveLength(0);
    });
  });

  describe("POST /api/auth/password-reset/request and /confirm", () => {
    it("always relays 200 accepted from request", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ accepted: true }),
      } as Response);
      const request = new NextRequest("http://localhost:3007/api/auth/password-reset/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "nobody@example.com" }),
      });
      const response = await authPost(request, {
        params: Promise.resolve({ auth: ["password-reset", "request"] }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ accepted: true });
    });
  });

  describe("POST /api/auth/mfa/totp/enroll", () => {
    it("requires an authenticated session before calling upstream", async () => {
      global.fetch = vi.fn();
      const request = new NextRequest("http://localhost:3007/api/auth/mfa/totp/enroll", {
        method: "POST",
        headers: {
          origin: "http://localhost:3007",
          cookie: "drts_csrf=real-token",
          "x-csrf-token": "real-token",
        },
      });
      const response = await authPost(request, {
        params: Promise.resolve({ auth: ["mfa", "totp", "enroll"] }),
      });
      expect(response.status).toBe(401);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("relays otpauth_uri and secret with the session bearer forwarded", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ otpauth_uri: "otpauth://totp/DRTS:user?secret=XYZ", secret: "XYZ" }),
      } as Response);
      const request = new NextRequest("http://localhost:3007/api/auth/mfa/totp/enroll", {
        method: "POST",
        headers: {
          origin: "http://localhost:3007",
          cookie: "drts_session=jwt; drts_csrf=real-token",
          "x-csrf-token": "real-token",
        },
      });
      const response = await authPost(request, {
        params: Promise.resolve({ auth: ["mfa", "totp", "enroll"] }),
      });
      expect(response.status).toBe(200);
      const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const headers = new Headers((init as RequestInit).headers);
      expect(headers.get("Authorization")).toBe("Bearer jwt");
    });
  });

  describe("GET /api/auth/sessions", () => {
    it("requires an authenticated session", async () => {
      global.fetch = vi.fn();
      const request = new NextRequest("http://localhost:3007/api/auth/sessions");
      const response = await authGet(request, { params: Promise.resolve({ auth: ["sessions"] }) });
      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/auth/logout-all", () => {
    it("calls the backend with the session bearer and clears local cookies", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) } as Response);
      const request = new NextRequest("http://localhost:3007/api/auth/logout-all", {
        method: "POST",
        headers: { cookie: "drts_session=jwt; drts_csrf=tok", "x-csrf-token": "tok", origin: "http://localhost:3007" },
      });
      const response = await authPost(request, { params: Promise.resolve({ auth: ["logout-all"] }) });
      expect(response.status).toBe(200);
      const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(url).toContain("/api/auth/logout-all");
      const headers = new Headers((init as RequestInit).headers);
      expect(headers.get("Authorization")).toBe("Bearer jwt");
      const cookies = response.headers.getSetCookie();
      expect(cookies.some((c) => c.startsWith("drts_session=;"))).toBe(true);
    });

    it("stays signed in locally if the backend revocation call fails", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) } as Response);
      const request = new NextRequest("http://localhost:3007/api/auth/logout-all", {
        method: "POST",
        headers: { cookie: "drts_session=jwt" },
      });
      const response = await authPost(request, { params: Promise.resolve({ auth: ["logout-all"] }) });
      expect(response.status).toBe(503);
      expect(response.headers.getSetCookie()).toHaveLength(0);
    });
  });
});
