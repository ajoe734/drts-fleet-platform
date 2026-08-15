import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import {
  TENANT_SESSION_COOKIE_NAME,
  TENANT_LOGIN_PATH,
} from "@/lib/auth/constants";

describe("Tenant Console Middleware", () => {
  it("attaches security headers to all responses", () => {
    const request = new NextRequest("http://localhost:3004/login");
    const response = middleware(request);

    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
  });

  describe("Public Routes", () => {
    it("allows /login without session cookie", () => {
      const request = new NextRequest("http://localhost:3004/login");
      const response = middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    });

    it("allows /api/auth/tenant/login without session cookie", () => {
      const request = new NextRequest("http://localhost:3004/api/auth/tenant/login");
      const response = middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    });

    it("allows /api/auth/tenant/callback without session cookie", () => {
      const request = new NextRequest("http://localhost:3004/api/auth/tenant/callback?code=abc&state=xyz");
      const response = middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    });
  });

  describe("Protected Page Routes", () => {
    it("redirects unauthenticated page requests to /login with redirect_uri", () => {
      const request = new NextRequest("http://localhost:3004/bookings?tab=active");
      const response = middleware(request);

      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).not.toBeNull();
      const redirectUrl = new URL(location!);
      expect(redirectUrl.pathname).toBe(TENANT_LOGIN_PATH);
      expect(redirectUrl.searchParams.get("redirect_uri")).toBe("/bookings?tab=active");
    });

    it("allows authenticated page GET requests when session cookie is present", () => {
      const request = new NextRequest("http://localhost:3004/bookings", {
        headers: {
          cookie: `${TENANT_SESSION_COOKIE_NAME}=valid-session-token`,
        },
      });
      const response = middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    });

    it("allows authenticated page POST requests (Server Actions) without requiring x-csrf-token header in middleware", () => {
      const request = new NextRequest("http://localhost:3004/sessions", {
        method: "POST",
        headers: {
          cookie: `${TENANT_SESSION_COOKIE_NAME}=valid-session-token`,
        },
      });
      const response = middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    });
  });

  describe("Protected API & Control Plane Proxy Routes", () => {
    it("returns 401 JSON for unauthenticated API requests", async () => {
      const request = new NextRequest("http://localhost:3004/api/bookings/create", {
        method: "POST",
      });
      const response = middleware(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe("AUTHENTICATION_REQUIRED");
      expect(data.active).toBe(false);
    });

    it("returns 401 JSON for unauthenticated control-plane-proxy requests", async () => {
      const request = new NextRequest("http://localhost:3004/control-plane-proxy/tenant/bookings", {
        method: "GET",
      });
      const response = middleware(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe("AUTHENTICATION_REQUIRED");
    });

    it("allows authenticated control-plane-proxy requests through middleware (proxy handler enforces CSRF/same-origin)", () => {
      const request = new NextRequest("http://localhost:3004/control-plane-proxy/tenant/bookings", {
        method: "GET",
        headers: {
          cookie: `${TENANT_SESSION_COOKIE_NAME}=valid-session-token`,
        },
      });
      const response = middleware(request);

      expect(response.status).toBe(200);
    });
  });
});
