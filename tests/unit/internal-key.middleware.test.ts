import { afterEach, describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { validateInternalKey } from "../../apps/api/src/common/auth/internal-key.middleware";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("validateInternalKey strict environment behavior", () => {
  it("fails closed for bootstrap-header direct paths in staging", () => {
    process.env.APP_ENV = "staging";
    process.env.DRTS_INTERNAL_KEY = "12345678901234567890123456789012";

    let error: ApiRequestError | null = null;
    try {
      validateInternalKey(
        {
          method: "GET",
          originalUrl: "/api/platform-admin/tenants",
          headers: {
            "x-actor-type": "platform_admin",
            "x-actor-id": "spoofed-admin",
            "x-realm": "platform",
          },
        },
        process.env.DRTS_INTERNAL_KEY,
      );
    } catch (caught) {
      error = caught as ApiRequestError;
    }

    expect(error?.code).toBe("INTERNAL_KEY_REQUIRED");
  });

  it("continues to allow bearer-authenticated requests without internal key", () => {
    process.env.APP_ENV = "staging";
    process.env.DRTS_INTERNAL_KEY = "12345678901234567890123456789012";

    expect(() =>
      validateInternalKey(
        {
          method: "GET",
          originalUrl: "/api/platform-admin/tenants",
          headers: {
            authorization: "Bearer verified.jwt.token",
          },
        },
        process.env.DRTS_INTERNAL_KEY,
      ),
    ).not.toThrow();
  });
});
