import { Reflector } from "@nestjs/core";
import { EventEmitter2 } from "@nestjs/event-emitter";
import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { AuthController } from "../../src/modules/auth/auth.controller";
import { DriverDeviceSessionService } from "../../src/modules/auth/driver-device-session.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { IdentityRepository } from "../../src/modules/identity/identity.repository";
import { MultiTaxiController } from "../../src/modules/multi-taxi/multi-taxi.controller";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";
import {
  AUTH_REALM_PATH_MATRIX,
  BootstrapAuthGuard,
  InternalKeyMiddleware,
  JwtAuthService,
  OpenRoute,
  RequireRealms,
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

function createAuthFixture() {
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
  const identityRepository = new IdentityRepository();
  const jwtAuthService = new JwtAuthService(
    identityRepository,
    tenantPartnerService,
    regulatoryRegistryService,
  );
  const driverDeviceSessionService = new DriverDeviceSessionService(
    jwtAuthService,
    driverProfileService,
    regulatoryRegistryService,
    undefined,
    identityRepository,
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
    identityRepository,
    jwtAuthService,
    regulatoryRegistryService,
    tenantPartnerService,
  };
}

async function issueDurableBearerToken(
  jwtAuthService: JwtAuthService,
  identity: Parameters<JwtAuthService["issueSessionToken"]>[0],
) {
  const issued = await jwtAuthService.issueSessionToken(identity);
  return issued.token;
}

async function expectApiRequestError(
  action: () => unknown | Promise<unknown>,
  assertions?: (error: ApiRequestError) => void | Promise<void>,
) {
  try {
    await action();
    throw new Error("Expected ApiRequestError");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    if (error instanceof ApiRequestError && assertions) {
      await assertions(error);
    }
  }
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

  it("resolves dedicated partner booking routes without tenant-admin semantics", () => {
    expect(resolveRouteAuthPolicy("POST", "/api/partner/bookings")).toEqual({
      routeKey: "partner:bookings:create",
      requiredScopes: ["partner:book"],
      allowedRealms: ["system", "partner"],
      description: "Partner-scoped booking creation",
    });
    expect(
      resolveRouteAuthPolicy("GET", "/api/partner/bookings/booking-001"),
    ).toEqual({
      routeKey: "partner:bookings:get",
      requiredScopes: ["partner:book"],
      allowedRealms: ["system", "partner"],
      description: "Partner-scoped booking confirmation and receipt access",
    });
    expect(
      resolveRouteAuthPolicy("GET", "/api/partner/orders/order-001"),
    ).toEqual({
      routeKey: "partner:orders:get",
      requiredScopes: ["partner:book"],
      allowedRealms: ["system", "partner"],
      description: "Partner-scoped booking confirmation and receipt access",
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

  it("keeps call-center order creation on ops-only callcenter scopes", () => {
    const policy = resolveRouteAuthPolicy("POST", "/api/call-center/orders");

    expect(policy).toEqual({
      routeKey: "callcenter:orders:POST",
      requiredScopes: ["callcenter:write"],
      allowedRealms: ["system", "ops"],
      description: "Callcenter phone-order management",
    });
  });

  it("protects ROC routes behind ops or system realm access", () => {
    const policy = resolveRouteAuthPolicy(
      "POST",
      "/api/roc/alerts/alert-001/ack",
    );

    expect(policy).toEqual({
      routeKey: "roc:POST",
      requiredScopes: [],
      allowedRealms: ["system", "ops"],
      description: "ROC operational read models and human-only actions",
    });
  });

  it("protects fleet partner admin billing routes with billing scopes", () => {
    const policy = resolveRouteAuthPolicy(
      "GET",
      "/api/admin/fleet-partners/fleet-demo-001/statements",
    );

    expect(policy).toEqual({
      routeKey: "admin:fleet-partners:billing:GET",
      requiredScopes: ["billing:read"],
      allowedRealms: ["system", "platform", "ops"],
      description: "Fleet partner billing administration",
    });
  });

  it.each([
    ["/api/fleet-partner/dashboard", "fleet-partner:dashboard:GET"],
    ["/api/fleet-partner/drivers", "fleet-partner:drivers:GET"],
    ["/api/fleet-partner/vehicles", "fleet-partner:vehicles:GET"],
    ["/api/fleet-partner/trips", "fleet-partner:trips:GET"],
    ["/api/fleet-partner/statements", "fleet-partner:statements:GET"],
    ["/api/fleet-partner/quality-metrics", "fleet-partner:quality-metrics:GET"],
  ])(
    "protects fleet partner portal route %s with partner realm access",
    (path, routeKey) => {
      const policy = resolveRouteAuthPolicy("GET", path);

      expect(policy).toEqual({
        routeKey,
        requiredScopes: ["billing:read"],
        allowedRealms: ["system", "partner"],
        description: "Fleet partner self-service access",
      });
    },
  );

  it.each([
    ["/api/partner/referral/dashboard", "partner:referral:dashboard:GET"],
    ["/api/partner/referral/usage", "partner:referral:usage:GET"],
    ["/api/partner/referral/revenue", "partner:referral:revenue:GET"],
    ["/api/partner/referral/statements", "partner:referral:statements:GET"],
    [
      "/api/partner/referral/statements/2026-06",
      "partner:referral:statements/2026-06:GET",
    ],
  ])(
    "protects referral partner portal route %s with partner realm access",
    (path, routeKey) => {
      const policy = resolveRouteAuthPolicy("GET", path);

      expect(policy).toEqual({
        routeKey,
        requiredScopes: ["billing:read"],
        allowedRealms: ["system", "partner"],
        description: "Referral partner self-service access",
      });
    },
  );
});

describe("auth token issuance", () => {
  it("issues trusted workforce MFA claims for internal-key bootstrap platform tokens", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";
    process.env.DRTS_INTERNAL_KEY = "test-internal-secret";
    process.env.AUTH_MODE = "explicit";

    const { controller, jwtAuthService } = createAuthFixture();

    const issued = await controller.issueToken({
      headers: {
        "x-drts-internal-key": "test-internal-secret",
        "x-actor-type": "platform_admin",
        "x-actor-id": "platform-admin-001",
        "x-realm": "platform",
        "x-request-id": "req-auth-token-platform-001",
      },
      method: "POST",
      originalUrl: "/api/auth/token",
      url: "/api/auth/token",
    });

    const payload = jwtAuthService.verify(issued.token);

    expect(issued.expiresIn).toBe("8h");
    expect(payload).toMatchObject({
      actorType: "platform_admin",
      realm: "platform",
      amr: ["verified_iap_workforce"],
      acr: "aal2",
    });
    expect(typeof payload?.auth_time).toBe("number");

    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
    delete process.env.DRTS_INTERNAL_KEY;
    delete process.env.AUTH_MODE;
  });
});

describe("bootstrap auth guard", () => {
  it("does not let a proxy-marked durable token bypass durable session checks", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";

    const fixture = createAuthFixture();
    const issued = await fixture.jwtAuthService.issueSessionToken({
      authMode: "jwt_bearer",
      actorType: "platform_admin",
      actorId: "platform-admin-001",
      realm: "platform",
      tenantId: null,
      roleFamilies: ["platform"],
      roles: ["platform_admin"],
      scopes: ["foundation:read"],
      requestId: null,
    });
    const payload = jwt.decode(issued.token) as jwt.JwtPayload;
    const proxyMarkedToken = jwt.sign(
      { ...payload, controlPlaneProxy: true },
      process.env.JWT_SECRET,
    );
    const session = await fixture.identityRepository.getSession(
      issued.sessionId,
    );
    expect(session).not.toBeNull();
    if (!session) {
      throw new Error("expected issued session");
    }

    const getSession = vi.spyOn(fixture.identityRepository, "getSession");
    getSession.mockResolvedValue({
      ...session,
      currentTokenId: "rotated-token-id",
    });
    await expect(
      fixture.jwtAuthService.verifyAccessToken(proxyMarkedToken, {
        allowControlPlaneProxyToken: true,
      }),
    ).resolves.toBeNull();

    getSession.mockResolvedValue({
      ...session,
      tokenVersion: session.tokenVersion + 1,
    });
    await expect(
      fixture.jwtAuthService.verifyAccessToken(proxyMarkedToken, {
        allowControlPlaneProxyToken: true,
      }),
    ).resolves.toBeNull();
    getSession.mockRestore();

    await fixture.identityRepository.revokeSession(
      issued.sessionId,
      "test revocation",
    );

    await expect(
      fixture.jwtAuthService.verifyAccessToken(proxyMarkedToken, {
        allowControlPlaneProxyToken: true,
      }),
    ).resolves.toBeNull();
  });

  it("rejects tenant bearer sessions for invited users until invitation proof is consumed", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";

    const fixture = createAuthFixture();
    const invitedUser = await fixture.tenantPartnerService.createTenantUser(
      "tenant-demo-001",
      {
        email: "proof.pending@example.com",
        displayName: "Proof Pending",
        roleCode: "tenant_viewer",
      },
      "req-proof-pending-create-001",
      {
        authMode: "bootstrap_headers",
        actorType: "tenant_admin",
        actorId: "tenant-user-demo-001",
        realm: "tenant",
        tenantId: "tenant-demo-001",
        roleFamilies: ["tenant"],
        roles: ["tenant_admin"],
        scopes: ["tenant:read", "tenant:write"],
        requestId: "req-proof-pending-create-001",
      },
    );
    const invitedSnapshot =
      await fixture.identityRepository.syncLegacyTenantUserRole(invitedUser);

    const invitedToken = await issueDurableBearerToken(
      fixture.jwtAuthService,
      {
        authMode: "jwt_bearer",
        actorType: "tenant_admin",
        actorId: invitedUser.userId,
        principalId: invitedSnapshot.principal.principalId,
        membershipId: invitedSnapshot.membership.membershipId,
        subject: invitedUser.userId,
        realm: "tenant",
        tenantId: invitedUser.tenantId,
        roleFamilies: ["tenant"],
        roles: [invitedUser.roleCode],
        scopes: ["tenant:read"],
        requestId: "req-proof-pending-token-001",
      },
    );

    await expect(
      fixture.jwtAuthService.verifyAccessToken(invitedToken),
    ).resolves.toBeNull();
  });

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

  it("still resolves bearer identity on OpenRoute endpoints when a token is present", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";

    const jwtAuthService = new JwtAuthService();
    const token = await issueDurableBearerToken(jwtAuthService, {
      authMode: "jwt_bearer",
      actorType: "tenant_admin",
      actorId: "tenant-admin-001",
      realm: "tenant",
      tenantId: "tenant-demo-001",
      roleFamilies: ["tenant"],
      roles: ["tenant_admin"],
      scopes: ["tenant:read"],
      requestId: null,
    });
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

    expect(await guard.canActivate(context)).toBe(true);
    expect(request.identity).toMatchObject({
      authMode: "jwt_bearer",
      actorId: "tenant-admin-001",
      tenantId: "tenant-demo-001",
    });

    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
    delete process.env.DRTS_TENANT_BOOTSTRAP_MODE;
  });

  it("rejects bootstrap identities on OpenRoute endpoints in strict auth environments", () => {
    process.env.APP_ENV = "staging";

    const guard = new BootstrapAuthGuard(new Reflector());
    const request: AuthenticatedRequestLike = {
      headers: {
        "x-actor-type": "platform_admin",
        "x-actor-id": "spoofed-admin",
        "x-realm": "platform",
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

    expect(() =>
      guard.canActivate(
        createExecutionContext(
          request,
          PublicHandler.prototype.handler,
          PublicHandler,
        ),
      ),
    ).toThrowError(ApiRequestError);

    delete process.env.APP_ENV;
  });

  it("fails closed for an unclassified controller route in a strict environment", () => {
    process.env.APP_ENV = "staging";
    const guard = new BootstrapAuthGuard(new Reflector());
    const request: AuthenticatedRequestLike = {
      headers: {},
      method: "GET",
      originalUrl: "/api/future-unclassified-route",
    };

    expect(() =>
      guard.canActivate(createExecutionContext(request)),
    ).toThrowError(ApiRequestError);

    delete process.env.APP_ENV;
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

  it("prefers x-drts-authorization for app JWTs when outer authorization is used elsewhere", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";

    const jwtAuthService = new JwtAuthService();
    const token = await issueDurableBearerToken(jwtAuthService, {
      authMode: "jwt_bearer",
      actorType: "platform_admin",
      actorId: "platform-admin-001",
      realm: "platform",
      tenantId: null,
      roleFamilies: ["platform"],
      roles: ["platform_admin"],
      scopes: ["foundation:read", "foundation:write"],
      requestId: null,
    });
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

    expect(await guard.canActivate(context)).toBe(true);
    expect(request.identity).toMatchObject({
      authMode: "jwt_bearer",
      actorId: "platform-admin-001",
      realm: "platform",
    });

    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
    delete process.env.DRTS_TENANT_BOOTSTRAP_MODE;
  });

  it("rejects decorator-scoped endpoints when scopes are missing", () => {
    const guard = new BootstrapAuthGuard(new Reflector());
    const request: AuthenticatedRequestLike = {
      headers: {
        "x-actor-type": "platform_admin",
        "x-actor-id": "platform-admin-001",
        "x-realm": "platform",
        "x-scopes": "foundation:write",
      },
      method: "POST",
      originalUrl:
        "/api/platform-admin/multi-taxi-ratings/rating-001/invalidate",
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

  it("returns 403 when rating moderation capability is missing", () => {
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
    const context = createExecutionContext(
      request,
      MultiTaxiController.prototype.invalidatePassengerRating as never,
      MultiTaxiController as never,
    );

    expect(() => guard.canActivate(context)).toThrowError(ApiRequestError);
    try {
      guard.canActivate(context);
    } catch (error) {
      const apiError = error as ApiRequestError;
      expect(apiError.getStatus()).toBe(403);
      expect(apiError.getResponse()).toMatchObject({
        error: {
          code: "AUTH_SCOPE_DENIED",
          details: expect.objectContaining({
            requiredScopes: expect.arrayContaining([
              "multi_taxi_ratings:moderate",
            ]),
          }),
        },
      });
    }
  });

  it("allows platform rating moderation with the required capability", () => {
    const guard = new BootstrapAuthGuard(new Reflector());
    const request: AuthenticatedRequestLike = {
      headers: {
        "x-actor-type": "platform_admin",
        "x-actor-id": "platform-admin-001",
        "x-realm": "platform",
        "x-scopes": "foundation:write multi_taxi_ratings:moderate",
      },
      method: "POST",
      originalUrl:
        "/api/platform-admin/multi-taxi-ratings/rating-001/invalidate",
    };
    const context = createExecutionContext(
      request,
      MultiTaxiController.prototype.invalidatePassengerRating as never,
      MultiTaxiController as never,
    );

    expect(guard.canActivate(context)).toBe(true);
    expect(request.identity).toMatchObject({
      actorId: "platform-admin-001",
      realm: "platform",
      scopes: ["foundation:write", "multi_taxi_ratings:moderate"],
    });
  });

  it("returns 403 when rating read capability is missing", () => {
    const guard = new BootstrapAuthGuard(new Reflector());
    const request: AuthenticatedRequestLike = {
      headers: {
        "x-actor-type": "platform_admin",
        "x-actor-id": "platform-admin-001",
        "x-realm": "platform",
        "x-scopes": "foundation:read",
      },
      method: "GET",
      originalUrl: "/api/platform-admin/multi-taxi-ratings",
    };
    const context = createExecutionContext(
      request,
      MultiTaxiController.prototype.listPassengerRatingReviews as never,
      MultiTaxiController as never,
    );

    expect(() => guard.canActivate(context)).toThrowError(ApiRequestError);
    try {
      guard.canActivate(context);
    } catch (error) {
      const apiError = error as ApiRequestError;
      expect(apiError.getStatus()).toBe(403);
      expect(apiError.getResponse()).toMatchObject({
        error: {
          code: "AUTH_SCOPE_DENIED",
          details: expect.objectContaining({
            requiredScopes: expect.arrayContaining([
              "foundation:read",
              "multi_taxi_ratings:read",
            ]),
          }),
        },
      });
    }
  });

  it("allows platform rating reads with the required capability", () => {
    const guard = new BootstrapAuthGuard(new Reflector());
    const request: AuthenticatedRequestLike = {
      headers: {
        "x-actor-type": "platform_admin",
        "x-actor-id": "platform-admin-001",
        "x-realm": "platform",
        "x-scopes": "foundation:read multi_taxi_ratings:read",
      },
      method: "GET",
      originalUrl:
        "/api/platform-admin/multi-taxi-rating-authorities/driver-001",
    };
    const context = createExecutionContext(
      request,
      MultiTaxiController.prototype.getDriverRatingAuthority as never,
      MultiTaxiController as never,
    );

    expect(guard.canActivate(context)).toBe(true);
    expect(request.identity).toMatchObject({
      actorId: "platform-admin-001",
      realm: "platform",
      scopes: ["foundation:read", "multi_taxi_ratings:read"],
    });
  });

  it("denies ops identities from requesting sandbox legal-hold release", () => {
    const guard = new BootstrapAuthGuard(new Reflector());
    const request: AuthenticatedRequestLike = {
      headers: {
        "x-actor-type": "ops_user",
        "x-actor-id": "roc-operator-001",
        "x-realm": "ops",
        "x-scopes": "sandbox.investigation.read sandbox.evidence.preview",
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
    RequireRealms("platform")(ScopedHandler);
    RequireScopes("sandbox.legal_hold.release.request")(
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

    try {
      guard.canActivate(context);
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

  it("keeps route-policy scopes active when class-level realms are present", () => {
    const guard = new BootstrapAuthGuard(new Reflector());
    const request: AuthenticatedRequestLike = {
      headers: {
        "x-actor-type": "ops_user",
        "x-actor-id": "ops-user-001",
        "x-realm": "ops",
        "x-scopes": "reports:read",
      },
      method: "POST",
      originalUrl: "/api/regulatory/notifications",
    };
    class RegulatoryControllerLike {}
    RequireRealms("platform", "ops")(RegulatoryControllerLike);

    const context = createExecutionContext(
      request,
      function createNotificationHandler() {},
      RegulatoryControllerLike,
    );

    expect(() => guard.canActivate(context)).toThrowError(ApiRequestError);
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

  it("accepts verified bearer tokens and marks authMode as jwt_bearer", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";

    const jwtAuthService = new JwtAuthService();
    const token = await issueDurableBearerToken(jwtAuthService, {
      authMode: "jwt_bearer",
      actorType: "platform_admin",
      actorId: "platform-admin-001",
      realm: "platform",
      tenantId: null,
      roleFamilies: ["platform"],
      roles: ["platform_admin"],
      scopes: ["foundation:write"],
      requestId: null,
    });
    const guard = new BootstrapAuthGuard(new Reflector(), jwtAuthService);
    const request: AuthenticatedRequestLike = {
      headers: {
        authorization: `Bearer ${token}`,
      },
      method: "POST",
      originalUrl: "/api/platform-admin/public-info",
    };

    const context = createExecutionContext(request);

    expect(await guard.canActivate(context)).toBe(true);
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

  it("applies queue read realm and scope policy to verified bearer tokens", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";
    const jwtAuthService = new JwtAuthService();
    const createToken = (realm: "ops" | "tenant", scopes: string[]) =>
      issueDurableBearerToken(jwtAuthService, {
        authMode: "jwt_bearer",
        actorType: realm === "ops" ? "ops_user" : "tenant_admin",
        actorId: `${realm}-queue-reader-001`,
        realm,
        tenantId: realm === "tenant" ? "tenant-demo-001" : null,
        roleFamilies: [realm],
        roles: [realm === "ops" ? "ops_dispatcher" : "tenant_admin"],
        scopes,
        requestId: null,
      });
    const guard = new BootstrapAuthGuard(new Reflector(), jwtAuthService);
    const createQueueRequest = (token: string): AuthenticatedRequestLike => ({
      headers: { authorization: `Bearer ${token}` },
      method: "GET",
      originalUrl: "/api/dispatch/queue",
    });

    await expectApiRequestError(async () =>
      guard.canActivate(
        createExecutionContext(
          createQueueRequest(await createToken("tenant", ["dispatch:read"])),
        ),
      ),
    );
    await expectApiRequestError(async () =>
      guard.canActivate(
        createExecutionContext(
          createQueueRequest(await createToken("ops", [])),
        ),
      ),
    );
    expect(
      await guard.canActivate(
        createExecutionContext(
          createQueueRequest(await createToken("ops", ["dispatch:read"])),
        ),
      ),
    ).toBe(true);

    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
  });

  it("accepts bearer tokens even when issuer and audience are not configured", async () => {
    process.env.JWT_SECRET = "test-secret";
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;

    const jwtAuthService = new JwtAuthService();
    const token = await issueDurableBearerToken(jwtAuthService, {
      authMode: "jwt_bearer",
      actorType: "tenant_admin",
      actorId: "tenant-admin-001",
      realm: "tenant",
      tenantId: "tenant-demo-001",
      roleFamilies: ["tenant"],
      roles: ["tenant_admin"],
      scopes: ["tenant:read"],
      requestId: null,
    });
    const guard = new BootstrapAuthGuard(new Reflector(), jwtAuthService);
    const request: AuthenticatedRequestLike = {
      headers: {
        authorization: `Bearer ${token}`,
      },
      method: "GET",
      originalUrl: "/api/identity/context",
    };

    const context = createExecutionContext(request);

    expect(await guard.canActivate(context)).toBe(true);
    expect(request.identity).toMatchObject({
      authMode: "jwt_bearer",
      actorId: "tenant-admin-001",
      tenantId: "tenant-demo-001",
    });

    delete process.env.JWT_SECRET;
    delete process.env.DRTS_TENANT_BOOTSTRAP_MODE;
  });

  it("rejects bearer tokens with the wrong audience", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";

    const signingService = new JwtAuthService();
    delete process.env.JWT_AUDIENCE;
    process.env.JWT_AUDIENCE = "wrong-audience";
    const wrongAudienceToken = await issueDurableBearerToken(signingService, {
      authMode: "jwt_bearer",
      actorType: "platform_admin",
      actorId: "platform-admin-001",
      realm: "platform",
      tenantId: null,
      roleFamilies: ["platform"],
      roles: ["platform_admin"],
      scopes: ["foundation:write"],
      requestId: null,
    });
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

    await expectApiRequestError(() => guard.canActivate(context));

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
  it("exchanges a verified tenant OIDC login with trusted MFA for a DRTS session", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";
    process.env.TENANT_OIDC_ISSUER = "https://tenant-idp.tests";
    process.env.TENANT_OIDC_AUDIENCE = "tenant-portal-tests";
    process.env.TENANT_OIDC_JWT_SECRET = "tenant-oidc-test-secret";
    const { controller } = createAuthFixture();
    const idToken = jwt.sign(
      {
        sub: "oidc-user-001",
        email: "admin@acme.example",
        email_verified: true,
        amr: ["pwd", "webauthn"],
        acr: "aal2",
      },
      process.env.TENANT_OIDC_JWT_SECRET,
      {
        algorithm: "HS256",
        issuer: process.env.TENANT_OIDC_ISSUER,
        audience: process.env.TENANT_OIDC_AUDIENCE,
        expiresIn: "5m",
      },
    );

    const response = await controller.issueTenantOidcSession(
      { idToken },
      undefined,
      undefined,
      undefined,
      "req-tenant-oidc-001",
    );

    expect(response.data).toMatchObject({
      tokenType: "Bearer",
      profile: { email: "admin@acme.example", roleCode: "tenant_admin" },
    });
    const decoded = jwt.decode(response.data.accessToken) as jwt.JwtPayload;
    expect(decoded.amr).toEqual(expect.arrayContaining(["oidc", "webauthn"]));
    expect(decoded.acr).toBe("aal2");

    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
    delete process.env.TENANT_OIDC_ISSUER;
    delete process.env.TENANT_OIDC_AUDIENCE;
    delete process.env.TENANT_OIDC_JWT_SECRET;
  });

  it("rejects tenant-admin OIDC login without a trusted MFA assertion", async () => {
    process.env.TENANT_OIDC_ISSUER = "https://tenant-idp.tests";
    process.env.TENANT_OIDC_AUDIENCE = "tenant-portal-tests";
    process.env.TENANT_OIDC_JWT_SECRET = "tenant-oidc-test-secret";
    const { controller } = createAuthFixture();
    const idToken = jwt.sign(
      { sub: "oidc-user-002", email: "admin@acme.example", email_verified: true, amr: ["pwd"] },
      process.env.TENANT_OIDC_JWT_SECRET,
      { issuer: process.env.TENANT_OIDC_ISSUER, audience: process.env.TENANT_OIDC_AUDIENCE, expiresIn: "5m" },
    );

    await expectApiRequestError(
      () => controller.issueTenantOidcSession({ idToken }),
      (apiError) => expect(apiError.getStatus()).toBe(403),
    );

    delete process.env.TENANT_OIDC_ISSUER;
    delete process.env.TENANT_OIDC_AUDIENCE;
    delete process.env.TENANT_OIDC_JWT_SECRET;
  });

  it("issues a bearer session envelope for tenant portal login", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";
    process.env.DRTS_TENANT_BOOTSTRAP_MODE = "fixture";

    const { controller, jwtAuthService } = createAuthFixture();

    const response = await controller.issueTenantBootstrapSession(
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

  it("prefers the server-side tenant user record when the email already exists", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";
    process.env.DRTS_TENANT_BOOTSTRAP_MODE = "fixture";

    const { controller } = createAuthFixture();

    const response = await controller.issueTenantBootstrapSession(
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

  it("still issues a tenant bearer session when issuer and audience are unset", async () => {
    process.env.JWT_SECRET = "test-secret";
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
    process.env.DRTS_TENANT_BOOTSTRAP_MODE = "fixture";

    const { controller } = createAuthFixture();

    const response = await controller.issueTenantBootstrapSession(
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
    delete process.env.DRTS_TENANT_BOOTSTRAP_MODE;
  });

  it("rejects bootstrap session issuance for emails without an invited tenant user", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.DRTS_TENANT_BOOTSTRAP_MODE = "fixture";

    const { controller } = createAuthFixture();

    await expectApiRequestError(
      () =>
        controller.issueTenantBootstrapSession(
          {
            email: "unknown@acme.example",
          },
          "req-tenant-bootstrap-004",
        ),
      (apiError) => {
        expect(apiError.getStatus()).toBe(403);
        expect(apiError.getResponse()).toMatchObject({
          error: {
            code: "AUTH_SESSION_EXCHANGE_DENIED",
            message:
              "The authentication proof could not be matched to an active session exchange.",
          },
        });
      },
    );

    delete process.env.JWT_SECRET;
    delete process.env.DRTS_TENANT_BOOTSTRAP_MODE;
  });

  it("rejects bootstrap session issuance for suspended tenant users", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.DRTS_TENANT_BOOTSTRAP_MODE = "fixture";

    const { controller, tenantPartnerService } = createAuthFixture();
    const suspendedUser = tenantPartnerService
      .listTenantUsers("tenant-demo-001")
      .find((user) => user.email === "viewer@acme.example");
    expect(suspendedUser).toBeDefined();
    if (!suspendedUser) {
      throw new Error("expected seeded tenant user");
    }

    await tenantPartnerService.updateTenantUserRole(
      "tenant-demo-001",
      suspendedUser.userId,
      {
        roleCode: suspendedUser.roleCode,
        status: "suspended",
      },
      "req-tenant-bootstrap-suspend-001",
    );

    await expectApiRequestError(
      () =>
        controller.issueTenantBootstrapSession(
          {
            email: "viewer@acme.example",
          },
          "req-tenant-bootstrap-005",
        ),
      (apiError) => {
        expect(apiError.getStatus()).toBe(403);
        expect(apiError.getResponse()).toMatchObject({
          error: {
            code: "AUTH_SESSION_EXCHANGE_DENIED",
          },
        });
      },
    );

    delete process.env.JWT_SECRET;
    delete process.env.DRTS_TENANT_BOOTSTRAP_MODE;
  });

  it("rejects bootstrap session issuance when the tenant scope does not match the invited user", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.DRTS_TENANT_BOOTSTRAP_MODE = "fixture";

    const { controller, tenantPartnerService } = createAuthFixture();
    await tenantPartnerService.createTenantUser(
      "tenant-other-001",
      {
        email: "cross-tenant@acme.example",
        displayName: "Cross Tenant Admin",
        roleCode: "tenant_admin",
      },
      "req-tenant-bootstrap-cross-001",
    );

    await expectApiRequestError(
      () =>
        controller.issueTenantBootstrapSession(
          {
            email: "cross-tenant@acme.example",
            tenantId: "tenant-demo-001",
          },
          "req-tenant-bootstrap-006",
        ),
      (apiError) => {
        expect(apiError.getStatus()).toBe(403);
        expect(apiError.getResponse()).toMatchObject({
          error: {
            code: "AUTH_SESSION_EXCHANGE_DENIED",
          },
        });
      },
    );

    delete process.env.JWT_SECRET;
    delete process.env.DRTS_TENANT_BOOTSTRAP_MODE;
  });

  it("rejects email-only tenant bootstrap outside explicit local fixture mode", async () => {
    process.env.JWT_SECRET = "test-secret";

    const { controller } = createAuthFixture();

    await expectApiRequestError(
      () =>
        controller.issueTenantBootstrapSession(
          {
            email: "ops@acme.example",
          },
          "req-tenant-bootstrap-no-fixture-001",
        ),
      (apiError) => {
        expect(apiError.getStatus()).toBe(403);
        expect(apiError.getResponse()).toMatchObject({
          error: {
            code: "AUTH_SESSION_EXCHANGE_DENIED",
            message:
              "The authentication proof could not be matched to an active session exchange.",
          },
        });
      },
    );

    delete process.env.JWT_SECRET;
  });

  it("rejects email-only tenant bootstrap in production even when fixture mode is configured", async () => {
    process.env.APP_ENV = "production";
    process.env.JWT_SECRET = "test-secret";
    process.env.DRTS_TENANT_BOOTSTRAP_MODE = "fixture";

    const { controller } = createAuthFixture();

    await expectApiRequestError(
      () =>
        controller.issueTenantBootstrapSession(
          {
            email: "ops@acme.example",
          },
          "req-tenant-bootstrap-prod-001",
        ),
      (apiError) => {
        expect(apiError.getStatus()).toBe(403);
        expect(apiError.getResponse()).toMatchObject({
          error: {
            code: "AUTH_SESSION_EXCHANGE_DENIED",
            message:
              "The authentication proof could not be matched to an active session exchange.",
          },
        });
      },
    );

    delete process.env.APP_ENV;
    delete process.env.JWT_SECRET;
    delete process.env.DRTS_TENANT_BOOTSTRAP_MODE;
  });
});

describe("partner bootstrap-session auth controller", () => {
  it("issues a bearer session envelope for partner ingress", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";
    process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT =
      "pk_demo_alpha_airport_20260428";

    const { controller, jwtAuthService } = createAuthFixture();

    const response = await controller.issuePartnerBootstrapSession(
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

  it("rejects partner bootstrap-session issuance for an invalid api key", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT =
      "pk_demo_alpha_airport_20260428";

    const { controller } = createAuthFixture();

    await expectApiRequestError(() =>
      controller.issuePartnerBootstrapSession(
        {
          entrySlug: "bank-demo-alpha-airport",
          apiKey: "wrong-demo-key",
        },
        "req-partner-bootstrap-002",
      ),
    );

    delete process.env.JWT_SECRET;
    delete process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT;
  });

  it("rejects partner bootstrap-session issuance for inactive entries and records the audit reason", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT =
      "pk_demo_alpha_airport_20260428";

    const { controller, tenantPartnerService, auditNotificationService } =
      createAuthFixture();
    await tenantPartnerService.updatePlatformPartnerEntry(
      "bank-demo-alpha-airport",
      {
        status: "inactive",
      },
      "req-partner-entry-inactive-001",
    );

    await expectApiRequestError(() =>
      controller.issuePartnerBootstrapSession(
        {
          entrySlug: "bank-demo-alpha-airport",
          apiKey: "pk_demo_alpha_airport_20260428",
        },
        "req-partner-bootstrap-003",
      ),
    );

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
  it("registers a device and issues a driver-bound bearer session", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";

    const { controller, jwtAuthService } = createAuthFixture();

    const response = await controller.issueDriverDeviceSession(
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

  it("rejects revoked driver device bearer sessions on protected driver routes", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";

    const { controller, driverDeviceSessionService, jwtAuthService } =
      createAuthFixture();

    const firstSession = (
      await controller.issueDriverDeviceSession(
        {
          registrationCode: "demo-driver",
          deviceId: "device-test-002",
        },
        "req-driver-device-002",
      )
    ).data;

    const refreshedSession = (
      await controller.refreshDriverDeviceSession(
        {
          refreshToken: firstSession.refreshToken,
          deviceId: "device-test-002",
        },
        "req-driver-device-003",
      )
    ).data;

    expect(refreshedSession.refreshToken).not.toBe(firstSession.refreshToken);
    await controller.revokeDriverDeviceSession(
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

    await expectApiRequestError(() =>
      guard.canActivate(createExecutionContext(request)),
    );

    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
  });

  it("allows platform admins to revoke a driver device binding for operational recovery", async () => {
    process.env.JWT_SECRET = "test-secret";

    const { controller, driverProfileService } = createAuthFixture();

    const session = (
      await controller.issueDriverDeviceSession(
        {
          registrationCode: "demo-driver",
          deviceId: "device-test-admin-revoke-001",
          deviceLabel: "QA iPhone",
        },
        "req-driver-device-admin-001",
      )
    ).data;

    const response = await controller.revokeDriverDeviceSession(
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

  it("rejects unauthenticated driver device binding revoke attempts", async () => {
    process.env.JWT_SECRET = "test-secret";

    const { controller } = createAuthFixture();

    const session = (
      await controller.issueDriverDeviceSession(
        {
          registrationCode: "demo-driver",
          deviceId: "device-test-anon-revoke-001",
        },
        "req-driver-device-anon-revoke-001",
      )
    ).data;

    await expectApiRequestError(
      () =>
        controller.revokeDriverDeviceSession(
          null,
          {
            bindingId: session.bindingId,
            deviceId: session.deviceId,
          },
          "req-driver-device-anon-revoke-002",
        ),
      (apiError) => {
        expect(apiError.getStatus()).toBe(403);
        expect(apiError.getResponse()).toMatchObject({
          error: {
            code: "DRIVER_DEVICE_BINDING_FORBIDDEN",
          },
        });
      },
    );

    delete process.env.JWT_SECRET;
  });

  it("rebinds a device by revoking the prior binding before issuing the replacement session", async () => {
    process.env.JWT_SECRET = "test-secret";

    const { controller, driverProfileService, auditNotificationService } =
      createAuthFixture();

    const firstSession = (
      await controller.issueDriverDeviceSession(
        {
          registrationCode: "demo-driver",
          deviceId: "device-test-rebind-001",
          deviceLabel: "Shared Tablet",
        },
        "req-driver-device-rebind-001",
      )
    ).data;

    const secondSession = (
      await controller.issueDriverDeviceSession(
        {
          registrationCode: "drv-demo-002",
          deviceId: "device-test-rebind-001",
          deviceLabel: "Shared Tablet",
        },
        "req-driver-device-rebind-002",
      )
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

  it("rejects device registration when the driver certifications are invalid", async () => {
    process.env.JWT_SECRET = "test-secret";

    const { controller } = createAuthFixture();

    await expectApiRequestError(
      () =>
        controller.issueDriverDeviceSession(
          {
            registrationCode: "drv-demo-003",
            deviceId: "device-test-invalid-cert-001",
          },
          "req-driver-device-005",
        ),
      (apiError) => {
        expect(apiError.getStatus()).toBe(403);
        expect(apiError.getResponse()).toMatchObject({
          error: {
            code: "DRIVER_CERT_INVALID",
          },
        });
      },
    );

    delete process.env.JWT_SECRET;
  });

  it("rejects driver bearer access after the driver is suspended", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";

    const {
      controller,
      driverDeviceSessionService,
      jwtAuthService,
      regulatoryRegistryService,
    } = createAuthFixture();

    const session = (
      await controller.issueDriverDeviceSession(
        {
          registrationCode: "demo-driver",
          deviceId: "device-test-003",
        },
        "req-driver-device-006",
      )
    ).data;
    await regulatoryRegistryService.updateDriverLifecycle("drv-demo-001", {
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

    await expectApiRequestError(
      () => guard.canActivate(createExecutionContext(request)),
      (apiError) => {
        expect(apiError.getStatus()).toBe(401);
        expect(apiError.getResponse()).toMatchObject({
          error: {
            code: "JWT_INVALID",
          },
        });
      },
    );

    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
  });

  it("rejects refresh immediately after the driver is suspended", async () => {
    process.env.JWT_SECRET = "test-secret";

    const { controller, regulatoryRegistryService } = createAuthFixture();

    const session = (
      await controller.issueDriverDeviceSession(
        {
          registrationCode: "demo-driver",
          deviceId: "device-test-suspended-refresh-001",
        },
        "req-driver-device-suspended-refresh-001",
      )
    ).data;

    await regulatoryRegistryService.updateDriverLifecycle("drv-demo-001", {
      lifecycleStatus: "suspended",
      reason: "manual compliance hold",
    });

    await expectApiRequestError(
      () =>
        controller.refreshDriverDeviceSession(
          {
            refreshToken: session.refreshToken,
            deviceId: session.deviceId,
          },
          "req-driver-device-suspended-refresh-002",
        ),
      (apiError) => {
        expect(apiError.getStatus()).toBe(403);
        expect(apiError.getResponse()).toMatchObject({
          error: {
            code: "DRIVER_AUTH_SUSPENDED",
          },
        });
      },
    );

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
