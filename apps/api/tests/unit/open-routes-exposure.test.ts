import "reflect-metadata";
import { Reflector } from "@nestjs/core";
import {
  THROTTLER_LIMIT,
  THROTTLER_SKIP,
} from "@nestjs/throttler/dist/throttler.constants";
import { describe, expect, it } from "vitest";

import {
  AUTH_OPEN_ROUTE_KEY,
  BootstrapAuthGuard,
} from "../../src/common/auth";
import { HealthController, buildHealthPayload } from "../../src/health/health.controller";
import { AuthController } from "../../src/modules/auth/auth.controller";
import { IdentityController } from "../../src/modules/identity/identity.controller";
import { MultiTaxiController } from "../../src/modules/multi-taxi/multi-taxi.controller";
import { TenantPartnerController } from "../../src/modules/tenant-partner/tenant-partner.controller";

describe("IAM-P0-003 Open Routes Rate & Data Exposure Tests (Requirement 4)", () => {
  const reflector = new Reflector();

  function createOpenRouteContext(targetClass: abstract new (...args: any[]) => any, methodName: string) {
    const handler = (targetClass.prototype as Record<string, any>)[methodName];
    if (typeof handler !== "function") {
      throw new Error(`Handler ${methodName} on ${targetClass.name} is not a function`);
    }
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {},
          method: "GET",
          originalUrl: "/api/test-open-route",
        }),
      }),
      getHandler: () => handler,
      getClass: () => targetClass,
    } as never;
  }

  const openRouteTargets: Array<{ name: string; class: any; method: string }> = [
    { name: "HealthController.getHealth", class: HealthController, method: "getHealth" },
    { name: "AuthController.issueToken", class: AuthController, method: "issueToken" },
    { name: "AuthController.issueDriverDeviceSession", class: AuthController, method: "issueDriverDeviceSession" },
    { name: "AuthController.refreshDriverDeviceSession", class: AuthController, method: "refreshDriverDeviceSession" },
    { name: "AuthController.issueTenantBootstrapSession", class: AuthController, method: "issueTenantBootstrapSession" },
    { name: "AuthController.issuePartnerBootstrapSession", class: AuthController, method: "issuePartnerBootstrapSession" },
    { name: "IdentityController.getContext", class: IdentityController, method: "getContext" },
    { name: "MultiTaxiController.createRide", class: MultiTaxiController, method: "createRide" },
    { name: "MultiTaxiController.getPassengerRide", class: MultiTaxiController, method: "getPassengerRide" },
    { name: "MultiTaxiController.streamPassengerRide", class: MultiTaxiController, method: "streamPassengerRide" },
    { name: "MultiTaxiController.cancelPassengerRide", class: MultiTaxiController, method: "cancelPassengerRide" },
    { name: "MultiTaxiController.submitPassengerRating", class: MultiTaxiController, method: "submitPassengerRating" },
    { name: "MultiTaxiController.getPassengerContact", class: MultiTaxiController, method: "getPassengerContact" },
    { name: "MultiTaxiController.getPassengerReceipt", class: MultiTaxiController, method: "getPassengerReceipt" },
    { name: "TenantPartnerController.listTenantRoles", class: TenantPartnerController, method: "listTenantRoles" },
    { name: "TenantPartnerController.issuePartnerIngressHandoff", class: TenantPartnerController, method: "issuePartnerIngressHandoff" },
    { name: "TenantPartnerController.issueReferralEmbedHandoffArtifact", class: TenantPartnerController, method: "issueReferralEmbedHandoffArtifact" },
    { name: "TenantPartnerController.consumeReferralEmbedHandoffArtifact", class: TenantPartnerController, method: "consumeReferralEmbedHandoffArtifact" },
    { name: "TenantPartnerController.recordReferralEmbedConsent", class: TenantPartnerController, method: "recordReferralEmbedConsent" },
    { name: "TenantPartnerController.listPartnerEntries", class: TenantPartnerController, method: "listPartnerEntries" },
    { name: "TenantPartnerController.getPartnerEntry", class: TenantPartnerController, method: "getPartnerEntry" },
  ];

  it("verifies all registered open routes carry explicit @OpenRoute metadata", () => {
    for (const item of openRouteTargets) {
      const handler = item.class.prototype[item.method];
      expect(typeof handler, `Handler ${item.method} on ${item.name} must exist`).toBe("function");
      const isOpen = reflector.getAllAndOverride<boolean>(AUTH_OPEN_ROUTE_KEY, [
        handler,
        item.class,
      ]);
      expect(isOpen, `${item.name} must be decorated with @OpenRoute()`).toBe(true);
    }
  });

  it("verifies all open routes carry explicit rate-limiting throttle controls (@Throttle or @SkipThrottle)", () => {
    for (const item of openRouteTargets) {
      const handler = item.class.prototype[item.method];
      const handlerLimit = Reflect.getMetadata(THROTTLER_LIMIT + "default", handler);
      const classLimit = Reflect.getMetadata(THROTTLER_LIMIT + "default", item.class);
      const handlerSkip = Reflect.getMetadata(THROTTLER_SKIP + "default", handler);
      const classSkip = Reflect.getMetadata(THROTTLER_SKIP + "default", item.class);

      const hasThrottleLimit = typeof handlerLimit === "number" || typeof classLimit === "number";
      const hasSkipThrottle = handlerSkip === true || classSkip === true;

      expect(
        hasThrottleLimit || hasSkipThrottle,
        `Open route ${item.name} must be explicitly decorated with @Throttle(...) or @SkipThrottle(...)`,
      ).toBe(true);
    }
  });

  it("verifies Health payload does not expose sensitive credentials or secrets", () => {
    const payload = buildHealthPayload();
    expect(payload).toHaveProperty("service", "api");
    expect(payload).toHaveProperty("status", "ok");
    expect(payload).not.toHaveProperty("JWT_SECRET");
    expect(payload).not.toHaveProperty("DRTS_INTERNAL_KEY");
    expect(payload).not.toHaveProperty("DATABASE_URL");
    const payloadStr = JSON.stringify(payload);
    expect(payloadStr).not.toContain("secret");
    expect(payloadStr).not.toContain("password");
  });

  it("ensures BootstrapAuthGuard allows unauthenticated access to @OpenRoute handlers", () => {
    const guard = new BootstrapAuthGuard(reflector);

    for (const item of openRouteTargets) {
      const context = createOpenRouteContext(item.class, item.method);
      expect(guard.canActivate(context)).toBe(true);
    }
  });
});

