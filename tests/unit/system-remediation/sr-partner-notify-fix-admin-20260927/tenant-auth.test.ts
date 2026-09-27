import { describe, expect, it } from "vitest";
import { issueControlPlaneRequestAuth } from "../../../../packages/control-plane-auth/src/index";

describe("SR-PARTNER-NOTIFY-FIX-ADMIN-20260927 tenant auth", () => {
  it("injects assumeTenantId as x-tenant-id when provided", () => {
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
});
