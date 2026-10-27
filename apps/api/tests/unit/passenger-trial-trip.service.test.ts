import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RequestIdentity } from "../../src/common/auth/auth.types";
import {
  PASSENGER_TRIAL_SUPPLY,
  PassengerTrialTripService,
} from "../../src/modules/passenger-app/review-demo/passenger-trial-trip.service";
import { REVIEW_AUTHORIZATION_ID } from "../../src/modules/passenger-app/review-demo/review-supply.service";

const ORDER_ID = "6b1f6a3e-2c4d-4e8f-9a1b-3c5d7e9f1a2b";
const PASSENGER = "passenger-1";
const identity = { realm: "passenger" } as unknown as RequestIdentity;

function order(overrides: Record<string, unknown> = {}) {
  return {
    orderId: ORDER_ID,
    status: "ready_for_dispatch",
    serviceBucket: "standard_taxi",
    serviceProductCode: "taxi_reservation",
    runtimeProfileCode: "multi_taxi_direct",
    businessDispatchSubtype: null,
    pickup: { address: "pickup", lat: 25.01, lng: 121.46 },
    dropoff: { address: "dropoff", lat: 25.04, lng: 121.56 },
    passenger: { passengerId: PASSENGER, name: "p", phone: "0900000001" },
    fixedPrice: false,
    quotedFare: null,
    proofRequirements: {
      minPhotoCount: 1,
      signoffRequired: false,
      expenseProofRequired: false,
    },
    ...overrides,
  };
}

function quote(overrides: Record<string, unknown> = {}) {
  return {
    fareSnapshotId: "snapshot-1",
    drtsPassengerId: PASSENGER,
    route: { distanceMeters: 5250, durationSeconds: 840 },
    estimatedMin: 185,
    estimatedMax: 215,
    breakdown: { baseFare: 85, nightApplies: false, nightSurchargeAmount: 0 },
    ...overrides,
  };
}

type Task = {
  taskId: string;
  orderId: string;
  driverId: string;
  vehicleId: string;
  status: string;
  acceptedAt?: string;
  departedAt?: string;
  startedAt?: string;
};

