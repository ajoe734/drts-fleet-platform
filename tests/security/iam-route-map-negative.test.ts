import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import {
  AUTH_ALLOWED_REALMS_KEY,
  AUTH_OPEN_ROUTE_KEY,
  AUTH_REQUIRED_SCOPES_KEY,
  AUTH_REALMS,
  type AuthRealm,
} from "../../apps/api/src/common/auth";
import { BootstrapAuthGuard } from "../../apps/api/src/common/auth/bootstrap-auth.guard";
import { resolveRouteAuthPolicy } from "../../apps/api/src/common/auth/auth.policy";
import { FoundationController } from "../../apps/api/src/modules/foundation/foundation.controller";
import { GeoController } from "../../apps/api/src/modules/geo/geo.controller";
import { GeoProviderConfigService } from "../../apps/api/src/modules/geo/geo-provider-config.service";
import { GeoService } from "../../apps/api/src/modules/geo/geo.service";
import { MockGeoProvider } from "../../apps/api/src/modules/geo/mock-geo.provider";
import { ServiceAreaController } from "../../apps/api/src/modules/service-area/service-area.controller";

// This is the exact 20-route inventory from GAP section 5 ("Foundation and
// map"), classified per system-design section 5.4. Every entry must resolve
// a non-empty realm/scope decorator or a central-policy match so strict
// environments never fall through to AUTH_ROUTE_UNCLASSIFIED.
const SHARED_ADMIN_MAP_REALMS: readonly AuthRealm[] = [
  "system",
  "platform",
  "ops",
];
const SHARED_OPERATIONAL_MAP_REALMS: readonly AuthRealm[] = [
  "system",
  "platform",
  "tenant",
  "ops",
  "driver",
];
const SHARED_GEO_REALMS: readonly AuthRealm[] = [
  "system",
  "platform",
  "tenant",
  "ops",
  "driver",
  "partner",
];

interface RouteCase {
  name: string;
  controller: new (...args: never[]) => unknown;
  handler: (...args: never[]) => unknown;
  method: "GET" | "POST";
  routePath: string;
  allowedRealms: readonly AuthRealm[];
  requiredScopes: readonly string[];
}

const foundationPrototype = FoundationController.prototype;
const geoPrototype = GeoController.prototype;
const serviceAreaPrototype = ServiceAreaController.prototype;

