import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { DriverProfileRepository } from "../../../apps/api/src/modules/driver-profile/driver-profile.repository";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { ServiceProductRepository } from "../../../apps/api/src/modules/service-product/service-product.repository";
import { ServiceProductService } from "../../../apps/api/src/modules/service-product/service-product.service";
import { ReviewSupplyService } from "../../../apps/api/src/modules/passenger-app/review-demo/review-supply.service";
import type { ServiceProductRecord } from "../../../apps/api/src/modules/service-product/service-product.types";
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
  const policy = {
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
          return { rows: [{ record: structuredClone(policy) }] };
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
});
