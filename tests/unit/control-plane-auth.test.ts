import { describe, expect, it } from "vitest";

import {
  CONTROL_PLANE_REQUEST_AUTH_HEADER,
  extractAuthenticatedUserEmail,
  issueControlPlaneRequestAuth,
  signTestIapJwtAssertion,
  verifyIapJwtAssertion,
} from "../../packages/control-plane-auth/src/index";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";

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

  it("rejects unverified email headers when strictIapMode is enabled", () => {
    expect(() =>
      issueControlPlaneRequestAuth({
        actorType: "platform_admin",
        headers: {
          "x-goog-authenticated-user-email":
            "accounts.google.com:admin@platform.drts",
        },
        strictIapMode: true,
      }),
    ).toThrowError("Control-plane strict IAP mode requires a valid x-goog-iap-jwt-assertion header.");
  });

  it("extracts verified subject and email from signed IAP JWT assertion", () => {
    const testSecret = "iap_test_secret_32bytes_minimum!";
    const iapToken = signTestIapJwtAssertion(
      {
        sub: "accounts.google.com:10099",
        email: "admin@platform.drts",
        aud: "drts-iap-aud",
      },
      testSecret,
    );

    const auth = issueControlPlaneRequestAuth({
      actorType: "platform_admin",
      headers: {
        "x-goog-iap-jwt-assertion": iapToken,
      },
      strictIapMode: true,
      iapJwtSecretOrPublicKey: testSecret,
      expectedIapAudience: "drts-iap-aud",
    });

    expect(auth.identity.subject).toBe("accounts.google.com:10099");
    expect(auth.authenticatedUserEmail).toBe("admin@platform.drts");
    expect(auth.identity.actorId).toBe("pa-admin-001");
  });

  it("rejects assertion when JWT secret is missing and unverified dev mode is disabled", () => {
    const iapToken = signTestIapJwtAssertion(
      {
        sub: "user-123",
        email: "user@platform.drts",
      },
      "some_secret",
    );

    expect(() =>
      verifyIapJwtAssertion(iapToken, { allowUnverifiedTokenInDev: false }),
    ).toThrowError("IAP JWT assertion signature verification failed: verification key is required.");
  });

  it("rejects assertion when issuer does not match expected IAP issuer", () => {
    const testSecret = "iap_test_secret_32bytes_minimum!";
    const invalidIssuerToken = signTestIapJwtAssertion(
      {
        sub: "user-123",
        email: "user@platform.drts",
        iss: "https://evil-issuer.com",
      },
      testSecret,
    );

    expect(() =>
      verifyIapJwtAssertion(invalidIssuerToken, {
        jwtSecretOrPublicKey: testSecret,
      }),
    ).toThrowError("IAP JWT assertion issuer mismatch");
  });
});