const ROUTES: RouteCase[] = [
  {
    name: "GET /system/foundation/manifest",
    controller: FoundationController,
    handler: foundationPrototype.getManifest,
    method: "GET",
    routePath: "system/foundation/manifest",
    allowedRealms: SHARED_ADMIN_MAP_REALMS,
    requiredScopes: ["foundation:read"],
  },
  {
    name: "GET /geo/health",
    controller: GeoController,
    handler: geoPrototype.health,
    method: "GET",
    routePath: "geo/health",
    allowedRealms: SHARED_GEO_REALMS,
    requiredScopes: [],
  },
  {
    name: "GET /geo/search",
    controller: GeoController,
    handler: geoPrototype.search,
    method: "GET",
    routePath: "geo/search",
    allowedRealms: SHARED_GEO_REALMS,
    requiredScopes: [],
  },
  {
    name: "POST /geo/resolve",
    controller: GeoController,
    handler: geoPrototype.resolve,
    method: "POST",
    routePath: "geo/resolve",
    allowedRealms: SHARED_GEO_REALMS,
    requiredScopes: [],
  },
  {
    name: "POST /geo/reverse",
    controller: GeoController,
    handler: geoPrototype.reverse,
    method: "POST",
    routePath: "geo/reverse",
    allowedRealms: SHARED_GEO_REALMS,
    requiredScopes: [],
  },
  {
    name: "POST /geo/route",
    controller: GeoController,
    handler: geoPrototype.route,
    method: "POST",
    routePath: "geo/route",
    allowedRealms: SHARED_GEO_REALMS,
    requiredScopes: [],
  },
  {
    name: "GET /service-area/definitions",
    controller: ServiceAreaController,
    handler: serviceAreaPrototype.listDefinitions,
    method: "GET",
    routePath: "service-area/definitions",
    allowedRealms: SHARED_OPERATIONAL_MAP_REALMS,
    requiredScopes: [],
  },
  {
    name: "GET /service-area/admin/geojson",
    controller: ServiceAreaController,
    handler: serviceAreaPrototype.exportAdminGeoJson,
    method: "GET",
    routePath: "service-area/admin/geojson",
    allowedRealms: SHARED_ADMIN_MAP_REALMS,
    requiredScopes: ["foundation:read"],
  },
  {
    name: "GET /service-area/geojson",
    controller: ServiceAreaController,
    handler: serviceAreaPrototype.exportOperationalGeoJson,
    method: "GET",
    routePath: "service-area/geojson",
    allowedRealms: SHARED_OPERATIONAL_MAP_REALMS,
    requiredScopes: [],
  },
  {
    name: "POST /service-area/evaluate",
    controller: ServiceAreaController,
    handler: serviceAreaPrototype.evaluateServiceArea,
    method: "POST",
    routePath: "service-area/evaluate",
    allowedRealms: SHARED_OPERATIONAL_MAP_REALMS,
    requiredScopes: [],
  },
  {
    name: "POST /service-area/admin/service-areas",
    controller: ServiceAreaController,
    handler: serviceAreaPrototype.createServiceArea,
    method: "POST",
    routePath: "service-area/admin/service-areas",
    allowedRealms: SHARED_ADMIN_MAP_REALMS,
    requiredScopes: ["foundation:write"],
  },
  {
    name: "POST /service-area/admin/service-areas/:serviceAreaId/update",
    controller: ServiceAreaController,
    handler: serviceAreaPrototype.updateServiceArea,
    method: "POST",
    routePath: "service-area/admin/service-areas/sa-1/update",
    allowedRealms: SHARED_ADMIN_MAP_REALMS,
    requiredScopes: ["foundation:write"],
  },
  {
    name: "POST /service-area/admin/service-areas/:serviceAreaId/submit-review",
    controller: ServiceAreaController,
    handler: serviceAreaPrototype.submitServiceAreaForReview,
    method: "POST",
    routePath: "service-area/admin/service-areas/sa-1/submit-review",
    allowedRealms: SHARED_ADMIN_MAP_REALMS,
    requiredScopes: ["foundation:write"],
  },
  {
    name: "POST /service-area/admin/service-areas/:serviceAreaId/publish",
    controller: ServiceAreaController,
    handler: serviceAreaPrototype.publishServiceArea,
    method: "POST",
    routePath: "service-area/admin/service-areas/sa-1/publish",
    allowedRealms: SHARED_ADMIN_MAP_REALMS,
    requiredScopes: ["foundation:write"],
  },
  {
    name: "POST /service-area/admin/service-areas/:serviceAreaId/retire",
    controller: ServiceAreaController,
    handler: serviceAreaPrototype.retireServiceArea,
    method: "POST",
    routePath: "service-area/admin/service-areas/sa-1/retire",
    allowedRealms: SHARED_ADMIN_MAP_REALMS,
    requiredScopes: ["foundation:write"],
  },
  {
    name: "POST /service-area/admin/stop-policies",
    controller: ServiceAreaController,
    handler: serviceAreaPrototype.createStopPolicy,
    method: "POST",
    routePath: "service-area/admin/stop-policies",
    allowedRealms: SHARED_ADMIN_MAP_REALMS,
    requiredScopes: ["foundation:write"],
  },
  {
    name: "POST /service-area/admin/stop-policies/:stopPolicyId/update",
    controller: ServiceAreaController,
    handler: serviceAreaPrototype.updateStopPolicy,
    method: "POST",
    routePath: "service-area/admin/stop-policies/sp-1/update",
    allowedRealms: SHARED_ADMIN_MAP_REALMS,
    requiredScopes: ["foundation:write"],
  },
  {
    name: "POST /service-area/admin/stop-policies/:stopPolicyId/submit-review",
    controller: ServiceAreaController,
    handler: serviceAreaPrototype.submitStopPolicyForReview,
    method: "POST",
    routePath: "service-area/admin/stop-policies/sp-1/submit-review",
    allowedRealms: SHARED_ADMIN_MAP_REALMS,
    requiredScopes: ["foundation:write"],
  },
  {
    name: "POST /service-area/admin/stop-policies/:stopPolicyId/publish",
    controller: ServiceAreaController,
    handler: serviceAreaPrototype.publishStopPolicy,
    method: "POST",
    routePath: "service-area/admin/stop-policies/sp-1/publish",
    allowedRealms: SHARED_ADMIN_MAP_REALMS,
    requiredScopes: ["foundation:write"],
  },
  {
    name: "POST /service-area/admin/stop-policies/:stopPolicyId/retire",
    controller: ServiceAreaController,
    handler: serviceAreaPrototype.retireStopPolicy,
    method: "POST",
    routePath: "service-area/admin/stop-policies/sp-1/retire",
    allowedRealms: SHARED_ADMIN_MAP_REALMS,
    requiredScopes: ["foundation:write"],
  },
];

