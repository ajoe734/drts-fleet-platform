import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { VehicleRegistryRecord } from "../../../packages/contracts/src";
import { RegulatoryRegistryController } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.controller";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { VehicleEligibilityService } from "../../../apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service";

const VEHICLE = "veh-demo-001";
const DRIVER = "drv-demo-001";
const ORDER = {
  serviceBucket: "standard_taxi" as const,
  businessDispatchSubtype: null,
  serviceProductCode: null,
};

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

// Existing durable-registry fixture seam: production repository/SQL/readback;
// only the external database transport is controlled. This is not PG evidence.
async function setup() {
  const tables = new Map<string, Map<string, unknown>>();
  const events: VehicleRegistryRecord[] = [];
  let nextWrite: ReturnType<typeof deferred> | undefined;
  let entered = deferred();
  let writes = 0;
  const repository = new RegulatoryRegistryRepository({
    isEnabled: () => true,
    query: async (sql: string, values: unknown[] = []) => {
      const insert = sql.match(/INSERT INTO (reg\.phase1_registry_\w+)/);
      if (insert) {
        if (insert[1] === "reg.phase1_registry_vehicles") {
          writes++;
          const wait = nextWrite;
          nextWrite = undefined;
          if (wait) {
            entered.resolve();
            await wait.promise;
          }
        }
        const rows = tables.get(insert[1]!) ?? new Map();
        rows.set(String(values[0]), JSON.parse(String(values.at(-1))));
        tables.set(insert[1]!, rows);
      }
      const table = sql.match(/FROM (reg\.phase1_registry_\w+)/)?.[1];
      return {
        rows: table
          ? [...(tables.get(table)?.values() ?? [])].map((record) => ({
              record: structuredClone(record),
            }))
          : [],
      };
    },
  } as never);
  const service = new RegulatoryRegistryService(
    {
      publishDriverLocationUpdated: () => {},
      publishSupplyLifecycleUpdated: (vehicle: VehicleRegistryRecord) =>
        events.push(structuredClone(vehicle)),
    } as never,
    null as never,
    { findProfileForDriver: () => null } as never,
    repository,
  );
  const controller = new RegulatoryRegistryController(service);
  const eligibility = new VehicleEligibilityService(service);
  await repository.persistChanges({
    vehicles: service.listVehicles(),
    drivers: service.listDrivers(),
    supplyPairs: service.listSupplyPairs(),
    contracts: service.listContracts(),
    policies: service.listPolicies(),
    exclusivities: service.listExclusivities(),
  });
  const live = () =>
    controller.listVehicles().data.items.find((v) => v.vehicleId === VEHICLE)!;
  const durable = async () =>
    (await repository.loadState()).vehicles.find(
      (v) => v.vehicleId === VEHICLE,
    )!;
  const hold = () => {
    nextWrite = deferred();
    entered = deferred();
    return { ...nextWrite, entered: entered.promise };
  };
  return {
    service,
    controller,
    eligibility,
    repository,
    tables,
    events,
    live,
    durable,
    hold,
    writes: () => writes,
  };
}

