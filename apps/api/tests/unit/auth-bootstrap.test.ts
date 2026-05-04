import { Reflector } from "@nestjs/core";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { AuthController } from "../../src/modules/auth/auth.controller";
import { DriverDeviceSessionService } from "../../src/modules/auth/driver-device-session.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";
import {
  AUTH_REALM_PATH_MATRIX,
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

function createAuthFixture(jwtAuthService = new JwtAuthService()) {
  const auditNotificationService = new AuditNotificationService();
  const driverProfileService = new DriverProfileService(
    auditNotificationService,
  );
  const regulatoryRegistryService = new RegulatoryRegistryService(
    new OpsDispatchEventsService(new EventEmitter2()),
    auditNotificationService,
    driverProfileService,
  );
  const tenantPartnerService = new TenantPartnerService(
    auditNotificationService,
  );
  const driverDeviceSessionService = new DriverDeviceSessionService(
    jwtAuthService,
    driverProfileService,
    regulatoryRegistryService,
  );
  const controller = new AuthController(
    jwtAuthService,
    tenantPartnerService,
    driverDeviceSessionService,
  );

  return {
    auditNotificationService,
    controller,
    driverDeviceSessionService,
    driverProfileService,
    regulatoryRegistryService,
    tenantPartnerService,
  };
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

    expect(identity).toMatchObject({
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

  it("parses partner bootstrap identity extensions from headers", () => {
    const identity = extractBootstrapRequestIdentity(
      {
        "x-actor-type": "partner_api_key",
        "x-actor-id": "partner-key-alpha-demo",
        "x-realm": "partner",
        "x-tenant-id": "tenant-demo-001",
        "x-partner-id": "partner-bank-demo-001",
        "x-partner-program-id": "program-airport-alpha",
        "x-partner-entry-slug": "bank-demo-alpha-airport",
      },
      { allowAnonymous: false },
    );

    expect(identity).toMatchObject({
      actorType: "partner_api_key",
      realm: "partner",
      tenantId: "tenant-demo-001",
      partnerId: "partner-bank-demo-001",
      partnerProgramId: "program-airport-alpha",
      partnerEntrySlug: "bank-demo-alpha-airport",
      roleFamilies: ["partner"],
      scopes: expect.arrayContaining([
        "partner:eligibility:read",
        "partner:eligibility:write",
      ]),
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

  it("resolves partner eligibility routes to partner-scoped access", () => {
    const policy = resolveRouteAuthPolicy(
      "POST",
      "/api/partner/eligibility/verify",
    );

    expect(policy).toEqual({
      routeKey: "partner:eligibility:verify",
      requiredScopes: ["partner:eligibility:write"],
      allowedRealms: ["system", "partner"],
      description: "Partner eligibility verification",
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

  it("requires authenticated driver or control-plane identity for driver-device revoke routes", () => {
    const policy = resolveRouteAuthPolicy(
      "POST",
      "/api/auth/driver/device/revoke",
    );

    expect(policy).toEqual({
      routeKey: "auth:driver-device:revoke",
      requiredScopes: [],
      allowedRealms: ["system", "platform", "ops", "driver"],
      description: "Authenticated driver-device revoke access",
    });
  });

  it("allows driver identities to post location heartbeats", () => {
    const policy = resolveRouteAuthPolicy(
      "POST",
      "/api/regulatory-registry/driver-location",
    );

    expect(policy).toEqual({
      routeKey: "regulatory:driver-location:POST",
      requiredScopes: ["driver:write"],
      allowedRealms: ["system", "platform", "ops", "driver"],
      description: "Driver location heartbeat ingestion",
    });
  });

  it("keeps call-center order creation on ops-only callcenter scopes", () => {
    const policy = resolveRouteAuthPolicy("POST", "/api/call-center/orders");

    expect(policy).toEqual({
      routeKey: "callcenter:orders:POST",
      requiredScopes: ["callcenter:write"],
      allowedRealms: ["system", "ops"],
      description: "Callcenter phone-order management",
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

  it("rejects tenant bootstrap identities on call-center order creation", () => {
    const guard = new BootstrapAuthGuard(new Reflector());
    const request: AuthenticatedRequestLike = {
      headers: {
        "x-actor-type": "tenant_admin",
        "x-actor-id": "tenant-admin-001",
        "x-realm": "tenant",
        "x-tenant-id": "tenant-demo-001",
        "x-roles": "tenant_admin",
        "x-scopes": "tenant:read tenant:write owned:write",
      },
      method: "POST",
      originalUrl: "/api/call-center/orders",
    };

    expect(() =>
      guard.canActivate(createExecutionContext(request)),
    ).toThrowError(ApiRequestError);

    try {
      guard.canActivate(createExecutionContext(request));
    } catch (error) {
      const apiError = error as ApiRequestError;
      expect(apiError.getStatus()).toBe(403);
      expect(apiError.getResponse()).toMatchObject({
        error: {
          code: "AUTH_REALM_DENIED",
        },
      });
    }
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

  it("allows partner bootstrap-session issuance without the internal key", () => {
    expect(() =>
      validateInternalKey(
        {
          headers: {},
          method: "POST",
          originalUrl: "/api/auth/partner/bootstrap-session",
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

  it("allows protected routes when the control-plane inner bearer header is present", () => {
    expect(() =>
      validateInternalKey(
        {
          headers: {
            "x-drts-authorization": "Bearer inner-control-plane-token",
          },
          method: "POST",
          originalUrl: "/api/platform-admin/public-info",
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
    const { controller } = createAuthFixture(jwtAuthService);

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

    const { controller } = createAuthFixture(new JwtAuthService());

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

    const { controller } = createAuthFixture(new JwtAuthService());

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

    const { controller } = createAuthFixture(new JwtAuthService());

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

  it("rejects bootstrap session issuance for suspended tenant users", () => {
    process.env.JWT_SECRET = "test-secret";

    const { controller, tenantPartnerService } = createAuthFixture(
      new JwtAuthService(),
    );
    const suspendedUser = tenantPartnerService
      .listTenantUsers("tenant-demo-001")
      .find((user) => user.email === "viewer@acme.example");
    expect(suspendedUser).toBeDefined();
    if (!suspendedUser) {
      throw new Error("expected seeded tenant user");
    }

    tenantPartnerService.updateTenantUserRole(
      "tenant-demo-001",
      suspendedUser.userId,
      {
        roleCode: suspendedUser.roleCode,
        status: "suspended",
      },
      "req-tenant-bootstrap-suspend-001",
    );

    expect(() =>
      controller.issueTenantBootstrapSession(
        {
          email: "viewer@acme.example",
        },
        "req-tenant-bootstrap-005",
      ),
    ).toThrowError(ApiRequestError);

    try {
      controller.issueTenantBootstrapSession(
        {
          email: "viewer@acme.example",
        },
        "req-tenant-bootstrap-005",
      );
    } catch (error) {
      const apiError = error as ApiRequestError;
      expect(apiError.getStatus()).toBe(403);
      expect(apiError.getResponse()).toMatchObject({
        error: {
          code: "TENANT_USER_SUSPENDED",
        },
      });
    }

    delete process.env.JWT_SECRET;
  });

  it("rejects bootstrap session issuance when the tenant scope does not match the invited user", () => {
    process.env.JWT_SECRET = "test-secret";

    const { controller, tenantPartnerService } = createAuthFixture(
      new JwtAuthService(),
    );
    tenantPartnerService.createTenantUser(
      "tenant-other-001",
      {
        email: "cross-tenant@acme.example",
        displayName: "Cross Tenant Admin",
        roleCode: "tenant_admin",
      },
      "req-tenant-bootstrap-cross-001",
    );

    expect(() =>
      controller.issueTenantBootstrapSession(
        {
          email: "cross-tenant@acme.example",
          tenantId: "tenant-demo-001",
        },
        "req-tenant-bootstrap-006",
      ),
    ).toThrowError(ApiRequestError);

    try {
      controller.issueTenantBootstrapSession(
        {
          email: "cross-tenant@acme.example",
          tenantId: "tenant-demo-001",
        },
        "req-tenant-bootstrap-006",
      );
    } catch (error) {
      const apiError = error as ApiRequestError;
      expect(apiError.getStatus()).toBe(403);
      expect(apiError.getResponse()).toMatchObject({
        error: {
          code: "TENANT_SCOPE_MISMATCH",
        },
      });
    }

    delete process.env.JWT_SECRET;
  });
});

describe("partner bootstrap-session auth controller", () => {
  it("issues a bearer session envelope for partner ingress", () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";
    process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT =
      "pk_demo_alpha_airport_20260428";

    const jwtAuthService = new JwtAuthService();
    const { controller } = createAuthFixture(jwtAuthService);

    const response = controller.issuePartnerBootstrapSession(
      {
        entrySlug: "bank-demo-alpha-airport",
        apiKey: "pk_demo_alpha_airport_20260428",
      },
      "req-partner-bootstrap-001",
    );

    expect(response.data).toMatchObject({
      tokenType: "Bearer",
      expiresIn: "1h",
      partnerEntry: {
        entrySlug: "bank-demo-alpha-airport",
        partnerId: "partner-bank-demo-001",
        authMode: "partner_api_key",
      },
      identity: {
        actorType: "partner_api_key",
        actorId: "partner-key-alpha-demo",
        authMode: "jwt_bearer",
        realm: "partner",
        tenantId: "tenant-demo-001",
        partnerId: "partner-bank-demo-001",
        partnerProgramId: "program-airport-alpha",
        partnerEntrySlug: "bank-demo-alpha-airport",
        scopes: expect.arrayContaining([
          "partner:eligibility:read",
          "partner:eligibility:write",
        ]),
      },
    });
    const verifiedPayload = jwtAuthService.verify(response.data.accessToken);
    expect(verifiedPayload).toMatchObject({
      sub: "partner-key-alpha-demo",
      actorType: "partner_api_key",
      realm: "partner",
      tenantId: "tenant-demo-001",
      partnerId: "partner-bank-demo-001",
      partnerProgramId: "program-airport-alpha",
      partnerEntrySlug: "bank-demo-alpha-airport",
    });

    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
    delete process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT;
  });

  it("rejects partner bootstrap-session issuance for an invalid api key", () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT =
      "pk_demo_alpha_airport_20260428";

    const { controller } = createAuthFixture(new JwtAuthService());

    expect(() =>
      controller.issuePartnerBootstrapSession(
        {
          entrySlug: "bank-demo-alpha-airport",
          apiKey: "wrong-demo-key",
        },
        "req-partner-bootstrap-002",
      ),
    ).toThrowError(ApiRequestError);

    delete process.env.JWT_SECRET;
    delete process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT;
  });

  it("rejects partner bootstrap-session issuance for inactive entries and records the audit reason", () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT =
      "pk_demo_alpha_airport_20260428";

    const { controller, tenantPartnerService, auditNotificationService } =
      createAuthFixture(new JwtAuthService());
    tenantPartnerService.updatePlatformPartnerEntry(
      "bank-demo-alpha-airport",
      {
        status: "inactive",
      },
      "req-partner-entry-inactive-001",
    );

    expect(() =>
      controller.issuePartnerBootstrapSession(
        {
          entrySlug: "bank-demo-alpha-airport",
          apiKey: "pk_demo_alpha_airport_20260428",
        },
        "req-partner-bootstrap-003",
      ),
    ).toThrowError(ApiRequestError);

    const auditRecord = auditNotificationService
      .listAuditLogs()
      .find((entry) => entry.actionName === "partner_ingress_rejected");
    expect(auditRecord).toMatchObject({
      resourceId: "bank-demo-alpha-airport",
      newValuesSummary: expect.objectContaining({
        reason: "entry_inactive",
        outcome: "rejected",
      }),
    });

    delete process.env.JWT_SECRET;
    delete process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT;
  });
});

describe("driver device-session auth controller", () => {
  it("registers a device and issues a driver-bound bearer session", () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";

    const jwtAuthService = new JwtAuthService();
    const { controller } = createAuthFixture(jwtAuthService);

    const response = controller.issueDriverDeviceSession(
      {
        registrationCode: "demo-driver",
        deviceId: "device-test-001",
        deviceLabel: "Pixel QA",
      },
      "req-driver-device-001",
    );

    expect(response.data).toMatchObject({
      tokenType: "Bearer",
      driverId: "drv-demo-001",
      deviceId: "device-test-001",
      identity: {
        actorType: "driver_user",
        authMode: "jwt_bearer",
        realm: "driver",
        scopes: expect.arrayContaining(["driver:read", "driver:write"]),
      },
    });
    const payload = jwtAuthService.verify(response.data.accessToken);
    expect(payload).toMatchObject({
      sub: "drv-demo-001",
      actorType: "driver_user",
      realm: "driver",
      driverBindingId: response.data.bindingId,
      driverDeviceId: "device-test-001",
    });

    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
  });

  it("rejects revoked driver device bearer sessions on protected driver routes", () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";

    const jwtAuthService = new JwtAuthService();
    const { controller, driverDeviceSessionService } =
      createAuthFixture(jwtAuthService);

    const firstSession = controller.issueDriverDeviceSession(
      {
        registrationCode: "demo-driver",
        deviceId: "device-test-002",
      },
      "req-driver-device-002",
    ).data;

    const refreshedSession = controller.refreshDriverDeviceSession(
      {
        refreshToken: firstSession.refreshToken,
        deviceId: "device-test-002",
      },
      "req-driver-device-003",
    ).data;

    expect(refreshedSession.refreshToken).not.toBe(firstSession.refreshToken);
    controller.revokeDriverDeviceSession(
      {
        actorType: "driver_user",
        actorId: "drv-demo-001",
        authMode: "jwt_bearer",
        realm: "driver",
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        roleFamilies: ["driver"],
        roles: ["driver_user"],
        scopes: ["driver:read", "driver:write"],
        requestId: null,
      },
      {
        bindingId: refreshedSession.bindingId,
        deviceId: "device-test-002",
      },
      "req-driver-device-004",
    );

    const guard = new BootstrapAuthGuard(
      new Reflector(),
      jwtAuthService,
      driverDeviceSessionService,
    );
    const request: AuthenticatedRequestLike = {
      headers: {
        authorization: `Bearer ${refreshedSession.accessToken}`,
      },
      method: "GET",
      originalUrl: "/api/driver/profile",
    };

    expect(() =>
      guard.canActivate(createExecutionContext(request)),
    ).toThrowError(ApiRequestError);

    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
  });

  it("allows platform admins to revoke a driver device binding for operational recovery", () => {
    process.env.JWT_SECRET = "test-secret";

    const { controller, driverProfileService } = createAuthFixture(
      new JwtAuthService(),
    );

    const session = controller.issueDriverDeviceSession(
      {
        registrationCode: "demo-driver",
        deviceId: "device-test-admin-revoke-001",
        deviceLabel: "QA iPhone",
      },
      "req-driver-device-admin-001",
    ).data;

    const response = controller.revokeDriverDeviceSession(
      {
        actorType: "platform_admin",
        actorId: "platform-admin-001",
        authMode: "bootstrap_headers",
        realm: "platform",
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        roleFamilies: ["platform"],
        roles: ["platform_admin"],
        scopes: ["foundation:write"],
        requestId: "req-driver-device-admin-002",
      },
      {
        bindingId: session.bindingId,
        deviceId: session.deviceId,
      },
      "req-driver-device-admin-002",
    );

    expect(response.data).toMatchObject({
      bindingId: session.bindingId,
      deviceId: session.deviceId,
      driverId: session.driverId,
    });

    expect(
      driverProfileService.getProfileForDriver(session.driverId),
    ).toMatchObject({
      deviceBindings: [
        expect.objectContaining({
          bindingId: session.bindingId,
          status: "revoked",
        }),
      ],
    });

    delete process.env.JWT_SECRET;
  });

  it("rejects unauthenticated driver device binding revoke attempts", () => {
    process.env.JWT_SECRET = "test-secret";

    const { controller } = createAuthFixture(new JwtAuthService());

    const session = controller.issueDriverDeviceSession(
      {
        registrationCode: "demo-driver",
        deviceId: "device-test-anon-revoke-001",
      },
      "req-driver-device-anon-revoke-001",
    ).data;

    expect(() =>
      controller.revokeDriverDeviceSession(
        null,
        {
          bindingId: session.bindingId,
          deviceId: session.deviceId,
        },
        "req-driver-device-anon-revoke-002",
      ),
    ).toThrowError(ApiRequestError);

    try {
      controller.revokeDriverDeviceSession(
        null,
        {
          bindingId: session.bindingId,
          deviceId: session.deviceId,
        },
        "req-driver-device-anon-revoke-002",
      );
    } catch (error) {
      const apiError = error as ApiRequestError;
      expect(apiError.getStatus()).toBe(403);
      expect(apiError.getResponse()).toMatchObject({
        error: {
          code: "DRIVER_DEVICE_BINDING_FORBIDDEN",
        },
      });
    }

    delete process.env.JWT_SECRET;
  });

  it("rebinds a device by revoking the prior binding before issuing the replacement session", () => {
    process.env.JWT_SECRET = "test-secret";

    const { controller, driverProfileService, auditNotificationService } =
      createAuthFixture(new JwtAuthService());

    const firstSession = controller.issueDriverDeviceSession(
      {
        registrationCode: "demo-driver",
        deviceId: "device-test-rebind-001",
        deviceLabel: "Shared Tablet",
      },
      "req-driver-device-rebind-001",
    ).data;

    const secondSession = controller.issueDriverDeviceSession(
      {
        registrationCode: "drv-demo-002",
        deviceId: "device-test-rebind-001",
        deviceLabel: "Shared Tablet",
      },
      "req-driver-device-rebind-002",
    ).data;

    expect(secondSession.bindingId).not.toBe(firstSession.bindingId);

    expect(
      driverProfileService.getProfileForDriver("drv-demo-001").deviceBindings,
    ).toEqual([
      expect.objectContaining({
        bindingId: firstSession.bindingId,
        status: "revoked",
      }),
    ]);
    expect(
      driverProfileService.getProfileForDriver("drv-demo-002").deviceBindings,
    ).toEqual([
      expect.objectContaining({
        bindingId: secondSession.bindingId,
        deviceId: "device-test-rebind-001",
        status: "active",
      }),
    ]);

    expect(
      auditNotificationService
        .listAuditLogs()
        .filter((entry) => entry.actionName === "revoke_driver_device_binding")
        .some((entry) => entry.resourceId === firstSession.bindingId),
    ).toBe(true);

    delete process.env.JWT_SECRET;
  });

  it("rejects device registration when the driver certifications are invalid", () => {
    process.env.JWT_SECRET = "test-secret";

    const { controller } = createAuthFixture(new JwtAuthService());

    expect(() =>
      controller.issueDriverDeviceSession(
        {
          registrationCode: "drv-demo-003",
          deviceId: "device-test-invalid-cert-001",
        },
        "req-driver-device-005",
      ),
    ).toThrowError(ApiRequestError);

    try {
      controller.issueDriverDeviceSession(
        {
          registrationCode: "drv-demo-003",
          deviceId: "device-test-invalid-cert-001",
        },
        "req-driver-device-005",
      );
    } catch (error) {
      const apiError = error as ApiRequestError;
      expect(apiError.getStatus()).toBe(403);
      expect(apiError.getResponse()).toMatchObject({
        error: {
          code: "DRIVER_CERT_INVALID",
        },
      });
    }

    delete process.env.JWT_SECRET;
  });

  it("rejects driver bearer access after the driver is suspended", () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";

    const jwtAuthService = new JwtAuthService();
    const {
      controller,
      driverDeviceSessionService,
      regulatoryRegistryService,
    } = createAuthFixture(jwtAuthService);

    const session = controller.issueDriverDeviceSession(
      {
        registrationCode: "demo-driver",
        deviceId: "device-test-003",
      },
      "req-driver-device-006",
    ).data;
    regulatoryRegistryService.updateDriverLifecycle("drv-demo-001", {
      lifecycleStatus: "suspended",
      reason: "manual compliance hold",
    });

    const guard = new BootstrapAuthGuard(
      new Reflector(),
      jwtAuthService,
      driverDeviceSessionService,
    );
    const request: AuthenticatedRequestLike = {
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      method: "GET",
      originalUrl: "/api/driver/profile",
    };

    expect(() =>
      guard.canActivate(createExecutionContext(request)),
    ).toThrowError(ApiRequestError);

    try {
      guard.canActivate(createExecutionContext(request));
    } catch (error) {
      const apiError = error as ApiRequestError;
      expect(apiError.getStatus()).toBe(403);
      expect(apiError.getResponse()).toMatchObject({
        error: {
          code: "DRIVER_AUTH_SUSPENDED",
        },
      });
    }

    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
  });

  it("rejects refresh immediately after the driver is suspended", () => {
    process.env.JWT_SECRET = "test-secret";

    const { controller, regulatoryRegistryService } = createAuthFixture(
      new JwtAuthService(),
    );

    const session = controller.issueDriverDeviceSession(
      {
        registrationCode: "demo-driver",
        deviceId: "device-test-suspended-refresh-001",
      },
      "req-driver-device-suspended-refresh-001",
    ).data;

    regulatoryRegistryService.updateDriverLifecycle("drv-demo-001", {
      lifecycleStatus: "suspended",
      reason: "manual compliance hold",
    });

    expect(() =>
      controller.refreshDriverDeviceSession(
        {
          refreshToken: session.refreshToken,
          deviceId: session.deviceId,
        },
        "req-driver-device-suspended-refresh-002",
      ),
    ).toThrowError(ApiRequestError);

    try {
      controller.refreshDriverDeviceSession(
        {
          refreshToken: session.refreshToken,
          deviceId: session.deviceId,
        },
        "req-driver-device-suspended-refresh-002",
      );
    } catch (error) {
      const apiError = error as ApiRequestError;
      expect(apiError.getStatus()).toBe(403);
      expect(apiError.getResponse()).toMatchObject({
        error: {
          code: "DRIVER_AUTH_SUSPENDED",
        },
      });
    }

    delete process.env.JWT_SECRET;
  });
});

describe("auth plane-separation matrix", () => {
  it("keeps control-plane realms on inner or service bearer paths only", () => {
    const realmMap = new Map(
      AUTH_REALM_PATH_MATRIX.map((record) => [record.realm, record]),
    );

    expect(realmMap.get("system")).toMatchObject({
      plane: "control_plane",
      primaryPath: "service_bearer",
      defaultIapProtected: true,
      bearerHeader: "authorization",
    });
    expect(realmMap.get("platform")).toMatchObject({
      plane: "control_plane",
      primaryPath: "control_plane_inner_bearer",
      defaultIapProtected: true,
      bearerHeader: "x-drts-authorization",
    });
    expect(realmMap.get("ops")).toMatchObject({
      plane: "control_plane",
      primaryPath: "control_plane_inner_bearer",
      defaultIapProtected: true,
      bearerHeader: "x-drts-authorization",
    });
  });

  it("keeps tenant, partner, and driver realms off the default IAP path", () => {
    const businessRealms = AUTH_REALM_PATH_MATRIX.filter(
      (record) =>
        record.realm === "tenant" ||
        record.realm === "partner" ||
        record.realm === "driver",
    );

    expect(businessRealms).toHaveLength(3);
    expect(businessRealms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          realm: "tenant",
          plane: "business_plane",
          primaryPath: "tenant_bootstrap_bearer",
          tokenIssuancePath: "/api/auth/tenant/bootstrap-session",
          defaultIapProtected: false,
        }),
        expect.objectContaining({
          realm: "partner",
          plane: "business_plane",
          primaryPath: "partner_bootstrap_bearer",
          tokenIssuancePath: "/api/auth/partner/bootstrap-session",
          defaultIapProtected: false,
        }),
        expect.objectContaining({
          realm: "driver",
          plane: "business_plane",
          primaryPath: "driver_device_bearer",
          tokenIssuancePath: "/api/auth/driver/device/register",
          refreshPath: "/api/auth/driver/device/refresh",
          defaultIapProtected: false,
        }),
      ]),
    );
  });
});
