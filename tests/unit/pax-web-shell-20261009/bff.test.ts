import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../../../apps/passenger-app-web/app/api/passenger-app/[...path]/route";

describe("Passenger BFF Route", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalFetch: typeof global.fetch;

  beforeAll(() => {
    originalEnv = process.env;
    originalFetch = global.fetch;
  });

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      DRTS_API_URL: "http://upstream.local",
      DRTS_API_AUTH_AUDIENCE: "test-audience",
    };
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
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
    global.fetch = vi.fn().mockImplementation(async (url) => {
      if (typeof url === 'string' && url.includes("metadata")) return new Response("trusted");
      return Response.json({ success: true }, { status: 200 });
    });
    const req = new NextRequest(
      "http://localhost/api/passenger-app/fares/quote",
    );
    const res = await GET(req, {
      params: Promise.resolve({ path: ["fares", "quote"] }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toBeDefined();
  });

  it("handles login and redacts tokens while setting cookies (Secure/SameSite)", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("metadata")) return new Response("trusted-identity");
      return Response.json({ accessToken: "sec-acc", refreshToken: "sec-ref", user: "abc" }, { status: 200 });
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
    expect(accCookie?.secure).toBe(true);
    expect(accCookie?.sameSite).toBe("lax");

    const refCookie = res.cookies.get("pax_refresh");
    expect(refCookie?.value).toBe("sec-ref");
    expect(refCookie?.httpOnly).toBe(true);
    expect(refCookie?.secure).toBe(true);
    expect(refCookie?.sameSite).toBe("lax");

    const data = await res.json();
    expect(data.accessToken).toBeUndefined();
    expect(data.refreshToken).toBeUndefined();
    expect(data.user).toBe("abc");
  });

  it("fails closed on partial/invalid tokens during login", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("metadata")) return new Response("trusted-identity");
      return Response.json({ accessToken: "sec-acc" }, { status: 200 });
    });
    const req = new NextRequest("http://localhost/api/passenger-app/auth/login", {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: JSON.stringify({})
    });
    const res = await POST(req, { params: Promise.resolve({ path: ["auth", "login"] }) });
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe("INVALID_TOKEN_PAYLOAD");
    expect(res.cookies.get("pax_session")).toBeUndefined();
  });

  it("handles OTP/OAuth initiation response correctly (R10 regression)", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("metadata")) return new Response("trusted-identity");
      return Response.json({ challengeId: "c1", expiresIn: 300 }, { status: 200 });
    });
    const req = new NextRequest("https://ride.smarttransport.tw/api/passenger-app/auth/otp/request", {
      method: "POST",
      headers: { Origin: "https://ride.smarttransport.tw" },
      body: JSON.stringify({})
    });
    const res = await POST(req, { params: Promise.resolve({ path: ["auth", "otp", "request"] }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.challengeId).toBe("c1");
    expect(res.cookies.get("pax_session")).toBeUndefined();
  });

  it("auto-refreshes on 401 using shared trusted auth routine and rejects spoofed headers", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      if (url.includes("metadata.google.internal")) {
        return new Response("trusted-identity-token", { status: 200 });
      }
      callCount++;
      if (callCount === 1) { // First request to /account
        if (init.headers.get("x-actor-id")) return new Response("Spoofed", { status: 400 });
        if (init.headers.get("authorization") !== "Bearer expired-access") return new Response("Bad Token", { status: 400 });
        return new Response("Unauthorized", { status: 401 });
      }
      if (callCount === 2) { // Refresh request
        if (init.headers.get("x-serverless-authorization") !== "Bearer trusted-identity-token") {
          return new Response("Forbidden", { status: 403 });
        }
        let body = { refreshToken: "" };
        try {
          body = typeof init.body === "string" ? JSON.parse(init.body) : JSON.parse(new TextDecoder().decode(init.body));
        } catch { /* ignore */ }
        if (body.refreshToken !== "stored-ref") return new Response("Bad Request", { status: 400 });
        return Response.json({ accessToken: "new-access", refreshToken: "new-ref" }, { status: 200 });
      }
      if (callCount === 3) { // Retry request
        if (init.headers.get("authorization") !== "Bearer new-access") return new Response("Bad Token", { status: 400 });
        return Response.json({ account: true }, { status: 200 });
      }
    });

    const req = new NextRequest("http://localhost/api/passenger-app/account", {
      headers: { Cookie: "pax_session=expired-access; pax_refresh=stored-ref", "X-Serverless-Authorization": "spoofed-header", "X-Actor-Id": "spoofed" }
    });
    const res = await GET(req, { params: Promise.resolve({ path: ["account"] }) });
    expect(res.status).toBe(200);

    const accCookie = res.cookies.get("pax_session");
    expect(accCookie?.value).toBe("new-access");
  });

  it("clears both cookies on automatic failed-retry network/401", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("metadata.google.internal")) {
        return new Response("trusted", { status: 200 });
      }
      callCount++;
      if (callCount === 1) { // Normal request -> 401
        return new Response("Unauthorized", { status: 401 });
      }
      if (callCount === 2) { // Refresh request -> network failure
        throw new Error("Network Error");
      }
    });

    const req = new NextRequest("http://localhost/api/passenger-app/account", {
      headers: { Cookie: "pax_session=expired-access; pax_refresh=stored-ref" }
    });
    const res = await GET(req, { params: Promise.resolve({ path: ["account"] }) });
    
    expect(res.status).toBe(401);
    expect(res.cookies.get("pax_session")?.value).toBe("");
    expect(res.cookies.get("pax_refresh")?.value).toBe("");
  });

  it("clears both cookies on explicit refresh failure (network, parsing, invalid tokens)", async () => {
    const scenarios = [
      { ok: false, status: 503 },
      { ok: true, status: 200, data: {} },
      { ok: true, status: 200, data: { accessToken: "missing_ref" } },
      null // network error
    ];

    for (const sc of scenarios) {
      if (sc === null) {
        global.fetch = vi.fn().mockImplementation(async (url) => {
          if (url.includes("metadata")) return new Response("token", { status: 200 });
          throw new Error("Network Error");
        });
      } else {
        global.fetch = vi.fn().mockImplementation(async (url) => {
          if (url.includes("metadata")) return new Response("token", { status: 200 });
          return sc.data ? Response.json(sc.data, { status: sc.status }) : new Response("", { status: sc.status });
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
      if (url.includes("metadata")) return new Response("token", { status: 200 });
      callCount++;
      if (url.includes("auth/logout")) {
        let body;
        try {
          body = typeof init.body === "string" ? JSON.parse(init.body) : JSON.parse(new TextDecoder().decode(init.body));
        } catch {
          body = {};
        }
        if (callCount === 1) {
          if (body.refreshToken !== "stored-ref") return new Response("Error", { status: 500 });
          return new Response("Unauthorized", { status: 401 });
        }
        if (callCount === 3) {
          if (body.refreshToken !== "new-ref") return new Response("Bad Request", { status: 400 });
          return new Response("", { status: 200 });
        }
      }
      if (url.includes("auth/refresh")) {
        return Response.json({ accessToken: "new-acc", refreshToken: "new-ref" }, { status: 200 });
      }
    });

    const req = new NextRequest("http://localhost/api/passenger-app/auth/logout", {
      method: "POST",
      headers: { Origin: "http://localhost", Cookie: "pax_session=expired-access; pax_refresh=stored-ref" },
      body: "{}"
    });
    
    const res = await POST(req, { params: Promise.resolve({ path: ["auth", "logout"] }) });
    expect(res.status).toBe(200);
    
    const accCookie = res.cookies.get("pax_session");
    expect(accCookie?.value).toBe("");
  });
  
  it("propagates upstream failure if logout fails after retries, but still clears cookies", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("metadata")) return new Response("token", { status: 200 });
      return new Response("Bad Request", { status: 400 }); // Failed request
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

  it("clears cookies on logout even if network exception occurs (R14)", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("metadata")) return new Response("token", { status: 200 });
      throw new Error("Network disconnect");
    });
    
    const req = new NextRequest("http://localhost/api/passenger-app/auth/logout", {
      method: "POST",
      headers: { Origin: "http://localhost", Cookie: "pax_session=acc; pax_refresh=stored-ref" },
      body: "{}"
    });
    
    const res = await POST(req, { params: Promise.resolve({ path: ["auth", "logout"] }) });
    expect(res.status).toBe(503);
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
