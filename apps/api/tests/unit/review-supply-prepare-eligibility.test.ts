/**
 * DEV-DEPLOY-REVIEW-SUPPLY-ELIGIBILITY-20261101
 *
 * Reproduces the shared-dev `POST /api/ops/review-demo/prepare` 400
 * (VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT without `details.reason`).
 *
 * The real RegulatoryRegistryService and VehicleEligibilityService run the
 * normal dispatch eligibility; only persistence is replaced by an in-memory
 * store seeded the way shared dev already holds the rehearsal supply: the
 * synthetic vehicles were first prepared before BUREAU-R02 (V0131) bound
 * exclusivity declarations to an operator ID, so their persisted exclusivity
 * rows carry no `exclusiveOperatorId`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RegulatoryRegistryState } from "../../src/modules/regulatory-registry/regulatory-registry.repository";

type Store = {
  registry: RegulatoryRegistryState;
  writes: Array<Record<string, unknown[] | undefined>>;
  taxi: { authorizations: unknown[]; vehicles: unknown[] };
};

const store = vi.hoisted(
  () => ({ current: null }) as { current: Store | null },
);

function clone<T>(value: T): T {
  return structuredClone(value);
}

function upsertBy<T extends Record<string, unknown>>(
  rows: T[],
  incoming: readonly T[] | undefined,
  key: keyof T,
) {
  for (const row of incoming ?? []) {
    const index = rows.findIndex((r) => r[key] === row[key]);
    if (index >= 0) rows[index] = clone(row);
    else rows.push(clone(row));
  }
}

vi.mock(
  "../../src/modules/regulatory-registry/regulatory-registry.repository",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("../../src/modules/regulatory-registry/regulatory-registry.repository")
      >();
    class InMemoryRegulatoryRegistryRepository {
      isEnabled() {
        return store.current !== null;
      }
      async loadState() {
        return clone(store.current!.registry);
      }
      async persistChanges(changes: Record<string, unknown[] | undefined>) {
        const state = store.current!.registry as unknown as Record<
          string,
          Record<string, unknown>[]
        >;
        store.current!.writes.push(clone(changes));
        upsertBy(state.vehicles!, changes.vehicles as never, "vehicleId");
        upsertBy(state.contracts!, changes.contracts as never, "contractId");
        upsertBy(state.policies!, changes.policies as never, "policyId");
        upsertBy(
          state.exclusivities!,
          changes.exclusivities as never,
          "vehicleId",
        );
        upsertBy(state.supplyPairs!, changes.supplyPairs as never, "vehicleId");
        upsertBy(
          state.disclosureProfiles!,
          changes.disclosureProfiles as never,
          "vehicleId",
        );
        upsertBy(
          state.driverCredentials!,
          changes.driverCredentials as never,
          "driverId",
        );
      }
      async loadDriverMatchingSuppressions() {
        return [];
      }
      async findFleetPartnerOperatorMappings() {
        return [];
      }
      async findDispatchSupplyContext(serviceBucket: string) {
        const state = clone(store.current!.registry);
        const vehicles = state.vehicles.filter((v) =>
          v.supportedServiceBuckets.includes(serviceBucket as never),
        );
        const ids = new Set(vehicles.map((v) => v.vehicleId));
        const pairs = state.supplyPairs.filter((p) => ids.has(p.vehicleId));
        const driverIds = new Set(pairs.map((p) => p.driverId));
        return {
          state: {
            vehicles,
            drivers: state.drivers.filter((d) => driverIds.has(d.driverId)),
            supplyPairs: pairs,
            contracts: state.contracts.filter((c) => ids.has(c.vehicleId)),
            policies: state.policies.filter((p) => ids.has(p.vehicleId)),
            exclusivities: state.exclusivities.filter((e) =>
              ids.has(e.vehicleId),
            ),
            disclosureProfiles: state.disclosureProfiles.filter((p) =>
              ids.has(p.vehicleId),
            ),
            driverCredentials: state.driverCredentials.filter((c) =>
              driverIds.has(c.driverId),
            ),
          },
          locations: [],
        };
      }
    }
    return {
      ...original,
      RegulatoryRegistryRepository: InMemoryRegulatoryRegistryRepository,
    };
  },
);

vi.mock("../../src/modules/multi-taxi/multi-taxi.repository", () => ({
  MultiTaxiRepository: class {
    async loadState() {
      return clone(store.current!.taxi);
    }
    async persistAuthorization(record: unknown) {
      store.current!.taxi.authorizations.push(clone(record));
    }
    async persistVehicle(record: unknown) {
      store.current!.taxi.vehicles.push(clone(record));
    }
  },
}));

const { RegulatoryRegistryService } =
  await import("../../src/modules/regulatory-registry/regulatory-registry.service");
const { RegulatoryRegistryRepository } =
  await import("../../src/modules/regulatory-registry/regulatory-registry.repository");
const { VehicleEligibilityService } =
  await import("../../src/modules/vehicle-eligibility/vehicle-eligibility.service");
const {
  ReviewSupplyService,
  REVIEW_AUTHORIZATION_ID,
  REVIEW_OPERATOR_ID,
  REVIEW_SUPPLY,
} =
  await import("../../src/modules/passenger-app/review-demo/review-supply.service");

const TAXI_RESERVATION = {
  serviceProductId: "svc-taxi-reservation",
  serviceProductType: "taxi_reservation",
  displayName: "Taxi Reservation",
  timing: "reservation",
  active: true,
  allowedLicenseTypes: ["taxi", "multi_purpose_taxi"],
  meterRequired: true,
  fixedFareAllowed: false,
  defaultProofRequirements: [],
};

function createRegistry() {
  return new RegulatoryRegistryService(
    { publishSupplyLifecycleUpdated: vi.fn() } as never,
    { recordAuditLog: vi.fn() } as never,
    { findProfileForDriver: () => null } as never,
    new RegulatoryRegistryRepository() as never,
  );
}

/** Rehearsal supply exactly as the pre-R02 prepare() persisted it: cloned
 * from the established veh-demo-001 fixture, exclusivity without operator. */
