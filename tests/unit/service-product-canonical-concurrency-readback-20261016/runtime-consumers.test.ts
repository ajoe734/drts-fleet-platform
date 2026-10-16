import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VehicleEligibilityService } from "../../../apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service";
import {
  createProductionBookingFixture,
  NOW,
  OWNER,
} from "../pax-booking-history-20261009/production-booking-fixture";
import {
  ProductSqlBoundary,
  enterprise,
  productInstance,
} from "./sql-boundary";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("DRTS_ENV", "test");
  vi.stubEnv("REQUIRE_SMS_VERIFICATION", "false");
  vi.stubEnv("MULTI_TAXI_DEFAULT_AUTHORIZATION_ID", "");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function reservationPeers() {
  const db = new ProductSqlBoundary();
  const a = productInstance(db),
    b = productInstance(db);
  await b.service.onModuleInit();
  await a.controller.createServiceProduct({
    ...enterprise("CURRENT-RESERVATION"),
    serviceProductType: "taxi_reservation",
    allowedLicenseTypes: ["taxi", "multi_purpose_taxi"],
    defaultBillingMode: "meter",
    meterRequired: true,
    fixedFareAllowed: false,
  });
  await a.controller.upsertRuntimePolicy(
    "multi_taxi_direct",
    "taxi_reservation",
    {
      runtimeProfileCode: "multi_taxi_direct",
      serviceProductCode: "taxi_reservation",
      active: true,
      effectiveFrom: "2026-01-01T00:00:00Z",
      effectiveUntil: null,
    },
  );
  return { db, a, b };
}