function harness(
  options: {
    order?: ReturnType<typeof order>;
    quote?: ReturnType<typeof quote> | null;
    bookingOwner?: string | null;
    tasks?: Task[];
    authorizationExists?: boolean;
  } = {},
) {
  const current = options.order ?? order();
  const tasks: Task[] = options.tasks ?? [];
  const advance = (status: string) =>
    vi.fn(async (taskId: string) => {
      const task = tasks.find((t) => t.taskId === taskId)!;
      task.status = status;
      if (status === "on_trip") task.startedAt = new Date().toISOString();
      if (status === "completed") current.status = "completed";
      return { ...task };
    });
  const orders = {
    prepareOrderAction: vi.fn(async () => undefined),
    getOrderForRead: vi.fn(async () => ({ ...current })),
    dispatchOrder: vi.fn(async () => ({ dispatchJobId: "job-1" })),
    listDispatchCandidates: vi.fn(async () =>
      PASSENGER_TRIAL_SUPPLY.map((pair) => ({
        driverId: pair.driverId,
        vehicleId: pair.vehicleId,
        eligibilityDecision: "eligible",
        hardReasonCodes: [],
      })),
    ),
    assignDispatch: vi.fn(
      async (command: { driverId: string; vehicleId: string }) => {
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
  };
  const registry = {
    updateDriverWorkStateFromPersistence: vi.fn(async () => ({})),
    recordDriverLocation: vi.fn(async () => ({ success: true })),
    recordDriverLocationBatch: vi.fn(async () => ({ items: [] })),
    createDriver: vi.fn(async () => ({})),
    listVehicles: vi.fn(() => [{ vehicleId: "pax-review-vehicle-a" }]),
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
    assertDispatchAssignmentEligible: vi.fn(),
    enableServiceProductForSupply: vi.fn(async () => undefined),
  };
  const fares = {
    findOwnedSnapshot: vi.fn(async () =>
      options.quote === null ? null : (options.quote ?? quote()),
    ),
  };
  const authorizations = {
    authorizations:
      options.authorizationExists === false
        ? []
        : [{ authorizationId: REVIEW_AUTHORIZATION_ID }],
    vehicles: [] as Array<{ authorizationId: string; vehicleId: string }>,
  };
  const persistVehicle = vi.fn(async () => undefined);
  const database = {
    isEnabled: vi.fn(() => true),
    query: vi.fn(async (sql: string) => {
      if (sql.includes("booking_histories"))
        return {
          rows:
            options.bookingOwner === null
              ? []
              : [
                  {
                    drts_passenger_id: options.bookingOwner ?? PASSENGER,
                    fare_snapshot_id: "snapshot-1",
                  },
                ],
        };
      if (sql.includes("multi_taxi")) return { rows: [] };
      return { rows: [] };
    }),
  };
  const accounts = {
    getMe: vi.fn(async () => ({ account: { drtsPassengerId: PASSENGER } })),
  };
  const profiles = {
    prepareProfileAuthority: vi.fn(async () => undefined),
    updateProfile: vi.fn(async () => ({})),
  };
  const reviewSupply = { prepare: vi.fn(async () => ({})) };
  const service = new PassengerTrialTripService(
    orders as never,
    registry as never,
    registryRepository as never,
    eligibility as never,
    fares as never,
    {} as never,
    database as never,
    accounts as never,
    profiles as never,
    reviewSupply as never,
  );
  return {
    service,
    orders,
    registry,
    registryRepository,
    eligibility,
    fares,
    database,
    profiles,
    reviewSupply,
    authorizations,
    persistVehicle,
    tasks,
    current,
  };
}

vi.mock("../../src/modules/multi-taxi/multi-taxi.repository", () => ({
  MultiTaxiRepository: vi.fn().mockImplementation(function (this: object) {
    return mockTaxiRepository;
  }),
}));
let mockTaxiRepository: {
  loadState: () => Promise<unknown>;
  persistVehicle: (vehicle: unknown) => Promise<void>;
};

describe("PassengerTrialTripService", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.PAX_REVIEW_DEMO_ENABLED = "true";
    process.env.DRTS_ENV = "development";
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  function withTaxi(h: ReturnType<typeof harness>) {
    mockTaxiRepository = {
      loadState: vi.fn(async () => h.authorizations),
      persistVehicle: h.persistVehicle,
    };
    return h;
  }

  it("behaves as a missing route when the review demo is disabled", async () => {
    process.env.PAX_REVIEW_DEMO_ENABLED = "false";
    const h = withTaxi(harness());
    await expect(h.service.assign(ORDER_ID, identity)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(h.orders.dispatchOrder).not.toHaveBeenCalled();
  });

  it("serves only the caller's own booking", async () => {
    const h = withTaxi(harness({ bookingOwner: "someone-else" }));
    await expect(h.service.assign(ORDER_ID, identity)).rejects.toMatchObject({
      code: "PASSENGER_RIDE_NOT_FOUND",
    });
    const missing = withTaxi(harness({ bookingOwner: null }));
    await expect(
      missing.service.assign(ORDER_ID, identity),
    ).rejects.toMatchObject({ code: "PASSENGER_RIDE_NOT_FOUND" });
    const malformed = withTaxi(harness());
    await expect(
      malformed.service.assign("not-a-uuid", identity),
    ).rejects.toMatchObject({ code: "PASSENGER_RIDE_NOT_FOUND" });
    expect(malformed.database.query).not.toHaveBeenCalled();
  });

  it("refuses orders that are not the passenger's taxi reservation", async () => {
    const h = withTaxi(
      harness({ order: order({ serviceBucket: "business_dispatch" }) }),
    );
    await expect(h.service.assign(ORDER_ID, identity)).rejects.toMatchObject({
      code: "PASSENGER_TRIAL_TRIP_UNSUPPORTED_ORDER",
    });
    const foreign = withTaxi(
      harness({
        order: order({
          passenger: { passengerId: "other", name: "o", phone: "0" },
        }),
      }),
    );
    await expect(
      foreign.service.assign(ORDER_ID, identity),
    ).rejects.toMatchObject({ code: "PASSENGER_TRIAL_TRIP_UNSUPPORTED_ORDER" });
  });

  it("assigns a trial pair through the normal dispatch and sets off", async () => {
    const h = withTaxi(harness());
    const result = await h.service.assign(ORDER_ID, identity);
    expect(result).toMatchObject({
      orderId: ORDER_ID,
      driverId: PASSENGER_TRIAL_SUPPLY[0]!.driverId,
      simulated: true,
    });
    expect(h.orders.assignDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatchJobId: "job-1",
        driverId: "pax-trial-driver-1",
        vehicleId: "pax-trial-vehicle-1",
      }),
      undefined,
      expect.stringMatching(/^passenger-trial-assign:/),
      { required: true },
    );
    expect(h.tasks[0]!.status).toBe("enroute_pickup");
    expect(h.registry.recordDriverLocationBatch).toHaveBeenCalled();
  });

  it("creates the trial pairs on the review authorization", async () => {
    const h = withTaxi(harness());
    await h.service.prepareSupply();
    expect(h.reviewSupply.prepare).not.toHaveBeenCalled();
    expect(h.registry.createDriver).toHaveBeenCalledTimes(3);
    expect(h.registry.createDriver).toHaveBeenCalledWith(
      expect.objectContaining({
        driverId: "pax-trial-driver-1",
        supportedServiceBuckets: ["standard_taxi"],
      }),
    );
    const vehicles = h.registryRepository.persistChanges.mock.calls
      .map(([changes]) => (changes as { vehicles?: unknown[] }).vehicles)
      .find(Boolean) as Array<{ vehicleId: string; plateNo: string }>;
    expect(vehicles.map((v) => [v.vehicleId, v.plateNo])).toEqual([
      ["pax-trial-vehicle-1", "TST-0001"],
      ["pax-trial-vehicle-2", "TST-0002"],
      ["pax-trial-vehicle-3", "TST-0003"],
    ]);
    expect(h.persistVehicle).toHaveBeenCalledTimes(3);
    expect(h.persistVehicle).toHaveBeenCalledWith(
      expect.objectContaining({
        authorizationId: REVIEW_AUTHORIZATION_ID,
        vehicleId: "pax-trial-vehicle-1",
        status: "active",
      }),
    );
    expect(h.profiles.updateProfile).toHaveBeenCalledWith(
      "pax-trial-driver-1",
      {
        driverSurname: "測試",
      },
    );
    expect(h.eligibility.enableServiceProductForSupply).toHaveBeenCalledWith(
      "taxi_reservation",
      ["pax-trial-vehicle-1", "pax-trial-vehicle-2", "pax-trial-vehicle-3"],
      expect.objectContaining({ actorId: "passenger-trial-trip" }),
    );
  });

  /** Registry records of both listed templates, minus the given pieces. */
  function templates(missing: Record<string, string[]> = {}) {
    const ids = ["pax-review-vehicle-a", "veh-demo-001"];
    const present = (piece: string) =>
      ids.filter((id) => !missing[id]?.includes(piece));
    return {
      vehicles: present("vehicle").map((vehicleId) => ({
        vehicleId,
        make: `make-${vehicleId}`,
      })),
      contracts: present("contract").map((vehicleId) => ({
        contractId: `contract-${vehicleId}`,
        vehicleId,
      })),
      policies: present("policy").map((vehicleId) => ({
        policyId: `policy-${vehicleId}`,
        vehicleId,
        coverage: `coverage-${vehicleId}`,
      })),
      exclusivities: present("exclusivity").map((vehicleId) => ({
        vehicleId,
        exclusiveProviderId: `provider-${vehicleId}`,
      })),
    };
  }

  function withTemplates(
    h: ReturnType<typeof harness>,
    records: ReturnType<typeof templates>,
  ) {
    h.registry.listVehicles.mockReturnValue(records.vehicles as never);
    h.registry.listContracts.mockReturnValue(records.contracts as never);
    h.registry.listPolicies.mockReturnValue(records.policies as never);
    h.registry.listExclusivities.mockReturnValue(
      records.exclusivities as never,
    );
    return h;
  }

  function clonedChanges(h: ReturnType<typeof harness>) {
    return h.registryRepository.persistChanges.mock.calls
      .map(([changes]) => changes as Record<string, unknown[] | undefined>)
      .find((changes) => changes.vehicles)!;
  }

  it("keeps the preferred template when it is complete", async () => {
    const h = withTemplates(withTaxi(harness()), templates());
    await h.service.prepareSupply();
    const changes = clonedChanges(h);
    expect(changes.vehicles).toEqual(
      PASSENGER_TRIAL_SUPPLY.map((pair) =>
        expect.objectContaining({
          vehicleId: pair.vehicleId,
          make: "make-pax-review-vehicle-a",
        }),
      ),
    );
    expect(changes.policies).toEqual(
      PASSENGER_TRIAL_SUPPLY.map(() =>
        expect.objectContaining({ coverage: "coverage-pax-review-vehicle-a" }),
      ),
    );
  });

  it.each(["contract", "policy", "exclusivity"])(
    "clones the complete second template when the first lacks its %s",
    async (piece) => {
      const h = withTemplates(
        withTaxi(harness()),
        templates({ "pax-review-vehicle-a": [piece] }),
      );
      await h.service.prepareSupply();
      const changes = clonedChanges(h);
      const trialIds = PASSENGER_TRIAL_SUPPLY.map((pair) => pair.vehicleId);
      expect(changes.vehicles).toEqual(
        trialIds.map((vehicleId) =>
          expect.objectContaining({ vehicleId, make: "make-veh-demo-001" }),
        ),
      );
      expect(changes.contracts).toEqual(
        trialIds.map((vehicleId) =>
          expect.objectContaining({
            vehicleId,
            contractId: `passenger-trial-contract-${vehicleId}`,
          }),
        ),
      );
      expect(changes.policies).toEqual(
        trialIds.map((vehicleId) =>
          expect.objectContaining({
            vehicleId,
            coverage: "coverage-veh-demo-001",
          }),
        ),
      );
      expect(changes.exclusivities).toEqual(
        trialIds.map((vehicleId) =>
          expect.objectContaining({
            vehicleId,
            exclusiveProviderId: "provider-veh-demo-001",
          }),
        ),
      );
      expect(h.persistVehicle).toHaveBeenCalledTimes(3);
      expect(h.eligibility.enableServiceProductForSupply).toHaveBeenCalledTimes(
        1,
      );
    },
  );

  it("still refuses when no listed template is complete", async () => {
    const h = withTemplates(
      withTaxi(harness()),
      templates({
        "pax-review-vehicle-a": ["policy"],
        "veh-demo-001": ["exclusivity"],
      }),
    );
    const error = await h.service.prepareSupply().catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: "PASSENGER_TRIAL_TRIP_SUPPLY_UNAVAILABLE",
    });
    expect((error as { getStatus: () => number }).getStatus()).toBe(503);
    expect(h.registryRepository.persistChanges).not.toHaveBeenCalled();
    expect(h.persistVehicle).not.toHaveBeenCalled();
    expect(h.eligibility.enableServiceProductForSupply).not.toHaveBeenCalled();
  });

  it("lets the review preparation create a missing authorization first", async () => {
    const h = withTaxi(harness({ authorizationExists: false }));
    await h.service.prepareSupply();
    expect(h.reviewSupply.prepare).toHaveBeenCalledTimes(1);
  });

  it("reports the confirmed quote's route and lower fare at completion", async () => {
    const h = withTaxi(
      harness({
        tasks: [
          {
            taskId: "task-1",
            orderId: ORDER_ID,
            driverId: "pax-trial-driver-1",
            vehicleId: "pax-trial-vehicle-1",
            status: "on_trip",
            startedAt: new Date().toISOString(),
          },
        ],
      }),
    );
    await h.service.complete(ORDER_ID, identity);
    expect(h.orders.completeDriverTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        actualDistanceKm: 5.3,
        actualDurationSec: 840,
        fare: { currency: "TWD", amountMinor: 18500 },
        actualFareBreakdown: {
          startMinor: 8500,
          distanceMinor: 10000,
          delayMinor: 0,
          nightMinor: 0,
        },
      }),
      undefined,
    );
    expect(h.current.status).toBe("completed");
  });

  it("splits the night fee out of the fare when the quote applied it", async () => {
    const h = withTaxi(
      harness({
        quote: quote({
          estimatedMin: 205,
          breakdown: {
            baseFare: 85,
            nightApplies: true,
            nightSurchargeAmount: 20,
          },
        }),
      }),
    );
    await h.service.assign(ORDER_ID, identity);
    const actual = await h.service.simulatedActuals(order() as never);
    expect(actual.breakdown).toEqual({
      startMinor: 8500,
      distanceMinor: 10000,
      delayMinor: 0,
      nightMinor: 2000,
    });
  });

  it("drives the ride for the quoted route's duration", async () => {
    const started = Date.parse("2026-10-27T02:00:00.000Z");
    const h = withTaxi(harness());
    await h.service.assign(ORDER_ID, identity);
    const task = {
      taskId: "task-1",
      orderId: ORDER_ID,
      driverId: "pax-trial-driver-1",
      vehicleId: "pax-trial-vehicle-1",
      status: "on_trip",
      startedAt: new Date(started).toISOString(),
    };
    const halfway = h.service.simulatedPosition(
      order() as never,
      task as never,
      started + 420_000,
    );
    expect(halfway.lat).toBeCloseTo(25.025, 3);
    expect(halfway.lng).toBeCloseTo(121.51, 3);
  });
});