describe("C073 actual controller canonical publication", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T07:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());
  it("keeps healthy paired reads/eligibility/events canonical while initiation is pending or rejected, then permits retry", async () => {
    const x = await setup();
    const initial = x.live();
    expect(() =>
      x.eligibility.assertDispatchAssignmentEligible(ORDER, VEHICLE, DRIVER),
    ).not.toThrow();
    const hold = x.hold();
    const error = new Error("controlled initiation write rejection");
    const command = { reason: "fleet_partner_exit", debrandingRequired: false };
    const pending = x.controller.initiateVehicleOffboarding(VEHICLE, command);
    const rejected = pending.then(
      () => ({ fulfilled: true }),
      (error: unknown) => ({ error }),
    );
    await hold.entered;
    expect(x.live()).toEqual(initial);
    expect(await x.durable()).toEqual(initial);
    expect(x.events).toHaveLength(0);
    expect(x.service.getVehicleDispatchability(VEHICLE)).toBe(true);
    expect(
      x.service
        .getEligibleCandidates("standard_taxi")
        .some((v) => v.vehicleId === VEHICLE),
    ).toBe(true);
    expect(() =>
      x.eligibility.assertDispatchAssignmentEligible(ORDER, VEHICLE, DRIVER),
    ).not.toThrow();
    hold.reject(error);
    await expect(rejected).resolves.toEqual({ error });
    expect(x.live()).toEqual(initial);
    expect(await x.durable()).toEqual(initial);
    expect(x.events).toHaveLength(0);
    const response = await x.controller.initiateVehicleOffboarding(
      VEHICLE,
      command,
      "retry",
    );
    expect(response.meta.requestId).toBe("retry");
    expect(response.data.supplyLifecycle.offboarding.status).toBe("completed");
    expect((await x.durable()).supplyLifecycle.offboarding).toEqual(
      response.data.supplyLifecycle.offboarding,
    );
    expect(x.events).toHaveLength(1);
    expect(x.service.getVehicleDispatchability(VEHICLE)).toBe(false);
    expect(() =>
      x.eligibility.assertDispatchAssignmentEligible(ORDER, VEHICLE, DRIVER),
    ).toThrow(
      expect.objectContaining({
        code: "VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT",
      }),
    );
  });

  it("retains pending debranding/ticket on rejected completion and retries the real command before duplicate refusal", async () => {
    const x = await setup();
    await x.controller.initiateVehicleOffboarding(VEHICLE, {
      reason: "fleet_partner_exit",
      debrandingRequired: true,
      debrandingTicketId: "C073-RETRY",
    });
    const initial = x.live();
    x.events.length = 0;
    const hold = x.hold();
    const error = new Error("controlled completion write rejection");
    const pending = x.controller.completeVehicleDebranding(VEHICLE, {});
    const rejected = pending.then(
      () => ({ fulfilled: true }),
      (error: unknown) => ({ error }),
    );
    await hold.entered;
    expect(x.live()).toEqual(initial);
    expect(await x.durable()).toEqual(initial);
    expect(x.events).toHaveLength(0);
    hold.reject(error);
    await expect(rejected).resolves.toEqual({ error });
    expect(x.live()).toEqual(initial);
    expect(await x.durable()).toEqual(initial);
    const response = await x.controller.completeVehicleDebranding(VEHICLE, {});
    expect(response.data.supplyLifecycle.offboarding).toMatchObject({
      status: "completed",
      debrandingStatus: "completed",
      debrandingTicketId: "C073-RETRY",
    });
    expect((await x.durable()).supplyLifecycle.offboarding).toEqual(
      response.data.supplyLifecycle.offboarding,
    );
    expect(x.events).toHaveLength(1);
    const writes = x.writes();
    await expect(
      x.controller.completeVehicleDebranding(VEHICLE, {}),
    ).rejects.toMatchObject({ code: "DEBRANDING_NOT_REQUIRED" });
    expect(x.writes()).toBe(writes);
  });

  it("orders same-vehicle commands after ACK without blocking a different vehicle", async () => {
    const x = await setup();
    const hold = x.hold();
    const first = x.controller.initiateVehicleOffboarding(VEHICLE, {
      reason: "fleet_partner_exit",
      debrandingRequired: true,
    });
    await hold.entered;
    const completion = x.controller.completeVehicleDebranding(VEHICLE, {});
    const writes = x.writes();
    const other = await x.controller.initiateVehicleOffboarding(
      "veh-demo-004",
      { reason: "fleet_partner_exit", debrandingRequired: false },
    );
    expect(other.data.supplyLifecycle.offboarding.status).toBe("completed");
    expect(x.writes()).toBe(writes + 1);
    expect(x.live().supplyLifecycle.offboarding.status).toBe("none");
    hold.resolve();
    await first;
    expect((await completion).data.supplyLifecycle.offboarding.status).toBe(
      "completed",
    );
    expect((await x.durable()).supplyLifecycle.offboarding.status).toBe(
      "completed",
    );
  });

  it("publishes only its acknowledged offboarding delta, preserving peer compliance intent in the current row", async () => {
    const x = await setup();
    const hold = x.hold();
    const pending = x.controller.initiateVehicleOffboarding(VEHICLE, {
      reason: "fleet_partner_exit",
      debrandingRequired: false,
    });
    await hold.entered;
    x.service.updateVehicleCompliance(VEHICLE, { dispatchableFlag: false });
    const peer = x.live();
    expect(peer.supplyLifecycle.dispatch.blockedReasons).toContain(
      "manual_hold",
    );
    hold.resolve();
    const response = await pending;
    expect(response.data.supplyLifecycle.offboarding.status).toBe("completed");
    expect(response.data.supplyLifecycle.dispatch.blockedReasons).toContain(
      "manual_hold",
    );
    expect(x.live().supplyLifecycle.dispatch.blockedReasons).toContain(
      "manual_hold",
    );
  });

  it("hydrates nonretired completed work-order evidence and restores legitimate insurance compliance without creating final exit", async () => {
    const x = await setup();
    // Existing canonical model permits completed debranding evidence without
    // a final offboarding status. This does not invent a temporary command or
    // allow final status=completed back in: PRD ties final exit to offboarding.
    const record = x.live();
    record.supplyLifecycle.offboarding = {
      ...record.supplyLifecycle.offboarding,
      status: "none",
      debrandingStatus: "completed",
      debrandingRequired: true,
      debrandingTicketId: "NONRETIRED-WORKORDER",
      debrandingCompletedAt: "2026-05-01T00:00:00.000Z",
    };
    x.tables.get("reg.phase1_registry_vehicles")!.set(VEHICLE, record);
    for (const [key, value] of x.tables.get("reg.phase1_registry_policies")!) {
      const policy = value as { vehicleId: string; endAt: string };
      if (policy.vehicleId === VEHICLE)
        x.tables
          .get("reg.phase1_registry_policies")!
          .set(key, { ...policy, endAt: "2000-01-01T00:00:00.000Z" });
    }
    await x.service.onModuleInit(); // NODE_ENV=test: no reconciliation loop.
    expect(x.service.getVehicleDispatchability(VEHICLE)).toBe(false);
    expect(x.live().supplyLifecycle.dispatch.blockedReasons).toContain(
      "insurance_expired",
    );
    const policy = x.service.createInsurancePolicy({
      vehicleId: VEHICLE,
      policyNo: "C073-RECOVERY",
      insuranceType: "commercial",
      insurerName: "sim-insurer",
      coverageAmount: 1000000,
      startAt: "2020-01-01T00:00:00.000Z",
      endAt: "2099-01-01T00:00:00.000Z",
    });
    x.service.activateInsurancePolicy(policy.policyId, {});
    expect(x.service.getVehicleDispatchability(VEHICLE)).toBe(true);
    expect(() =>
      x.eligibility.assertDispatchAssignmentEligible(ORDER, VEHICLE, DRIVER),
    ).not.toThrow();
    expect(
      x.service
        .getEligibleCandidates("standard_taxi")
        .some((v) => v.vehicleId === VEHICLE),
    ).toBe(true);
    expect(x.live().supplyLifecycle.offboarding).toMatchObject({
      status: "none",
      debrandingStatus: "completed",
      debrandingTicketId: "NONRETIRED-WORKORDER",
    });
    await x.service.onModuleDestroy();
  });
});
