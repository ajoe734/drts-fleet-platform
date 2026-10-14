import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProductionBookingFixture,
  NOW,
  OWNER,
  PAYMENT_METHOD_ID,
} from "../pax-booking-history-20261009/production-booking-fixture";
import { PassengerBookingRepository } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.repository";
import type { DatabaseService } from "../../../apps/api/src/common/db/database.service";

const HistoricalRepository = process.env.PAX_PAYMENT_BOOKING_SOURCE
  ? (await import(process.env.PAX_PAYMENT_BOOKING_SOURCE))
      .PassengerBookingRepository
  : PassengerBookingRepository;

describe("actual booking payment transaction boundary", () => {
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

  it.each([undefined, "", "payment-unit", "not-a-card", 123])(
    "refuses malformed or missing method %j before persistence",
    async (value) => {
      const f = createProductionBookingFixture();
      await expect(
        f.service.createRide(OWNER, {
          ...f.command,
          paymentMethodId: value,
        } as never),
      ).rejects.toMatchObject({ code: "invalid_method" });
      expect(f.calls).toEqual([]);
      expect(f.published).toEqual([]);
    },
  );

  it.each(["foreign", "expired", "removed"])(
    "refuses the database's nonmatching %s method inside the creation transaction",
    async (reason) => {
      const f = createProductionBookingFixture();
      // PG owns expiry/status matching; an empty SQL response is that external
      // boundary, not a fake implementation of PostgreSQL date semantics.
      f.paymentPrerequisites.activeMethodRows = [];
      const id =
        reason === "foreign"
          ? "44444444-4444-4444-8444-444444444444"
          : PAYMENT_METHOD_ID;
      await expect(
        f.service.createRide(OWNER, { ...f.command, paymentMethodId: id }),
      ).rejects.toMatchObject({ code: "not_found" });
      const lookup = f.calls.find((c) =>
        c.sql.includes("FROM passenger.psp_tokens"),
      );
      expect(lookup?.values).toEqual([id, OWNER, false]);
      expect(lookup?.transactional).toBe(true);
      expect(lookup?.sql).toContain("status='active'");
      expect(lookup?.sql).toContain("EXTRACT(MONTH FROM now())");
      expect(lookup?.sql).toContain("FOR UPDATE");
      expect(f.calls.some((c) => c.sql.startsWith("INSERT"))).toBe(false);
      expect(f.state).toEqual({ order: null, token: null, history: null });
      expect(f.release).toEqual([true]);
    },
  );

  it("rechecks account status inside the creation transaction", async () => {
    const f = createProductionBookingFixture();
    f.account.status = "deleted";
    await expect(f.service.createRide(OWNER, f.command)).rejects.toMatchObject({
      code: "PASSENGER_ACCOUNT_NOT_FOUND",
    });
    expect(f.calls.some((c) => c.sql.startsWith("INSERT"))).toBe(false);
    expect(f.release).toEqual([true]);
  });

  it("refuses an unpaid ride before writing or publishing another ride", async () => {
    const f = createProductionBookingFixture();
    f.paymentPrerequisites.unpaidRows = [{ unpaid: 1 }];
    await expect(f.service.createRide(OWNER, f.command)).rejects.toMatchObject({
      code: "pending_payment_block",
    });
    expect(f.calls.some((c) => c.sql.startsWith("INSERT"))).toBe(false);
    expect(f.published).toEqual([]);
    expect(f.owned.listOrders()).toEqual([]);
    expect(f.release).toEqual([true]);
  });

  it("persists the canonical selected method under the authorized precreate locks", async () => {
    const f = createProductionBookingFixture();
    await f.service.createRide(OWNER, f.command);
    expect(f.state.order?.paymentMethodTokenRef).toBe(PAYMENT_METHOD_ID);
    expect(
      f.calls
        .filter((c) => c.sql.includes("FOR UPDATE"))
        .every((c) => c.transactional),
    ).toBe(true);
    expect(f.published).toHaveLength(1);
  });

  it("minimal selected repository probe refuses debt before its real persist callback", async () => {
    const client = {
      query: vi.fn(async (sql: string) => ({
        rows: sql.includes("FROM passenger.accounts")
          ? [{ status: "active" }]
          : sql.includes("FROM passenger.booking_histories h")
            ? [{ unpaid: 1 }]
            : [],
      })),
      release: vi.fn(),
    };
    const repository = new HistoricalRepository({
      connect: async () => client,
    } as unknown as DatabaseService);
    const persist = vi.fn(async () => {});
    const args = [
      OWNER,
      "55555555-5555-4555-8555-555555555555",
      "22222222-2222-4222-8222-222222222222",
      new Date(NOW).toISOString(),
    ];
    // Historical caller signature differs; invoke its actual supported API,
    // rather than manufacturing a callback type/setup failure as a finding.
    const committing = process.env.PAX_PAYMENT_BOOKING_SOURCE
      ? repository.commitBooking(...args, persist)
      : repository.commitBooking(...args, PAYMENT_METHOD_ID, persist);
    await expect(committing).rejects.toMatchObject({
      code: "pending_payment_block",
    });
    expect(persist).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledWith(true);
  });
});
