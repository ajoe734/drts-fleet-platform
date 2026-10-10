import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { PassengerJwtService } from "../../../apps/api/src/common/auth/passenger-jwt.service";
import { resolveRouteAuthPolicy } from "../../../apps/api/src/common/auth/auth.policy";
import { RequireScopes } from "../../../apps/api/src/common/auth";
import type { AuthenticatedRequestLike } from "../../../apps/api/src/common/auth/auth.types";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { GeoController } from "../../../apps/api/src/modules/geo/geo.controller";
import { ServiceAreaController } from "../../../apps/api/src/modules/service-area/service-area.controller";
import { PassengerFareController } from "../../../apps/api/src/modules/passenger-app/fare/passenger-fare.controller";
import { MemoryPassengerStore } from "../pax-account-session-20261009/memory-store";

const requireApi = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
const { Reflector } = requireApi("@nestjs/core");
const routes = [
  ["GET", "search"],
  ["POST", "resolve"],
  ["POST", "reverse"],
  ["POST", "route"],
] as const;
// Test-only added scope exercises the guard's merged authorization contract.
// The actual four geo handlers currently require no scopes.
@RequireScopes("foundation:read")
class ScopedGeoController extends GeoController {}
beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "unit-only-fare-geo-key");
  vi.stubEnv("JWT_PRIVATE_KEY", "");
  vi.stubEnv("JWT_PUBLIC_KEY", "");
  vi.stubEnv("JWT_KEY_RING_JSON", "");
  vi.stubEnv("JWT_ALGORITHM", "HS256");
  vi.stubEnv("JWT_ALGORITHMS", "HS256");
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("DRTS_ENV", undefined);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DRTS_INTERNAL_KEY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
function context(
  request: AuthenticatedRequestLike,
  handler: string,
  controller:
    | typeof GeoController
    | typeof ServiceAreaController
    | typeof PassengerFareController = GeoController,
) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () =>
      controller.prototype[handler as keyof typeof controller.prototype],
    getClass: () => controller,
  } as never;
}
async function fixture(google?: unknown) {
  const store = new MemoryPassengerStore();
  const accounts = new PassengerAccountService(
    store,
    new PassengerJwtService(),
  );
  const account = await accounts.findOrCreateByIdentity(
    "google",
    "fare-geo-unit",
  );
  const session = await accounts.issueSession(account.drtsPassengerId);
  const legacy = new JwtAuthService();
  const guard = new BootstrapAuthGuard(
    new Reflector(),
    legacy,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    google as never,
    accounts,
  );
  return { accounts, account, session, legacy, guard, store };
}
function request(
  method: string,
  path: string,
  token?: string,
): AuthenticatedRequestLike {
  return {
    method,
    url: path,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
}

describe.each(["development", "staging", "production"])(
  "actual geo metadata and passenger guard in %s",
  (environment) => {
    it.each(routes)(
      "allows live passenger %s geo/%s; denies it after logout",
      async (method, handler) => {
        const f = await fixture();
        vi.stubEnv("APP_ENV", environment);
        const path = `/api/geo/${handler}`;
        const r = request(method, path, f.session.accessToken);
        expect(resolveRouteAuthPolicy(method, path)?.allowedRealms).toContain(
          "passenger",
        );
        expect(await f.guard.canActivate(context(r, handler))).toBe(true);
        expect(r.identity).toMatchObject({
          realm: "passenger",
          drtsPassengerId: f.account.drtsPassengerId,
        });
        await f.accounts.logout(f.session.refreshToken);
        await expect(
          f.guard.canActivate(
            context(request(method, path, f.session.accessToken), handler),
          ),
        ).rejects.toMatchObject({
          code: "JWT_INVALID",
        });
      },
    );
    it.each(routes)(
      "accepts the verified inner Bearer on %s geo/%s",
      async (method, handler) => {
        const f = await fixture();
        vi.stubEnv("APP_ENV", environment);
        const r = request(method, `/api/geo/${handler}`, "outer-metadata");
        r.headers["x-drts-authorization"] = `Bearer ${f.session.accessToken}`;
        expect(await f.guard.canActivate(context(r, handler))).toBe(true);
        expect(r.identity).toMatchObject({
          authMode: "jwt_bearer",
          realm: "passenger",
          actorId: f.account.drtsPassengerId,
          tenantId: null,
          scopes: [],
        });
      },
    );
    it.each(routes)(
      "rejects absent, arbitrary, expired, and sessionless credentials on %s geo/%s",
      async (method, handler) => {
        const f = await fixture();
        vi.stubEnv("APP_ENV", environment);
        const path = `/api/geo/${handler}`;
        await expect(
          Promise.resolve().then(() =>
            f.guard.canActivate(context(request(method, path), handler)),
          ),
        ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
        for (const token of [
          "arbitrary-invalid",
          new PassengerJwtService().sign(
            f.account.drtsPassengerId,
            randomUUID(),
          ),
        ]) {
          const r = request(method, path, token);
          await expect(
            f.guard.canActivate(context(r, handler)),
          ).rejects.toMatchObject({
            code: "JWT_INVALID",
          });
          expect(r.identity).toBeUndefined();
        }
        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 16 * 60 * 1000);
        await expect(
          f.guard.canActivate(
            context(request(method, path, f.session.accessToken), handler),
          ),
        ).rejects.toMatchObject({ code: "JWT_INVALID" });
      },
    );
    it.each(routes)(
      "rejects deleted accounts and missing session authority on %s geo/%s",
      async (method, handler) => {
        const f = await fixture();
        vi.stubEnv("APP_ENV", environment);
        const path = `/api/geo/${handler}`;
        const withoutAccounts = new BootstrapAuthGuard(
          new Reflector(),
          f.legacy,
        );
        await expect(
          withoutAccounts.canActivate(
            context(request(method, path, f.session.accessToken), handler),
          ),
        ).rejects.toMatchObject({ code: "JWT_INVALID" });
        const identity = await f.accounts.authenticateAccessToken(
          f.session.accessToken,
        );
        await f.accounts.deleteAccount(identity);
        await expect(
          f.guard.canActivate(
            context(request(method, path, f.session.accessToken), handler),
          ),
        ).rejects.toMatchObject({ code: "JWT_INVALID" });
      },
    );
    it("propagates session storage failures without allowing access or using workload fallback", async () => {
      const google = { verifyServicePrincipal: vi.fn() };
      const f = await fixture(google);
      vi.stubEnv("APP_ENV", environment);
      vi.spyOn(f.store, "transaction").mockRejectedValue(
        new Error("unit-storage-unavailable"),
      );
      for (const [method, handler] of routes) {
        const r = request(method, `/api/geo/${handler}`, f.session.accessToken);
        await expect(f.guard.canActivate(context(r, handler))).rejects.toThrow(
          "unit-storage-unavailable",
        );
        expect(r.identity).toBeUndefined();
      }
      expect(google.verifyServicePrincipal).not.toHaveBeenCalled();
    });
    it("enforces added decorator scopes for both passenger and legacy sessions", async () => {
      const f = await fixture();
      vi.stubEnv("APP_ENV", environment);
      const { token } = await f.legacy.issueSessionToken({
        authMode: "jwt_bearer",
        actorType: "platform_admin",
        actorId: "unit-scoped-platform",
        realm: "platform",
        tenantId: null,
        roles: [],
        roleFamilies: [],
        scopes: [],
      });
      for (const [method, handler] of routes) {
        for (const credential of [f.session.accessToken, token]) {
          await expect(
            f.guard.canActivate(
              context(
                request(method, `/api/geo/${handler}`, credential),
                handler,
                ScopedGeoController,
              ),
            ),
          ).rejects.toMatchObject({ code: "AUTH_SCOPE_DENIED" });
        }
      }
    });
    it("rejects passenger bootstrap identities without a Bearer token", async () => {
      const f = await fixture();
      vi.stubEnv("APP_ENV", environment);
      for (const [method, handler] of routes) {
        const r = request(method, `/api/geo/${handler}`);
        r.headers["x-realm"] = "passenger";
        r.headers["x-actor-type"] = "first_party_passenger";
        r.headers["x-actor-id"] = f.account.drtsPassengerId;
        await expect(
          Promise.resolve().then(() =>
            f.guard.canActivate(context(r, handler)),
          ),
        ).rejects.toMatchObject({
          code:
            environment === "development"
              ? "AUTH_REQUIRED"
              : "AUTH_BOOTSTRAP_HEADERS_FORBIDDEN",
        });
      }
    });
    it.skipIf(environment === "development")(
      "preserves strict bootstrap-header rejection even with a live passenger JWT",
      async () => {
        const f = await fixture();
        vi.stubEnv("APP_ENV", environment);
        for (const [method, handler] of routes) {
          const r = request(
            method,
            `/api/geo/${handler}`,
            f.session.accessToken,
          );
          r.headers["x-realm"] = "passenger";
          await expect(
            Promise.resolve().then(() =>
              f.guard.canActivate(context(r, handler)),
            ),
          ).rejects.toMatchObject({ code: "AUTH_BOOTSTRAP_HEADERS_FORBIDDEN" });
        }
      },
    );
    it.each([
      "system",
      "platform",
      "tenant",
      "ops",
      "driver",
      "partner",
    ] as const)("retains geo access for existing %s realm", async (realm) => {
      const f = await fixture();
      vi.stubEnv("APP_ENV", environment);
      const actors = {
        system: "system",
        platform: "platform_admin",
        tenant: "tenant_admin",
        ops: "ops_user",
        driver: "driver_user",
        partner: "partner_user",
      } as const;
      const { token } = await f.legacy.issueSessionToken({
        authMode: "jwt_bearer",
        actorType: actors[realm],
        actorId: `unit-${realm}`,
        realm,
        tenantId: realm === "tenant" ? "unit-tenant" : null,
        roles: [],
        roleFamilies: [],
        scopes: [],
      });
      for (const [method, handler] of routes) {
        expect(
          await f.guard.canActivate(
            context(request(method, `/api/geo/${handler}`, token), handler),
          ),
        ).toBe(true);
      }
    });
    it("does not open health, wrong methods, or unrelated protected routes to passenger JWT", async () => {
      const f = await fixture();
      vi.stubEnv("APP_ENV", environment);
      for (const [method, path, handler] of [
        ["GET", "/api/geo/health", "health"],
        ["POST", "/api/geo/search", "search"],
        ["GET", "/api/geo/resolve", "resolve"],
        ["GET", "/api/geo/reverse", "reverse"],
        ["GET", "/api/geo/route", "route"],
      ]) {
        await expect(
          f.guard.canActivate(
            context(request(method!, path!, f.session.accessToken), handler!),
          ),
        ).rejects.toMatchObject({ code: "JWT_INVALID" });
        expect(
          resolveRouteAuthPolicy(method!, path!)?.allowedRealms ?? [],
        ).not.toContain("passenger");
      }
      for (const [method, path, handler] of [
        ["GET", "/api/service-area/definitions", "listDefinitions"],
        ["POST", "/api/service-area/evaluate", "evaluateServiceArea"],
        ["GET", "/api/service-area/admin/geojson", "exportAdminGeoJson"],
        ["POST", "/api/service-area/admin/service-areas", "createServiceArea"],
      ]) {
        await expect(
          f.guard.canActivate(
            context(
              request(method!, path!, f.session.accessToken),
              handler!,
              ServiceAreaController,
            ),
          ),
        ).rejects.toMatchObject({ code: "JWT_INVALID" });
      }
    });
    it("requires real live passenger access on the quote controller", async () => {
      const f = await fixture();
      vi.stubEnv("APP_ENV", environment);
      const r = request(
        "POST",
        "/api/passenger-app/quotes",
        f.session.accessToken,
      );
      expect(
        await f.guard.canActivate(context(r, "quote", PassengerFareController)),
      ).toBe(true);
      await expect(
        f.guard.canActivate(
          context(
            request("POST", "/api/passenger-app/quotes"),
            "quote",
            PassengerFareController,
          ),
        ),
      ).rejects.toMatchObject({ code: "unauthorized" });
    });
    it("serves the public fare controller via the BFF metadata boundary", async () => {
      const google = {
        verifyServicePrincipal: vi
          .fn()
          .mockResolvedValue({ principalId: "unit-bff" }),
      };
      const f = await fixture(google);
      vi.stubEnv("APP_ENV", environment);
      const r = request(
        "GET",
        "/api/passenger-app/fares",
        "metadata-unit-stub",
      );
      expect(
        await f.guard.canActivate(context(r, "fares", PassengerFareController)),
      ).toBe(true);
      expect(r.identity).toBeUndefined();
      if (environment !== "development")
        expect(google.verifyServicePrincipal).toHaveBeenCalled();
    });
    it.skipIf(environment === "development")(
      "rejects arbitrary Bearer on the public fare controller in strict environments",
      async () => {
        const f = await fixture();
        vi.stubEnv("APP_ENV", environment);
        await expect(
          f.guard.canActivate(
            context(
              request("GET", "/api/passenger-app/fares", "arbitrary-invalid"),
              "fares",
              PassengerFareController,
            ),
          ),
        ).rejects.toThrow();
      },
    );
  },
);
