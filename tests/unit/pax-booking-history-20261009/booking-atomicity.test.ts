import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProductionBookingFixture,
  NOW,
  OWNER,
  type Fault,
} from "./production-booking-fixture";

describe("R2: production booking and repositories commit before dispatch", () => {
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

  it.each([15, 20, 30, 120])(
    "commits order, digest-only access and account history for lead=%i",
    async (lead) => {
      const f = createProductionBookingFixture([], lead);
      const result = await f.service.createRide(OWNER, {
        ...f.command,
        passenger: {
          passengerId: "forged",
          name: "Forged",
          phone: "0999999999",
        },
      } as never);
      expect(result.ride.order.orderId).toBe(f.state.order?.orderId);
      expect(f.state.order?.passenger).toEqual({
        passengerId: OWNER,
        name: "Account Name",
        phone: "0912345678",
      });
      expect(f.state.order?.paymentMethodTokenRef).toBe("payment-unit");
      expect(f.state.order?.pickup.address).toBe("Origin Address");
      expect(f.state.history).toEqual([
        OWNER,
        f.state.order?.orderId,
        f.command.fareSnapshotId,
        f.command.passengerConfirmedAt,
      ]);
      expect(f.state.token?.[3]).toBe(OWNER);
      expect(f.state.token?.[1]).toMatch(/^[0-9a-f]{64}$/);
      expect(f.historyObservations).toEqual([
        { memory: 0, published: 0, durable: false },
      ]);
      expect(
        f.calls
          .filter((c) => c.sql.startsWith("INSERT"))
          .every((c) => c.transactional),
      ).toBe(true);
      expect(f.release).toEqual([false]);
      expect(f.published).toHaveLength(1);
      expect(Object.keys(result.ride).sort()).toEqual([
        "actions",
        "assignment",
        "order",
        "payment",
        "rating",
        "receipt",
      ]);
    },
  );

  it.each<Fault[]>([
    ["order"],
    ["token"],
    ["history"],
    ["connect"],
    ["commit"],
    ["history", "cancel_connect"],
    ["history", "cancel_write"],
    ["token", "cancel_connect"],
    ["history", "rollback"],
  ])("keeps failed creation invisible, faults=%j", async (...faults) => {
    const f = createProductionBookingFixture(faults);
    await expect(f.service.createRide(OWNER, f.command)).rejects.toBeDefined();
    expect(f.state).toEqual({ order: null, token: null, history: null });
    expect(f.owned.listOrders()).toEqual([]);
    expect(f.published).toEqual([]);
    expect(
      (f.multi as unknown as { accessTokensByDigest: Map<string, unknown> })
        .accessTokensByDigest.size,
    ).toBe(0);
    expect(f.calls.some((c) => c.sql.includes("FOR UPDATE"))).toBe(false);
    if (!faults.includes("connect")) expect(f.release).toEqual([true]);
  });

  it("a lost COMMIT reply can leave only a fully owned, accessible durable booking", async () => {
    const f = createProductionBookingFixture(["lost_commit_reply"]);
    await expect(f.service.createRide(OWNER, f.command)).rejects.toThrow(
      "lost commit reply",
    );
    expect(f.state.order).not.toBeNull();
    expect(f.state.token).not.toBeNull();
    expect(f.state.history?.[0]).toBe(OWNER);
    expect(f.owned.listOrders()).toEqual([]);
    expect(f.published).toEqual([]);
    expect(f.release).toEqual([true]);
  });

  it("does not expose an order while account history is still pending", async () => {
    const f = createProductionBookingFixture();
    let unblock!: () => void;
    f.holdHistory(
      new Promise((resolve) => {
        unblock = resolve;
      }),
    );
    const creating = f.service.createRide(OWNER, f.command);
    for (let i = 0; i < 30 && f.historyObservations.length === 0; i++)
      await Promise.resolve();
    expect(f.historyObservations).toHaveLength(1);
    expect(f.owned.listOrders()).toEqual([]);
    expect(f.published).toEqual([]);
    expect(f.state.order).toBeNull();
    unblock();
    await creating;
    expect(f.published).toHaveLength(1);
  });

  it.each(["completed", "cancelled"])(
    "compensation preserves terminal %s",
    async (status) => {
      const f = createProductionBookingFixture([], 120);
      const created = await f.service.createRide(OWNER, f.command);
      f.state.order!.status = status as never;
      await expect(
        f.multi.compensateFailedTrustedPassengerRide(
          created.ride.order.orderId,
          "test",
        ),
      ).rejects.toMatchObject({ code: "ORDER_NOT_CANCELABLE" });
      expect(f.state.order?.status).toBe(status);
    },
  );
});
