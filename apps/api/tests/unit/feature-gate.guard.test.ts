import type { AddressInfo } from "node:net";

import { Controller, Get, Module } from "@nestjs/common";
import { APP_GUARD, NestFactory, Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { FeatureGated, FeatureGateGuard } from "../../src/common/auth";
import type { AuthenticatedRequestLike } from "../../src/common/auth";
import { FeatureFlagsService } from "../../src/modules/feature-flags/feature-flags.service";

@Controller("feature-gate-test")
class FeatureGateTestController {
  @Get("open")
  getOpenRoute() {
    return {
      route: "open",
    };
  }

  @FeatureGated("grab_taiwan_integration")
  @Get("decorated")
  getDecoratedRoute() {
    return {
      route: "decorated",
    };
  }
}

function createExecutionContext(
  request: AuthenticatedRequestLike,
  handler: () => void = function handler() {},
  target: abstract new () => unknown = class GuardTarget {},
) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => handler,
    getClass: () => target,
  } as never;
}

function createFeatureFlagsServiceMock() {
  return {
    isEnabled: vi.fn(),
  } as unknown as Pick<FeatureFlagsService, "isEnabled">;
}

async function createFeatureGateTestApp(
  featureFlagsService: Pick<FeatureFlagsService, "isEnabled">,
) {
  @Module({
    controllers: [FeatureGateTestController],
    providers: [
      {
        provide: FeatureFlagsService,
        useValue: featureFlagsService,
      },
      {
        provide: APP_GUARD,
        useClass: FeatureGateGuard,
      },
    ],
  })
  class FeatureGateTestModule {}

  const app = await NestFactory.create(FeatureGateTestModule, {
    logger: false,
  });
  await app.listen(0, "127.0.0.1");

  const address = app.getHttpServer().address() as AddressInfo | null;
  if (!address) {
    throw new Error("expected test server address");
  }

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

describe("feature gate guard", () => {
  it("allows undecorated routes without checking feature flags", async () => {
    const featureFlagsService = createFeatureFlagsServiceMock();
    const guard = new FeatureGateGuard(
      new Reflector(),
      featureFlagsService as FeatureFlagsService,
    );
    const request: AuthenticatedRequestLike = {
      headers: {},
      method: "GET",
      originalUrl: "/api/health",
    };

    await expect(
      guard.canActivate(createExecutionContext(request)),
    ).resolves.toBe(true);
    expect(featureFlagsService.isEnabled).not.toHaveBeenCalled();
  });

  it("allows decorated routes when the feature flag is enabled", async () => {
    const featureFlagsService = createFeatureFlagsServiceMock();
    featureFlagsService.isEnabled = vi.fn().mockResolvedValue(true);
    const guard = new FeatureGateGuard(
      new Reflector(),
      featureFlagsService as FeatureFlagsService,
    );
    const request: AuthenticatedRequestLike = {
      headers: {
        "x-tenant-id": "tenant-header-001",
      },
      method: "POST",
      originalUrl: "/api/forwarder/jobs",
      identity: {
        authMode: "bootstrap_headers",
        actorType: "tenant_admin",
        actorId: "tenant-admin-001",
        realm: "tenant",
        tenantId: "tenant-identity-001",
        roleFamilies: ["tenant"],
        roles: ["tenant_admin"],
        scopes: ["forwarder:write"],
        requestId: "req-flag-enabled",
      },
    };
    class GuardedHandler {
      handler() {}
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      GuardedHandler.prototype,
      "handler",
    );
    expect(descriptor).toBeDefined();
    if (!descriptor) {
      throw new Error("expected descriptor");
    }
    FeatureGated("grab_taiwan_integration")(
      GuardedHandler.prototype,
      "handler",
      descriptor,
    );

    await expect(
      guard.canActivate(
        createExecutionContext(
          request,
          GuardedHandler.prototype.handler,
          GuardedHandler,
        ),
      ),
    ).resolves.toBe(true);
    expect(featureFlagsService.isEnabled).toHaveBeenCalledWith(
      "grab_taiwan_integration",
      "tenant-identity-001",
    );
  });

  it("falls back to x-tenant-id header when auth has not populated request identity", async () => {
    const featureFlagsService = createFeatureFlagsServiceMock();
    featureFlagsService.isEnabled = vi.fn().mockResolvedValue(true);
    const guard = new FeatureGateGuard(
      new Reflector(),
      featureFlagsService as FeatureFlagsService,
    );
    const request: AuthenticatedRequestLike = {
      headers: {
        "x-tenant-id": "tenant-header-001",
      },
      method: "GET",
      originalUrl: "/api/admin/flags/grab_taiwan_integration/enabled",
    };
    class GuardedHandler {
      handler() {}
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      GuardedHandler.prototype,
      "handler",
    );
    expect(descriptor).toBeDefined();
    if (!descriptor) {
      throw new Error("expected descriptor");
    }
    FeatureGated("tenant-portal.billing")(
      GuardedHandler.prototype,
      "handler",
      descriptor,
    );

    await expect(
      guard.canActivate(
        createExecutionContext(
          request,
          GuardedHandler.prototype.handler,
          GuardedHandler,
        ),
      ),
    ).resolves.toBe(true);
    expect(featureFlagsService.isEnabled).toHaveBeenCalledWith(
      "tenant-portal.billing",
      "tenant-header-001",
    );
  });

  it("rejects decorated routes when the feature flag is disabled", async () => {
    const featureFlagsService = createFeatureFlagsServiceMock();
    featureFlagsService.isEnabled = vi.fn().mockResolvedValue(false);
    const guard = new FeatureGateGuard(
      new Reflector(),
      featureFlagsService as FeatureFlagsService,
    );
    const request: AuthenticatedRequestLike = {
      headers: {
        "x-tenant-id": "tenant-header-001",
      },
      method: "POST",
      originalUrl: "/api/forwarder/webhooks/grab-taiwan",
    };
    class GuardedHandler {
      handler() {}
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      GuardedHandler.prototype,
      "handler",
    );
    expect(descriptor).toBeDefined();
    if (!descriptor) {
      throw new Error("expected descriptor");
    }
    FeatureGated("grab_taiwan_integration")(
      GuardedHandler.prototype,
      "handler",
      descriptor,
    );

    const error = await guard
      .canActivate(
        createExecutionContext(
          request,
          GuardedHandler.prototype.handler,
          GuardedHandler,
        ),
      )
      .catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(ApiRequestError);
    const response = (error as ApiRequestError).getResponse() as {
      error: {
        code: string;
        details?: Record<string, unknown>;
      };
    };

    expect(response.error.code).toBe("FEATURE_FLAG_DISABLED");
    expect(response.error.details).toMatchObject({
      flagKey: "grab_taiwan_integration",
      route: "/api/forwarder/webhooks/grab-taiwan",
      tenantId: "tenant-header-001",
    });
  });

  it("allows decorated routes through the request pipeline when the feature flag is enabled", async () => {
    const featureFlagsService = createFeatureFlagsServiceMock();
    featureFlagsService.isEnabled = vi.fn().mockResolvedValue(true);
    const { app, baseUrl } = await createFeatureGateTestApp(
      featureFlagsService as FeatureFlagsService,
    );

    try {
      const response = await fetch(`${baseUrl}/feature-gate-test/decorated`, {
        headers: {
          "x-tenant-id": "tenant-http-001",
        },
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        route: "decorated",
      });
      expect(featureFlagsService.isEnabled).toHaveBeenCalledWith(
        "grab_taiwan_integration",
        "tenant-http-001",
      );
    } finally {
      await app.close();
    }
  });

  it("rejects decorated routes through the request pipeline when the feature flag is disabled", async () => {
    const featureFlagsService = createFeatureFlagsServiceMock();
    featureFlagsService.isEnabled = vi.fn().mockResolvedValue(false);
    const { app, baseUrl } = await createFeatureGateTestApp(
      featureFlagsService as FeatureFlagsService,
    );

    try {
      const response = await fetch(`${baseUrl}/feature-gate-test/decorated`, {
        headers: {
          "x-tenant-id": "tenant-http-002",
        },
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "FEATURE_FLAG_DISABLED",
          details: {
            flagKey: "grab_taiwan_integration",
            route: "/feature-gate-test/decorated",
            tenantId: "tenant-http-002",
          },
        },
      });
    } finally {
      await app.close();
    }
  });

  it("leaves undecorated routes untouched in the request pipeline", async () => {
    const featureFlagsService = createFeatureFlagsServiceMock();
    const { app, baseUrl } = await createFeatureGateTestApp(
      featureFlagsService as FeatureFlagsService,
    );

    try {
      const response = await fetch(`${baseUrl}/feature-gate-test/open`);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        route: "open",
      });
      expect(featureFlagsService.isEnabled).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
