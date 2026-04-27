import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { AuthController } from "../../src/modules/auth/auth.controller";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";
import {
  BootstrapAuthGuard,
  InternalKeyMiddleware,
  JwtAuthService,
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

  it("allows platform health views to read forwarder adapter health", () => {
    const policy = resolveRouteAuthPolicy(
      "GET",
      "/api/forwarder/adapters/health",
    );

    expect(policy).toEqual({
      routeKey: "forwarder:adapters:health:GET",
      requiredScopes: ["forwarder:read"],
      allowedRealms: ["system", "platform", "ops"],
      description: "Forwarder adapter health",
    });
  });

  it("resolves driver profile routes to driver-scoped self-service access", () => {
    const policy = resolveRouteAuthPolicy("PATCH", "/api/driver/profile");

    expect(policy).toEqual({
      routeKey: "driver:profile:PATCH",
      requiredScopes: ["driver:write"],
      allowedRealms: ["system", "driver"],
      description: "Driver self-service profile access",
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

  it("still resolves bearer identity on OpenRoute endpoints when a token is present", () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";

    const jwtAuthService = new JwtAuthService();
    const token = jwtAuthService.sign(
      {
        authMode: "bootstrap_headers",
        actorType: "tenant_admin",
        actorId: "tenant-admin-001",
        realm: "tenant",
        tenantId: "tenant-demo-001",
        roleFamilies: ["tenant"],
        roles: ["tenant_admin"],
        scopes: ["tenant:read"],
        requestId: "req-open-jwt-001",
      },
      { expiresIn: "10m" },
    );
    const guard = new BootstrapAuthGuard(new Reflector(), jwtAuthService);
    const request: AuthenticatedRequestLike = {
      headers: {
        authorization: `Bearer ${token}`,
      },
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
    expect(request.identity).toMatchObject({
      authMode: "jwt_bearer",
      actorId: "tenant-admin-001",
      tenantId: "tenant-demo-001",
    });

    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
  });

  it("prefers x-drts-authorization for app JWTs when outer authorization is used elsewhere", () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";

    const jwtAuthService = new JwtAuthService();
    const token = jwtAuthService.sign(
      {
        authMode: "jwt_bearer",
        actorType: "platform_admin",
        actorId: "platform-admin-001",
        realm: "platform",
        tenantId: null,
        roleFamilies: ["platform"],
        roles: ["platform_admin"],
        scopes: ["foundation:read", "foundation:write"],
        requestId: "req-open-jwt-002",
      },
      { expiresIn: "10m" },
    );
    const guard = new BootstrapAuthGuard(new Reflector(), jwtAuthService);
    const request: AuthenticatedRequestLike = {
      headers: {
        authorization: "Bearer outer-iap-token",
        "x-drts-authorization": `Bearer ${token}`,
      },
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
    expect(request.identity).toMatchObject({
      authMode: "jwt_bearer",
      actorId: "platform-admin-001",
      realm: "platform",
    });

    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
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

  it("accepts SSE bootstrap identity from query params on ops dispatch streams", () => {
    const guard = new BootstrapAuthGuard(new Reflector());
    const request: AuthenticatedRequestLike = {
      headers: {},
      method: "GET",
      originalUrl:
        "/api/ops/dispatch-events?actorType=ops_user&actorId=ops-007&realm=ops",
      query: {
        actorType: "ops_user",
        actorId: "ops-007",
        realm: "ops",
      },
    };

    const context = createExecutionContext(request);

    expect(guard.canActivate(context)).toBe(true);
    expect(request.identity).toMatchObject({
      actorType: "ops_user",
      actorId: "ops-007",
      realm: "ops",
    });
    expect(request.identity?.scopes).toContain("dispatch:read");
  });

  it("accepts verified bearer tokens and marks authMode as jwt_bearer", () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";

    const jwtAuthService = new JwtAuthService();
    const token = jwtAuthService.sign(
      {
        authMode: "bootstrap_headers",
        actorType: "platform_admin",
        actorId: "platform-admin-001",
        realm: "platform",
        tenantId: null,
        roleFamilies: ["platform"],
        roles: ["platform_admin"],
        scopes: ["foundation:write"],
        requestId: "req-jwt-001",
      },
      { expiresIn: "10m" },
    );
    const guard = new BootstrapAuthGuard(new Reflector(), jwtAuthService);
    const request: AuthenticatedRequestLike = {
      headers: {
        authorization: `Bearer ${token}`,
      },
      method: "POST",
      originalUrl: "/api/platform-admin/public-info",
    };

    const context = createExecutionContext(request);

    expect(guard.canActivate(context)).toBe(true);
    expect(request.identity).toMatchObject({
      authMode: "jwt_bearer",
      actorType: "platform_admin",
      actorId: "platform-admin-001",
      realm: "platform",
    });

    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
  });

  it("accepts bearer tokens even when issuer and audience are not configured", () => {
    process.env.JWT_SECRET = "test-secret";
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;

    const jwtAuthService = new JwtAuthService();
    const token = jwtAuthService.sign(
      {
        authMode: "bootstrap_headers",
        actorType: "tenant_admin",
        actorId: "tenant-admin-001",
        realm: "tenant",
        tenantId: "tenant-demo-001",
        roleFamilies: ["tenant"],
        roles: ["tenant_admin"],
        scopes: ["tenant:read"],
        requestId: "req-jwt-no-claims-001",
      },
      { expiresIn: "10m" },
    );
    const guard = new BootstrapAuthGuard(new Reflector(), jwtAuthService);
    const request: AuthenticatedRequestLike = {
      headers: {
        authorization: `Bearer ${token}`,
      },
      method: "GET",
      originalUrl: "/api/identity/context",
    };

    const context = createExecutionContext(request);

    expect(guard.canActivate(context)).toBe(true);
    expect(request.identity).toMatchObject({
      authMode: "jwt_bearer",
      actorId: "tenant-admin-001",
      tenantId: "tenant-demo-001",
    });

    delete process.env.JWT_SECRET;
  });

  it("rejects bearer tokens with the wrong audience", () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";

    const signingService = new JwtAuthService();
    delete process.env.JWT_AUDIENCE;
    process.env.JWT_AUDIENCE = "wrong-audience";
    const wrongAudienceToken = signingService.sign(
      {
        authMode: "bootstrap_headers",
        actorType: "platform_admin",
        actorId: "platform-admin-001",
        realm: "platform",
        tenantId: null,
        roleFamilies: ["platform"],
        roles: ["platform_admin"],
        scopes: ["foundation:write"],
        requestId: "req-jwt-002",
      },
      { expiresIn: "10m" },
    );
    process.env.JWT_AUDIENCE = "drts-api";

    const guard = new BootstrapAuthGuard(new Reflector(), new JwtAuthService());
    const request: AuthenticatedRequestLike = {
      headers: {
        authorization: `Bearer ${wrongAudienceToken}`,
      },
      method: "POST",
      originalUrl: "/api/platform-admin/public-info",
    };

    const context = createExecutionContext(request);

    expect(() => guard.canActivate(context)).toThrowError(ApiRequestError);

    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
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

  it("allows protected routes for validated non-system bootstrap identities without the internal key", () => {
    expect(() =>
      validateInternalKey(
        {
          headers: {
            "x-actor-type": "tenant_admin",
            "x-actor-id": "tenant-admin-001",
            "x-realm": "tenant",
          },
          method: "POST",
          originalUrl: "/api/tenant/webhooks",
        },
        "staging-secret",
      ),
    ).not.toThrow();
  });

  it("rejects x-realm-only requests that do not provide a validated bootstrap identity", () => {
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
    ).toThrowError(ApiRequestError);
  });

  it("allows explicit public routes without the internal key", () => {
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

  it("allows public tenant role-catalog reads without the internal key", () => {
    expect(() =>
      validateInternalKey(
        {
          headers: {},
          method: "GET",
          originalUrl: "/api/tenant/roles",
        },
        "staging-secret",
      ),
    ).not.toThrow();
  });

  it("allows tenant bootstrap-session issuance without the internal key", () => {
    expect(() =>
      validateInternalKey(
        {
          headers: {},
          method: "POST",
          originalUrl: "/api/auth/tenant/bootstrap-session",
        },
        "staging-secret",
      ),
    ).not.toThrow();
  });

  it("allows bearer-authenticated tenant routes without the internal key", () => {
    expect(() =>
      validateInternalKey(
        {
          headers: {
            authorization: "Bearer session-token-001",
          },
          method: "GET",
          originalUrl: "/api/tenant/passengers",
        },
        "staging-secret",
      ),
    ).not.toThrow();
  });

  it("rejects uncovered admin routes without the internal key", () => {
    expect(() =>
      validateInternalKey(
        {
          headers: {},
          method: "GET",
          originalUrl: "/api/admin/flags",
        },
        "staging-secret",
      ),
    ).toThrowError(ApiRequestError);
  });

  it("rejects uncovered driver-settings routes without the internal key", () => {
    expect(() =>
      validateInternalKey(
        {
          headers: {},
          method: "PATCH",
          originalUrl: "/api/driver-settings/drv-001",
        },
        "staging-secret",
      ),
    ).toThrowError(ApiRequestError);
  });

  it("allows uncovered driver-settings routes for non-system bootstrap realms", () => {
    expect(() =>
      validateInternalKey(
        {
          headers: {
            "x-actor-type": "driver_user",
            "x-actor-id": "driver-001",
            "x-realm": "driver",
          },
          method: "PATCH",
          originalUrl: "/api/driver-settings/drv-001",
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

describe("tenant bootstrap-session auth controller", () => {
  it("issues a bearer session envelope for tenant portal login", () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";

    const jwtAuthService = new JwtAuthService();
    const controller = new AuthController(
      jwtAuthService,
      new TenantPartnerService(new AuditNotificationService()),
    );

    const response = controller.issueTenantBootstrapSession(
      {
        email: "ops@acme.example",
      },
      "req-tenant-bootstrap-001",
    );

    expect(response.data).toMatchObject({
      tokenType: "Bearer",
      expiresIn: "8h",
      profile: {
        email: "ops@acme.example",
        roleCode: "tenant_ops_admin",
        tenantId: "tenant-demo-001",
      },
      identity: {
        actorType: "tenant_admin",
        authMode: "jwt_bearer",
        realm: "tenant",
        roles: ["tenant_ops_admin"],
        scopes: expect.arrayContaining([
          "tenant:write",
          "tenant:webhooks:write",
        ]),
        tenantId: "tenant-demo-001",
      },
    });
    expect(response.data.accessToken).toMatch(/\S+/);
    const verifiedPayload = jwtAuthService.verify(response.data.accessToken);
    expect(verifiedPayload).toMatchObject({
      sub: response.data.profile.id,
      actorType: "tenant_admin",
      realm: "tenant",
      tenantId: "tenant-demo-001",
      roles: ["tenant_ops_admin"],
      scopes: expect.arrayContaining(["tenant:write", "tenant:webhooks:write"]),
    });
    expect(
      verifiedPayload &&
        jwtAuthService.toRequestIdentity(verifiedPayload).authMode,
    ).toBe("jwt_bearer");

    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
  });

  it("prefers the server-side tenant user record when the email already exists", () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";

    const controller = new AuthController(
      new JwtAuthService(),
      new TenantPartnerService(new AuditNotificationService()),
    );

    const response = controller.issueTenantBootstrapSession(
      {
        email: "admin@acme.example",
      },
      "req-tenant-bootstrap-002",
    );

    expect(response.data.profile).toMatchObject({
      id: "tenant-user-demo-001",
      fullName: "Acme Tenant Admin",
      email: "admin@acme.example",
      roleCode: "tenant_admin",
      tenantId: "tenant-demo-001",
    });

    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
  });

  it("still issues a tenant bearer session when issuer and audience are unset", () => {
    process.env.JWT_SECRET = "test-secret";
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;

    const controller = new AuthController(
      new JwtAuthService(),
      new TenantPartnerService(new AuditNotificationService()),
    );

    const response = controller.issueTenantBootstrapSession(
      {
        email: "viewer@acme.example",
      },
      "req-tenant-bootstrap-003",
    );

    expect(response.data).toMatchObject({
      tokenType: "Bearer",
      profile: {
        email: "viewer@acme.example",
        roleCode: "tenant_viewer",
        tenantId: "tenant-demo-001",
      },
      identity: {
        roles: ["tenant_viewer"],
        scopes: expect.arrayContaining(["tenant:read", "reports:read"]),
      },
    });
    expect(response.data.accessToken).toMatch(/\S+/);

    delete process.env.JWT_SECRET;
  });

  it("rejects bootstrap session issuance for emails without an invited tenant user", () => {
    process.env.JWT_SECRET = "test-secret";

    const controller = new AuthController(
      new JwtAuthService(),
      new TenantPartnerService(new AuditNotificationService()),
    );

    try {
      controller.issueTenantBootstrapSession(
        {
          email: "unknown@acme.example",
        },
        "req-tenant-bootstrap-004",
      );
      throw new Error("Expected tenant bootstrap session issuance to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      const apiError = error as ApiRequestError;
      expect(apiError.getStatus()).toBe(403);
      expect(apiError.getResponse()).toMatchObject({
        error: {
          code: "TENANT_USER_NOT_INVITED",
          message: "No active tenant user was found for this email.",
        },
      });
    }

    delete process.env.JWT_SECRET;
  });
});
