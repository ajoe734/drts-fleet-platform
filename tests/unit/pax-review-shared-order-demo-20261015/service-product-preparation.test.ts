import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { DriverProfileRepository } from "../../../apps/api/src/modules/driver-profile/driver-profile.repository";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { ServiceProductRepository } from "../../../apps/api/src/modules/service-product/service-product.repository";
import { ServiceProductService } from "../../../apps/api/src/modules/service-product/service-product.service";
import { ReviewSupplyService } from "../../../apps/api/src/modules/passenger-app/review-demo/review-supply.service";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import type {
  ServiceProductRecord,
  RuntimeProfileServiceProductPolicy,
} from "../../../apps/api/src/modules/service-product/service-product.types";
import {
  createProductionBookingFixture,
  NOW,
  OWNER,
} from "../pax-booking-history-20261009/production-booking-fixture";

// Only the external SQL response boundary is controlled. Retain actual native
// INSERT payloads; do not reproduce SQL or product/booking business logic.
// This socket-free regression is separate from hosted PostgreSQL acceptance.
function productPeers() {
  const records = new Map<string, ServiceProductRecord>();
  const supply = new Map<string, Map<string, unknown>>();
  const supplyRows = (table: string) =>
    [...(supply.get(table)?.values() ?? [])].map((record) => ({
      record: structuredClone(record),
    }));
  const policy: RuntimeProfileServiceProductPolicy = {
    runtimeProfileCode: "multi_taxi_direct",
    serviceProductCode: "taxi_reservation",
    active: true,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  let readError: Error | undefined;
  let writeError: Error | undefined;
  let policyVisible = true;
  let writeGate: Promise<void> | undefined;
  let writeEntered: (() => void) | undefined;
  const database = {
    isEnabled: () => true,
    query: async (sql: string, values: unknown[] = []) => {
      const supplyInsert =
        /INSERT INTO ((?:reg\.phase1_registry_\w+)|ops\.phase1_driver_profiles)/.exec(
          sql,
        );
      if (supplyInsert) {
        const table = supplyInsert[1]!;
        if (!supply.has(table)) supply.set(table, new Map());
        supply
          .get(table)!
          .set(values[0] as string, JSON.parse(values.at(-1) as string));
      }
      if (sql.trimStart().startsWith("WITH vehicles AS MATERIALIZED"))
        return {
          rows: [
            {
              vehicles: supplyRows("reg.phase1_registry_vehicles"),
              drivers: supplyRows("reg.phase1_registry_drivers"),
              pairs: supplyRows("reg.phase1_registry_supply_pairs"),
              contracts: supplyRows("reg.phase1_registry_contracts"),
              policies: supplyRows("reg.phase1_registry_policies"),
              exclusivities: supplyRows("reg.phase1_registry_exclusivities"),
              disclosures: [],
              credentials: [],
              locations: [],
            },
          ],
        };
      if (sql.includes("INSERT INTO ops.phase1_service_products")) {
        writeEntered?.();
        await writeGate;
        if (writeError) throw writeError;
        records.set(values[0] as string, JSON.parse(values[11] as string));
      }
      if (sql.trimStart().startsWith("SELECT record")) {
        if (readError) throw readError;
        if (sql.includes("ops.phase1_service_products")) {
          const stored = [...records.values()].filter(
            (r) => !values.length || r.serviceProductType === values[0],
          );
          return {
            rows: stored.map((record) => ({ record: structuredClone(record) })),
          };
        }
        if (sql.includes("ops.runtime_profile_service_product_policies"))
          return {
            rows: policyVisible ? [{ record: structuredClone(policy) }] : [],
          };
        const table =
          /FROM ((?:reg\.phase1_registry_\w+)|ops\.phase1_driver_profiles)/.exec(
            sql,
          )?.[1];
        if (table)
          return {
            rows: values.length
              ? supplyRows(table).filter(
                  (r) =>
                    (r.record as { driverId?: string }).driverId === values[0],
                )
              : supplyRows(table),
          };
      }
      return { rows: [] };
    },
  };
  const make = () =>
    new ServiceProductService(
      new AuditNotificationService(),
      new ServiceProductRepository(database as never),
    );
  return {
    a: make(),
    b: make(),
    records,
    policy,
    database,
    hidePolicy: () => {
      policyVisible = false;
    },
    holdWrites: () => {
      let release!: () => void;
      const entered = new Promise<void>((resolve) => {
        writeEntered = resolve;
      });
      writeGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return { entered, release };
    },
    failReads: (e: Error) => {
      readError = e;
    },
    failWrites: (e: Error) => {
      writeError = e;
    },
  };
}

function rehearsal(p: ReturnType<typeof productPeers>) {
  const audit = new AuditNotificationService();
  const registry = new RegulatoryRegistryService(
    { publishSupplyLifecycleUpdated() {} } as never,
    audit,
    new DriverProfileService(
      audit,
      new DriverProfileRepository(p.database as never),
    ),
    new RegulatoryRegistryRepository(p.database as never),
  );
  return new ReviewSupplyService(
    p.database as never,
    registry,
    {} as never,
    p.a,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("PAX_REVIEW_DEMO_ENABLED", "true");
  vi.stubEnv("DRTS_ENV", "test");
  vi.stubEnv("REQUIRE_SMS_VERIFICATION", "false");
  vi.stubEnv("MULTI_TAXI_DEFAULT_AUTHORIZATION_ID", "");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("R18: rehearsal prepares the native reservation product before real booking", () => {
  it("prepares on A, then commits a genuine passenger booking on preinitialized B", async () => {
    const p = productPeers();
    await Promise.all([p.a.onModuleInit(), p.b.onModuleInit()]);
    const booking = createProductionBookingFixture([], 20, p.b);
    await expect(
      booking.service.createRide(OWNER, booking.command),
    ).rejects.toMatchObject({ code: "SERVICE_PRODUCT_INACTIVE" });
    expect(booking.state.order).toBeNull();
    await rehearsal(p).prepare();
    const result = await booking.service.createRide(OWNER, booking.command);
    expect(result.ride.order.orderId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.ride.order.orderId).toBe(booking.state.order?.orderId);
    expect(booking.state.history?.[1]).toBe(result.ride.order.orderId);
    expect(booking.state.token?.[3]).toBe(OWNER);
    expect(booking.published).toHaveLength(1);
    expect(
      p.b.getRuntimeServiceProductByType("taxi_reservation"),
    ).toMatchObject({
      active: true,
      timing: "reservation",
      meterRequired: true,
      fixedFareAllowed: false,
    });
  });

  it("preserves the established master and other product configuration across repeated preparation", async () => {
    const p = productPeers();
    await rehearsal(p).prepare();
    const original = p.a.getRuntimeServiceProductByType("taxi_reservation")!;
    const custom = {
      ...original,
      serviceProductId: "configured-reservation-master",
      active: false,
      displayName: "Existing reservation master",
      defaultProofRequirements: ["photo"],
    };
    const other = p.a.getRuntimeServiceProductByType("enterprise_dispatch")!;
    p.records.clear();
    await new ServiceProductRepository(p.database as never).persistChanges({
      records: [custom, other],
    });
    await rehearsal(p).prepare();
    await rehearsal(p).prepare();
    expect(p.records.size).toBe(2);
    expect(p.records.get(custom.serviceProductId)).toEqual({
      ...custom,
      active: true,
      updatedAt: new Date().toISOString(),
    });
    expect(p.records.get(other.serviceProductId)).toEqual(other);
    expect(
      new ServiceProductService(
        new AuditNotificationService(),
      ).getRuntimeServiceProductByType("taxi_reservation")?.active,
    ).toBe(false);
  });

  it.each(["disabled", "production"])(
    "does not configure a product in %s mode",
    async (mode) => {
      const p = productPeers();
      if (mode === "disabled") vi.stubEnv("PAX_REVIEW_DEMO_ENABLED", "false");
      else vi.stubEnv("DRTS_ENV", "production");
      await expect(rehearsal(p).prepare()).rejects.toThrow();
      expect(p.records.size).toBe(0);
    },
  );

  it("waits for the product persistence acknowledgement before reporting readiness", async () => {
    const p = productPeers();
    const gate = p.holdWrites();
    let settled = false;
    const preparing = rehearsal(p)
      .prepare()
      .then(() => {
        settled = true;
      });
    await gate.entered;
    expect(settled).toBe(false);
    expect(p.records.size).toBe(0);
    gate.release();
    await preparing;
    expect(settled).toBe(true);
    expect([...p.records.values()]).toMatchObject([{ active: true }]);
  });

  it("rejects a failed product write without creating a local active override", async () => {
    const p = productPeers();
    p.failWrites(new Error("controlled product write failure"));
    await expect(rehearsal(p).prepare()).rejects.toThrow(
      "controlled product write failure",
    );
    expect(p.records.size).toBe(0);
    expect(p.a.getRuntimeServiceProductByType("taxi_reservation")?.active).toBe(
      false,
    );
  });

  it.each(["inactive", "expired", "future", "missing"])(
    "retains the independent %s runtime policy rejection",
    async (state) => {
      const p = productPeers();
      await Promise.all([p.a.onModuleInit(), p.b.onModuleInit()]);
      if (state === "inactive") p.policy.active = false;
      if (state === "expired")
        p.policy.effectiveUntil = new Date(NOW - 1).toISOString();
      if (state === "future")
        p.policy.effectiveFrom = new Date(NOW + 60000).toISOString();
      if (state === "missing") p.hidePolicy();
      await rehearsal(p).prepare();
      const booking = createProductionBookingFixture([], 20, p.b);
      await expect(
        booking.service.createRide(OWNER, booking.command),
      ).rejects.toMatchObject({
        code: "MULTI_TAXI_SERVICE_PRODUCT_NOT_ALLOWED",
      });
      expect(booking.state.order).toBeNull();
    },
  );

  it.each(["inactive", "deleted", "read_failure"])(
    "does not book from stale active cache after %s",
    async (state) => {
      const p = productPeers();
      await rehearsal(p).prepare();
      await p.b.prepareRuntimeProfileServiceProduct(
        "multi_taxi_direct",
        "taxi_reservation",
      );
      expect(
        p.b.getRuntimeServiceProductByType("taxi_reservation")?.active,
      ).toBe(true);
      if (state === "inactive") {
        const product = p.b.getRuntimeServiceProductByType("taxi_reservation")!;
        await new ServiceProductRepository(p.database as never).persistChanges({
          records: [{ ...product, active: false }],
        });
      }
      if (state === "deleted") p.records.clear();
      if (state === "read_failure")
        p.failReads(new Error("controlled product read failure"));
      const booking = createProductionBookingFixture([], 20, p.b);
      const creating = booking.service.createRide(OWNER, booking.command);
      if (state === "read_failure")
        await expect(creating).rejects.toThrow(
          "controlled product read failure",
        );
      else
        await expect(creating).rejects.toMatchObject({
          code: "SERVICE_PRODUCT_INACTIVE",
        });
      expect(booking.state.order).toBeNull();
      expect(booking.published).toEqual([]);
    },
  );

  it.each(["direct", "call_center"])(
    "refreshes policy authority at the existing %s intake too",
    async (entry) => {
      const p = productPeers();
      await rehearsal(p).prepare();
      await p.b.prepareRuntimeProfileServiceProduct(
        "multi_taxi_direct",
        "taxi_reservation",
      );
      p.policy.active = false;
      const f = createProductionBookingFixture([], 20, p.b);
      const command = {
        pickup: { ...f.command.origin, address: "Synthetic pickup" },
        dropoff: { ...f.command.destination, address: "Synthetic dropoff" },
        passenger: {
          passengerId: OWNER,
          name: "Synthetic passenger",
          phone: "0900000010",
        },
        timingMode: "scheduled" as const,
        requestedPickupAt: f.command.scheduledAt,
        paymentMethodTokenRef: f.command.paymentMethodId,
      };
      const creating =
        entry === "direct"
          ? f.multi.createRide(command, null)
          : f.multi.createCallCenterRide({
              ...command,
              callId: "synthetic-review-call",
              agentId: "synthetic-review-agent",
            });
      await expect(creating).rejects.toMatchObject({
        code: "MULTI_TAXI_SERVICE_PRODUCT_NOT_ALLOWED",
      });
      expect(f.state.order).toBeNull();
    },
  );

  it("refreshes the product at the native Owned intake while preserving inactive rejection", async () => {
    const p = productPeers();
    await p.b.onModuleInit();
    await rehearsal(p).prepare();
    const f = createProductionBookingFixture([], 20, p.b);
    const [authorization] = await new MultiTaxiRepository(
      f.database,
    ).findEffectiveAuthorizations(new Date().toISOString());
    const command = {
      pickup: { ...f.command.origin, address: "Synthetic pickup" },
      dropoff: { ...f.command.destination, address: "Synthetic dropoff" },
      passenger: {
        passengerId: OWNER,
        name: "Synthetic passenger",
        phone: "0900000010",
      },
      timingMode: "scheduled" as const,
      requestedPickupAt: f.command.scheduledAt,
      paymentMethodTokenRef: f.command.paymentMethodId,
    };
    const order = await f.owned.createMultiTaxiRide(command, authorization!);
    expect(order.orderId).toBe(f.state.order?.orderId);
    expect(order.serviceProductCode).toBe("taxi_reservation");
    const product = p.b.getRuntimeServiceProductByType("taxi_reservation")!;
    await new ServiceProductRepository(p.database as never).persistChanges({
      records: [{ ...product, active: false }],
    });
    const next = createProductionBookingFixture([], 20, p.b);
    await expect(
      next.owned.createMultiTaxiRide(command, authorization!),
    ).rejects.toMatchObject({ code: "SERVICE_PRODUCT_INACTIVE" });
    expect(next.state.order).toBeNull();
  });
});
