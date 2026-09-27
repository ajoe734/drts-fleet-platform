import { describe, expect, it } from "vitest";
import { issueControlPlaneRequestAuth } from "../../../../packages/control-plane-auth/src/index";
import jwt from "jsonwebtoken";

describe("SR-PARTNER-NOTIFY-FIX-ADMIN-20260927 tenant auth proxy authority", () => {
  it("injects assumeTenantId as x-tenant-id in bootstrap mode", () => {
    const auth = issueControlPlaneRequestAuth({
      actorType: "platform_admin",
      headers: {
        "x-goog-authenticated-user-email": "accounts.google.com:admin@platform.drts",
      },
      assumeTenantId: "t-test-tenant-id",
    });

    expect(auth.headers["x-tenant-id"]).toBe("t-test-tenant-id");
    expect(auth.identity.tenantId).toBe("t-test-tenant-id");
  });

  it("injects assumeTenantId as x-tenant-id in JWT mode", () => {
    const auth = issueControlPlaneRequestAuth({
      actorType: "platform_admin",
      headers: {
        "x-goog-authenticated-user-email": "accounts.google.com:admin@platform.drts",
      },
      jwtSecret: "test-secret-123",
      assumeTenantId: "t-test-tenant-id",
    });

    expect(auth.headers["x-tenant-id"]).toBe("t-test-tenant-id");
    expect(auth.identity.tenantId).toBe("t-test-tenant-id");

    const token = auth.headers["x-drts-authorization"].replace("Bearer ", "");
    const decoded = jwt.verify(token, "test-secret-123") as any;
    expect(decoded.tenantId).toBe("t-test-tenant-id");
  });

  it("fails when IAP assertion is forged or unverified in strict mode", () => {
    expect(() => {
      issueControlPlaneRequestAuth({
        actorType: "platform_admin",
        headers: {
          "x-goog-iap-jwt-assertion": "fake.jwt.token",
        },
        strictIapMode: true,
        jwtSecret: "test-secret-123",
        assumeTenantId: "t-test-tenant-id",
      });
    }).toThrow(/verification failed/);
  });

  it("fails when no verified user email is available in strict mode", () => {
    expect(() => {
      issueControlPlaneRequestAuth({
        actorType: "platform_admin",
        headers: {},
        strictIapMode: true,
        jwtSecret: "test-secret-123",
        assumeTenantId: "t-test-tenant-id",
      });
    }).toThrow(/requires a valid x-goog-iap-jwt-assertion header/);
  });
});
