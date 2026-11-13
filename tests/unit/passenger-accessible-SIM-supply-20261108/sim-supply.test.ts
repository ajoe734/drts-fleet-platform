import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { PASSENGER_TRIAL_SUPPLY } from "../../../apps/api/src/modules/passenger-app/review-demo/passenger-trial-trip.service";
import { REVIEW_SUPPLY } from "../../../apps/api/src/modules/passenger-app/review-demo/review-supply.service";
import { NOW, simSupplyFixture } from "./fixture";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  for (const [name, value] of Object.entries({
    NODE_ENV: "test",
    APP_ENV: "test",
    JWT_SECRET: "synthetic-unit-only-accessible-fare-key",
    JWT_ALGORITHM: "HS256",
    JWT_ALGORITHMS: "HS256",
    JWT_PRIVATE_KEY: "",
    JWT_PUBLIC_KEY: "",
    JWT_KEY_RING_JSON: "",
    SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES: "15",
  }))
    vi.stubEnv(name, value);
  vi.stubEnv("PAX_REVIEW_DEMO_ENABLED", "true");
  vi.stubEnv("DRTS_ENV", "test");
  vi.stubEnv(
    "MULTI_TAXI_DEFAULT_AUTHORIZATION_ID",
    "bc39e4f3-72d8-4383-bdc1-2426c1330dfa",
  );
  vi.stubEnv("REQUIRE_SMS_VERIFICATION", "false");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

