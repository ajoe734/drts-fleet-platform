import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CONTROL_PLANE_REQUEST_AUTH_HEADER,
  exchangeControlPlaneRequestAuth,
  extractAuthenticatedUserEmail,
  issueControlPlaneRequestAuth,
} from "../../packages/control-plane-auth/src/index";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("control-plane auth helper", () => {
  it("extracts the normalized IAP user email from request headers", () => {
    expect(
      extractAuthenticatedUserEmail({
        "x-goog-authenticated-user-email":
          "accounts.google.com:Edna@cctech-support.com",
      }),
    ).toBe("edna@cctech-support.com");
  });

  it("issues a JWT-backed control-plane auth header when JWT_SECRET is present", () => {
    process.env.JWT_SECRET = "control-plane-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";

    const auth = issueControlPlaneRequestAuth({
      actorType: "platform_admin",
      headers: {
        "x-goog-authenticated-user-email":
          "accounts.google.com:admin@platform.drts",
      },
      jwtSecret: "control-plane-secret",
      jwtIssuer: "drts-tests",
      jwtAudience: "drts-api",
      requestId: "req-control-plane-001",
    });

    const token = auth.headers[CONTROL_PLANE_REQUEST_AUTH_HEADER]?.replace(
      /^Bearer\s+/i,
      "",
    ).trim();

    expect(token).toBeTruthy();
    expect(auth.identity).toMatchObject({
      authMode: "jwt_bearer",
      actorType: "platform_admin",
      actorId: "pa-admin-001",
      realm: "platform",
      roles: ["superadmin"],
      requestId: "req-control-plane-001",
    });

    const payload = new JwtAuthService().verify(token!);

    expect(payload?.sub).toBe("pa-admin-001");
    expect(payload?.actorType).toBe("platform_admin");
    expect(payload?.realm).toBe("platform");
    expect(payload?.scopes).toContain("foundation:write");
    expect(payload?.scopes).toContain("forwarder:read");
    expect(payload?.scopes).toContain("multi_taxi_ratings:read");
    expect(payload?.scopes).toContain("multi_taxi_ratings:moderate");

    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
  });

  it("falls back to server-owned bootstrap headers when JWT_SECRET is unavailable", () => {
    const auth = issueControlPlaneRequestAuth({
      actorType: "ops_user",
      headers: {
        "x-goog-authenticated-user-email":
          "accounts.google.com:ops@cctech-support.com",
      },
    });

    expect(auth.identity).toMatchObject({
      authMode: "bootstrap_headers",
      actorType: "ops_user",
      realm: "ops",
    });
    expect(auth.headers["x-actor-type"]).toBe("ops_user");
    expect(auth.headers["x-realm"]).toBe("ops");
    expect(auth.headers[CONTROL_PLANE_REQUEST_AUTH_HEADER]).toBeUndefined();
  });

  it("exchanges a verified IAP assertion for an inner bearer token", async () => {
    process.env.JWT_SECRET = "control-plane-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";
    const exchangedToken = new JwtAuthService().sign(
      {
        authMode: "jwt_bearer",
        actorType: "platform_admin",
        actorId: "pa-admin-001",
        realm: "platform",
        tenantId: null,
        roleFamilies: ["platform"],
        roles: ["superadmin"],
        scopes: ["foundation:write"],
        requestId: "req-control-plane-002",
      },
      { expiresIn: "15m" },
    );
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: exchangedToken, expiresIn: "8h" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const auth = await exchangeControlPlaneRequestAuth({
      actorType: "platform_admin",
      headers: {
        "x-goog-authenticated-user-email":
          "accounts.google.com:admin@platform.drts",
        "x-goog-iap-jwt-assertion": "signed-iap-assertion",
      },
      exchangeUrl: "https://api.example/api/auth/token",
      internalKey: "internal-secret",
      requestId: "req-control-plane-002",
      upstreamAuthHeaders: {
        authorization: "Bearer outer-metadata-token",
      },
    });

    expect(auth.identity).toMatchObject({
      actorType: "platform_admin",
      actorId: "pa-admin-001",
      roles: ["superadmin"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("x-drts-internal-key")).toBe("internal-secret");
    expect(headers.get("x-drts-control-plane-actor-type")).toBe(
      "platform_admin",
    );
    expect(headers.get("x-goog-iap-jwt-assertion")).toBe("signed-iap-assertion");
    expect(headers.get("authorization")).toBe("Bearer outer-metadata-token");

    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
  });
});
