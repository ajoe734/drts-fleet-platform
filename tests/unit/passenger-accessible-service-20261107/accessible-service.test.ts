import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bookingFixture,
  dispatchFixture,
  NOW,
  VEHICLE,
  DRIVER,
} from "./fixture";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  for (const [name, value] of Object.entries({
    NODE_ENV: "test",
    DRTS_ENV: "test",
    APP_ENV: "test",
    JWT_SECRET: "synthetic-unit-only-accessible-fare-key",
    JWT_ALGORITHM: "HS256",
    JWT_ALGORITHMS: "HS256",
    JWT_PRIVATE_KEY: "",
    JWT_PUBLIC_KEY: "",
    JWT_KEY_RING_JSON: "",
    REQUIRE_SMS_VERIFICATION: "false",
    SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES: "15",
    MULTI_TAXI_DEFAULT_AUTHORIZATION_ID: "",
  }))
    vi.stubEnv(name, value);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("normal Passenger immutable accessible quote and same-order dispatch", () => {
  it("quotes and persists the optional accessible choice without changing the approved fare calculation", async () => {
    const f = await bookingFixture();
    const ordinary = await f.fares.quote(f.identity, f.body);
    const selected = await f.fares
      .quote(f.identity, { ...f.body, serviceSelection: { accessible: true } })
      .catch((error) => error);
    expect(selected).toMatchObject({
      serviceAreaResult: "serviceable",
      serviceSelection: { accessible: true },
    });
    expect(selected.estimatedMin).toBe(
      ordinary.serviceAreaResult === "serviceable"
        ? ordinary.estimatedMin
        : null,
    );
    expect(selected.estimatedMax).toBe(
      ordinary.serviceAreaResult === "serviceable"
        ? ordinary.estimatedMax
        : null,
    );
    expect(
      await f.fareRepository.findOwnedSnapshot(
        selected.fareSnapshotId,
        f.account.drtsPassengerId,
      ),
    ).toMatchObject({
      serviceSelection: { accessible: true },
      fareSnapshotId: selected.fareSnapshotId,
    });
    expect(
      await f.fareRepository.findOwnedSnapshot(
        selected.fareSnapshotId,
        "foreign-owner",
      ),
    ).toBeNull();
    expect(f.fareCalls[0]!.values).toHaveLength(16);
    expect(f.fareCalls[0]!.sql).not.toContain("service_selection");
    expect(f.fareCalls[1]!.values).toHaveLength(17);
    expect(f.fareCalls[1]!.values[16]).toBe(
      JSON.stringify({ accessible: true }),
    );
  });

  it("binds creation and idempotent replay to the owned quote instead of a new create-body flag", async () => {
    const f = await bookingFixture();
    const quote = await f.persistedQuote({ accessible: true });
    const command = f.commandFor(quote);
    const created = await f.booking.createRide(
      f.account.drtsPassengerId,
      command,
      "same-accessible-booking",
    );
    const replay = await f.booking.createRide(
      f.account.drtsPassengerId,
      command,
      "same-accessible-booking",
    );
    expect(created.ride.order).toMatchObject({
      orderId: f.state.order?.orderId,
      serviceSelection: { accessible: true },
    });
    expect(replay.ride.order).toEqual(created.ride.order);
    expect(f.state.order).toMatchObject({
      serviceProductCode: "taxi_reservation",
      serviceSelection: { accessible: true },
    });
    expect(f.state.history?.[1]).toBe(created.ride.order.orderId);
    expect(
      f.calls.filter((c) =>
        c.sql.startsWith("INSERT INTO ops.phase1_owned_orders"),
      ),
    ).toHaveLength(1);
    expect(
      f.calls
        .filter((c) => c.sql.startsWith("INSERT"))
        .every((c) => c.transactional),
    ).toBe(true);
  });

  it("retains the accessible choice through a lost commit acknowledgement and same-key readback", async () => {
    const f = await bookingFixture(["lost_commit_reply"]);
    const quote = await f.persistedQuote({ accessible: true });
    const command = f.commandFor(quote);
    await expect(
      f.booking.createRide(
        f.account.drtsPassengerId,
        command,
        "lost-accessible-ack",
      ),
    ).rejects.toThrow("lost commit reply");
    const replay = await f.booking.createRide(
      f.account.drtsPassengerId,
      command,
      "lost-accessible-ack",
    );
    expect(replay.ride.order).toMatchObject({
      orderId: f.state.order?.orderId,
      serviceSelection: { accessible: true },
    });
    expect(f.state.history?.[1]).toBe(replay.ride.order.orderId);
    expect(
      f.calls.filter((c) =>
        c.sql.startsWith("INSERT INTO ops.phase1_owned_orders"),
      ),
    ).toHaveLength(1);
  });

  it("keeps ordinary quotes and creates unchanged and ignores a create-body accessible flag", async () => {
    const f = await bookingFixture();
    const quote = await f.persistedQuote();
    const created = await f.booking.createRide(f.account.drtsPassengerId, {
      ...f.commandFor(quote),
      serviceSelection: { accessible: true },
    } as never);
    expect(created.ride.order).not.toHaveProperty("serviceSelection");
    expect(f.state.order).not.toHaveProperty("serviceSelection");
    expect(f.state.order?.serviceProductCode).toBe("taxi_reservation");
    expect(f.fareCalls[0]!.values).toHaveLength(16);
  });

  it("uses the per-vehicle canonical form for candidates and final assignment on the same booked UUID", async () => {
    const f = await bookingFixture();
    const quote = await f.persistedQuote({ accessible: true });
    await f.booking.createRide(f.account.drtsPassengerId, f.commandFor(quote));
    const d = await dispatchFixture(f.state.order!, quote);
    const orderId = f.state.order!.orderId;
    const job = await d.owned.dispatchOrder(orderId, { mode: "auto" });
    const candidates = await d.owned.listDispatchCandidates(job.dispatchJobId);
    expect(candidates.map((c) => c.vehicleId)).toContain(VEHICLE);
    const result = await d.owned.assignDispatch({
      dispatchJobId: job.dispatchJobId,
      vehicleId: VEHICLE,
      driverId: DRIVER,
    });
    expect(d.owned.getOrder(orderId)).toMatchObject({
      orderId,
      serviceSelection: { accessible: true },
    });
    expect(
      d.owned
        .getDispatchAssignmentsForOrder(orderId)
        .find((a) => a.assignmentId === result.assignmentId),
    ).toMatchObject({
      orderId,
      serviceSelection: { accessible: true },
    });
    expect(
      d.owned
        .getDriverTasksForOrder(orderId)
        .find((t) => t.taskId === result.taskId),
    ).toMatchObject({
      orderId,
      serviceSelection: { accessible: true },
    });
    expect(d.forwarder.listDriverTaskViews(DRIVER)[0]).toMatchObject({
      orderId,
      taskId: result.taskId,
      serviceSelection: { accessible: true },
    });
    const formRead = d.calls.findIndex(
      (c) =>
        c.transaction &&
        c.sql.includes("FROM reg.vehicles") &&
        c.sql.includes("ANY"),
    );
    const taskWrite = d.calls.findIndex(
      (c) =>
        c.transaction &&
        c.sql.startsWith("INSERT INTO ops.phase1_driver_tasks"),
    );
    expect(formRead).toBeGreaterThanOrEqual(0);
    expect(taskWrite).toBeGreaterThan(formRead);
  });

  it("does not offer an ordinary or unknown form as accessible despite the same active license matrix", async () => {
    const f = await bookingFixture();
    const quote = await f.persistedQuote({ accessible: true });
    await f.booking.createRide(f.account.drtsPassengerId, f.commandFor(quote));
    const d = await dispatchFixture(f.state.order!, quote);
    const job = await d.owned.dispatchOrder(f.state.order!.orderId, {
      mode: "auto",
    });
    for (const form of ["sedan", null] as const) {
      d.forms.set(VEHICLE, form);
      expect(
        (await d.owned.listDispatchCandidates(job.dispatchJobId, true)).map(
          (c) => c.vehicleId,
        ),
      ).not.toContain(VEHICLE);
      expect(
        d.eligibility.resolveRuntimeVehicleCapability(VEHICLE),
      ).toMatchObject({ active: true, licenseType: "multi_purpose_taxi" });
    }
    d.forms.set(VEHICLE, "accessible");
    expect(
      (await d.owned.listDispatchCandidates(job.dispatchJobId)).map(
        (c) => c.vehicleId,
      ),
    ).toContain(VEHICLE);
  });

  it("rechecks a removed accessible form inside the assignment transaction without downgrading the order", async () => {
    const f = await bookingFixture();
    const quote = await f.persistedQuote({ accessible: true });
    await f.booking.createRide(f.account.drtsPassengerId, f.commandFor(quote));
    const d = await dispatchFixture(f.state.order!, quote);
    const orderId = f.state.order!.orderId;
    const job = await d.owned.dispatchOrder(orderId, { mode: "auto" });
    expect(
      (await d.owned.listDispatchCandidates(job.dispatchJobId)).map(
        (c) => c.vehicleId,
      ),
    ).toContain(VEHICLE);
    d.forms.delete(VEHICLE); // External canonical registry row no longer provides an accessible form.
    await expect(
      d.owned.assignDispatch({
        dispatchJobId: job.dispatchJobId,
        vehicleId: VEHICLE,
        driverId: DRIVER,
      }),
    ).rejects.toMatchObject({ code: "BOOKING_REQUIREMENTS_NOT_MET" });
    expect(d.owned.getDriverTasksForOrder(orderId)).toEqual([]);
    expect(d.owned.getDispatchAssignmentsForOrder(orderId)).toEqual([]);
    expect(d.owned.getOrder(orderId)).toMatchObject({
      orderId,
      serviceSelection: { accessible: true },
    });
    expect(
      d.calls.some((c) => c.transaction && c.sql.includes("FROM reg.vehicles")),
    ).toBe(true);
  });

  it("continues offering the ordinary booked service when the same vehicle has a sedan form", async () => {
    const f = await bookingFixture();
    const quote = await f.persistedQuote();
    await f.booking.createRide(f.account.drtsPassengerId, f.commandFor(quote));
    const d = await dispatchFixture(f.state.order!, quote);
    d.forms.set(VEHICLE, "sedan");
    const job = await d.owned.dispatchOrder(f.state.order!.orderId, {
      mode: "auto",
    });
    expect(
      (await d.owned.listDispatchCandidates(job.dispatchJobId)).map(
        (c) => c.vehicleId,
      ),
    ).toContain(VEHICLE);
    expect(d.owned.getOrder(f.state.order!.orderId)).not.toHaveProperty(
      "serviceSelection",
    );
  });
});