// A minimal stand-in for @nestjs/core's Reflector.getAllAndOverride, reading
// the same Reflect metadata SetMetadata-based decorators write. Root-level
// tests cannot resolve the bare "@nestjs/core" specifier (only apps/api's
// own node_modules has it), so this avoids that resolution failure while
// exercising the identical handler-then-class metadata lookup the guard uses.
type ReflectorLike = ConstructorParameters<typeof BootstrapAuthGuard>[0];

const reflector = {
  getAllAndOverride<T>(key: string, targets: unknown[]): T | undefined {
    for (const target of targets) {
      const value = Reflect.getMetadata(key, target as object) as
        | T
        | undefined;
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  },
} as unknown as ReflectorLike;

function metadataFor(route: RouteCase) {
  const isOpen =
    reflector.getAllAndOverride<boolean>(AUTH_OPEN_ROUTE_KEY, [
      route.handler,
      route.controller,
    ]) ?? false;
  const realms =
    reflector.getAllAndOverride<string[]>(AUTH_ALLOWED_REALMS_KEY, [
      route.handler,
      route.controller,
    ]) ?? [];
  const scopes =
    reflector.getAllAndOverride<string[]>(AUTH_REQUIRED_SCOPES_KEY, [
      route.handler,
      route.controller,
    ]) ?? [];
  return { isOpen, realms, scopes };
}

function buildContext(route: RouteCase, request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => route.handler,
    getClass: () => route.controller,
  } as never;
}

function bootstrapHeaders(
  actorType: string,
  realm: string,
  scopes: readonly string[] = [],
) {
  return {
    "x-actor-type": actorType,
    "x-actor-id": `${actorType}-negative-test`,
    "x-realm": realm,
    ...(scopes.length ? { "x-scopes": scopes.join(",") } : {}),
  };
}

function requestFor(route: RouteCase, headers: Record<string, string>) {
  return {
    headers,
    method: route.method,
    url: `/api/${route.routePath}`,
    originalUrl: `/api/${route.routePath}`,
  };
}

const REALM_ACTOR_TYPE: Record<AuthRealm, string> = {
  system: "system",
  platform: "platform_admin",
  tenant: "tenant_admin",
  ops: "ops_user",
  driver: "driver_user",
  partner: "partner_api_key",
};

async function activate(guard: BootstrapAuthGuard, context: unknown) {
  return guard.canActivate(context as never);
}

async function expectDenied(
  guard: BootstrapAuthGuard,
  context: unknown,
  code: string,
) {
  await expect(activate(guard, context)).rejects.toMatchObject({
    code,
  });
}

