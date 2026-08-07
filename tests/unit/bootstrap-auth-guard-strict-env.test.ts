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

  it("keeps bootstrap headers available in development when NODE_ENV=production but DRTS_ENV=development", async () => {
    process.env.NODE_ENV = "production";
    process.env.DRTS_ENV = "development";

    const guard = new BootstrapAuthGuard(
      { getAllAndOverride: () => undefined } as never,
      new JwtAuthService(),
    );
    const request: any = {
      headers: {
        "x-actor-type": "platform_admin",
        "x-actor-id": "dev-admin",
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

    expect(guard.canActivate(context)).toBe(true);
    expect(request.identity?.actorId).toBe("dev-admin");
  });

  it("rejects bootstrap headers even when a verified bearer token is present in staging", async () => {
    process.env.APP_ENV = "staging";
    process.env.JWT_SECRET = "unit-test-jwt-secret";
    process.env.JWT_ISSUER = "drts";
    process.env.JWT_AUDIENCE = "drts-api";

    const jwtAuthService = new JwtAuthService();
    const token = jwtAuthService.sign({
      authMode: "jwt_bearer",
      actorType: "platform_admin",
      actorId: "platform-admin-001",
      realm: "platform",
      tenantId: null,
      roles: ["superadmin"],
      scopes: ["foundation:read"],
      roleFamilies: ["platform"],
      requestId: null,
    });
    const guard = new BootstrapAuthGuard(
      { getAllAndOverride: () => undefined } as never,
      jwtAuthService,
    );
    const request: any = {
      headers: {
        authorization: `Bearer ${token}`,
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

    expect(() => guard.canActivate(context)).toThrowError(ApiRequestError);
    try {
      guard.canActivate(context);
    } catch (error) {
      expect(error).toMatchObject({
        code: "AUTH_BOOTSTRAP_HEADERS_FORBIDDEN",
      });
    }
  });
});
