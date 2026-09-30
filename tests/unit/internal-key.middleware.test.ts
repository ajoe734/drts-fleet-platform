import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import {
  InternalKeyMiddleware,
  validateInternalKey,
} from "../../apps/api/src/common/auth/internal-key.middleware";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("validateInternalKey strict environment behavior", () => {
  it("fails closed for bootstrap-header direct paths in staging", async () => {
    process.env.APP_ENV = "staging";
    process.env.DRTS_INTERNAL_KEY = "12345678901234567890123456789012";

    let error: ApiRequestError | null = null;
    try {
      await validateInternalKey(
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

  it("continues to allow bearer-authenticated requests without internal key", async () => {
    process.env.APP_ENV = "staging";
    process.env.DRTS_INTERNAL_KEY = "12345678901234567890123456789012";

    await expect(
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
    ).resolves.not.toThrow();
  });

  it("does not treat a workload assertion header as a direct internal-key bypass", async () => {
    process.env.APP_ENV = "staging";
    delete process.env.DRTS_INTERNAL_KEY;

    let error: ApiRequestError | null = null;
    try {
      await validateInternalKey(
        {
          method: "POST",
          originalUrl: "/api/auth/token",
          headers: {
            "x-drts-workload-assertion": "signed.workload.assertion",
          },
        },
        process.env.DRTS_INTERNAL_KEY,
      );
    } catch (caught) {
      error = caught as ApiRequestError;
    }

    expect(error?.code).toBe("INTERNAL_KEY_NOT_CONFIGURED");
  });

  it("does not bypass internal key enforcement for non-token routes that carry a workload assertion header", async () => {
    process.env.APP_ENV = "staging";
    process.env.DRTS_INTERNAL_KEY = "12345678901234567890123456789012";

    let error: ApiRequestError | null = null;
    try {
      await validateInternalKey(
        {
          method: "GET",
          originalUrl: "/api/platform-admin/tenants",
          headers: {
            "x-drts-workload-assertion": "signed.workload.assertion",
          },
        },
        process.env.DRTS_INTERNAL_KEY,
      );
    } catch (caught) {
      error = caught as ApiRequestError;
    }

    expect(error?.code).toBe("INTERNAL_KEY_REQUIRED");
  });

  it("middleware still fails closed in staging even when enforcement flag is false", async () => {
    process.env.APP_ENV = "staging";
    process.env.DRTS_INTERNAL_KEY_ENFORCED = "false";
    process.env.DRTS_INTERNAL_KEY = "12345678901234567890123456789012";

    const middleware = new InternalKeyMiddleware();
    const next = vi.fn();

    await expect(
      middleware.use(
        {
          method: "GET",
          originalUrl: "/api/platform-admin/tenants",
          headers: {
            "x-actor-type": "platform_admin",
            "x-actor-id": "spoofed-admin",
            "x-realm": "platform",
          },
        },
        {},
        next,
      ),
    ).rejects.toThrowError(ApiRequestError);
    expect(next).not.toHaveBeenCalled();
  });

  it("middleware allows local requests when DRTS_ENV=development disables enforcement", async () => {
    process.env.NODE_ENV = "production";
    process.env.DRTS_ENV = "development";
    process.env.DRTS_INTERNAL_KEY_ENFORCED = "false";
    delete process.env.DRTS_INTERNAL_KEY;

    const middleware = new InternalKeyMiddleware();
    const next = vi.fn();

    await expect(
      middleware.use(
        {
          method: "GET",
          originalUrl: "/api/platform-admin/tenants",
          headers: {
            "x-actor-type": "platform_admin",
            "x-actor-id": "local-admin",
            "x-realm": "platform",
          },
        },
        {},
        next,
      ),
    ).resolves.not.toThrow();
    expect(next).toHaveBeenCalledOnce();
  });

  it("middleware bypasses local enforcement when DRTS_ENV=development sets flag false even with mounted key", async () => {
    process.env.NODE_ENV = "production";
    process.env.DRTS_ENV = "development";
    process.env.DRTS_INTERNAL_KEY_ENFORCED = "false";
    process.env.DRTS_INTERNAL_KEY = "12345678901234567890123456789012";

    const middleware = new InternalKeyMiddleware();
    const next = vi.fn();

    await expect(
      middleware.use(
        {
          method: "GET",
          originalUrl: "/api/platform-admin/tenants",
          headers: {
            "x-actor-type": "platform_admin",
            "x-actor-id": "local-admin",
            "x-realm": "platform",
          },
        },
        {},
        next,
      ),
    ).resolves.not.toThrow();
    expect(next).toHaveBeenCalledOnce();
  });

  it("still requires an internal key for token exchange when Dev middleware enforcement is disabled", async () => {
    process.env.NODE_ENV = "production";
    process.env.DRTS_ENV = "development";
    process.env.DRTS_INTERNAL_KEY_ENFORCED = "false";
    process.env.DRTS_INTERNAL_KEY = "12345678901234567890123456789012";

    await expect(
      validateInternalKey(
        {
          method: "POST",
          originalUrl: "/api/auth/token",
          headers: {
            "x-actor-type": "tenant_admin",
            "x-actor-id": "release-acceptance",
            "x-realm": "tenant",
          },
        },
        process.env.DRTS_INTERNAL_KEY,
      ),
    ).rejects.toThrowError(ApiRequestError);
  });
});