describe("IAM foundation/geo/service-area route classification", () => {
  it("declares an explicit policy (open route, decorator, or central policy) for all 20 GAP routes", () => {
    expect(ROUTES).toHaveLength(20);
    for (const route of ROUTES) {
      const { isOpen, realms, scopes } = metadataFor(route);
      const centralPolicy = resolveRouteAuthPolicy(
        route.method,
        route.routePath,
      );
      const classified =
        isOpen || realms.length > 0 || scopes.length > 0 || Boolean(centralPolicy);
      expect(classified, `${route.name} must be explicitly classified`).toBe(
        true,
      );
      expect(isOpen, `${route.name} must not be an open route`).toBe(false);
    }
  });

  it("matches the SD 5.4 allowed-realm and required-scope matrix for every route", () => {
    for (const route of ROUTES) {
      const { realms, scopes } = metadataFor(route);
      expect(new Set(realms), route.name).toEqual(
        new Set(route.allowedRealms),
      );
      expect(new Set(scopes), route.name).toEqual(
        new Set(route.requiredScopes),
      );
    }
  });

  it("rejects unauthenticated requests to every route", async () => {
    const guard = new BootstrapAuthGuard(reflector);
    for (const route of ROUTES) {
      const context = buildContext(route, requestFor(route, {}));
      await expectDenied(guard, context, "AUTH_REQUIRED");
    }
  });

  it("allows only the SD-approved realms and denies every other realm", async () => {
    const guard = new BootstrapAuthGuard(reflector);
    for (const route of ROUTES) {
      for (const realm of AUTH_REALMS) {
        const scopes = route.requiredScopes.length
          ? route.requiredScopes
          : [];
        const context = buildContext(
          route,
          requestFor(
            route,
            bootstrapHeaders(REALM_ACTOR_TYPE[realm], realm, scopes),
          ),
        );

        if (route.allowedRealms.includes(realm)) {
          await expect(
            activate(guard, context),
            `${route.name} should allow realm ${realm}`,
          ).resolves.toBe(true);
        } else {
          await expectDenied(guard, context, "AUTH_REALM_DENIED");
        }
      }
    }
  });

  it("service-area shared reads reject tenant driver and partner realms only when out of the SD allowlist", async () => {
    const guard = new BootstrapAuthGuard(reflector);
    const sharedReads = ROUTES.filter((route) =>
      route.routePath.startsWith("service-area/") &&
      !route.routePath.includes("admin/"),
    );
    expect(sharedReads.length).toBeGreaterThan(0);
    for (const route of sharedReads) {
      // Confirms the acceptance wording: shared map reads keep tenant and
      // driver, but never widen to partner (not in SD 5.4's operational row).
      expect(route.allowedRealms).toContain("tenant");
      expect(route.allowedRealms).toContain("driver");
      expect(route.allowedRealms).not.toContain("partner");

      const context = buildContext(
        route,
        requestFor(route, bootstrapHeaders("partner_api_key", "partner")),
      );
      await expectDenied(guard, context, "AUTH_REALM_DENIED");
    }
  });

  it("service-area admin lifecycle rejects tenant, driver, and partner realms even with a claimed scope", async () => {
    const guard = new BootstrapAuthGuard(reflector);
    const adminMutations = ROUTES.filter((route) =>
      route.routePath.includes("admin/") && route.method === "POST",
    );
    expect(adminMutations.length).toBe(10);

    for (const route of adminMutations) {
      for (const [actorType, realm] of [
        ["tenant_admin", "tenant"],
        ["driver_user", "driver"],
        ["partner_api_key", "partner"],
      ] as const) {
        const context = buildContext(
          route,
          requestFor(
            route,
            bootstrapHeaders(actorType, realm, ["foundation:write"]),
          ),
        );
        await expectDenied(guard, context, "AUTH_REALM_DENIED");
      }
    }
  });

  it("service-area admin lifecycle denies an in-realm actor missing foundation:write", async () => {
    const guard = new BootstrapAuthGuard(reflector);
    const adminMutations = ROUTES.filter((route) =>
      route.routePath.includes("admin/") &&
      route.method === "POST",
    );

    for (const route of adminMutations) {
      const missingScopeContext = buildContext(
        route,
        requestFor(route, bootstrapHeaders("ops_user", "ops", [])),
      );
      await expectDenied(guard, missingScopeContext, "AUTH_SCOPE_DENIED");

      const withScopeContext = buildContext(
        route,
        requestFor(
          route,
          bootstrapHeaders("ops_user", "ops", ["foundation:write"]),
        ),
      );
      await expect(activate(guard, withScopeContext)).resolves.toBe(true);
    }
  });

  it("service-area admin geojson denies an in-realm actor missing foundation:read", async () => {
    const guard = new BootstrapAuthGuard(reflector);
    const route = ROUTES.find(
      (candidate) => candidate.routePath === "service-area/admin/geojson",
    )!;

    // ops_user's default scope preset does not include foundation:read, so
    // omitting x-scopes proves the guard denies rather than silently
    // granting the platform_admin preset (which already carries the scope).
    const missingScope = buildContext(
      route,
      requestFor(route, bootstrapHeaders("ops_user", "ops", [])),
    );
    await expectDenied(guard, missingScope, "AUTH_SCOPE_DENIED");

    const withScope = buildContext(
      route,
      requestFor(
        route,
        bootstrapHeaders("ops_user", "ops", ["foundation:read"]),
      ),
    );
    await expect(activate(guard, withScope)).resolves.toBe(true);
  });

  it("foundation manifest is restricted to system, platform, and ops with foundation:read", async () => {
    const guard = new BootstrapAuthGuard(reflector);
    const route = ROUTES.find(
      (candidate) => candidate.routePath === "system/foundation/manifest",
    )!;

    const deniedRealm = buildContext(
      route,
      requestFor(
        route,
        bootstrapHeaders("driver_user", "driver", ["foundation:read"]),
      ),
    );
    await expectDenied(guard, deniedRealm, "AUTH_REALM_DENIED");

    const deniedScope = buildContext(
      route,
      requestFor(route, bootstrapHeaders("ops_user", "ops", [])),
    );
    await expectDenied(guard, deniedScope, "AUTH_SCOPE_DENIED");

    const allowed = buildContext(
      route,
      requestFor(
        route,
        bootstrapHeaders("ops_user", "ops", ["foundation:read"]),
      ),
    );
    await expect(activate(guard, allowed)).resolves.toBe(true);
  });
});