describe("current canonical products through existing runtime consumers", () => {
  it("post-create warm peer books through native passenger/multi/Owned paths and rejects a later durable disable after stale rename", async () => {
    const { db, a, b } = await reservationPeers();
    const first = createProductionBookingFixture([], 20, b.service);
    const result = await first.service.createRide(OWNER, first.command);
    expect(result.ride.order.orderId).toBe(first.state.order?.orderId);
    expect(first.published).toHaveLength(1);
    expect(
      b.service.getRuntimeServiceProductByType("taxi_reservation")
        ?.serviceProductId,
    ).toBe("CURRENT-RESERVATION");
    await a.controller.updateServiceProduct("CURRENT-RESERVATION", {
      active: false,
    });
    await b.controller.updateServiceProduct("CURRENT-RESERVATION", {
      displayName: "Only a label",
    });
    for (const products of [b, productInstance(db)]) {
      const next = createProductionBookingFixture([], 20, products.service);
      await expect(
        next.service.createRide(OWNER, next.command),
      ).rejects.toMatchObject({ code: "SERVICE_PRODUCT_INACTIVE" });
      expect(next.state.order).toBeNull();
      expect(next.published).toEqual([]);
    }
  });

  it.each(["missing", "inactive", "future", "expired", "read_failure"])(
    "runtime policy %s still rejects native intake independently of active product",
    async (state) => {
      const { db, b } = await reservationPeers();
      await b.service.prepareRuntimeProfileServiceProduct(
        "multi_taxi_direct",
        "taxi_reservation",
      );
      const policy = db.policies.get("multi_taxi_direct:taxi_reservation")!;
      if (state === "missing") db.policies.clear();
      if (state === "inactive") policy.active = false;
      if (state === "future")
        policy.effectiveFrom = new Date(NOW + 60_000).toISOString();
      if (state === "expired")
        policy.effectiveUntil = new Date(NOW).toISOString();
      if (state === "read_failure")
        db.readError = new Error("canonical_read_failed");
      const f = createProductionBookingFixture([], 20, b.service);
      if (state === "read_failure")
        await expect(f.service.createRide(OWNER, f.command)).rejects.toThrow(
          "canonical_read_failed",
        );
      else
        await expect(
          f.service.createRide(OWNER, f.command),
        ).rejects.toMatchObject({
          code: "MULTI_TAXI_SERVICE_PRODUCT_NOT_ALLOWED",
        });
      expect(f.state.order).toBeNull();
      expect(f.published).toEqual([]);
    },
  );

  it("prepare/get and vehicle eligibility interpret current licenses/meter/fixed-fare/proof while billing remains canonical", async () => {
    const { a, b } = await reservationPeers();
    const eligibility = new VehicleEligibilityService(
      {
        getVehicleLicenseType: () => "taxi",
        getVehicleDispatchability: () => true,
        getDriverAvailability: () => true,
      } as never,
      b.audit,
      undefined,
      b.service,
    );
    const matrix = eligibility.listMatrix().map((item) => ({
      ...item,
      supportedProducts:
        item.licenseType === "taxi"
          ? [...item.supportedProducts, "taxi_reservation" as const]
          : item.supportedProducts,
    }));
    const actor = {
      actorId: "test-admin",
      actorType: "platform_admin" as const,
      tenantId: null,
    };
    eligibility.updateMatrix({ items: matrix }, actor);
    const order = {
      serviceBucket: "standard_taxi" as const,
      serviceProductCode: "taxi_reservation" as const,
    };
    await b.service.prepareRuntimeProfileServiceProduct(
      "multi_taxi_direct",
      "taxi_reservation",
    );
    expect(() =>
      eligibility.assertDispatchAssignmentEligible(order, "vehicle", "driver"),
    ).not.toThrow();
    await a.controller.updateServiceProduct("CURRENT-RESERVATION", {
      allowedLicenseTypes: ["multi_purpose_taxi"],
      defaultProofRequirements: ["receipt", "signoff"],
      defaultBillingMode: "external_platform_settlement",
      timing: "external_defined",
    });
    await b.controller.updateServiceProduct("CURRENT-RESERVATION", {
      displayName: "Current label",
    });
    await b.service.prepareRuntimeProfileServiceProduct(
      "multi_taxi_direct",
      "taxi_reservation",
    );
    expect(() =>
      eligibility.assertDispatchAssignmentEligible(order, "vehicle", "driver"),
    ).toThrow();
    expect(
      eligibility.getRuntimeServiceProductDefinition("taxi_reservation"),
    ).toMatchObject({
      allowedLicenseTypes: ["multi_purpose_taxi"],
      defaultProofRequirements: ["receipt", "signoff"],
      timing: "external_defined",
    });
    expect(
      b.service.getRuntimeServiceProductByType("taxi_reservation"),
    ).toMatchObject({
      serviceProductId: "CURRENT-RESERVATION",
      defaultBillingMode: "external_platform_settlement",
    });
    await a.controller.updateServiceProduct("CURRENT-RESERVATION", {
      allowedLicenseTypes: ["taxi"],
      fixedFareAllowed: true,
    });
    await b.service.prepareRuntimeProfileServiceProduct(
      "multi_taxi_direct",
      "taxi_reservation",
    );
    try {
      eligibility.assertDispatchAssignmentEligible(order, "vehicle", "driver");
      throw new Error("expected fixed fare denial");
    } catch (error) {
      expect(error).toMatchObject({ code: "FIXED_FARE_NOT_ALLOWED" });
    }
    await a.controller.updateServiceProduct("CURRENT-RESERVATION", {
      fixedFareAllowed: false,
    });
    eligibility.updateMatrix(
      { items: matrix.map((item) => ({ ...item, taxiMeterRequired: false })) },
      actor,
    );
    try {
      eligibility.assertDispatchAssignmentEligible(order, "vehicle", "driver");
      throw new Error("expected meter denial");
    } catch (error) {
      expect(error).toMatchObject({ code: "TAXI_METER_REQUIRED" });
    }
    eligibility.updateMatrix({ items: matrix }, actor);

    await b.service.prepareRuntimeProfileServiceProduct(
      "multi_taxi_direct",
      "taxi_reservation",
    );
    expect(() =>
      eligibility.assertDispatchAssignmentEligible(order, "vehicle", "driver"),
    ).not.toThrow();
  });
});
