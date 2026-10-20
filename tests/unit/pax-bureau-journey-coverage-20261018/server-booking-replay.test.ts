import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createProductionBookingFixture,
  NOW,
  OWNER,
} from "../pax-booking-history-20261009/production-booking-fixture";
import { computePayloadHash } from "../../../apps/api/src/common/idempotency/canonical-json";

// Reuse the original production service/mobility/access/repository fixture.
// Only SQL transport responses are supplied here; this is not PG acceptance.
function fixture(
  faults: Parameters<typeof createProductionBookingFixture>[0] = [],
) {
  const f = createProductionBookingFixture(faults);
  let hideLookup = false;
  const query = f.database.query.bind(f.database);
  f.database.query = (async (sql: string, values?: readonly unknown[]) => {
    const result = await query(sql, values);
    // A competing transaction may commit between the early read and claim.
    // Supply only that external read timing; actual replay logic stays real.
    if (hideLookup && sql.includes("FROM ops.idempotency_records")) {
      hideLookup = false;
      return { ...result, rows: [], rowCount: 0 };
    }
    return result;
  }) as typeof f.database.query;
  return {
    ...f,
    receipts: f.bookingReceipts,
    hideNextLookup: () => {
      hideLookup = true;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("REQUIRE_SMS_VERIFICATION", "false");
  vi.stubEnv("SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES", "15");
  vi.stubEnv("MULTI_TAXI_DEFAULT_AUTHORIZATION_ID", "");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("the production create caller replays one immutable key/body as the same owned UUID", async () => {
  const f = fixture();
  const first = await f.service.createRide(OWNER, f.command, "same-command");
  const next = await f.service.createRide(
    OWNER,
    { ...f.command },
    "same-command",
  );
  expect(next.ride.order.orderId).toBe(first.ride.order.orderId);
  expect(f.published).toHaveLength(1);
});

it("a committed original command can be recovered after its quote expires", async () => {
  const f = fixture();
  const first = await f.service.createRide(
    OWNER,
    f.command,
    "expired-original",
  );
  f.snapshot.expiresAt = new Date(NOW - 1).toISOString();
  const next = await f.service.createRide(OWNER, f.command, "expired-original");
  expect(next.ride.order.orderId).toBe(first.ride.order.orderId);
  await expect(
    f.service.createRide(OWNER, f.command, "new-expired-command"),
  ).rejects.toMatchObject({ code: "FARE_QUOTE_EXPIRED" });
  expect(f.published).toHaveLength(1);
});

it("a reused key with a changed body is 409 without another order", async () => {
  const f = fixture();
  await f.service.createRide(OWNER, f.command, "immutable-body");
  await expect(
    f.service.createRide(
      OWNER,
      {
        ...f.command,
        origin: { ...f.command.origin, address: "changed address" },
      },
      "immutable-body",
    ),
  ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_KEY_REUSED" });
  expect(f.published).toHaveLength(1);
});

it("a lost database COMMIT acknowledgement recovers the atomically owned original", async () => {
  const faults: Parameters<typeof createProductionBookingFixture>[0] = [
    "lost_commit_reply",
  ];
  const f = fixture(faults);
  await expect(
    f.service.createRide(OWNER, f.command, "lost-commit"),
  ).rejects.toThrow("lost commit reply");
  const original = f.state.order!.orderId;
  expect(f.state.history?.[0]).toBe(OWNER);
  expect(f.receipts().size).toBe(1);
  faults.length = 0;
  expect(
    (await f.service.createRide(OWNER, f.command, "lost-commit")).ride.order
      .orderId,
  ).toBe(original);
  expect(f.state.order!.orderId).toBe(original);
});

it("a pre-commit failure rolls the command receipt back and allows a genuine retry", async () => {
  const faults: Parameters<typeof createProductionBookingFixture>[0] = [
    "history",
  ];
  const f = fixture(faults);
  await expect(
    f.service.createRide(OWNER, f.command, "failed-history"),
  ).rejects.toMatchObject({ code: "PASSENGER_BOOKING_HISTORY_FAILED" });
  expect(f.receipts().size).toBe(0);
  faults.length = 0;
  const recovered = await f.service.createRide(
    OWNER,
    f.command,
    "failed-history",
  );
  expect(recovered.ride.order.orderId).toBe(f.state.order!.orderId);
  expect(f.receipts().size).toBe(1);
});

it("the transaction replay fence discards a racing prepared order and its temporary grant", async () => {
  const f = fixture();
  const first = await f.service.createRide(OWNER, f.command, "racing-command");
  f.hideNextLookup();
  const replay = await f.service.createRide(OWNER, f.command, "racing-command");
  expect(replay.ride.order.orderId).toBe(first.ride.order.orderId);
  expect(f.owned.listOrders()).toHaveLength(1);
  expect(f.published).toHaveLength(1);
  expect(
    (f.multi as unknown as { accessTokensByDigest: Map<string, unknown> })
      .accessTokensByDigest.size,
  ).toBe(1);
});

it("an identical key and body in another account's SQL scope cannot reveal the original booking", async () => {
  const f = fixture();
  await f.service.createRide(OWNER, f.command, "account-bound-key");
  expect(
    await f.bookingRepository.findCompletedBooking("different-account", {
      key: "account-bound-key",
      payloadHash: computePayloadHash(f.command),
    }),
  ).toBeNull();
  expect(f.published).toHaveLength(1);
});