// This interleaving is an R2-candidate control / R3 GREEN-only regression.
// Private225 lacks the new form SELECT and cannot provide causal RED for this case.
describe("transaction-local accessible form despite a delayed candidate read", () => {
  it("retains the transaction's negative form when an older candidate SELECT restores the shared accessible cache", async () => {
    for (const removedForm of ["sedan", null] as const) {
      const f = await bookingFixture();
      const quote = await f.persistedQuote({ accessible: true });
      await f.booking.createRide(
        f.account.drtsPassengerId,
        f.commandFor(quote),
      );
      const d = await dispatchFixture(f.state.order!, quote);
      const orderId = f.state.order!.orderId;
      const job = await d.owned.dispatchOrder(orderId, { mode: "auto" });
      expect(
        (await d.owned.listDispatchCandidates(job.dispatchJobId)).map(
          (c) => c.vehicleId,
        ),
      ).toContain(VEHICLE);

      const oldRead = d.holdNextCandidateFormRead();
      const oldCandidates = d.owned.listDispatchCandidates(job.dispatchJobId);
      const authorization = d.holdNextAssignmentAuthorizationRead();
      let assignment: Promise<unknown> | undefined;
      try {
        await oldRead.waitUntilEntered();
        d.forms.set(VEHICLE, removedForm);
        assignment = Promise.resolve(
          d.owned.assignDispatch({
            dispatchJobId: job.dispatchJobId,
            vehicleId: VEHICLE,
            driverId: DRIVER,
          }),
        ).then(
          (value) => value,
          (error) => error,
        );
        await authorization.waitUntilEntered();
        expect(d.registry.getVehicleForm(VEHICLE)).toBe(removedForm);
        oldRead.release();
        await oldCandidates;
        expect(d.registry.getVehicleForm(VEHICLE)).toBe("accessible");
        authorization.release();
        expect(await assignment).toMatchObject({
          code: "BOOKING_REQUIREMENTS_NOT_MET",
        });
        expect(d.owned.getDriverTasksForOrder(orderId)).toEqual([]);
        expect(d.owned.getDispatchAssignmentsForOrder(orderId)).toEqual([]);
        expect(d.owned.getOrder(orderId)).toMatchObject({
          orderId,
          serviceSelection: { accessible: true },
        });
        expect(
          d.calls.some(
            (c) => c.transaction && c.sql.includes("FROM reg.vehicles"),
          ),
        ).toBe(true);
        expect(
          d.calls.filter(
            (c) =>
              c.transaction &&
              /INSERT INTO ops.phase1_(driver_tasks|dispatch_assignments)/.test(
                c.sql,
              ),
          ),
        ).toEqual([]);
      } finally {
        oldRead.release();
        authorization.release();
        await Promise.allSettled([oldCandidates, assignment]);
      }
    }
  });
});