function sharedDevStateBeforeR02(): Store {
  store.current = null;
  const seed = createRegistry();
  const template = seed
    .listVehicles()
    .find((v) => v.vehicleId === "veh-demo-001")!;
  const contract = seed
    .listContracts()
    .find((c) => c.vehicleId === "veh-demo-001")!;
  const policy = seed
    .listPolicies()
    .find((p) => p.vehicleId === "veh-demo-001")!;
  const exclusivity = seed
    .listExclusivities()
    .find((e) => e.vehicleId === "veh-demo-001")!;
  const driverTemplate = seed
    .listDrivers()
    .find((d) => d.driverId === "drv-demo-001")!;
  const start = "2026-01-01T00:00:00.000Z";
  const end = "2099-01-01T00:00:00.000Z";
  const at = "2026-10-20T00:00:00.000Z";
  const legacyExclusivity = (vehicleId: string) => {
    const record = {
      ...clone(exclusivity),
      vehicleId,
      declarationFileId: "review-simulated-document",
      exclusiveProviderName: "虛構演練車隊",
      effectiveStart: start,
      effectiveEnd: end,
      updatedAt: at,
    } as Record<string, unknown>;
    // Pre-V0131 rows never had an operator binding.
    delete record.exclusiveOperatorId;
    return record as never;
  };
  return {
    writes: [],
    taxi: {
      authorizations: [{ authorizationId: REVIEW_AUTHORIZATION_ID }],
      vehicles: REVIEW_SUPPLY.map((f) => ({
        authorizationId: REVIEW_AUTHORIZATION_ID,
        vehicleId: f.vehicleId,
      })),
    },
    registry: {
      vehicles: [
        clone(template),
        ...REVIEW_SUPPLY.map((f) => ({
          ...clone(template),
          ...f,
          operatingArea: "taipei",
          supportedServiceBuckets: ["standard_taxi" as const],
          dispatchableFlag: true,
          insuranceStatus: "valid" as const,
          exclusivityApproved: true,
          createdAt: at,
          updatedAt: at,
        })),
      ],
      drivers: REVIEW_SUPPLY.map((f) => ({
        ...clone(driverTemplate),
        driverId: f.driverId,
        supportedServiceBuckets: ["standard_taxi" as const],
        licenseExpiry: end,
        professionalDriverLicenseExpiry: end,
        taxiDriverRegistrationExpiry: end,
      })),
      supplyPairs: REVIEW_SUPPLY.map((f) => ({
        vehicleId: f.vehicleId,
        driverId: f.driverId,
        etaMinutes: 1,
      })),
      contracts: [
        clone(contract),
        ...REVIEW_SUPPLY.map((f) => ({
          ...clone(contract),
          contractId: `review-contract-${f.vehicleId}`,
          vehicleId: f.vehicleId,
          partnerId: REVIEW_OPERATOR_ID,
          operatingAreaId: "taipei",
          startAt: start,
          endAt: end,
          createdAt: at,
          updatedAt: at,
        })),
      ],
      policies: [
        clone(policy),
        ...REVIEW_SUPPLY.map((f) => ({
          ...clone(policy),
          policyId: `review-policy-${f.vehicleId}`,
          vehicleId: f.vehicleId,
          startAt: start,
          endAt: end,
          createdAt: at,
          updatedAt: at,
        })),
      ],
      exclusivities: [
        clone(exclusivity),
        ...REVIEW_SUPPLY.map((f) => legacyExclusivity(f.vehicleId)),
      ],
      disclosureProfiles: [],
      driverCredentials: [],
    },
  };
}

