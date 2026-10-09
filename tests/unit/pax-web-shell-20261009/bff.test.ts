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

  it("adds security headers", async () => {
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
});
