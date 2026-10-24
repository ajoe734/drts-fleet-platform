import { FleetPartnerService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.service";
import { FleetPartnerRepository } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.repository";
import { EventEmitter } from "node:events";
import type { VehicleEligibilityMatrixRecord } from "@drts/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { DriverProfileRepository } from "../../../apps/api/src/modules/driver-profile/driver-profile.repository";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { ServiceProductService } from "../../../apps/api/src/modules/service-product/service-product.service";
import { ServiceProductRepository } from "../../../apps/api/src/modules/service-product/service-product.repository";
import { VehicleEligibilityService } from "../../../apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service";
import { VehicleEligibilityRepository } from "../../../apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.repository";
import {
  ReviewSupplyService,
  REVIEW_SUPPLY,
} from "../../../apps/api/src/modules/passenger-app/review-demo/review-supply.service";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";

afterEach(() => vi.unstubAllEnvs());

/** External SQL transport only: retain actual production INSERT payloads.
 * Repository transaction boundaries are exercised, but this is not PostgreSQL
 * or concurrency acceptance. The existing formal-schema hosted case covers PG.
 */
function peers() {
  vi.stubEnv("PAX_REVIEW_DEMO_ENABLED", "true");
  vi.stubEnv("DRTS_ENV", "test");
  const tables = new Map<string, Map<string, unknown>>();
  const authorizations = new Map<string, Record<string, unknown>>();
  const locations = new Map<string, Record<string, unknown>>();
  let matrix = new Map<string, VehicleEligibilityMatrixRecord>();
  let matrixReadError: Error | undefined;
  let matrixWriteError: Error | undefined;
  let enterCommit: (() => void) | undefined;
  let commitGate: Promise<void> | undefined;
  const rows = (table: string) =>
    [...(tables.get(table)?.values() ?? [])].map((record) => ({
      record: structuredClone(record),
    }));
  const query = async (
    sql: string,
    values: unknown[] = [],
    transaction?: { matrix: typeof matrix },
  ) => {
    const currentMatrix = transaction?.matrix ?? matrix;
    if (sql.includes("INSERT INTO ops.phase1_driver_locations")) {
      locations.set(String(values[0]), {
        driver_id: values[0],
        lat: values[1],
        lng: values[2],
        accuracy_m: values[3],
        recorded_at: values[4],
        updated_at: new Date().toISOString(),
      });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO reg.multi_taxi_operating_authorizations")) {
      const columns = /operating_authorizations\s*\(([^)]+)\)/
        .exec(sql)![1]!
        .split(",")
        .map((column) => column.trim());
      authorizations.set(
        String(values[0]),
        Object.fromEntries(
          columns.map((column, index) => [
            column,
            column === "service_area_codes"
              ? JSON.parse(String(values[index]))
              : values[index],
          ]),
        ),
      );
    }
    if (
      sql.trimStart().startsWith("SELECT *") &&
      sql.includes("reg.multi_taxi_operating_authorizations")
    )
      return { rows: [...authorizations.values()] };
    if (sql.includes(" AS configured")) {
      if (matrixReadError) throw matrixReadError;
      const types = values[0] as string[];
      return {
        rows: [
          {
            configured: currentMatrix.size > 0,
            records: [...currentMatrix.values()]
              .filter((item) => types.includes(item.licenseType))
              .map((item) => structuredClone(item)),
          },
        ],
      };
    }
    if (sql.includes("INSERT INTO admin.phase1_vehicle_eligibility_matrix")) {
      if (matrixWriteError) throw matrixWriteError;
      currentMatrix.set(String(values[0]), JSON.parse(String(values.at(-1))));
    }
    if (sql.includes("DELETE FROM admin.phase1_vehicle_eligibility_matrix"))
      currentMatrix.clear();
    const inserted =
      /INSERT INTO ((?:reg\.phase1_registry_\w+)|admin\.phase1_(?:fleet_partners|driver_fleet_affiliations)|ops\.phase1_(?:driver_profiles|service_products|multi_taxi_[a-z_]+))/.exec(
        sql,
      )?.[1];
    if (inserted) {
      if (!tables.has(inserted)) tables.set(inserted, new Map());
      tables
        .get(inserted)!
        .set(String(values[0]), JSON.parse(String(values.at(-1))));
    }
    if (sql.trimStart().startsWith("WITH vehicles AS MATERIALIZED"))
      return {
        rows: [
          {
            vehicles: rows("reg.phase1_registry_vehicles"),
            drivers: rows("reg.phase1_registry_drivers"),
            pairs: rows("reg.phase1_registry_supply_pairs"),
            contracts: rows("reg.phase1_registry_contracts"),
            policies: rows("reg.phase1_registry_policies"),
            exclusivities: rows("reg.phase1_registry_exclusivities"),
            disclosures: [],
            credentials: [],
            locations: [...locations.values()],
          },
        ],
      };
    if (sql.trimStart().startsWith("SELECT record")) {
      const table = /FROM ([a-z_.0-9]+)/.exec(sql)?.[1];
      if (table === "admin.phase1_vehicle_eligibility_matrix")
        return {
          rows: [...currentMatrix.values()].map((record) => ({
            record: structuredClone(record),
          })),
        };
      if (table === "ops.runtime_profile_service_product_policies")
        return {
          rows: [
            {
              record: {
                runtimeProfileCode: "multi_taxi_direct",
                serviceProductCode: "taxi_reservation",
                active: true,
                effectiveFrom: "2026-01-01T00:00:00.000Z",
                effectiveUntil: null,
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
              },
            },
          ],
        };
      return {
        rows: rows(table ?? "").filter(
          ({ record }) =>
            !values.length ||
            (table === "ops.phase1_service_products"
              ? (record as { serviceProductType: string })
                  .serviceProductType === values[0]
              : table === "reg.phase1_registry_drivers"
                ? (record as { driverId: string }).driverId === values[0]
                : table === "admin.phase1_fleet_partners"
                  ? sql.includes("multiTaxiOperatorIds")
                    ? Boolean(
                        (
                          record as { multiTaxiOperatorIds?: string[] }
                        ).multiTaxiOperatorIds?.includes(
                          JSON.parse(String(values[0]))[0],
                        ),
                      )
                    : (record as { fleetPartnerId: string }).fleetPartnerId ===
                        values[0] &&
                      (!sql.includes("active = true") ||
                        (record as { active?: boolean }).active === true)
                  : true),
        ),
      };
    }
    return { rows: [] };
  };
  const database = {
    isEnabled: () => true,
    query,
    connect: async () => {
      const transaction = { matrix: new Map(matrix) };
      return {
        release() {},
        query: async (sql: string, values: unknown[] = []) => {
          if (sql === "COMMIT") {
            enterCommit?.();
            await commitGate;
            matrix = transaction.matrix;
          }
          return query(sql, values, transaction);
        },
      };
    },
  };
  const make = () => {
    const audit = new AuditNotificationService();
    const registry = new RegulatoryRegistryService(
      new OpsDispatchEventsService(new EventEmitter() as never),
      audit,
      new DriverProfileService(
        audit,
        new DriverProfileRepository(database as never),
      ),
      new RegulatoryRegistryRepository(database as never),
    );
    const products = new ServiceProductService(
      audit,
      new ServiceProductRepository(database as never),
    );
    const eligibility = new VehicleEligibilityService(
      registry,
      audit,
      new VehicleEligibilityRepository(database as never),
      products,
    );
    return {
      audit,
      registry,
      products,
      eligibility,
      supply: new ReviewSupplyService(
        database as never,
        registry,
        {} as never,
        products,
        eligibility,
        new FleetPartnerService(
          {} as never,
          {} as never,
          registry,
          new FleetPartnerRepository(database as never),
        ),
        new DriverProfileService(
          audit,
          new DriverProfileRepository(database as never),
        ),
      ),
    };
  };
  const a = make();
  const b = make();
  return {
    a,
    b,
    database,
    matrix: () => [...matrix.values()],
    seed: () =>
      new RegulatoryRegistryRepository(database as never).persistChanges({
        vehicles: a.registry.listVehicles(),
        drivers: a.registry.listDrivers(),
        supplyPairs: a.registry.listSupplyPairs(),
        contracts: a.registry.listContracts(),
        policies: a.registry.listPolicies(),
        exclusivities: a.registry.listExclusivities(),
      }),
    readFailure: (error: Error) => {
      matrixReadError = error;
    },
    writeFailure: (error: Error) => {
      matrixWriteError = error;
    },
    holdCommit: () => {
      let release!: () => void;
      const entered = new Promise<void>((resolve) => {
        enterCommit = resolve;
      });
      commitGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return { entered, release };
    },
  };
}

