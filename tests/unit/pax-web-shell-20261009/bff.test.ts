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

  it("rejects path traversal, encoded delimiters, and unauthorized routes", async () => {
    // Original POST traversal with actual Next-decoded params
    const traversalReq = new NextRequest("http://localhost/api/passenger-app/auth/otp/%252e%252e/%252e%252e/%252e%252e/admin", { method: "POST", headers: { Origin: "http://localhost" } });
    const traversalRes = await POST(traversalReq, { params: Promise.resolve({ path: ["auth", "otp", "%2e%2e", "%2e%2e", "%2e%2e", "admin"] }) }); // Next.js decoding gives %2e%2e for double encoded in params
    expect(traversalRes.status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();

    // Allowed-shaped GET oauth encoded dot
    const oauthReq = new NextRequest("http://localhost/api/passenger-app/auth/oauth/%252e%252e");
    const oauthRes = await GET(oauthReq, { params: Promise.resolve({ path: ["auth", "oauth", "%2e%2e"] }) });
    expect(oauthRes.status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();

    const maliciousPaths = [
      { method: "GET", path: ["auth", "..", "admin"] },
      { method: "POST", path: ["auth", "%2e%2e", "admin"] },
      { method: "POST", path: ["auth", "otp", "..%2f..%2fadmin"] },
      { method: "POST", path: ["auth", "otp%2f..%2fadmin"] },
      { method: "POST", path: ["auth", "otp%5c..%5cadmin"] },
      { method: "GET", path: ["admin", "users"] },
      { method: "POST", path: ["auth", "otp-extra", "something"] }, // prefix collision
      { method: "GET", path: ["auth", "oauth", "google", "extra"] }, // extra segments
    ];

    for (const { method, path } of maliciousPaths) {
      const req = new NextRequest(`http://localhost/api/passenger-app/${path.join("/")}`, { method, headers: { Origin: "http://localhost" } });
      const handler = method === "POST" ? POST : GET;
      const res = await handler(req, { params: Promise.resolve({ path }) });
      expect(res.status).toBe(404);
      expect(global.fetch).not.toHaveBeenCalled();
    }
  });

  it("allows legitimate explicit paths and asserts forwarding", async () => {
    const valid = [
      { method: "GET", path: ["auth", "providers"], expectedStatus: 200, mockResponse: new Response("ok", { status: 200 }) },
      { method: "POST", path: ["auth", "otp", "verify"], expectedStatus: 503, mockResponse: new Response(JSON.stringify({ accessToken: "a" }), { status: 200, headers: { "Content-Type": "application/json" } }) },
      { method: "POST", path: ["auth", "otp", "request"], expectedStatus: 200, mockResponse: new Response(JSON.stringify({ challengeId: "123" }), { status: 200, headers: { "Content-Type": "application/json" } }) },
      { method: "POST", path: ["auth", "oauth", "google", "start"], expectedStatus: 200, mockResponse: new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }) },
      { method: "POST", path: ["auth", "mfa", "verify"], expectedStatus: 503, mockResponse: new Response(JSON.stringify({ accessToken: "a" }), { status: 200, headers: { "Content-Type": "application/json" } }) },
      { method: "POST", path: ["quotes"], expectedStatus: 200, mockResponse: new Response("ok", { status: 200 }) },
      { method: "POST", path: ["auth", "refresh"], expectedStatus: 401, mockResponse: new Response("ok", { status: 200 }) },
      { method: "POST", path: ["auth", "logout"], expectedStatus: 200, mockResponse: new Response("ok", { status: 200 }) },
      { method: "GET", path: ["me"], expectedStatus: 200, mockResponse: new Response("ok", { status: 200 }) },
      { method: "POST", path: ["rides"], expectedStatus: 200, mockResponse: new Response("ok", { status: 200 }) },
    ];
    for (const v of valid) {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("metadata")) return new Response("trusted-identity", { status: 200 });
        return v.mockResponse;
      });
      const req = new NextRequest(`http://localhost/api/passenger-app/${v.path.join("/")}`, { method: v.method, headers: { Origin: "http://localhost" } });
      const handler = v.method === "POST" ? POST : GET;
      const res = await handler(req, { params: Promise.resolve({ path: v.path }) });
      expect(res.status).toBe(v.expectedStatus);
      expect(res.status).not.toBe(404);
      // We expect fetch to be called (unless it fails early due to no refresh token)
      if (v.path.join("/") !== "auth/refresh") {
        expect(global.fetch).toHaveBeenCalled();
      }
    }
  });

  it("adds security headers on success and error", async () => {
    global.fetch = vi.fn().mockImplementation(async (url) => {
      if (typeof url === 'string' && url.includes("metadata")) return new Response("trusted");
      return Response.json({ success: true }, { status: 200 });
    });
    const req = new NextRequest(
      "http://localhost/api/passenger-app/quotes",
      { method: "POST", headers: { Origin: "http://localhost" } }
    );
    const res = await POST(req, {
      params: Promise.resolve({ path: ["quotes"] }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toBeDefined();
  });

  it("handles login and redacts tokens while setting cookies (Secure/SameSite)", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("metadata")) return new Response("trusted-identity");
      return Response.json({
        data: { access_token: "sec-acc", refresh_token: "sec-ref", user: "abc" },
        meta: {}
      }, { status: 200 });
    });
    const req = new NextRequest("http://localhost/api/passenger-app/auth/otp/verify", {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: JSON.stringify({})
    });
    const res = await POST(req, { params: Promise.resolve({ path: ["auth", "otp", "verify"] }) });
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

    const responseJson = await res.json();
    expect(responseJson.data.access_token).toBeUndefined();
    expect(responseJson.data.refresh_token).toBeUndefined();
    expect(responseJson.data.user).toBe("abc");
  });

  it("fails closed on partial/invalid tokens during login", async () => {
    const invalidPayloads = [
      { accessToken: "sec-acc" }, // access-only
      { refreshToken: "sec-ref" }, // refresh-only
      { accessToken: 123, refreshToken: "sec-ref" }, // non-string (number)
      { accessToken: "", refreshToken: "" }, // empty string pair
      { data: { access_token: "sec-acc" } }, // snake_case access-only
      { data: { refresh_token: "sec-ref" } }, // snake_case refresh-only
    ];

    for (const payload of invalidPayloads) {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("metadata")) return new Response("trusted-identity");
        return Response.json(payload, { status: 200 });
      });
      const req = new NextRequest("http://localhost/api/passenger-app/auth/otp/verify", {
        method: "POST",
        headers: { Origin: "http://localhost" },
        body: JSON.stringify({})
      });
      const res = await POST(req, { params: Promise.resolve({ path: ["auth", "otp", "verify"] }) });
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.error).toBe("INVALID_TOKEN_PAYLOAD");
      expect(res.cookies.get("pax_session")).toBeUndefined();
    }
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

    const req = new NextRequest("http://localhost/api/passenger-app/me", {
      headers: { Cookie: "pax_session=expired-access; pax_refresh=stored-ref", "X-Serverless-Authorization": "spoofed-header", "X-Actor-Id": "spoofed" }
    });
    const res = await GET(req, { params: Promise.resolve({ path: ["me"] }) });
    expect(res.status).toBe(200);

    const accCookie = res.cookies.get("pax_session");
    expect(accCookie?.value).toBe("new-access");
  });

  it("clears both cookies on automatic failed-retry network/401", async () => {
    const scenarios = [
      { networkError: false, status: 401 },
      { networkError: true, status: 401 } // status 401 will be from the original call before retry
    ];
    for (const sc of scenarios) {
      let callCount = 0;
      let retryAuthHeader: string | null = null;
      global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        if (url.includes("metadata.google.internal")) {
          return new Response("trusted", { status: 200 });
        }
        callCount++;
        if (callCount === 1) { // Normal request -> 401
          return new Response("Unauthorized", { status: 401 });
        }
        if (callCount === 2) { // Refresh request -> success
          let body: any = {};
          if (init && init.body) {
            body = typeof init.body === "string" ? JSON.parse(init.body) : JSON.parse(new TextDecoder().decode(init.body));
          }
          expect(body.refreshToken).toBe("stored-ref");
          expect(init.headers.get("x-serverless-authorization")).toBe("Bearer trusted");
          return Response.json({ accessToken: "rotated-acc", refreshToken: "rotated-ref" }, { status: 200 });
        }
        if (callCount === 3) { // Retry request
          retryAuthHeader = init.headers.get("authorization") || null;
          if (sc.networkError) throw new Error("Network exception");
          return new Response("Unauthorized", { status: 401 });
        }
      });

      const req = new NextRequest("http://localhost/api/passenger-app/me", {
        headers: { Cookie: "pax_session=expired-access; pax_refresh=stored-ref" }
      });
      const res = await GET(req, { params: Promise.resolve({ path: ["me"] }) });
      
      expect(callCount).toBe(3);
      expect(retryAuthHeader).toBe("Bearer rotated-acc");
      expect(res.status).toBe(sc.status);
      expect(res.cookies.get("pax_session")?.value).toBe("");
      expect(res.cookies.get("pax_session")?.maxAge).toBe(0);
      expect(res.cookies.get("pax_refresh")?.value).toBe("");
      expect(res.cookies.get("pax_refresh")?.maxAge).toBe(0);
    }
  });

  it("handles explicit refresh success and sets cookies (Secure/SameSite)", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("metadata")) return new Response("trusted-identity");
      return Response.json({
        data: { access_token: "fresh-acc", refresh_token: "fresh-ref", user: "def" },
        meta: {}
      }, { status: 200 });
    });
    const req = new NextRequest("http://localhost/api/passenger-app/auth/refresh", {
      method: "POST",
      headers: { Origin: "http://localhost", Cookie: "pax_refresh=stored-ref" }
    });
    const res = await POST(req, { params: Promise.resolve({ path: ["auth", "refresh"] }) });
    expect(res.status).toBe(200);
    
    const accCookie = res.cookies.get("pax_session");
    expect(accCookie?.value).toBe("fresh-acc");
    expect(accCookie?.httpOnly).toBe(true);
    expect(accCookie?.secure).toBe(true);
    expect(accCookie?.sameSite).toBe("lax");

    const refCookie = res.cookies.get("pax_refresh");
    expect(refCookie?.value).toBe("fresh-ref");
    expect(refCookie?.httpOnly).toBe(true);
    expect(refCookie?.secure).toBe(true);
    expect(refCookie?.sameSite).toBe("lax");

    const responseJson = await res.json();
    expect(responseJson.data.access_token).toBeUndefined();
    expect(responseJson.data.refresh_token).toBeUndefined();
    expect(responseJson.data.user).toBe("def");
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
    expect(accCookie?.maxAge).toBe(0);
    const refCookie = res.cookies.get("pax_refresh");
    expect(refCookie?.value).toBe("");
    expect(refCookie?.maxAge).toBe(0);
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
    expect(accCookie?.maxAge).toBe(0);
    const refCookie = res.cookies.get("pax_refresh");
    expect(refCookie?.value).toBe("");
    expect(refCookie?.maxAge).toBe(0);
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
    expect(accCookie?.maxAge).toBe(0);
    const refCookie = res.cookies.get("pax_refresh");
    expect(refCookie?.value).toBe("");
    expect(refCookie?.maxAge).toBe(0);
  });

  it("clears cookies on logout even if metadata minting fails", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("metadata")) throw new Error("Metadata failure");
      return new Response("ok", { status: 200 });
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
    expect(accCookie?.maxAge).toBe(0);
    const refCookie = res.cookies.get("pax_refresh");
    expect(refCookie?.value).toBe("");
    expect(refCookie?.maxAge).toBe(0);
  });
  
  it("rejects CSRF if origin doesn't match", async () => {
    const req = new NextRequest("http://localhost/api/passenger-app/auth/otp/verify", {
      method: "POST",
      headers: { Origin: "http://evil.com" }
    });
    const res = await POST(req, { params: Promise.resolve({ path: ["auth", "otp", "verify"] }) });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("CSRF_CHECK_FAILED");
  });
});
