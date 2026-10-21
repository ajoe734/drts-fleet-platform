import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scenario } from "./fixture";
const T = Date.parse("2026-10-20T06:00:00.000Z");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("BEFORE_CONTROL actual original command keeps its inclusive created boundary", async () => {
  const f = await scenario();
  const row = await f.stored();
  expect(row?.dispatchSemantics).toBe("reservation");
  vi.setSystemTime(T + 120_000);
  expect(() => (f.service as any).assertOrderCancelable(row)).not.toThrow();
  vi.setSystemTime(T + 120_001);
  expect(() => (f.service as any).assertOrderCancelable(row)).toThrow();
});
it("BEFORE_NEW actual immediate producer publishes its real created window", async () => {
  const f = await scenario();
  const before = await f.stored();
  const result = await f.read();
  expect(result.trip?.orderId).toBe(f.orderId);
  expect(result.trip?.cancellationWindow).toEqual({
    canCancel: true,
    cancelableUntil: new Date(T + 120_000).toISOString(),
    asOf: new Date(T).toISOString(),
  });
  expect(await f.stored()).toEqual(before);
});

describe("actual active read and unchanged cancellation command policy", () => {
  it.each([
    [
      "created inclusive grace",
      "created",
      "reservation",
      T - 1_800_000,
      T + 120_000,
      true,
      T + 120_000,
    ],
    [
      "created grace just expired",
      "created",
      "reservation",
      T - 1_800_000,
      T + 120_001,
      false,
      T + 120_000,
    ],
    [
      "accepted immediate reservation",
      "driver_accepted",
      "reservation",
      T - 1_800_000,
      T,
      false,
      T - 1_800_000,
    ],
    [
      "arrived immediate reservation",
      "arrived_pickup",
      "reservation",
      T - 1_800_000,
      T,
      false,
      T - 1_800_000,
    ],
    [
      "on-trip immediate reservation",
      "on_trip",
      "reservation",
      T - 1_800_000,
      T,
      false,
      T - 1_800_000,
    ],
    [
      "future reservation cutoff later than grace",
      "created",
      "reservation",
      T + 3_600_000,
      T,
      true,
      T + 3_600_000,
    ],
    [
      "future accepted exact cutoff",
      "driver_accepted",
      "reservation",
      T + 3_600_000,
      T + 3_600_000,
      true,
      T + 3_600_000,
    ],
    [
      "future accepted after cutoff",
      "driver_accepted",
      "reservation",
      T + 3_600_000,
      T + 3_600_001,
      false,
      T + 3_600_000,
    ],
    [
      "missing reservation cutoff is not invented",
      "created",
      "reservation",
      null,
      T + 360_000,
      true,
      null,
    ],
    [
      "invalid reservation cutoff is not invented",
      "driver_accepted",
      "reservation",
      "invalid-existing-value",
      T,
      true,
      null,
    ],
    [
      "nonreservation created has no finite deadline",
      "created",
      "immediate",
      null,
      T + 360_000,
      true,
      null,
    ],
    [
      "nonreservation accepted has no finite deadline",
      "driver_accepted",
      "immediate",
      null,
      T,
      true,
      null,
    ],
    [
      "nonreservation arrived policy rejects",
      "arrived_pickup",
      "immediate",
      null,
      T,
      false,
      null,
    ],
    [
      "nonreservation on-trip policy rejects",
      "on_trip",
      "immediate",
      null,
      T,
      false,
      null,
    ],
  ] as const)(
    "%s",
    async (_title, status, semantics, cutoff, at, allowed, deadline) => {
      const f = await scenario();
      await f.change({
        status,
        dispatchSemantics: semantics,
        cancelableUntil:
          typeof cutoff === "number" ? new Date(cutoff).toISOString() : cutoff,
      });
      vi.setSystemTime(at);
      const row = await f.stored();
      const snapshot = () =>
        structuredClone([...f.db.tables].filter(([, rows]) => rows.size > 0));
      const before = snapshot();
      const callStart = f.db.calls.length;
      let commandDecision = true;
      try {
        (f.service as any).assertOrderCancelable(row);
      } catch (error) {
        expect((error as any).code).toBe("ORDER_NOT_CANCELABLE");
        commandDecision = false;
      }
      const result = await f.read();
      expect(result.trip?.cancellationWindow).toEqual({
        canCancel: allowed,
        cancelableUntil:
          deadline === null ? null : new Date(deadline).toISOString(),
        asOf: new Date(at).toISOString(),
      });
      expect(result.trip?.cancellationWindow?.canCancel).toBe(commandDecision);
      expect(snapshot()).toEqual(before);
      expect(
        f.db.calls
          .slice(callStart)
          .some((call) => /^(INSERT|UPDATE|DELETE)\b/.test(call.sql)),
      ).toBe(false);
    },
  );
  it("loads current storage instead of an old service cache and returns no window for terminal orders", async () => {
    const f = await scenario();
    await f.read();
    await f.change({ status: "driver_accepted" });
    const fresh = f.newService();
    const result = await fresh.getReferralPassengerActiveTrip(f.identity);
    expect(result.trip?.cancellationWindow?.canCancel).toBe(false);
    await f.change({ status: "cancelled" });
    expect(await fresh.getReferralPassengerActiveTrip(f.identity)).toEqual({
      active: false,
      trip: null,
    });
  });
  it("keeps actual wrong-realm denial and read failures as errors", async () => {
    const f = await scenario();
    await expect(
      f.service.getReferralPassengerActiveTrip({
        ...f.identity,
        realm: "platform",
      }),
    ).rejects.toMatchObject({ code: "REFERRAL_PASSENGER_IDENTITY_REQUIRED" });
    f.db.failSql = /FROM ops\.phase1_owned_orders/;
    await expect(f.read()).rejects.toThrow("controlled storage write failure");
  });
  it("does not hide an unrelated failure from the original policy method", async () => {
    const f = await scenario();
    const error = new Error("controlled unexpected policy error");
    vi.spyOn(f.service as any, "assertOrderCancelable").mockImplementation(
      () => {
        throw error;
      },
    );
    await expect(f.read()).rejects.toBe(error);
  });
});