const order = {
  serviceBucket: "standard_taxi" as const,
  businessDispatchSubtype: null,
  serviceProductCode: "taxi_reservation" as const,
};
const ids = REVIEW_SUPPLY.map((fixture) => fixture.vehicleId);
async function refresh(p: ReturnType<typeof peers>) {
  await p.b.registry.prepareDispatchSupply("standard_taxi");
  await p.b.products.prepareRuntimeProfileServiceProduct(
    "multi_taxi_direct",
    "taxi_reservation",
  );
  await p.b.eligibility.prepareVehicleCapabilities?.(ids);
}
function assertEligible(p: ReturnType<typeof peers>, index = 0) {
  const fixture = REVIEW_SUPPLY[index]!;
  return p.b.eligibility.assertDispatchAssignmentEligible(
    order,
    fixture.vehicleId,
    fixture.driverId,
  );
}

describe("R21 reservation capability authority", () => {
  it.each([0, 1])(
    "real prepare makes vehicle %i eligible on a preinitialized consumer",
    async (index) => {
      const p = peers();
      await Promise.all([
        p.a.eligibility.onModuleInit(),
        p.b.eligibility.onModuleInit(),
      ]);
      await p.a.supply.prepare();
      await refresh(p);
      const fixture = REVIEW_SUPPLY[index]!;
      expect(p.b.registry.getVehicleLicenseType(fixture.vehicleId)).toBe(
        "multi_purpose_taxi",
      );
      expect(
        p.b.registry.getVehicleDispatchability(
          fixture.vehicleId,
          "standard_taxi",
        ),
      ).toBe(true);
      expect(
        p.b.registry.getDriverAvailability(fixture.driverId, "standard_taxi"),
      ).toBe(true);
      expect(() => assertEligible(p, index)).not.toThrow();
    },
  );

  it("amends the existing native matrix without changing its other qualifications or license types", async () => {
    const p = peers();
    await p.seed();
    const current = p.a.eligibility.listMatrix().map((item) => ({
      ...item,
      supportedProducts: item.supportedProducts.filter(
        (product) => product !== "taxi_reservation",
      ),
    }));
    const custom = current.find(
      (item) => item.licenseType === "multi_purpose_taxi",
    )!;
    custom.capabilityId = "configured-native-multi-taxi";
    custom.seatCount = 6;
    custom.requiredDocuments = ["simulated-document"];
    custom.trainingRequired = true;
    await new VehicleEligibilityRepository(p.database as never).replaceAll(
      current,
    );
    await Promise.all([
      p.a.eligibility.onModuleInit(),
      p.b.eligibility.onModuleInit(),
    ]);
    await p.a.supply.prepare();
    const first = structuredClone(p.matrix());
    await p.a.supply.prepare();
    expect(p.matrix()).toEqual(first);
    expect(
      p.matrix().find((item) => item.capabilityId === custom.capabilityId),
    ).toEqual({
      ...custom,
      supportedProducts: [...custom.supportedProducts, "taxi_reservation"],
      updatedAt: expect.any(String),
    });
    expect(
      p.matrix().filter((item) => item.capabilityId !== custom.capabilityId),
    ).toEqual(
      current.filter((item) => item.capabilityId !== custom.capabilityId),
    );
    await refresh(p);
    expect(() => assertEligible(p)).not.toThrow();
  });

  it("does not report readiness or publish a capability cache/audit before COMMIT", async () => {
    const p = peers();
    const gate = p.holdCommit();
    let settled = false;
    const preparing = p.a.supply.prepare().then(() => {
      settled = true;
    });
    await gate.entered;
    expect(settled).toBe(false);
    expect(p.matrix()).toEqual([]);
    expect(
      p.a.audit
        .listAuditLogs()
        .filter(
          (item) => item.actionName === "vehicle_eligibility_matrix.updated",
        ),
    ).toEqual([]);
    gate.release();
    await preparing;
    expect(settled).toBe(true);
    expect(p.matrix().length).toBeGreaterThan(0);
  });

  it("rejects failed native capability persistence without a success audit or durable change", async () => {
    const p = peers();
    p.writeFailure(new Error("controlled matrix write failure"));
    await expect(p.a.supply.prepare()).rejects.toThrow(
      "controlled matrix write failure",
    );
    expect(p.matrix()).toEqual([]);
    expect(
      p.a.audit
        .listAuditLogs()
        .filter(
          (item) => item.actionName === "vehicle_eligibility_matrix.updated",
        ),
    ).toEqual([]);
  });

  it.each(["unsupported", "inactive", "expired", "missing", "meter"] as const)(
    "rechecks a later %s matrix instead of stale eligible cache",
    async (state) => {
      const p = peers();
      await p.a.supply.prepare();
      await refresh(p);
      expect(() => assertEligible(p)).not.toThrow();
      let next = structuredClone(p.matrix());
      const target = next.find(
        (item) => item.licenseType === "multi_purpose_taxi",
      )!;
      if (state === "unsupported")
        target.supportedProducts = target.supportedProducts.filter(
          (product) => product !== "taxi_reservation",
        );
      if (state === "inactive") target.active = false;
      if (state === "expired")
        target.effectiveUntil = "2026-01-02T00:00:00.000Z";
      if (state === "missing")
        next = next.filter((item) => item.licenseType !== target.licenseType);
      if (state === "meter") target.taxiMeterRequired = false;
      await new VehicleEligibilityRepository(p.database as never).replaceAll(
        next,
      );
      await p.b.eligibility.prepareVehicleCapabilities(ids);
      expect(() => assertEligible(p)).toThrowError(
        expect.objectContaining({
          code:
            state === "meter"
              ? "TAXI_METER_REQUIRED"
              : "VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT",
        }),
      );
    },
  );

  it("propagates a failed authoritative read despite a previously eligible cache", async () => {
    const p = peers();
    await p.a.supply.prepare();
    await refresh(p);
    expect(() => assertEligible(p)).not.toThrow();
    p.readFailure(new Error("controlled matrix read failure"));
    await expect(
      p.b.eligibility.prepareVehicleCapabilities(ids),
    ).rejects.toThrow("controlled matrix read failure");
  });

  it("retains product deactivation and driver offline refusals", async () => {
    const p = peers();
    await p.a.supply.prepare();
    await refresh(p);
    const product =
      p.b.products.getRuntimeServiceProductByType("taxi_reservation")!;
    await new ServiceProductRepository(p.database as never).persistChanges({
      records: [{ ...product, active: false }],
    });
    await refresh(p);
    expect(() => assertEligible(p)).toThrowError(
      expect.objectContaining({ code: "SERVICE_PRODUCT_INACTIVE" }),
    );
    await new ServiceProductRepository(p.database as never).persistChanges({
      records: [product],
    });
    await p.a.registry.updateDriverWorkStateFromPersistence(
      REVIEW_SUPPLY[0]!.driverId,
      { workState: "offline" },
    );
    await refresh(p);
    expect(() => assertEligible(p)).toThrowError(
      expect.objectContaining({
        code: "DRIVER_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT",
      }),
    );
  });

  it("the genuine Owned candidate and final assign entries await the native matrix and reject revocation", async () => {
    const p = peers();
    await p.a.supply.prepare();
    await refresh(p);
    const owned = new OwnedMobilityService(
      p.b.registry,
      p.b.audit,
      {
        registerRecordingAttachmentListener() {},
        registerRecordingStateChangeListener() {},
      } as never,
      new OwnedMobilityTaskEventsService(new EventEmitter() as never),
      undefined,
      undefined,
      undefined,
      p.b.eligibility,
      p.b.products,
    );
    const authorization = (
      await new MultiTaxiRepository(p.database as never).loadState()
    ).authorizations[0]!;
    const ride = await owned.createMultiTaxiRide(
      {
        pickup: {
          lat: 25.08,
          lng: 121.55,
          address: "Synthetic New Taipei pickup",
        },
        dropoff: {
          lat: 25.1,
          lng: 121.57,
          address: "Synthetic New Taipei dropoff",
        },
        passenger: {
          passengerId: "synthetic-review-owner",
          name: "Synthetic passenger",
          phone: "0900000010",
        },
        timingMode: "scheduled",
        requestedPickupAt: new Date(Date.now() + 20 * 60000).toISOString(),
        paymentMethodTokenRef: "synthetic-method",
      },
      authorization,
    );
    const job = await owned.dispatchOrder(ride.orderId, { mode: "auto" });
    const listed = await owned.listDispatchCandidates(job.dispatchJobId);
    expect(listed.some((item) => item.vehicleId === ids[0])).toBe(true);
    const next = structuredClone(p.matrix());
    next.find(
      (item) => item.licenseType === "multi_purpose_taxi",
    )!.supportedProducts = ["taxi_realtime"];
    await new VehicleEligibilityRepository(p.database as never).replaceAll(
      next,
    );
    await expect(
      owned.assignDispatch({
        dispatchJobId: job.dispatchJobId,
        vehicleId: ids[0]!,
        driverId: REVIEW_SUPPLY[0]!.driverId,
      }),
    ).rejects.toMatchObject({ code: "ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT" });
    expect(owned.getDriverTasksForOrder(ride.orderId)).toEqual([]);
  });
});
