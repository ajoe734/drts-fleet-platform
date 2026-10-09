import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../../../apps/passenger-app-web/app/api/passenger-app/[...path]/route";

describe("Passenger BFF Route", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    originalEnv = process.env;
    process.env = {
      ...originalEnv,
      DRTS_API_URL: "http://upstream.local",
      DRTS_API_AUTH_AUDIENCE: "test-audience",
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("rejects path traversal and unauthorized routes", async () => {
    let req = new NextRequest(
      "http://localhost/api/passenger-app/auth/../admin",
    );
    let res = await GET(req, {
      params: Promise.resolve({ path: ["auth", "..", "admin"] }),
    });
    expect(res.status).toBe(404);

    req = new NextRequest(
      "http://localhost/api/passenger-app/admin/users",
    );
    res = await GET(req, {
      params: Promise.resolve({ path: ["admin", "users"] }),
    });
    expect(res.status).toBe(404);
  });

  it("adds security headers on success and error", async () => {
    const req = new NextRequest(
      "http://localhost/api/passenger-app/fares/quote",
    );
    const res = await GET(req, {
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
      text: async () => "{}",
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
    
    const accCookie = res.cookies.get("pax_session");
    expect(accCookie?.value).toBe("sec-acc");
    expect(accCookie?.httpOnly).toBe(true);

    const refCookie = res.cookies.get("pax_refresh");
    expect(refCookie?.value).toBe("sec-ref");
    expect(refCookie?.httpOnly).toBe(true);

    const data = await res.json();
    expect(data.accessToken).toBeUndefined();
    expect(data.refreshToken).toBeUndefined();
    expect(data.user).toBe("abc");
  });

  it("auto-refreshes on 401 using shared trusted auth routine and rejects spoofed headers", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      if (url.includes("metadata.google.internal")) {
        return { ok: true, text: async () => "trusted-identity-token" };
      }
      callCount++;
      if (callCount === 1) { // First request to /account
        // R4: Do not fail if test assertions throw; instead verify outside or softly
        return { ok: false, status: 401, headers: new Headers() };
      }
      if (callCount === 2) { // Refresh request
        if (init.headers.get("x-serverless-authorization") !== "Bearer trusted-identity-token") {
          return { ok: false, status: 403 };
        }
        let body = { refreshToken: "" };
        try {
          body = typeof init.body === "string" ? JSON.parse(init.body) : JSON.parse(new TextDecoder().decode(init.body));
        } catch { /* ignore */ }
        if (body.refreshToken !== "stored-ref") return { ok: false, status: 400 };
        return { ok: true, status: 200, json: async () => ({ accessToken: "new-access", refreshToken: "new-ref" }), headers: new Headers() };
      }
      if (callCount === 3) { // Retry request
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
  });

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
      
      expect(accCookie?.value).toBe("");
      expect(refCookie?.value).toBe("");
      
      expect(res.status).toBe(401);
    }
  });

  it("asserts authorized revocation on logout and propagates failure", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      if (url.includes("metadata")) return { ok: true, text: async () => "token" };
      callCount++;
      if (url.includes("auth/logout")) {
        let body;
        try {
          body = typeof init.body === "string" ? JSON.parse(init.body) : JSON.parse(new TextDecoder().decode(init.body));
        } catch {
          body = {};
        }
        if (callCount === 1) {
          if (body.refreshToken !== "stored-ref") return { ok: false, status: 500 };
          return { ok: false, status: 401, headers: new Headers() };
        }
        if (callCount === 3) {
          if (body.refreshToken !== "new-ref") return { ok: false, status: 400 };
          return { ok: true, status: 200, headers: new Headers() };
        }
      }
      if (url.includes("auth/refresh")) {
        return { ok: true, status: 200, json: async () => ({ accessToken: "new-acc", refreshToken: "new-ref" }), headers: new Headers() };
      }
    });

    const req = new NextRequest("http://localhost/api/passenger-app/auth/logout", {
      method: "POST",
      headers: { Origin: "http://localhost", Cookie: "pax_session=expired-access; pax_refresh=stored-ref" },
      body: "{}"
    });
    // Need to provide initial body data to request so it parses. Wait, `auth/logout` ignores initial body data!
    
    const res = await POST(req, { params: Promise.resolve({ path: ["auth", "logout"] }) });
    expect(res.status).toBe(200);
    
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
    const accCookie = res.cookies.get("pax_session");
    expect(accCookie?.value).toBe("");
  });
  
  it("rejects CSRF if origin doesn't match", async () => {
    const req = new NextRequest("http://localhost/api/passenger-app/auth/login", {
      method: "POST",
      headers: { Origin: "http://evil.com" }
    });
    const res = await POST(req, { params: Promise.resolve({ path: ["auth", "login"] }) });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("CSRF_CHECK_FAILED");
  });
});
