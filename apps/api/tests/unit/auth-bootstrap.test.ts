import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import {
  BootstrapAuthGuard,
  InternalKeyMiddleware,
  OpenRoute,
  RequireScopes,
  extractBootstrapRequestIdentity,
  isHealthRequest,
  resolveRouteAuthPolicy,
  validateInternalKey,
} from "../../src/common/auth";
import type { AuthenticatedRequestLike } from "../../src/common/auth";

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

describe("bootstrap auth extraction", () => {
  it("returns null when protected routes receive no auth signal", () => {
    const identity = extractBootstrapRequestIdentity(
      { "x-request-id": "req-001" },
      { allowAnonymous: false },
    );

    expect(identity).toBeNull();
  });

  it("parses actor, realm, roles, and scopes from bootstrap headers", () => {
    const identity = extractBootstrapRequestIdentity(
      {
        "x-actor-type": "tenant_admin",
        "x-actor-id": "tenant-admin-001",
        "x-realm": "tenant",
        "x-tenant-id": "tenant-001",
        "x-roles": "tenant_admin, tenant_support",
        "x-scopes": "tenant:read tenant:write tenant:webhooks:write",
        "x-request-id": "req-002",
      },
      { allowAnonymous: false },
    );

    expect(identity).toEqual({
      authMode: "bootstrap_headers",
      actorType: "tenant_admin",
      actorId: "tenant-admin-001",
      realm: "tenant",
      tenantId: "tenant-001",
      roleFamilies: ["tenant"],
      roles: ["tenant_admin", "tenant_support"],
      scopes: ["tenant:read", "tenant:write", "tenant:webhooks:write"],
      requestId: "req-002",
    });
  });

  it("resolves a meaningful policy for protected route groups", () => {
    const policy = resolveRouteAuthPolicy("POST", "/api/tenant/webhooks");

    expect(policy).toEqual({
      routeKey: "tenant:webhooks:POST",
      requiredScopes: ["tenant:webhooks:write"],
      allowedRealms: ["system", "platform", "tenant"],
      description: "Tenant webhook administration",
    });
  });

  it("resolves platform-admin routes to platform-scoped foundation access", () => {
    const policy = resolveRouteAuthPolicy(
      "POST",
      "/api/platform-admin/public-info",
    );

    expect(policy).toEqual({
      routeKey: "platform-admin:POST",
      requiredScopes: ["foundation:write"],
      allowedRealms: ["system", "platform"],
      description: "Platform admin master-data management",
    });
  });
});

