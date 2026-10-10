import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { PassengerJwtService } from "../../../apps/api/src/common/auth/passenger-jwt.service";
import { resolveRouteAuthPolicy } from "../../../apps/api/src/common/auth/auth.policy";
import type { AuthenticatedRequestLike } from "../../../apps/api/src/common/auth/auth.types";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { GeoController } from "../../../apps/api/src/modules/geo/geo.controller";
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
    | typeof PassengerFareController = GeoController,
) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () =>
      controller.prototype[handler as keyof typeof controller.prototype],
    getClass: () => controller,
  } as never;
}
async function fixture() {
  const accounts = new PassengerAccountService(
    new MemoryPassengerStore(),
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
    undefined,
    accounts,
  );
  return { accounts, account, session, legacy, guard };
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
          code: expect.stringMatching(/unauthorized|JWT_INVALID/),
        });
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
      const token = f.legacy.sign({
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
        ["GET", "/api/geo/route", "route"],
        ["GET", "/api/service-area/definitions", "health"],
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
  },
);