function createReviewSupply() {
  const registry = createRegistry();
  vi.spyOn(registry, "recordDriverLocation").mockResolvedValue(
    undefined as never,
  );
  const products = {
    prepareRuntimeProfileServiceProduct: vi.fn(async () => undefined),
    getRuntimeServiceProductByType: vi.fn((type: string) =>
      type === "taxi_reservation" ? TAXI_RESERVATION : null,
    ),
    listServiceProducts: vi.fn(() => [TAXI_RESERVATION]),
    createServiceProduct: vi.fn(),
    updateServiceProduct: vi.fn(),
  };
  const eligibility = new VehicleEligibilityService(
    registry,
    undefined,
    {
      isEnabled: () => true,
      amendMatrix: async (
        mutate: (current: never[]) => Record<string, unknown>[],
      ) => mutate([]),
    } as never,
    products as never,
  );
  const service = new ReviewSupplyService(
    { isEnabled: () => true } as never,
    registry,
    {} as never,
    products as never,
    eligibility,
    {
      findFleetPartnerForMultiTaxiOperator: vi.fn(async () => ({
        fleetPartnerId: "fleet-review",
        legalName: "智行",
        displayName: "智行",
      })),
    } as never,
    {
      prepareProfileAuthority: vi.fn(async () => undefined),
      updateProfile: vi.fn(async () => undefined),
    } as never,
  );
  return { service, registry, eligibility };
}

function exclusivityWrites(state: Store) {
  return state.writes.flatMap(
    (w) => (w.exclusivities ?? []) as Array<Record<string, unknown>>,
  );
}

