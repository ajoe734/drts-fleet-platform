import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { PassengerJwtService } from "../../../apps/api/src/common/auth/passenger-jwt.service";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { resolveRouteAuthPolicy } from "../../../apps/api/src/common/auth/auth.policy";
import type { AuthenticatedRequestLike } from "../../../apps/api/src/common/auth/auth.types";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { PassengerBookingController } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.controller";
import { PassengerBookingSettingsController } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking-settings.controller";
import { MemoryPassengerStore } from "../pax-account-session-20261009/memory-store";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import {
  createProductionBookingFixture,
  NOW,
} from "./production-booking-fixture";

const requireApi = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
const { Reflector } = requireApi("@nestjs/core");
const routes = [
  ["POST", "/api/passenger-app/rides", "createRide"],
  ["GET", "/api/passenger-app/rides", "listRides"],
  ["GET", "/api/passenger-app/rides/active", "getActiveRides"],
  ["GET", "/api/passenger-app/rides/id", "getRide"],
  ["GET", "/api/passenger-app/rides/id/events", "getRideEvents"],
  ["POST", "/api/passenger-app/rides/id/cancel", "cancelRide"],
  ["POST", "/api/passenger-app/rides/id/ratings", "rateRide"],
  ["GET", "/api/passenger-app/rides/id/receipt", "getReceipt"],
] as const;

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "unit-only-booking-session-key");
  vi.stubEnv("JWT_PRIVATE_KEY", "");
  vi.stubEnv("JWT_PUBLIC_KEY", "");
  vi.stubEnv("JWT_KEY_RING_JSON", "");
  vi.stubEnv("JWT_ALGORITHM", "HS256");
  vi.stubEnv("JWT_ALGORITHMS", "HS256");
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("DRTS_ENV", undefined);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DRTS_INTERNAL_KEY", "");
  vi.stubEnv("MULTI_TAXI_DEFAULT_AUTHORIZATION_ID", "");
  vi.stubEnv("REQUIRE_SMS_VERIFICATION", "false");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function sessions() {
  // Only persistence and Google verification are boundaries. The passenger
  // JWT, session revocation, production guard and actual controller metadata run.
  const service = new PassengerAccountService(
    new MemoryPassengerStore(),
    new PassengerJwtService(),
  );
  const account = await service.findOrCreateByIdentity(
    "google",
    "booking-account-a",
  );
  const session = await service.issueSession(account.drtsPassengerId);
  const legacy = new JwtAuthService();
  const google = {
    verifyServicePrincipal: vi.fn(async (headers: Record<string, string>) => {
      if (headers["x-drts-google-id-token"] !== "metadata-stub")
        throw new ApiRequestError(
          401,
          "GOOGLE_ASSERTION_INVALID",
          "Invalid boundary credential",
        );
      return { principalId: "bff-unit" };
    }),
  };
  const guard = new BootstrapAuthGuard(
    new Reflector(),
    legacy,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    google as never,
    service,
  );
  return { service, account, session, guard, legacy, google };
}

