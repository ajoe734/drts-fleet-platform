import { randomUUID } from "node:crypto";
import { firstValueFrom } from "../../../apps/api/node_modules/rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnedOrderRecord } from "@drts/contracts";
import { PassengerBookingService } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.service";
import { PassengerBookingSettingsController } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking-settings.controller";
import {
  createProductionBookingFixture,
  NOW,
  OWNER,
  QUOTE_ID,
} from "./production-booking-fixture";

const identity = { realm: "passenger", drtsPassengerId: OWNER } as never;
const otherIdentity = {
  realm: "passenger",
  drtsPassengerId: "pax-other",
} as never;
type Fixture = ReturnType<typeof createProductionBookingFixture>;

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
  vi.restoreAllMocks();
});

describe("pax-booking_trusted_create_and_ownership: production validation", () => {
  it.each(["foreign", "unknown"])(
    "uses the owner-filtered production fare repository for a %s quote",
    async () => {
      const f = createProductionBookingFixture();
      const service = new PassengerBookingService(
        f.bookingRepository,
        f.multi,
        f.fareRepository,
        f.accountRepository as never,
      );
      await expect(service.createRide(OWNER, f.command)).rejects.toMatchObject({
        code: "FARE_QUOTE_NOT_FOUND",
      });
      const lookup = f.calls.find((c) =>
        c.sql.includes("FROM passenger.fare_quote_snapshots"),
      )!;
      expect(lookup.sql).toContain(
        "fare_snapshot_id = $1 AND drts_passenger_id = $2",
      );
      expect(lookup.values).toEqual([QUOTE_ID, OWNER]);
      expect(f.published).toEqual([]);
      expect(f.calls.some((c) => c.sql.startsWith("INSERT"))).toBe(false);
    },
  );

  it.each([
    [
      "expired",
      "FARE_QUOTE_EXPIRED",
      (f: Fixture) => {
        f.snapshot.expiresAt = new Date(NOW - 1).toISOString();
      },
    ],
    [
      "expiry boundary",
      "FARE_QUOTE_EXPIRED",
      (f: Fixture) => {
        f.snapshot.expiresAt = new Date(NOW).toISOString();
      },
    ],
    [
      "invalid expiry",
      "FARE_QUOTE_EXPIRED",
      (f: Fixture) => {
        f.snapshot.expiresAt = "invalid";
      },
    ],
    [
      "missing confirmation",
      "PASSENGER_NOT_CONFIRMED",
      (f: Fixture) => {
        f.command.passengerConfirmedAt = "";
      },
    ],
    [
      "invalid confirmation",
      "PASSENGER_NOT_CONFIRMED",
      (f: Fixture) => {
        f.command.passengerConfirmedAt = "invalid";
      },
    ],
    [
      "future confirmation",
      "PASSENGER_NOT_CONFIRMED",
      (f: Fixture) => {
        f.command.passengerConfirmedAt = new Date(NOW + 1).toISOString();
      },
    ],
    [
      "array confirmation",
      "PASSENGER_NOT_CONFIRMED",
      (f: Fixture) => {
        f.command.passengerConfirmedAt = [
          f.command.passengerConfirmedAt,
        ] as never;
      },
    ],
    [
      "on-demand quote",
      "FARE_QUOTE_NOT_SCHEDULED",
      (f: Fixture) => {
        f.snapshot.scheduledAt = "";
      },
    ],
    [
      "missing schedule",
      "FARE_QUOTE_MISMATCH",
      (f: Fixture) => {
        f.command.scheduledAt = "";
      },
    ],
    [
      "schedule mismatch",
      "FARE_QUOTE_MISMATCH",
      (f: Fixture) => {
        f.command.scheduledAt = new Date(NOW + 3600000).toISOString();
      },
    ],
    [
      "route mismatch",
      "FARE_QUOTE_MISMATCH",
      (f: Fixture) => {
        f.command.origin = { ...f.command.origin, lat: 0 };
      },
    ],
  ] as const)(
    "rejects %s without dispatch or storage",
    async (_name, code, mutate) => {
      const f = createProductionBookingFixture();
      mutate(f);
      await expect(
        f.service.createRide(OWNER, f.command),
      ).rejects.toMatchObject({ code });
      expect(f.calls.some((c) => c.sql.startsWith("INSERT"))).toBe(false);
      expect(f.owned.listOrders()).toEqual([]);
      expect(f.published).toEqual([]);
    },
  );

  it("rejects an absent account before reading quotes", async () => {
    const f = createProductionBookingFixture();
    vi.spyOn(f.accountRepository, "transaction").mockResolvedValue(null);
    await expect(f.service.createRide(OWNER, f.command)).rejects.toMatchObject({
      code: "PASSENGER_ACCOUNT_NOT_FOUND",
    });
    expect(f.calls).toEqual([]);
  });

  it("enforces the same configured lead time that public settings report", async () => {
    vi.stubEnv("SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES", "30");
    const f = createProductionBookingFixture([], 20);
    const settings = new PassengerBookingSettingsController(
      f.service,
    ).getSettings("settings-request");
    expect(settings.data).toEqual({
      minLeadTimeMinutes: 30,
      requireSmsVerification: false,
    });
    expect(settings.meta.requestId).toBe("settings-request");
    await expect(f.service.createRide(OWNER, f.command)).rejects.toMatchObject({
      code: "TOO_SOON_TO_BOOK",
    });
    expect(f.calls).toEqual([]);
    const allowed = createProductionBookingFixture([], 30);
    expect(
      (await allowed.service.createRide(OWNER, allowed.command)).ride.order
        .timingMode,
    ).toBe("scheduled");
  });

  it.each(["", "invalid", "-1", "Infinity"])(
    "reports and enforces default lead time when configuration is %s",
    (value) => {
      vi.stubEnv("SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES", value);
      const f = createProductionBookingFixture();
      expect(f.service.getBookingSettings().minLeadTimeMinutes).toBe(15);
    },
  );

  it("supports the legacy lead-time configuration used by token callers", () => {
    vi.stubEnv("SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES", undefined);
    vi.stubEnv("MULTI_TAXI_MIN_LEAD_TIME_MINUTES", "45");
    expect(
      createProductionBookingFixture().service.getBookingSettings()
        .minLeadTimeMinutes,
    ).toBe(45);
  });

  it.each([false, true])(
    "SMS requirement=%s uses server contact verification",
    async (requireSms) => {
      vi.stubEnv("REQUIRE_SMS_VERIFICATION", String(requireSms));
      const f = createProductionBookingFixture();
      f.account.verifiedPhone = "0999999999";
      expect(f.service.getBookingSettings().requireSmsVerification).toBe(
        requireSms,
      );
      if (requireSms) {
        await expect(
          f.service.createRide(OWNER, f.command),
        ).rejects.toMatchObject({ code: "PASSENGER_PHONE_REQUIRED" });
        expect(f.calls).toEqual([]);
        f.account.contactPhoneVerified = true;
      }
      await f.service.createRide(OWNER, f.command);
      expect(f.state.order?.passenger.phone).toBe(f.account.contactPhone);
    },
  );

  it("permits a verified-phone fallback only while SMS verification is disabled", async () => {
    const f = createProductionBookingFixture();
    f.account.contactPhone = "";
    f.account.verifiedPhone = "0911000000";
    await f.service.createRide(OWNER, f.command);
    expect(f.state.order?.passenger.phone).toBe("0911000000");
    const missing = createProductionBookingFixture();
    missing.account.contactPhone = "";
    await expect(
      missing.service.createRide(OWNER, missing.command),
    ).rejects.toMatchObject({ code: "PASSENGER_PHONE_REQUIRED" });
    expect(missing.calls).toEqual([]);
  });
});

