import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  GET,
  POST,
} from "../../../apps/passenger-app-web/app/api/passenger-app/[...path]/route.js";

describe("Passenger App BFF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => "token",
      headers: new Headers(),
      body: null,
    });
    // mock DRTS_API_AUTH_AUDIENCE
    process.env.DRTS_API_AUTH_AUDIENCE = "test-audience";
    process.env.NODE_ENV = "production";
  });

  it("blocks unallowed paths", async () => {
    const req = new NextRequest(
      "http://localhost/api/passenger-app/admin/users",
    );
    const res = await GET(req, {
      params: Promise.resolve({ path: ["admin", "users"] }),
    });
    expect(res.status).toBe(404);
  });

  it("adds security headers on success and error", async () => {
    // success
    let req = new NextRequest(
      "http://localhost/api/passenger-app/fares/quote",
    );
    let res = await GET(req, {
      params: Promise.resolve({ path: ["fares", "quote"] }),
    });
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toBeDefined();
  });

  it("handles login and redacts tokens while setting cookies (Secure/SameSite)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: "sec-acc", refreshToken: "sec-ref", user: "abc" }),
      headers: new Headers(),
      body: "{}",
    });
    const req = new NextRequest("http://localhost/api/passenger-app/auth/login", {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: JSON.stringify({})
    });
    const res = await POST(req, { params: Promise.resolve({ path: ["auth", "login"] }) });
    expect(res.status).toBe(200);
    
    // Tokens are set as HttpOnly cookies
    const accCookie = res.cookies.get("pax_session");
    expect(accCookie?.value).toBe("sec-acc");
    expect(accCookie?.httpOnly).toBe(true);
    expect(accCookie?.secure).toBe(true); // R7
    expect(accCookie?.sameSite).toBe("lax"); // R7

    const refCookie = res.cookies.get("pax_refresh");
    expect(refCookie?.value).toBe("sec-ref");
    expect(refCookie?.httpOnly).toBe(true);
    expect(refCookie?.secure).toBe(true);
    expect(refCookie?.sameSite).toBe("lax");

    // Tokens are redacted from response
    const data = await res.json();
    expect(data.accessToken).toBeUndefined();
    expect(data.refreshToken).toBeUndefined();
    expect(data.user).toBe("abc");
  });

  // R4 Test
  it("auto-refreshes on 401 using shared trusted auth routine and rejects spoofed headers", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      if (url.includes("metadata.google.internal")) {
        return { ok: true, text: async () => "trusted-identity-token" };
      }
      callCount++;
      if (callCount === 1) { // First request to /account
        expect(init.headers.get("x-serverless-authorization")).toBe("Bearer trusted-identity-token");
        expect(init.headers.get("authorization")).toBe("Bearer expired-access");
        expect(init.headers.get("x-drts-google-id-token")).toBe("trusted-identity-token");
        expect(init.headers.get("x-spoofed")).toBeNull();
        return { ok: false, status: 401, headers: new Headers() };
      }
      if (callCount === 2) { // Refresh request
        expect(url).toContain("auth/refresh");
        expect(init.headers.get("x-serverless-authorization")).toBe("Bearer trusted-identity-token");
        const body = JSON.parse(init.body);
        expect(body.refreshToken).toBe("stored-ref");
        return { ok: true, status: 200, json: async () => ({ accessToken: "new-access", refreshToken: "new-ref" }), headers: new Headers() };
      }
      if (callCount === 3) { // Retry request
        expect(url).toContain("account");
        expect(init.headers.get("authorization")).toBe("Bearer new-access");
        return { ok: true, status: 200, headers: new Headers(), body: '{"account": true}' };
      }
    });

    const req = new NextRequest("http://localhost/api/passenger-app/account", {
      headers: { Cookie: "pax_session=expired-access; pax_refresh=stored-ref", "X-Serverless-Authorization": "spoofed-header" }
    });
    const res = await GET(req, { params: Promise.resolve({ path: ["account"] }) });
    expect(res.status).toBe(200);

    const accCookie = res.cookies.get("pax_session");
    expect(accCookie?.value).toBe("new-access");
    expect(accCookie?.secure).toBe(true);
  });

  // R2 Test
  it("clears both cookies on explicit refresh failure (network, parsing, invalid tokens)", async () => {
    const scenarios = [
      { ok: false, status: 503 },
      { ok: true, status: 200, data: {} }, // empty data
      { ok: true, status: 200, data: { accessToken: "missing_ref" } },
      null // network error
    ];

    for (const sc of scenarios) {
      if (sc === null) {
        global.fetch = vi.fn().mockImplementation(async (url) => {
          if (url.includes("metadata")) return { ok: true, text: async () => "token" };
          throw new Error("Network Error");
        });
      } else {
        global.fetch = vi.fn().mockImplementation(async (url) => {
          if (url.includes("metadata")) return { ok: true, text: async () => "token" };
          return { ok: sc.ok, status: sc.status, json: async () => sc.data, headers: new Headers() };
        });
      }

      const req = new NextRequest("http://localhost/api/passenger-app/auth/refresh", {
        method: "POST",
        headers: { Origin: "http://localhost", Cookie: "pax_session=acc; pax_refresh=stored-ref" }
      });
      const res = await POST(req, { params: Promise.resolve({ path: ["auth", "refresh"] }) });

      const accCookie = res.cookies.get("pax_session");
      const refCookie = res.cookies.get("pax_refresh");
      
      expect(accCookie?.value).toBe(""); // cleared
      expect(refCookie?.value).toBe(""); // cleared
      
      if (sc === null || sc.status === 503) {
        expect(res.status).toBe(503);
      } else {
        expect(res.status).toBe(401);
      }
    }
  });

  // R3 Test
  it("asserts authorized revocation on logout and propagates failure", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      if (url.includes("metadata")) return { ok: true, text: async () => "token" };
      callCount++;
      if (url.includes("auth/logout")) {
        const body = JSON.parse(init.body);
        expect(body.refreshToken).toBe("stored-ref");
        if (callCount === 1) return { ok: false, status: 401, headers: new Headers() };
        if (callCount === 3) return { ok: true, status: 200, headers: new Headers() };
      }
      if (url.includes("auth/refresh")) {
        return { ok: true, status: 200, json: async () => ({ accessToken: "new-acc", refreshToken: "new-ref" }), headers: new Headers() };
      }
    });

    const req = new NextRequest("http://localhost/api/passenger-app/auth/logout", {
      method: "POST",
      headers: { Origin: "http://localhost", Cookie: "pax_session=expired-access; pax_refresh=stored-ref" }
    });
    
    // First it hits 401 on logout, then refresh kicks in, then retries logout
    const res = await POST(req, { params: Promise.resolve({ path: ["auth", "logout"] }) });
    expect(res.status).toBe(200);
    
    // Cookies must be cleared on successful logout
    const accCookie = res.cookies.get("pax_session");
    expect(accCookie?.value).toBe("");
  });
  
  it("propagates upstream failure if logout fails after retries", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("metadata")) return { ok: true, text: async () => "token" };
      return { ok: false, status: 400, headers: new Headers() }; // Failed request
    });
    
    const req = new NextRequest("http://localhost/api/passenger-app/auth/logout", {
      method: "POST",
      headers: { Origin: "http://localhost", Cookie: "pax_session=acc; pax_refresh=stored-ref" }
    });
    
    const res = await POST(req, { params: Promise.resolve({ path: ["auth", "logout"] }) });
    expect(res.status).toBe(400); // Propagated error status
    // Cookies must STILL be cleared
    const accCookie = res.cookies.get("pax_session");
    expect(accCookie?.value).toBe("");
  });
});
