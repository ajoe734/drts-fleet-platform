import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../src/common/auth";
import type { FareTariff } from "../../src/modules/passenger-app/fare/fare.types";
import { referralDemoTripEnabled } from "../../src/modules/owned-mobility/referral-demo-trip.config";
import { REFERRAL_DEMO_PROOF_PHOTO } from "../../src/modules/owned-mobility/referral-demo-trip.proof";
import {
  REFERRAL_DEMO_SUPPLY,
  ReferralDemoTripService,
} from "../../src/modules/owned-mobility/referral-demo-trip.service";

const identity = {
  realm: "partner",
  actorType: "referral_passenger",
} as unknown as BootstrapRequestIdentity;

const tariff: FareTariff = {
  version: "synthetic-fare-v1",
  sourceReference: "synthetic test tariff",
  effectiveAt: "2023-04-01T00:00:00+08:00",
  effectiveUntil: null,
  baseFare: 85,
  baseDistanceMeters: 1250,
  distanceRate: 5,
  distanceIncrementMeters: 200,
  delayRate: 5,
  delayIncrementSeconds: 60,
  nightSurchargeAmount: 20,
  nightSurchargeWindowStart: "23:00",
  nightSurchargeWindowEnd: "06:00",
  nightApplication: "pickup",
  additionalFees: {},
  distanceRounding: "ceil",
  delayRounding: "ceil",
  totalRounding: "nearest",
  totalIncrement: 5,
};

// 10:00 Taipei: daytime. 5.25 km → 20 distance units of NT$5 on top of NT$85.
const DAY = "2026-10-21T02:00:00.000Z";
const NIGHT = "2026-10-21T16:00:00.000Z";

function order(overrides: Record<string, unknown> = {}) {
  return {
    orderId: "order-1",
    status: "created",
    serviceBucket: "business_dispatch",
    businessDispatchSubtype: "enterprise_dispatch",
    serviceProductCode: "enterprise_dispatch",
    pickup: { address: "pickup", lat: 25.01, lng: 121.46 },
    dropoff: { address: "dropoff", lat: 25.04, lng: 121.56 },
    fixedPrice: false,
    quotedFare: null,
    proofRequirements: {
      minPhotoCount: 1,
      signoffRequired: false,
      expenseProofRequired: false,
    },
    referralPassengerLifecycle: { quote: { pricingAt: DAY } },
    ...overrides,
  };
}

type Task = {
  taskId: string;
  orderId: string;
  driverId: string;
  vehicleId: string;
  status: string;
};