function actions(f: Fixture, actor: typeof identity, orderId: string) {
  return {
    detail: () => f.controller.getRide(actor, orderId),
    events: () => firstValueFrom(f.controller.getRideEvents(actor, orderId)),
    cancel: () => f.controller.cancelRide(actor, orderId, "cancel-request"),
    rating: () =>
      f.controller.rateRide(actor, orderId, { rideId: orderId, rating: 5 }),
    receipt: () => f.controller.getReceipt(actor, orderId),
  };
}

describe("pax-booking_history_and_ride_actions: production ownership", () => {
  it.each(["foreign", "unknown", "malformed"])(
    "returns identical 404 across every action for %s ownership",
    async (scenario) => {
      const f = createProductionBookingFixture();
      const created = await f.service.createRide(OWNER, f.command);
      const id =
        scenario === "foreign"
          ? created.ride.order.orderId
          : scenario === "unknown"
            ? randomUUID()
            : "not-a-uuid";
      const actor = scenario === "foreign" ? otherIdentity : identity;
      const authority = vi.spyOn(f.multi, "getPassengerRideById");
      const stream = vi.spyOn(f.multi, "streamTrustedPassengerEvents");
      const cancel = vi.spyOn(f.multi, "cancelTrustedPassengerRide");
      const rating = vi.spyOn(f.multi, "submitTrustedPassengerRating");
      const receipt = vi.spyOn(f.multi, "getTrustedPassengerReceipt");
      const before = f.calls.length;
      for (const action of Object.values(actions(f, actor, id))) {
        await expect(action()).rejects.toMatchObject({
          code: "PASSENGER_RIDE_NOT_FOUND",
          status: 404,
        });
      }
      for (const spy of [authority, stream, cancel, rating, receipt])
        expect(spy).not.toHaveBeenCalled();
      expect(f.state.order?.status).toBe("ready_for_dispatch");
      if (scenario === "malformed") expect(f.calls.length).toBe(before);
    },
  );

  it("returns the authority view, emits live updates, cancels and preserves the token link", async () => {
    const f = createProductionBookingFixture();
    const creation = vi.spyOn(f.multi, "createTrustedPassengerRide");
    const created = await f.controller.createRide(
      identity,
      "create-request",
      f.command,
    );
    const id = created.data.ride.order.orderId;
    expect(created.meta.requestId).toBe("create-request");
    expect((await f.controller.getRide(identity, id)).data.ride).toEqual(
      created.data.ride,
    );
    const token = (await creation.mock.results[0]!.value).passengerAccess
      .accessToken;
    expect((await f.multi.getPassengerRide(token)).order.orderId).toBe(id);
    const cancelled = await f.controller.cancelRide(
      identity,
      id,
      "cancel-request",
    );
    expect(cancelled.data).toEqual({ success: true });
    expect(f.state.order?.status).toBe("cancelled");
    expect((await f.multi.getPassengerRide(token)).order.status).toBe(
      "cancelled",
    );
    const eventPromise = firstValueFrom(
      f.controller.getRideEvents(identity, id),
    );
    await vi.advanceTimersByTimeAsync(0);
    const event = await eventPromise;
    expect(event.data).toMatchObject({
      eventType: "trip_cancelled",
      orderId: id,
      data: { order: { status: "cancelled" } },
    });
  });

  it("maps the public rating command after ownership and keeps receipt errors", async () => {
    const f = createProductionBookingFixture();
    const created = await f.service.createRide(OWNER, f.command);
    const id = created.ride.order.orderId;
    const rate = vi
      .spyOn(f.multi, "submitTrustedPassengerRating")
      .mockResolvedValue({} as never);
    const response = await f.controller.rateRide(identity, id, {
      rideId: "body-id-is-ignored",
      rating: 4,
      tags: ["clean"],
      comments: "Good",
    });
    expect(response.data).toEqual({ success: true });
    expect(rate).toHaveBeenCalledWith(
      id,
      { score: 4, tags: ["clean"], comment: "Good" },
      OWNER,
    );
    await expect(f.controller.getReceipt(identity, id)).rejects.toMatchObject({
      code: "PASSENGER_RECEIPT_NOT_READY",
    });
    // Delegation-only fixture: the separate multi-taxi authority suite tests persistence and rating rules.
    vi.spyOn(f.multi, "getTrustedPassengerReceipt").mockResolvedValue({
      record: { htmlUrl: "https://receipt.test/receipt" },
    } as never);
    expect((await f.controller.getReceipt(identity, id)).data).toEqual({
      receiptUrl: "https://receipt.test/receipt",
    });
    rate.mockClear();
    await expect(
      f.controller.rateRide(identity, id, { rideId: id, rating: 0 as never }),
    ).rejects.toMatchObject({ code: "PASSENGER_RATING_SCORE_INVALID" });
    expect(rate).not.toHaveBeenCalled();
  });
});