describe("Geo provider errors never expose configured secret values", () => {
  function createGeoService(env: Record<string, string | undefined>) {
    return new GeoService(
      new MockGeoProvider(),
      new GeoProviderConfigService({
        NODE_ENV: "test",
        DRTS_ENV: "test",
        ...env,
      }),
    );
  }

  it("redacts a configured provider secret value from the fail-closed error response", async () => {
    const liveLookingSecret = "AIzaSyDNegativeTestSecretValueDoNotLeak-000";
    const service = createGeoService({
      MAP_PROVIDER_MODE: "external",
      MAP_PROVIDER_NAME: "google",
      GOOGLE_MAPS_GEOCODING_API_KEY: liveLookingSecret,
      // GOOGLE_MAPS_ROUTES_API_KEY intentionally left unset so the provider
      // is still fail-closed even though one real secret value is present.
    });

    try {
      await service.route({
        origin: { lat: 25.0478, lng: 121.5171 },
        destination: { lat: 25.0375, lng: 121.5637 },
        travelMode: "drive",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      const apiError = error as ApiRequestError;
      expect(apiError.getStatus()).toBe(503);
      const response = apiError.getResponse();
      expect(response).toMatchObject({
        error: {
          code: "GEO_PROVIDER_NOT_CONFIGURED",
          details: {
            missingSecretNames: ["GOOGLE_MAPS_ROUTES_API_KEY"],
          },
        },
      });
      const serialized = JSON.stringify(response);
      expect(serialized).not.toContain(liveLookingSecret);
      expect(serialized).not.toContain("GOOGLE_MAPS_GEOCODING_API_KEY");
      return;
    }

    throw new Error("Expected geo route to fail closed on missing secrets.");
  });
});
