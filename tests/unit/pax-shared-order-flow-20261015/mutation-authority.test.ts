import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createProductionBookingFixture,
  NOW,
  OWNER,
} from "../pax-booking-history-20261009/production-booking-fixture";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("REQUIRE_SMS_VERIFICATION", "false");
  vi.stubEnv("SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES", "15");
  vi.stubEnv("MULTI_TAXI_DEFAULT_AUTHORIZATION_ID", "");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function fixture() {
  const f = createProductionBookingFixture();
  const creation = vi.spyOn(f.multi, "createTrustedPassengerRide");
  const created = await f.service.createRide(OWNER, f.command);
  const token = (await creation.mock.results[0]!.value).passengerAccess
    .accessToken;
  const query = f.database.query.bind(f.database);
  // Complete the SQL transport fixture for the new authoritative read port.
  // Services, owner check, cancellation locks/rollback and token checks are real.
  f.database.query = (async (sql: string, values?: unknown[]) => {
    if (/SELECT record\s+FROM ops.phase1_owned_orders/.test(sql)) {
      expect(values).toEqual([created.ride.order.orderId]);
      return { rows: [{ record: structuredClone(f.state.order) }] };
    }
    return query(sql, values);
  }) as typeof f.database.query;
  return { ...f, orderId: created.ride.order.orderId, token };
}

it.each(["on_trip", "proof_pending", "completed", "cancelled"] as const)(
  "account cancellation of peer-committed %s uses locked authority without changing the stale projection",
  async (status) => {
    const f = await fixture();
    const memory = f.owned.listOrders();
    f.state.order!.status = status;
    const durable = structuredClone(f.state.order);
    const start = f.calls.length;
    await expect(
      f.controller.cancelRide(
        { realm: "passenger", drtsPassengerId: OWNER } as never,
        f.orderId,
        "shared-order-refusal",
      ),
    ).rejects.toMatchObject({ code: "ORDER_NOT_CANCELABLE" });
    expect(f.state.order).toEqual(durable);
    expect(f.owned.listOrders()).toEqual(memory);
    const statements = f.calls.slice(start);
    expect(
      statements.some((s) =>
        /phase1_dispatch_assignments.*FOR UPDATE/.test(s.sql),
      ),
    ).toBe(true);
    expect(statements.some((s) => s.sql === "ROLLBACK")).toBe(true);
    expect(
      statements.filter((s) => /^(INSERT|UPDATE|DELETE|COMMIT)\b/.test(s.sql)),
    ).toEqual([]);
  },
);

it("a durable token rating whose order subject changed retains the repository's ride-not-found contract", async () => {
  const f = await fixture();
  f.state.order!.status = "completed";
  f.state.order!.passenger.passengerId = "different-subject";
  const start = f.calls.length;
  await expect(
    f.multi.submitPassengerRating(f.token, {
      score: 1,
      contactRequested: true,
    }),
  ).rejects.toMatchObject({ code: "PASSENGER_RIDE_NOT_FOUND" });
  expect(
    f.calls.slice(start).filter((s) => /^(INSERT|UPDATE|DELETE)\b/.test(s.sql)),
  ).toEqual([]);
});