describe("R5/R6: production repository pagination and active traversal", () => {
  it.each([0, -1, 101, "1x", "1.5", "", ["1"]])(
    "rejects invalid limit %j before accessing history",
    async (limit) => {
      const f = createProductionBookingFixture();
      await expect(
        f.controller.listRides(identity, limit as never),
      ).rejects.toMatchObject({ code: "INVALID_PAGINATION" });
      expect(f.calls).toEqual([]);
    },
  );

  it.each([
    { createdAt: ["2026-10-10T13:00:00Z"], orderId: randomUUID() },
    { createdAt: "2026-10-10T13:00:00Z", orderId: [randomUUID()] },
    { createdAt: 123, orderId: randomUUID() },
    { createdAt: "bad", orderId: randomUUID() },
    { createdAt: "2026-10-10T13:00:00Z", orderId: "bad" },
    null,
  ])("rejects invalid cursor %j before SQL", async (value) => {
    const f = createProductionBookingFixture();
    const cursor = Buffer.from(JSON.stringify(value)).toString("base64");
    await expect(
      f.controller.listRides(identity, "10", cursor),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    expect(f.calls).toEqual([]);
  });

  it("consumes a microsecond cursor and preserves the UUID tie-break parameter", async () => {
    const f = createProductionBookingFixture();
    await f.service.createRide(OWNER, f.command);
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    (f.owned as unknown as { orders: OwnedOrderRecord[] }).orders = ids.map(
      (orderId) => ({
        ...structuredClone(f.state.order!),
        orderId,
        status: "completed",
      }),
    );
    const timestamp = "2026-10-10 13:00:00.123456+00";
    const batches = [
      [
        { order_id: ids[0], created_at_str: timestamp },
        { order_id: ids[1], created_at_str: timestamp },
      ],
      [{ order_id: ids[2], created_at_str: "2026-10-10 12:00:00.000001+00" }],
    ];
    const base = f.database.query.bind(f.database);
    const queries: { sql: string; values: readonly unknown[] }[] = [];
    vi.spyOn(f.database, "query").mockImplementation(
      async (sql, values = []) => {
        if (sql.includes("SELECT order_id, created_at")) {
          queries.push({ sql, values });
          return { rows: batches.shift() ?? [], rowCount: 1 } as never;
        }
        return base(sql, values);
      },
    );
    const first = (await f.controller.listRides(identity, "2")).data;
    expect(first.rides.map((r) => r.order.orderId)).toEqual(ids.slice(0, 2));
    const second = (
      await f.controller.listRides(identity, "2", first.nextCursor)
    ).data;
    expect(second.rides.map((r) => r.order.orderId)).toEqual(ids.slice(2));
    expect(second.nextCursor).toBeUndefined();
    expect(queries[0]!.values).toEqual([OWNER, 2]);
    expect(queries[1]!.values).toEqual([OWNER, 2, timestamp, ids[1]]);
    expect(queries[1]!.sql).toContain("WHERE drts_passenger_id = $1");
    expect(queries[1]!.sql).toContain(
      "created_at = $3::timestamptz AND order_id < $4",
    );
    expect(queries[1]!.sql).toContain(
      "ORDER BY created_at DESC, order_id DESC",
    );
  });

  it.each(["active-endpoint", "active-filter"])(
    "finds an active ride after the 50th completed record through %s",
    async (entry) => {
      const f = createProductionBookingFixture();
      await f.service.createRide(OWNER, f.command);
      const ids = Array.from({ length: 51 }, () => randomUUID());
      (f.owned as unknown as { orders: OwnedOrderRecord[] }).orders = ids.map(
        (orderId, index) => ({
          ...structuredClone(f.state.order!),
          orderId,
          status: index === 50 ? "on_trip" : "completed",
        }),
      );
      const batches = [
        ids.slice(0, 50).map((order_id) => ({
          order_id,
          created_at_str: "2026-10-10 13:00:00.123456+00",
        })),
        [
          {
            order_id: ids[50],
            created_at_str: "2026-10-10 12:00:00.000001+00",
          },
        ],
      ];
      const base = f.database.query.bind(f.database);
      vi.spyOn(f.database, "query").mockImplementation(
        async (sql, values = []) =>
          sql.includes("SELECT order_id, created_at")
            ? ({ rows: batches.shift() ?? [], rowCount: 1 } as never)
            : base(sql, values),
      );
      const response =
        entry === "active-endpoint"
          ? await f.controller.getActiveRides(identity)
          : await f.controller.listRides(identity, "10", undefined, "active");
      expect(response.data.rides.map((r) => r.order.orderId)).toEqual([
        ids[50],
      ]);
      expect(batches).toEqual([]);
    },
  );

  it.each(["list", "active"])(
    "propagates authority storage errors from %s instead of hiding rides",
    async (entry) => {
      const f = createProductionBookingFixture();
      await f.service.createRide(OWNER, f.command);
      const base = f.database.query.bind(f.database);
      vi.spyOn(f.database, "query").mockImplementation(
        async (sql, values = []) => {
          if (sql.includes("SELECT order_id, created_at"))
            return {
              rows: [
                {
                  order_id: f.state.order!.orderId,
                  created_at_str: new Date(NOW).toISOString(),
                },
              ],
              rowCount: 1,
            } as never;
          if (sql.includes("FROM billing.multi_taxi_passenger_payments"))
            throw new Error("authority storage unavailable");
          return base(sql, values);
        },
      );
      const reading =
        entry === "list"
          ? f.controller.listRides(identity)
          : f.controller.getActiveRides(identity);
      await expect(reading).rejects.toThrow("authority storage unavailable");
    },
  );
});
