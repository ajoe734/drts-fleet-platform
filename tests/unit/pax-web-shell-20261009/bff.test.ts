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

  it("allows public fare quote (GET)", async () => {
    const req = new NextRequest(
      "http://localhost/api/passenger-app/fares/quote",
    );
    const res = await GET(req, {
      params: Promise.resolve({ path: ["fares", "quote"] }),
    });
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/passenger-app/fares/quote"),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("checks CSRF for POST", async () => {
    const req = new NextRequest("http://localhost/api/passenger-app/rides", {
      method: "POST",
      headers: {
        Origin: "http://hacker.com",
      },
    });
    const res = await POST(req, {
      params: Promise.resolve({ path: ["rides"] }),
    });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("CSRF_CHECK_FAILED");
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

    // error
    req = new NextRequest("http://localhost/api/passenger-app/admin/users");
    res = await GET(req, {
      params: Promise.resolve({ path: ["admin", "users"] }),
    });
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("handles login and redacts tokens while setting cookies", async () => {
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

    const refCookie = res.cookies.get("pax_refresh");
    expect(refCookie?.value).toBe("sec-ref");
    expect(refCookie?.httpOnly).toBe(true);

    // Tokens are redacted from response
    const data = await res.json();
    expect(data.accessToken).toBeUndefined();
    expect(data.refreshToken).toBeUndefined();
    expect(data.user).toBe("abc");
  });

  it("handles refresh with stored cookie and metadata auth", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: "new-acc", refreshToken: "new-ref" }),
      headers: new Headers(),
      body: "{}",
    });
    const req = new NextRequest("http://localhost/api/passenger-app/auth/refresh", {
      method: "POST",
      headers: { Origin: "http://localhost", Cookie: "pax_refresh=stored-ref" }
    });
    const res = await POST(req, { params: Promise.resolve({ path: ["auth", "refresh"] }) });
    
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("metadata.google.internal"),
      expect.objectContaining({ cache: "no-store" })
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/passenger-app/auth/refresh"),
      expect.objectContaining({
        body: JSON.stringify({ refreshToken: "stored-ref" })
      })
    );

    const accCookie = res.cookies.get("pax_session");
    expect(accCookie?.value).toBe("new-acc");
    
    // Refreshed tokens are also redacted in the logic for refresh since it returns success: true
    const data = await res.json();
    expect(data.accessToken).toBeUndefined();
    expect(data.success).toBe(true);
  });

  it("clears cookies on failed refresh", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      body: "{}",
    });
    const req = new NextRequest("http://localhost/api/passenger-app/auth/refresh", {
      method: "POST",
      headers: { Origin: "http://localhost", Cookie: "pax_refresh=stored-ref" }
    });
    const res = await POST(req, { params: Promise.resolve({ path: ["auth", "refresh"] }) });
    
    expect(res.status).toBe(401);
    const accCookie = res.cookies.get("pax_session");
    expect(accCookie?.value).toBe(""); // cleared
  });

  it("handles logout by revoking upstream then clearing cookies", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers() });
    const req = new NextRequest("http://localhost/api/passenger-app/auth/logout", {
      method: "POST",
      headers: { Origin: "http://localhost", Cookie: "pax_session=tok; pax_refresh=ref" }
    });
    const res = await POST(req, { params: Promise.resolve({ path: ["auth", "logout"] }) });
    
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/passenger-app/auth/logout"),
      expect.objectContaining({
        headers: expect.any(Headers) // Should contain auth header for session
      })
    );
    const accCookie = res.cookies.get("pax_session");
    expect(accCookie?.value).toBe(""); // cleared
  });
});