function context(
  request: AuthenticatedRequestLike,
  handler: keyof PassengerBookingController,
) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getClass: () => PassengerBookingController,
    getHandler: () => PassengerBookingController.prototype[handler],
  } as never;
}
function request(
  method: string,
  url: string,
  token?: string,
): AuthenticatedRequestLike {
  return {
    method,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
}

describe.each(["development", "staging", "production"])(
  "all booking entry points in %s",
  (environment) => {
    it.each(routes)(
      "accepts a passenger session on %s %s and rejects it after logout",
      async (method, url, handler) => {
        const f = await sessions();
        vi.stubEnv("APP_ENV", environment);
        const req = request(method, url, f.session.accessToken);
        expect(resolveRouteAuthPolicy(method, url)?.allowedRealms).toEqual([
          "passenger",
        ]);
        expect(await f.guard.canActivate(context(req, handler))).toBe(true);
        expect(req.identity).toMatchObject({
          realm: "passenger",
          drtsPassengerId: f.account.drtsPassengerId,
        });
        await f.service.logout(f.session.refreshToken);
        await expect(
          f.guard.canActivate(context(req, handler)),
        ).rejects.toMatchObject({ code: "unauthorized" });
        expect(req.identity).toBeUndefined();
      },
    );

    it.each([
      ["system", "system"],
      ["platform_admin", "platform"],
      ["tenant_admin", "tenant"],
      ["ops_user", "ops"],
      ["ops_observer", "ops"],
      ["driver_user", "driver"],
      ["partner_api_key", "partner"],
      ["partner_user", "partner"],
      ["referral_passenger", "partner"],
    ] as const)(
      "rejects a valid legacy %s token on every account booking route",
      async (actorType, realm) => {
        const f = await sessions();
        const token = f.legacy.sign({
          authMode: "jwt_bearer",
          actorType,
          realm,
          actorId: f.account.drtsPassengerId,
          drtsPassengerId: f.account.drtsPassengerId,
          tenantId: null,
          roleFamilies: [],
          roles: [],
          scopes: [],
        });
        vi.stubEnv("APP_ENV", environment);
        for (const [method, url, handler] of routes) {
          const req = request(method, url, token);
          await expect(
            f.guard.canActivate(context(req, handler)),
          ).rejects.toMatchObject({ code: "unauthorized" });
          expect(req.identity).toBeUndefined();
        }
      },
    );

    it("rejects absent credentials and bootstrap headers across all booking routes", async () => {
      const f = await sessions();
      vi.stubEnv("APP_ENV", environment);
      for (const [method, url, handler] of routes) {
        const req = request(method, url);
        await expect(
          f.guard.canActivate(context(req, handler)),
        ).rejects.toMatchObject({ code: "unauthorized" });
        req.headers = {
          "x-realm": "passenger",
          "x-actor-id": f.account.drtsPassengerId,
          "x-actor-type": "first_party_passenger",
        };
        await expect(async () =>
          f.guard.canActivate(context(req, handler)),
        ).rejects.toMatchObject({ status: 401 });
      }
    });

    it("permits public booking settings through the BFF's verified metadata boundary", async () => {
      const f = await sessions();
      vi.stubEnv("APP_ENV", environment);
      const req = request(
        "GET",
        "/api/passenger-app/booking-settings",
        "metadata-stub",
      );
      const ctx = {
        switchToHttp: () => ({ getRequest: () => req }),
        getClass: () => PassengerBookingSettingsController,
        getHandler: () =>
          PassengerBookingSettingsController.prototype.getSettings,
      } as never;
      expect(await f.guard.canActivate(ctx)).toBe(true);
      expect(req.identity).toBeUndefined();
      if (environment !== "development") {
        expect(f.google.verifyServicePrincipal).toHaveBeenCalledOnce();
        req.headers = { authorization: "Bearer forged" };
        await expect(f.guard.canActivate(ctx)).rejects.toMatchObject({
          code: "GOOGLE_ASSERTION_INVALID",
        });
      }
    });
  },
);

it("switching accounts uses the newly authenticated owner and cannot reuse the first account's ride", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const f = await sessions();
  const booking = createProductionBookingFixture([], 120);
  booking.account.drtsPassengerId = f.account.drtsPassengerId;
  booking.snapshot.drtsPassengerId = f.account.drtsPassengerId;
  const req = request(
    "POST",
    "/api/passenger-app/rides",
    f.session.accessToken,
  );
  await f.guard.canActivate(context(req, "createRide"));
  const created = await booking.controller.createRide(
    req.identity!,
    "create-request",
    booking.command,
  );
  const id = created.data.ride.order.orderId;
  const secondAccount = await f.service.findOrCreateByIdentity(
    "line",
    "booking-account-b",
  );
  const secondSession = await f.service.issueSession(
    secondAccount.drtsPassengerId,
  );
  req.method = "GET";
  req.url = `/api/passenger-app/rides/${id}`;
  req.headers = { authorization: `Bearer ${secondSession.accessToken}` };
  await f.guard.canActivate(context(req, "getRide"));
  expect(req.identity?.drtsPassengerId).toBe(secondAccount.drtsPassengerId);
  await expect(
    booking.controller.getRide(req.identity!, id),
  ).rejects.toMatchObject({ code: "PASSENGER_RIDE_NOT_FOUND" });
});
