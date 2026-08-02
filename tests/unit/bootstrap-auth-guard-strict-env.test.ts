import { afterEach, describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { BootstrapAuthGuard } from "../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("BootstrapAuthGuard strict environment behavior", () => {
  it("rejects bootstrap identity headers in staging", async () => {
    process.env.APP_ENV = "staging";

    const guard = new BootstrapAuthGuard(
      { getAllAndOverride: () => undefined } as never,
      new JwtAuthService(),
    );
    const request: any = {
      headers: {
        "x-actor-type": "platform_admin",
        "x-actor-id": "spoofed-admin",
        "x-realm": "platform",
      },
      method: "GET",
      url: "/api/platform-admin/tenants",
    };
    const context: any = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    };

    let error: ApiRequestError | null = null;
    try {
      await guard.canActivate(context);
    } catch (caught) {
      error = caught as ApiRequestError;
    }

    expect(error?.code).toBe("AUTH_BOOTSTRAP_HEADERS_FORBIDDEN");
  });
});