describe("bootstrap auth guard", () => {
  it("honors OpenRoute metadata for public endpoints", () => {
    const guard = new BootstrapAuthGuard(new Reflector());
    const request: AuthenticatedRequestLike = {
      headers: {},
      method: "GET",
      originalUrl: "/api/identity/context",
    };
    class PublicHandler {
      handler() {}
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      PublicHandler.prototype,
      "handler",
    );
    expect(descriptor).toBeDefined();
    if (!descriptor) {
      throw new Error("expected descriptor");
    }
    OpenRoute()(PublicHandler.prototype, "handler", descriptor);

    const context = createExecutionContext(
      request,
      PublicHandler.prototype.handler,
      PublicHandler,
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it("rejects decorator-scoped endpoints when scopes are missing", () => {
    const guard = new BootstrapAuthGuard(new Reflector());
    const request: AuthenticatedRequestLike = {
      headers: {
        "x-actor-type": "platform_admin",
        "x-actor-id": "platform-admin-001",
        "x-realm": "platform",
        "x-scopes": "audit:read",
      },
      method: "POST",
      originalUrl: "/api/unmatched-route",
    };
    class ScopedHandler {
      handler() {}
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      ScopedHandler.prototype,
      "handler",
    );
    expect(descriptor).toBeDefined();
    if (!descriptor) {
      throw new Error("expected descriptor");
    }
    RequireScopes("tenant:write")(
      ScopedHandler.prototype,
      "handler",
      descriptor,
    );

    const context = createExecutionContext(
      request,
      ScopedHandler.prototype.handler,
      ScopedHandler,
    );

    expect(() => guard.canActivate(context)).toThrowError(ApiRequestError);
  });

  it("allows protected endpoints when the bootstrap identity has matching scopes", () => {
    const guard = new BootstrapAuthGuard(new Reflector());
    const request: AuthenticatedRequestLike = {
      headers: {
        "x-actor-type": "tenant_admin",
        "x-actor-id": "tenant-admin-001",
        "x-realm": "tenant",
        "x-scopes": "tenant:webhooks:write tenant:read",
      },
      method: "POST",
      originalUrl: "/api/unmatched-route",
    };
    class ScopedHandler {
      handler() {}
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      ScopedHandler.prototype,
      "handler",
    );
    expect(descriptor).toBeDefined();
    if (!descriptor) {
      throw new Error("expected descriptor");
    }
    RequireScopes("tenant:webhooks:write")(
      ScopedHandler.prototype,
      "handler",
      descriptor,
    );

    const context = createExecutionContext(
      request,
      ScopedHandler.prototype.handler,
      ScopedHandler,
    );

    expect(guard.canActivate(context)).toBe(true);
    expect(request.identity?.actorType).toBe("tenant_admin");
    expect(request.identity?.scopes).toContain("tenant:webhooks:write");
  });
});

describe("internal key middleware", () => {
  it("skips enforcement when DRTS_INTERNAL_KEY is not configured", () => {
    expect(() =>
      validateInternalKey(
        {
          headers: {},
          originalUrl: "/api/tenant/webhooks",
          method: "POST",
        },
        "",
      ),
    ).not.toThrow();
  });

  it("allows health endpoints without the internal key", () => {
    expect(isHealthRequest("/health")).toBe(true);
    expect(isHealthRequest("/api/health?probe=1")).toBe(true);
    expect(() =>
      validateInternalKey(
        {
          headers: {},
          originalUrl: "/api/health?probe=1",
          method: "GET",
        },
        "staging-secret",
      ),
    ).not.toThrow();
  });

  it("allows browser preflight requests without the internal key", () => {
    expect(() =>
      validateInternalKey(
        {
          headers: {},
          method: "OPTIONS",
          originalUrl: "/api/tenant/webhooks",
        },
        "staging-secret",
      ),
    ).not.toThrow();
  });

  it("allows protected routes for non-system bootstrap realms without the internal key", () => {
    expect(() =>
      validateInternalKey(
        {
          headers: {
            "x-realm": "tenant",
          },
          method: "POST",
          originalUrl: "/api/tenant/webhooks",
        },
        "staging-secret",
      ),
    ).not.toThrow();
  });

  it("allows open routes without the internal key", () => {
    expect(() =>
      validateInternalKey(
        {
          headers: {},
          method: "GET",
          originalUrl: "/api/identity/context",
        },
        "staging-secret",
      ),
    ).not.toThrow();
  });

  it("rejects system-scoped protected routes when the internal key header is missing", () => {
    expect(() =>
      validateInternalKey(
        {
          headers: {
            "x-realm": "system",
          },
          method: "POST",
          originalUrl: "/api/tenant/webhooks",
        },
        "staging-secret",
      ),
    ).toThrowError(ApiRequestError);
  });

  it("rejects protected routes when the internal key header is invalid", () => {
    expect(() =>
      validateInternalKey(
        {
          headers: {
            "x-realm": "system",
            "x-drts-internal-key": "wrong-secret",
          },
          method: "POST",
          originalUrl: "/api/tenant/webhooks",
        },
        "staging-secret",
      ),
    ).toThrowError(ApiRequestError);
  });

  it("allows protected routes when the internal key header matches", () => {
    expect(() =>
      validateInternalKey(
        {
          headers: {
            "x-realm": "system",
            "x-drts-internal-key": "staging-secret",
          },
          method: "POST",
          originalUrl: "/api/tenant/webhooks",
        },
        "staging-secret",
      ),
    ).not.toThrow();
  });

  it("invokes next() after successful validation", () => {
    const middleware = new InternalKeyMiddleware();
    const next = vi.fn();

    const originalKey = process.env.DRTS_INTERNAL_KEY;
    process.env.DRTS_INTERNAL_KEY = "staging-secret";
    try {
      middleware.use(
        {
          headers: {
            "x-realm": "system",
            "x-drts-internal-key": "staging-secret",
          },
          method: "POST",
          originalUrl: "/api/tenant/webhooks",
        },
        {},
        next,
      );
    } finally {
      if (originalKey === undefined) {
        delete process.env.DRTS_INTERNAL_KEY;
      } else {
        process.env.DRTS_INTERNAL_KEY = originalKey;
      }
    }

    expect(next).toHaveBeenCalledOnce();
  });
});