type Fixture = Awaited<ReturnType<typeof simSupplyFixture>>;
async function threeReaders(h: Fixture, ids: string[]) {
  const loaded = await h.registryRepository.loadState();
  const supply =
    await h.registryRepository.findDispatchSupplyContext("standard_taxi");
  const client = await h.database.connect();
  try {
    await client.query("BEGIN");
    const selected = await h.registryRepository.findVehicleForms(ids, client);
    await client.query("COMMIT");
    return [
      loaded.vehicles
        .filter((vehicle) => ids.includes(vehicle.vehicleId))
        .map((vehicle) => [vehicle.vehicleId, vehicle.vehicleForm]),
      supply.state.vehicles
        .filter((vehicle) => ids.includes(vehicle.vehicleId))
        .map((vehicle) => [vehicle.vehicleId, vehicle.vehicleForm]),
      selected.map((vehicle) => [vehicle.vehicleId, vehicle.vehicleForm]),
    ].map((rows) =>
      rows.sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
  } finally {
    client.release();
  }
}
async function expectNoSedanAssignment(h: Fixture) {
  const outcome = await h.controller
    .assign(h.order.orderId, h.booking.identity)
    .catch((error: unknown) => error);
  expect(outcome).toBeInstanceOf(ApiRequestError);
  expect(
    h
      .rows("ops.phase1_dispatch_assignments")
      .filter((record) => record.orderId === h.order.orderId),
  ).toEqual([]);
  expect(
    h
      .rows("ops.phase1_driver_tasks")
      .filter((record) => record.orderId === h.order.orderId),
  ).toEqual([]);
  expect(
    (await h.owned.getOrderForRead(h.order.orderId)).serviceSelection,
  ).toEqual({ accessible: true });
  return outcome;
}

describe("UC16 existing SIM supply uses the same canonical order and form authority", () => {
  it("reads valid text snapshot forms consistently through load, fresh supply and the selected transaction", async () => {
    const h = await simSupplyFixture();
    const template = h.registry.listVehicles()[0]!;
    const entries = [
      ["SIM-form-accessible", "accessible"],
      ["SIM-form-sedan", "sedan"],
      ["SIM-form-wagon", "wagon"],
      ["SIM-form-mpv", "mpv"],
      ["SIM-form-other", "other"],
      ["SIM-form-invalid", "wheelchair"],
      ["SIM-form-unknown", null],
    ] as const;
    // Invalid/unknown external JSON is deliberately not trusted as a typed enum.
    for (const [id, form] of entries)
      h.sql
        .table("reg.phase1_registry_vehicles")
        .set(id, { ...template, vehicleId: id, vehicleForm: form });
    const ids = entries.map(([id]) => id);
    const expected = entries
      .map(([id, form]) => [id, form === "wheelchair" ? null : form])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    for (const reader of await threeReaders(h, ids))
      expect(reader).toEqual(expected);
  });

  it("keeps canonical sedan and null authoritative and never revives a missing UUID master from its snapshot", async () => {
    const h = await simSupplyFixture();
    const template = h.registry.listVehicles()[0]!;
    const ids = [
      "c5a89100-1111-4111-8111-000000000001",
      "c5a89100-1111-4111-8111-000000000002",
      "c5a89100-1111-4111-8111-000000000003",
    ];
    await h.registryRepository.persistChanges({
      vehicles: ids.map((vehicleId) => ({
        ...template,
        vehicleId,
        vehicleForm: "accessible",
      })),
    });
    h.canonicalForms.set(ids[0]!, "sedan");
    h.canonicalForms.set(ids[1]!, null);
    h.canonicalForms.delete(ids[2]!);
    const expected = [
      [ids[0], "sedan"],
      [ids[1], null],
      [ids[2], null],
    ];
    for (const reader of await threeReaders(h, ids))
      expect(reader).toEqual(expected);
  });

  it("prepares only the third trial car as an explicitly simulated accessible car", async () => {
    const h = await simSupplyFixture();
    await h.trial.prepareSupply();
    const state = await h.registryRepository.loadState();
    expect(
      PASSENGER_TRIAL_SUPPLY.map(
        (pair) =>
          state.vehicles.find((vehicle) => vehicle.vehicleId === pair.vehicleId)
            ?.vehicleForm,
      ),
    ).toEqual(["sedan", "sedan", "accessible"]);
    expect(
      state.disclosureProfiles.find(
        (profile) => profile.vehicleId === PASSENGER_TRIAL_SUPPLY[2]!.vehicleId,
      )?.model,
    ).toBe("輪椅測試車（模擬）");
    expect(
      state.vehicles.find((vehicle) => vehicle.vehicleId === "veh-demo-001")
        ?.vehicleForm,
    ).toBe("sedan");
  });

  it("prepares only the second review car as accessible while retaining the synthetic receipt source", async () => {
    const h = await simSupplyFixture();
    const result = await h.review.prepare();
    const state = await h.registryRepository.loadState();
    expect(
      REVIEW_SUPPLY.map(
        (pair) =>
          state.vehicles.find((vehicle) => vehicle.vehicleId === pair.vehicleId)
            ?.vehicleForm,
      ),
    ).toEqual(["sedan", "accessible"]);
    expect(
      state.disclosureProfiles.find(
        (profile) => profile.vehicleId === REVIEW_SUPPLY[1]!.vehicleId,
      )?.model,
    ).toBe("輪椅展示車（合成）");
    expect(result).toMatchObject({
      simulated: true,
      receiptSource: "合成演練資料・非正式憑證",
    });
  });

  it("upgrades the previously prepared third trial car without resetting busy state, existing assignments or unrelated records", async () => {
    const h = await simSupplyFixture();
    await h.trial.prepareSupply();
    const pair = PASSENGER_TRIAL_SUPPLY[2]!;
    const old = structuredClone(
      h.sql.table("reg.phase1_registry_vehicles").get(pair.vehicleId),
    );
    delete old.vehicleForm;
    h.sql.table("reg.phase1_registry_vehicles").set(pair.vehicleId, old);
    await h.registry.updateDriverWorkStateFromPersistence(pair.driverId, {
      workState: "reserved",
    });
    const busy = {
      taskId: "SIM-busy-trial",
      orderId: "SIM-existing-other-order",
      driverId: pair.driverId,
      vehicleId: pair.vehicleId,
      status: "accepted",
      updatedAt: new Date().toISOString(),
    };
    h.sql.table("ops.phase1_driver_tasks").set(busy.taskId, busy);
    const assignment = {
      assignmentId: "SIM-existing-trial-assignment",
      orderId: busy.orderId,
      driverId: pair.driverId,
      vehicleId: pair.vehicleId,
      status: "accepted",
    };
    h.sql
      .table("ops.phase1_dispatch_assignments")
      .set(assignment.assignmentId, assignment);
    const disclosure = h
      .raw("reg.vehicle_passenger_disclosure_profiles")
      .get(pair.vehicleId)!;
    disclosure.model = "Corolla Altis";
    const unrelated = structuredClone(
      h.sql.table("reg.phase1_registry_vehicles").get("veh-demo-001"),
    );
    await h.trial.prepareSupply();
    expect(
      (await h.registryRepository.loadState()).vehicles.find(
        (vehicle) => vehicle.vehicleId === pair.vehicleId,
      )?.vehicleForm,
    ).toBe("accessible");
    expect(
      h.sql.table("reg.phase1_registry_drivers").get(pair.driverId)?.workState,
    ).toBe("reserved");
    expect(h.sql.table("ops.phase1_driver_tasks").get(busy.taskId)).toEqual(
      busy,
    );
    expect(
      h.sql
        .table("ops.phase1_dispatch_assignments")
        .get(assignment.assignmentId),
    ).toEqual(assignment);
    expect(
      h.raw("reg.vehicle_passenger_disclosure_profiles").get(pair.vehicleId),
    ).toMatchObject({ ...disclosure, model: "輪椅測試車（模擬）" });
    expect(
      h.sql.table("reg.phase1_registry_vehicles").get("veh-demo-001"),
    ).toEqual(unrelated);
    expect(
      h.sql.table("reg.phase1_registry_vehicles").get(pair.vehicleId),
    ).toMatchObject({ ...old, vehicleForm: "accessible" });
  });

  it("upgrades the existing second review car without replacing its busy task or ordinary sibling", async () => {
    const h = await simSupplyFixture();
    await h.review.prepare();
    const pair = REVIEW_SUPPLY[1]!;
    const old = structuredClone(
      h.sql.table("reg.phase1_registry_vehicles").get(pair.vehicleId),
    );
    delete old.vehicleForm;
    h.sql.table("reg.phase1_registry_vehicles").set(pair.vehicleId, old);
    await h.registry.updateDriverWorkStateFromPersistence(pair.driverId, {
      workState: "reserved",
    });
    const busy = {
      taskId: "SIM-busy-review",
      orderId: "SIM-existing-review-order",
      driverId: pair.driverId,
      vehicleId: pair.vehicleId,
      status: "accepted",
      updatedAt: new Date().toISOString(),
    };
    h.sql.table("ops.phase1_driver_tasks").set(busy.taskId, busy);
    const assignment = {
      assignmentId: "SIM-existing-review-assignment",
      orderId: busy.orderId,
      driverId: pair.driverId,
      vehicleId: pair.vehicleId,
      status: "accepted",
    };
    h.sql
      .table("ops.phase1_dispatch_assignments")
      .set(assignment.assignmentId, assignment);
    const disclosure = h
      .raw("reg.vehicle_passenger_disclosure_profiles")
      .get(pair.vehicleId)!;
    disclosure.model = "虛構展示車";
    const ordinary = structuredClone(
      h.sql
        .table("reg.phase1_registry_vehicles")
        .get(REVIEW_SUPPLY[0]!.vehicleId),
    );
    const readiness = await h.review.prepare().catch((error: unknown) => error);
    // Existing readiness rejects a reserved driver rather than releasing it.
    expect(readiness).toMatchObject({
      code: "DRIVER_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT",
    });
    expect(
      (await h.registryRepository.loadState()).vehicles.find(
        (vehicle) => vehicle.vehicleId === pair.vehicleId,
      )?.vehicleForm,
    ).toBe("accessible");
    expect(
      h.sql.table("reg.phase1_registry_drivers").get(pair.driverId)?.workState,
    ).toBe("reserved");
    expect(h.sql.table("ops.phase1_driver_tasks").get(busy.taskId)).toEqual(
      busy,
    );
    expect(
      h.sql
        .table("ops.phase1_dispatch_assignments")
        .get(assignment.assignmentId),
    ).toEqual(assignment);
    expect(
      h.raw("reg.vehicle_passenger_disclosure_profiles").get(pair.vehicleId),
    ).toMatchObject({ ...disclosure, model: "輪椅展示車（合成）" });
    expect(
      h.sql
        .table("reg.phase1_registry_vehicles")
        .get(REVIEW_SUPPLY[0]!.vehicleId),
    ).toEqual(ordinary);
  });

  it("assigns the third trial car through the real controller and engine on the passenger's same accessible order UUID", async () => {
    const h = await simSupplyFixture({ accessible: true });
    expect(h.order.serviceProductCode).toBe("taxi_reservation");
    expect(h.order.serviceSelection).toEqual({ accessible: true });
    const result = await h.controller
      .assign(h.order.orderId, h.booking.identity)
      .catch((error: unknown) => error);
    expect(result).toMatchObject({
      data: {
        orderId: h.order.orderId,
        driverId: PASSENGER_TRIAL_SUPPLY[2]!.driverId,
        simulated: true,
      },
    });
    const tasks = h
      .rows("ops.phase1_driver_tasks")
      .filter((task) => task.orderId === h.order.orderId);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      orderId: h.order.orderId,
      vehicleId: PASSENGER_TRIAL_SUPPLY[2]!.vehicleId,
      status: "enroute_pickup",
      serviceSelection: { accessible: true },
    });
    expect(
      h
        .rows("ops.phase1_dispatch_assignments")
        .filter((assignment) => assignment.orderId === h.order.orderId),
    ).toHaveLength(1);
    expect((await h.owned.getOrderForRead(h.order.orderId)).orderId).toBe(
      h.order.orderId,
    );
  });

  it("keeps ordinary same-order trial dispatch available without requiring an accessible selection", async () => {
    const h = await simSupplyFixture();
    const result = await h.controller.assign(
      h.order.orderId,
      h.booking.identity,
    );
    expect(result).toMatchObject({
      data: {
        orderId: h.order.orderId,
        driverId: PASSENGER_TRIAL_SUPPLY[0]!.driverId,
        simulated: true,
      },
    });
    expect(
      h
        .rows("ops.phase1_driver_tasks")
        .filter((task) => task.orderId === h.order.orderId),
    ).toEqual([
      expect.objectContaining({
        vehicleId: PASSENGER_TRIAL_SUPPLY[0]!.vehicleId,
        status: "enroute_pickup",
      }),
    ]);
    expect(
      (await h.owned.getOrderForRead(h.order.orderId)).serviceSelection,
    ).toBeUndefined();
  });

  it("does not assign an ordinary car when the accessible trial driver is busy on another order", async () => {
    const h = await simSupplyFixture({ accessible: true });
    await h.trial.prepareSupply();
    const pair = PASSENGER_TRIAL_SUPPLY[2]!;
    await h.registry.updateDriverWorkStateFromPersistence(pair.driverId, {
      workState: "reserved",
    });
    const busy = {
      taskId: "SIM-other-active-task",
      orderId: "SIM-other-active-order",
      driverId: pair.driverId,
      vehicleId: pair.vehicleId,
      status: "accepted",
      updatedAt: new Date().toISOString(),
    };
    h.sql.table("ops.phase1_driver_tasks").set(busy.taskId, busy);
    await expectNoSedanAssignment(h);
    expect(h.sql.table("ops.phase1_driver_tasks").get(busy.taskId)).toEqual(
      busy,
    );
    expect(
      h.sql.table("reg.phase1_registry_drivers").get(pair.driverId)?.workState,
    ).toBe("reserved");
  });

  it("does not replace a removed accessible supply option with a sedan", async () => {
    const h = await simSupplyFixture({ accessible: true });
    await h.trial.prepareSupply();
    const pair = PASSENGER_TRIAL_SUPPLY[2]!;
    await h.registry.updateVehicleComplianceFromPersistence(pair.vehicleId, {
      dispatchableFlag: false,
    });
    await expectNoSedanAssignment(h);
    expect(
      (await h.registryRepository.loadState()).vehicles.find(
        (vehicle) => vehicle.vehicleId === pair.vehicleId,
      )?.dispatchableFlag,
    ).toBe(false);
  });

  it("refuses a removed SIM accessible form at the real assignment transaction without falling back to a sedan", async () => {
    const h = await simSupplyFixture({ accessible: true });
    await h.trial.prepareSupply();
    const pair = PASSENGER_TRIAL_SUPPLY[2]!;
    h.removeFormAtNextSelectedTransaction(pair.vehicleId);
    const outcome = await expectNoSedanAssignment(h);
    expect(outcome).toMatchObject({ code: "BOOKING_REQUIREMENTS_NOT_MET" });
    expect(
      h.calls.some(
        (call) => call.transaction && call.sql.startsWith("WITH selected AS"),
      ),
    ).toBe(true);
    // The negative SQL row was read during the real transaction; its rollback
    // can restore the in-memory store, so this records the boundary event.
    expect(h.selectedTransactionFormRemovals).toEqual([pair.vehicleId]);
  });
});