function harness(
  options: {
    order?: ReturnType<typeof order>;
    tasks?: Task[];
    busyDriverIds?: string[];
    staleTasks?: Task[];
    ineligibleDriverIds?: string[];
    conflictDriverIds?: string[];
  } = {},
) {
  const current = options.order ?? order();
  const tasks: Task[] = options.tasks ?? [];
  const advance = (status: string) =>
    vi.fn(async (taskId: string) => {
      const task = tasks.find((t) => t.taskId === taskId)!;
      task.status = status;
      if (status === "completed") current.status = "completed";
      return { ...task };
    });
  const orders = {
    requireOwnedReferralPassengerOrder: vi.fn(async () => current),
    prepareOrderAction: vi.fn(async () => undefined),
    dispatchOrder: vi.fn(async () => ({ dispatchJobId: "job-1" })),
    listDispatchCandidates: vi.fn(async () =>
      REFERRAL_DEMO_SUPPLY.map((pair) => ({
        driverId: pair.driverId,
        vehicleId: pair.vehicleId,
        eligibilityDecision: "eligible",
        hardReasonCodes: [],
      })),
    ),
    assignDispatch: vi.fn(
      async (command: { driverId: string; vehicleId: string }) => {
        if (options.conflictDriverIds?.includes(command.driverId))
          throw new ApiRequestError(
            409,
            "DISPATCH_RESOURCE_RESERVATION_CONFLICT",
            "taken",
          );
        tasks.push({
          taskId: "task-1",
          orderId: current.orderId,
          driverId: command.driverId,
          vehicleId: command.vehicleId,
          status: "pending_acceptance",
        });
        current.status = "assigned";
        return {};
      },
    ),
    getDriverTasksForOrder: vi.fn((orderId: string) =>
      tasks.filter((t) => t.orderId === orderId).map((t) => ({ ...t })),
    ),
    getDriverTask: vi.fn((taskId: string) => ({
      ...tasks.find((t) => t.taskId === taskId)!,
    })),
    acceptDriverTask: advance("accepted"),
    departDriverTask: advance("enroute_pickup"),
    arrivedPickup: advance("arrived_pickup"),
    startDriverTask: advance("on_trip"),
    completeDriverTask: advance("completed"),
    getOrderForRead: vi.fn(async () => ({ ...current })),
  };
  const registry = {
    updateDriverWorkStateFromPersistence: vi.fn(async () => ({})),
    recordDriverLocation: vi.fn(async () => ({ success: true })),
    createDriver: vi.fn(async () => ({})),
    listVehicles: vi.fn(() => [
      { vehicleId: "pax-review-vehicle-a", plateNo: "SIM-1001" },
    ]),
    listContracts: vi.fn(() => [
      { contractId: "c", vehicleId: "pax-review-vehicle-a" },
    ]),
    listPolicies: vi.fn(() => [
      { policyId: "p", vehicleId: "pax-review-vehicle-a" },
    ]),
    listExclusivities: vi.fn(() => [{ vehicleId: "pax-review-vehicle-a" }]),
    prepareDispatchSupply: vi.fn(async () => undefined),
  };
  const registryRepository = {
    loadState: vi.fn(async () => ({ drivers: [], vehicles: [] })),
    persistChanges: vi.fn(async () => undefined),
  };
  const eligibility = {
    assertDispatchAssignmentEligible: vi.fn(
      (_order: unknown, _vehicleId: string, driverId: string) => {
        if (options.ineligibleDriverIds?.includes(driverId))
          throw new ApiRequestError(400, "VEHICLE_NOT_ELIGIBLE", "no");
      },
    ),
    enableServiceProductForSupply: vi.fn(async () => undefined),
  };
  const fares = { publishedTariff: vi.fn(async () => tariff) };
  const geo = {
    route: vi.fn(async () => ({ distanceMeters: 5250, durationSeconds: 900 })),
  };
  const database = {
    isEnabled: vi.fn(() => true),
    query: vi.fn(async (sql: string) =>
      sql.includes("updated_at <")
        ? { rows: (options.staleTasks ?? []).map((record) => ({ record })) }
        : {
            rows: (options.busyDriverIds ?? []).map((driver_id) => ({
              driver_id,
            })),
          },
    ),
  };
  const service = new ReferralDemoTripService(
    orders as never,
    registry as never,
    registryRepository as never,
    eligibility as never,
    fares as never,
    geo as never,
    database as never,
  );
  return {
    service,
    orders,
    registry,
    registryRepository,
    eligibility,
    database,
    tasks,
    current,
  };
}

describe("referral demo trip gating", () => {
  it("is enabled only with the flag in a development or test environment", () => {
    expect(
      referralDemoTripEnabled({
        REFERRAL_DEMO_TRIP_ENABLED: "true",
        DRTS_ENV: "development",
      }),
    ).toBe(true);
    expect(
      referralDemoTripEnabled({
        REFERRAL_DEMO_TRIP_ENABLED: "true",
        DRTS_ENV: "production",
      }),
    ).toBe(false);
    expect(referralDemoTripEnabled({ DRTS_ENV: "development" })).toBe(false);
  });
});

