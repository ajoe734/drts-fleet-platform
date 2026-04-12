import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import {
  BootstrapAuthGuard,
  OpenRoute,
  RequireScopes,
  extractBootstrapRequestIdentity,
  resolveRouteAuthPolicy,
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