describe("ReviewSupplyService.prepare on shared-dev rehearsal supply", () => {
  const previous = {
    PAX_REVIEW_DEMO_ENABLED: process.env.PAX_REVIEW_DEMO_ENABLED,
    DRTS_ENV: process.env.DRTS_ENV,
  };

  beforeEach(() => {
    process.env.PAX_REVIEW_DEMO_ENABLED = "true";
    process.env.DRTS_ENV = "test";
  });
  afterEach(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    store.current = null;
    vi.restoreAllMocks();
  });

  it("binds the existing rehearsal exclusivity to the synthetic operator and passes normal eligibility", async () => {
    const state = sharedDevStateBeforeR02();
    store.current = state;
    const { service, registry } = createReviewSupply();

    await expect(service.prepare()).resolves.toMatchObject({
      simulated: true,
      authorizationId: REVIEW_AUTHORIZATION_ID,
    });

    for (const fixture of REVIEW_SUPPLY) {
      const persisted = state.registry.exclusivities.find(
        (e) => e.vehicleId === fixture.vehicleId,
      )!;
      expect(persisted.exclusiveOperatorId).toBe(REVIEW_OPERATOR_ID);
      expect(
        registry.getVehicleDispatchability(fixture.vehicleId, "standard_taxi"),
      ).toBe(true);
    }
    // Only the rehearsal vehicles' exclusivities are written.
    expect(
      exclusivityWrites(state)
        .map((e) => e.vehicleId)
        .sort(),
    ).toEqual(REVIEW_SUPPLY.map((f) => f.vehicleId).sort());
    expect(
      state.registry.exclusivities.find((e) => e.vehicleId === "veh-demo-001")
        ?.exclusiveOperatorId,
    ).toBe("partner-demo-001");
  });

  it("stays idempotent: a second prepare rewrites no exclusivity and no authorization", async () => {
    const state = sharedDevStateBeforeR02();
    store.current = state;
    await createReviewSupply().service.prepare();
    const writesAfterFirst = exclusivityWrites(state).length;
    const authorizationsAfterFirst = state.taxi.authorizations.length;
    const taxiVehiclesAfterFirst = state.taxi.vehicles.length;

    await expect(createReviewSupply().service.prepare()).resolves.toMatchObject(
      { simulated: true },
    );
    expect(exclusivityWrites(state)).toHaveLength(writesAfterFirst);
    expect(state.taxi.authorizations).toHaveLength(authorizationsAfterFirst);
    expect(state.taxi.vehicles).toHaveLength(taxiVehiclesAfterFirst);
  });

  it("does not rebind a rehearsal exclusivity already bound to another operator", async () => {
    const state = sharedDevStateBeforeR02();
    const target = state.registry.exclusivities.find(
      (e) => e.vehicleId === REVIEW_SUPPLY[0]!.vehicleId,
    )!;
    target.exclusiveOperatorId = "some-other-operator";
    store.current = state;

    await createReviewSupply().service.prepare();

    expect(
      state.registry.exclusivities.find(
        (e) => e.vehicleId === REVIEW_SUPPLY[0]!.vehicleId,
      )?.exclusiveOperatorId,
    ).toBe("some-other-operator");
    expect(exclusivityWrites(state).map((e) => e.vehicleId)).not.toContain(
      REVIEW_SUPPLY[0]!.vehicleId,
    );
  });

  it("keeps the normal dispatch check: unbound exclusivity is still refused with a public reason", async () => {
    const state = sharedDevStateBeforeR02();
    store.current = state;
    const { registry, eligibility } = createReviewSupply();
    await registry.prepareDispatchSupply("standard_taxi");
    await eligibility.enableServiceProductForSupply(
      "taxi_reservation",
      REVIEW_SUPPLY.map((f) => f.vehicleId),
      { actorId: "test", actorType: "system", tenantId: null },
    );

    // Root cause: BUREAU-R02 blocks an active exclusivity with no operator ID.
    const lifecycle = registry
      .listVehicles()
      .find(
        (v) => v.vehicleId === REVIEW_SUPPLY[0]!.vehicleId,
      )!.supplyLifecycle;
    expect(lifecycle.dispatch.blockedReasons).toEqual([
      "exclusivity_operator_unbound",
    ]);

    let caught: unknown;
    try {
      eligibility.assertDispatchAssignmentEligible(
        {
          serviceBucket: "standard_taxi",
          businessDispatchSubtype: null,
          serviceProductCode: "taxi_reservation",
        },
        REVIEW_SUPPLY[0]!.vehicleId,
        REVIEW_SUPPLY[0]!.driverId,
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeDefined();
    const response = (
      caught as { getStatus(): number; getResponse(): unknown }
    ).getResponse() as {
      error: { code: string; details: Record<string, unknown> };
    };
    expect((caught as { getStatus(): number }).getStatus()).toBe(400);
    expect(response.error.code).toBe(
      "VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT",
    );
    expect(response.error.details).toEqual({
      vehicleId: REVIEW_SUPPLY[0]!.vehicleId,
      serviceProduct: "taxi_reservation",
      reason: "inactive",
    });
  });
});

describe("VehicleEligibilityService dispatchability refusal reason", () => {
  function assertWith(dispatchable: (bucket?: string) => boolean) {
    const registry = {
      getVehicleDispatchability: vi.fn((_vehicleId: string, bucket?: string) =>
        dispatchable(bucket),
      ),
      getDriverAvailability: vi.fn(() => true),
      getVehicleLicenseType: vi.fn(() => "multi_purpose_taxi"),
    };
    const eligibility = new VehicleEligibilityService(
      registry as never,
      undefined,
      undefined,
      {
        getRuntimeServiceProductByType: (type: string) =>
          type === "taxi_reservation" ? TAXI_RESERVATION : null,
      } as never,
    );
    try {
      eligibility.assertDispatchAssignmentEligible(
        {
          serviceBucket: "standard_taxi",
          businessDispatchSubtype: null,
          serviceProductCode: "taxi_reservation",
        },
        "veh-x",
        "drv-x",
      );
    } catch (error) {
      return (error as { getResponse(): unknown }).getResponse() as {
        error: { code: string; details: Record<string, unknown> };
      };
    }
    throw new Error("expected a refusal");
  }

  it("classifies a blocked supply lifecycle as inactive", () => {
    const response = assertWith(() => false);
    expect(response.error).toMatchObject({
      code: "VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT",
      details: {
        vehicleId: "veh-x",
        serviceProduct: "taxi_reservation",
        reason: "inactive",
      },
    });
  });

  it("classifies a dispatchable vehicle outside the product's bucket as unsupported_product", () => {
    const response = assertWith((bucket) => bucket === undefined);
    expect(response.error.details).toEqual({
      vehicleId: "veh-x",
      serviceProduct: "taxi_reservation",
      reason: "unsupported_product",
    });
  });
});
