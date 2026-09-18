import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  GET as proxyGet,
  POST as proxyPost,
  DELETE as proxyDelete,
} from "@/app/control-plane-proxy/[...path]/route";
import {
  TENANT_SESSION_COOKIE_NAME,
  TENANT_CSRF_COOKIE_NAME,
  TENANT_CSRF_HEADER_NAME,
} from "@/lib/auth/constants";

describe("Control Plane Proxy Invariants", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.DRTS_TENANT_CONSOLE_TENANT_ID;
  });

  function activeTenantSession(tenantId = "tenant-from-session") {
    return new Response(
      JSON.stringify({
        data: {
          active: true,
          identity: { realm: "tenant", tenant_id: tenantId },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  describe("Mutation CSRF and Same-Origin Protection", () => {
    it("rejects POST when Origin is mismatched", async () => {
      const request = new NextRequest(
        "http://localhost:3004/control-plane-proxy/tenant/bookings",
        {
          method: "POST",
          headers: {
            origin: "http://attacker.com",
            cookie: `${TENANT_SESSION_COOKIE_NAME}=sess123; ${TENANT_CSRF_COOKIE_NAME}=csrf123`,
            [TENANT_CSRF_HEADER_NAME]: "csrf123",
          },
          body: JSON.stringify({ passengerId: "p1" }),
        },
      );

      const response = await proxyPost(request, {
        params: Promise.resolve({ path: ["tenant", "bookings"] }),
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe("CSRF_ORIGIN_INVALID");
    });

    it("rejects POST when CSRF token is mismatched", async () => {
      const request = new NextRequest(
        "http://localhost:3004/control-plane-proxy/tenant/bookings",
        {
          method: "POST",
          headers: {
            origin: "http://localhost:3004",
            cookie: `${TENANT_SESSION_COOKIE_NAME}=sess123; ${TENANT_CSRF_COOKIE_NAME}=csrf123`,
            [TENANT_CSRF_HEADER_NAME]: "wrong-csrf",
          },
          body: JSON.stringify({ passengerId: "p1" }),
        },
      );

      const response = await proxyPost(request, {
        params: Promise.resolve({ path: ["tenant", "bookings"] }),
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe("CSRF_TOKEN_INVALID");
    });

    it("rejects DELETE when CSRF token is mismatched", async () => {
      const request = new NextRequest(
        "http://localhost:3004/control-plane-proxy/tenant/api-keys/k1",
        {
          method: "DELETE",
          headers: {
            origin: "http://localhost:3004",
            cookie: `${TENANT_SESSION_COOKIE_NAME}=sess123; ${TENANT_CSRF_COOKIE_NAME}=csrf123`,
          },
        },
      );

      const response = await proxyDelete(request, {
        params: Promise.resolve({ path: ["tenant", "api-keys", "k1"] }),
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe("CSRF_TOKEN_INVALID");
    });
  });

  describe("Header Stripping and Bearer Forwarding", () => {
    it("forwards Authorization: Bearer from cookie and strips bootstrap headers", async () => {
      let forwardedHeaders: Headers | null = null;

      global.fetch = vi.fn().mockImplementation(async (url, init) => {
        if (String(url).endsWith("/api/auth/session")) {
          return activeTenantSession();
        }
        forwardedHeaders = init.headers as Headers;
        return {
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          body: null,
        } as Response;
      });

      const request = new NextRequest(
        "http://localhost:3004/control-plane-proxy/tenant/bookings",
        {
          method: "GET",
          headers: {
            cookie: `${TENANT_SESSION_COOKIE_NAME}=bearer-jwt-token-456`,
            "x-actor-id": "spoofed-actor",
            "x-realm": "ops",
            "x-roles": "superadmin",
            "x-tenant-id": "other-tenant",
            "x-drts-internal-key": "fake-key",
          },
        },
      );

      const response = await proxyGet(request, {
        params: Promise.resolve({ path: ["tenant", "bookings"] }),
      });

      expect(response.status).toBe(200);
      expect(forwardedHeaders).not.toBeNull();
      expect(forwardedHeaders!.get("authorization")).toBe(
        "Bearer bearer-jwt-token-456",
      );
      expect(forwardedHeaders!.has("cookie")).toBe(false);
      expect(forwardedHeaders!.has("x-actor-id")).toBe(false);
      expect(forwardedHeaders!.has("x-realm")).toBe(false);
      expect(forwardedHeaders!.has("x-roles")).toBe(false);
      expect(forwardedHeaders!.get("x-tenant-id")).toBe("tenant-from-session");
      expect(forwardedHeaders!.has("x-drts-internal-key")).toBe(false);
    });

    it("uses the verified session tenant instead of configuration or browser input", async () => {
      process.env.DRTS_TENANT_CONSOLE_TENANT_ID =
        "10000000-0000-0000-0000-000000000299";
      let forwardedHeaders: Headers | null = null;
      global.fetch = vi.fn().mockImplementation(async (url, init) => {
        if (String(url).endsWith("/api/auth/session")) {
          return activeTenantSession("verified-session-tenant");
        }
        forwardedHeaders = init.headers as Headers;
        return { status: 200, headers: new Headers(), body: null } as Response;
      });
      const request = new NextRequest(
        "http://localhost:3004/control-plane-proxy/tenant/bookings",
        {
          method: "GET",
          headers: {
            cookie: `${TENANT_SESSION_COOKIE_NAME}=verified-token`,
            "x-tenant-id": "spoofed-tenant",
          },
        },
      );
      const response = await proxyGet(request, {
        params: Promise.resolve({ path: ["tenant", "bookings"] }),
      });
      expect(response.status).toBe(200);
      expect(forwardedHeaders!.get("x-tenant-id")).toBe(
        "verified-session-tenant",
      );
    });

    it("rejects a session that is not bound to the tenant realm", async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              active: true,
              identity: { realm: "ops", tenant_id: "spoofed-tenant" },
            },
          }),
          { status: 200 },
        ),
      );
      const request = new NextRequest(
        "http://localhost:3004/control-plane-proxy/tenant/bookings",
        {
          method: "GET",
          headers: { cookie: `${TENANT_SESSION_COOKIE_NAME}=ops-token` },
        },
      );

      const response = await proxyGet(request, {
        params: Promise.resolve({ path: ["tenant", "bookings"] }),
      });

      expect(response.status).toBe(401);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("Path Allowlist", () => {
    it("rejects unallowed non-tenant paths", async () => {
      const request = new NextRequest(
        "http://localhost:3004/control-plane-proxy/ops/dispatch",
        { method: "GET" },
      );

      const response = await proxyGet(request, {
        params: Promise.resolve({ path: ["ops", "dispatch"] }),
      });

      expect(response.status).toBe(404);
    });

    it("rejects path traversal attempts", async () => {
      const request = new NextRequest(
        "http://localhost:3004/control-plane-proxy/..%2f..%2fadmin",
        { method: "GET" },
      );

      const response = await proxyGet(request, {
        params: Promise.resolve({ path: ["..", "..", "admin"] }),
      });

      expect(response.status).toBe(404);
    });
  });
});