describe("ReferralDemoTripService", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.REFERRAL_DEMO_TRIP_ENABLED = "true";
    process.env.DRTS_ENV = "development";
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("behaves as a missing route when disabled", async () => {
    process.env.REFERRAL_DEMO_TRIP_ENABLED = "false";
    const h = harness();
    await expect(h.service.assign("order-1", identity)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(h.service.complete("order-1", identity)).rejects.toMatchObject(
      { code: "not_found" },
    );
    expect(h.orders.requireOwnedReferralPassengerOrder).not.toHaveBeenCalled();
  });

  it("refuses another passenger's order through the shared ownership check", async () => {
    const h = harness();
    h.orders.requireOwnedReferralPassengerOrder.mockRejectedValueOnce(
      new ApiRequestError(403, "PASSENGER_SCOPE_MISMATCH", "not yours"),
    );
    await expect(h.service.assign("order-1", identity)).rejects.toMatchObject({
      code: "PASSENGER_SCOPE_MISMATCH",
    });
    expect(h.orders.dispatchOrder).not.toHaveBeenCalled();
  });

  it("only serves referral business orders", async () => {
    const h = harness({ order: order({ serviceBucket: "standard_taxi" }) });
    await expect(h.service.assign("order-1", identity)).rejects.toMatchObject({
      code: "REFERRAL_DEMO_TRIP_UNSUPPORTED_ORDER",
    });
  });

  it("refuses an order that is no longer dispatchable", async () => {
    const h = harness({ order: order({ status: "cancelled" }) });
    await expect(h.service.assign("order-1", identity)).rejects.toMatchObject({
      code: "REFERRAL_DEMO_TRIP_NOT_DISPATCHABLE",
    });
    expect(h.orders.dispatchOrder).not.toHaveBeenCalled();
  });

  it("dispatches, assigns the first idle pair and accepts at once", async () => {
    const h = harness({ busyDriverIds: ["referral-demo-driver-1"] });
    const result = await h.service.assign("order-1", identity, "req-1");

    expect(result).toMatchObject({
      orderId: "order-1",
      driverId: "referral-demo-driver-2",
      simulated: true,
    });
    // The busy pair is left alone; idle pairs go online at the pickup.
    const online = h.registry.updateDriverWorkStateFromPersistence.mock.calls
      .filter(([, command]) => command.workState === "available")
      .map(([driverId]) => driverId);
    expect(online).toEqual([
      "referral-demo-driver-2",
      "referral-demo-driver-3",
    ]);
    expect(h.registry.recordDriverLocation).toHaveBeenCalledWith(
      expect.objectContaining({
        driverId: "referral-demo-driver-2",
        lat: 25.01,
        lng: 121.46,
      }),
    );
    expect(h.orders.dispatchOrder).toHaveBeenCalledWith(
      "order-1",
      { mode: "auto" },
      "req-1",
      expect.stringMatching(/^referral-demo-dispatch:order-1:/),
      { required: true },
    );
    expect(h.orders.assignDispatch).toHaveBeenCalledTimes(1);
    expect(h.orders.assignDispatch.mock.calls[0]![0]).toEqual({
      dispatchJobId: "job-1",
      driverId: "referral-demo-driver-2",
      vehicleId: "referral-demo-vehicle-2",
    });
    expect(h.orders.acceptDriverTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ acceptedAt: expect.any(String) }),
      "req-1",
    );
    // Only the pair that was not chosen goes back offline.
    const offline = h.registry.updateDriverWorkStateFromPersistence.mock.calls
      .filter(([, command]) => command.workState === "offline")
      .map(([driverId]) => driverId);
    expect(offline).toEqual(["referral-demo-driver-3"]);
  });

  it("refuses before dispatching when no test pair is eligible", async () => {
    const h = harness({
      ineligibleDriverIds: REFERRAL_DEMO_SUPPLY.map((p) => p.driverId),
    });
    await expect(h.service.assign("order-1", identity)).rejects.toMatchObject({
      code: "REFERRAL_DEMO_TRIP_SUPPLY_UNAVAILABLE",
    });
    // No dispatch means the passenger's order cannot fall into no-supply.
    expect(h.orders.dispatchOrder).not.toHaveBeenCalled();
    const offline = h.registry.updateDriverWorkStateFromPersistence.mock.calls
      .filter(([, command]) => command.workState === "offline")
      .map(([driverId]) => driverId);
    expect(offline).toHaveLength(3);
  });

  it("reports busy supply when every test pair is serving another demo trip", async () => {
    const h = harness({
      busyDriverIds: REFERRAL_DEMO_SUPPLY.map((p) => p.driverId),
    });
    await expect(h.service.assign("order-1", identity)).rejects.toMatchObject({
      code: "REFERRAL_DEMO_TRIP_SUPPLY_BUSY",
    });
    expect(h.orders.dispatchOrder).not.toHaveBeenCalled();
  });

  it("moves to the next pair when a reservation conflict wins the race", async () => {
    const h = harness({ conflictDriverIds: ["referral-demo-driver-1"] });
    const result = await h.service.assign("order-1", identity);
    expect(result.driverId).toBe("referral-demo-driver-2");
    expect(h.orders.assignDispatch).toHaveBeenCalledTimes(2);
  });

  it("is idempotent once a demo driver already serves the order", async () => {
    const h = harness({
      order: order({ status: "assigned" }),
      tasks: [
        {
          taskId: "task-1",
          orderId: "order-1",
          driverId: "referral-demo-driver-1",
          vehicleId: "referral-demo-vehicle-1",
          status: "accepted",
        },
      ],
    });
    const result = await h.service.assign("order-1", identity);
    expect(result.driverId).toBe("referral-demo-driver-1");
    expect(h.orders.dispatchOrder).not.toHaveBeenCalled();
  });

  it("completes through every driver step with the simulated actuals", async () => {
    const h = harness({
      order: order({ status: "assigned" }),
      tasks: [
        {
          taskId: "task-1",
          orderId: "order-1",
          driverId: "referral-demo-driver-1",
          vehicleId: "referral-demo-vehicle-1",
          status: "accepted",
        },
      ],
    });
    const result = await h.service.complete("order-1", identity, "req-2");

    expect(result).toMatchObject({ orderId: "order-1", status: "completed" });
    expect(h.orders.acceptDriverTask).not.toHaveBeenCalled();
    expect(h.orders.departDriverTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        currentLocation: { lat: 25.01, lng: 121.46 },
      }),
      "req-2",
    );
    expect(h.orders.arrivedPickup).toHaveBeenCalledTimes(1);
    expect(h.orders.startDriverTask).toHaveBeenCalledTimes(1);
    const [, command] = h.orders.completeDriverTask.mock.calls[0]!;
    expect(command).toMatchObject({
      actualDistanceKm: 5.3,
      actualDurationSec: 900,
      fare: { currency: "TWD", amountMinor: 18500 },
      actualFareBreakdown: {
        startMinor: 8500,
        distanceMinor: 10000,
        delayMinor: 0,
        nightMinor: 0,
      },
      proof: { photos: [REFERRAL_DEMO_PROOF_PHOTO] },
    });
    expect(REFERRAL_DEMO_PROOF_PHOTO).toMatch(/^data:image\/png;base64,/);
    expect(
      h.registry.updateDriverWorkStateFromPersistence,
    ).toHaveBeenCalledWith("referral-demo-driver-1", { workState: "offline" });
  });

  it("adds the tariff night fee when the quoted pickup was at night", async () => {
    const h = harness({
      order: order({
        referralPassengerLifecycle: { quote: { pricingAt: NIGHT } },
      }),
    });
    const actual = await h.service.simulatedActuals(h.current as never);
    expect(actual.fare.amountMinor).toBe(20500);
    expect(actual.breakdown).toEqual({
      startMinor: 8500,
      distanceMinor: 10000,
      delayMinor: 0,
      nightMinor: 2000,
    });
  });

  it("never completes a trip served by a real driver", async () => {
    const h = harness({
      order: order({ status: "assigned" }),
      tasks: [
        {
          taskId: "task-9",
          orderId: "order-1",
          driverId: "real-driver",
          vehicleId: "real-vehicle",
          status: "on_trip",
        },
      ],
    });
    await expect(h.service.complete("order-1", identity)).rejects.toMatchObject(
      { code: "REFERRAL_DEMO_TRIP_NOT_ASSIGNED" },
    );
    expect(h.orders.completeDriverTask).not.toHaveBeenCalled();
  });

  it("refuses proof the demo cannot provide", async () => {
    const h = harness({
      order: order({
        status: "assigned",
        proofRequirements: {
          minPhotoCount: 1,
          signoffRequired: true,
          expenseProofRequired: false,
        },
      }),
      tasks: [
        {
          taskId: "task-1",
          orderId: "order-1",
          driverId: "referral-demo-driver-1",
          vehicleId: "referral-demo-vehicle-1",
          status: "on_trip",
        },
      ],
    });
    await expect(h.service.complete("order-1", identity)).rejects.toMatchObject(
      { code: "REFERRAL_DEMO_TRIP_PROOF_UNSUPPORTED" },
    );
    expect(h.orders.completeDriverTask).not.toHaveBeenCalled();
  });

  it("returns a completed order without touching it again", async () => {
    const h = harness({ order: order({ status: "completed" }) });
    await expect(
      h.service.complete("order-1", identity),
    ).resolves.toMatchObject({ status: "completed" });
    expect(h.orders.prepareOrderAction).not.toHaveBeenCalled();
  });

  it("creates three business test pairs cloned from an existing vehicle", async () => {
    const h = harness();
    await h.service.prepareSupply();
    expect(h.registry.createDriver).toHaveBeenCalledTimes(3);
    expect(h.registry.createDriver.mock.calls[0]![0]).toMatchObject({
      driverId: "referral-demo-driver-1",
      supportedServiceBuckets: ["business_dispatch"],
      lifecycleStatus: "active",
    });
    const changes = h.registryRepository.persistChanges.mock.calls[0]![0];
    expect(
      changes.vehicles.map((v: { vehicleId: string }) => v.vehicleId),
    ).toEqual([
      "referral-demo-vehicle-1",
      "referral-demo-vehicle-2",
      "referral-demo-vehicle-3",
    ]);
    expect(changes.vehicles[0]).toMatchObject({
      plateNo: "TEST-B001",
      supportedServiceBuckets: ["business_dispatch"],
    });
    expect(changes.supplyPairs).toHaveLength(3);
    expect(h.registry.prepareDispatchSupply).toHaveBeenCalledWith(
      "business_dispatch",
    );
    expect(h.eligibility.enableServiceProductForSupply).toHaveBeenCalledWith(
      "enterprise_dispatch",
      REFERRAL_DEMO_SUPPLY.map((p) => p.vehicleId),
      expect.objectContaining({ actorType: "system" }),
    );
  });

  it("completes an abandoned demo trip to free its test pair", async () => {
    const stale: Task = {
      taskId: "task-old",
      orderId: "order-old",
      driverId: "referral-demo-driver-1",
      vehicleId: "referral-demo-vehicle-1",
      status: "on_trip",
    };
    const h = harness({ staleTasks: [stale], tasks: [stale] });
    h.orders.getOrderForRead.mockImplementation(async (id: string) =>
      id === "order-old"
        ? (order({ orderId: "order-old", status: "assigned" }) as never)
        : ({ ...h.current } as never),
    );
    await h.service.assign("order-1", identity);
    expect(h.orders.completeDriverTask).toHaveBeenCalledWith(
      "task-old",
      expect.any(Object),
      undefined,
    );
  });
});
