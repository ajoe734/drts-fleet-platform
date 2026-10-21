import { describe, expect, it, vi } from "vitest";

import {
  Evidence,
  JourneyFailure,
} from "../../e2e/owned-referral-business-journey/protocol";
import {
  RETAINED_REFERRAL_ORDER,
  recoverRetainedReferralOrder,
} from "../../e2e/owned-referral-business-journey/retained-order-recovery";

const retained = RETAINED_REFERRAL_ORDER;
const passengerId = "synthetic-original-passenger";
const inactive = { active: false, trip: null };

function fixture() {
  let order: Record<string, unknown> = {
    orderId: retained.orderId,
    partnerEntrySlug: retained.entrySlug,
    passenger: { passengerId },
    status: "created",
    reservationHoldStatus: "requested",
  };
  let history: unknown = {
    orderId: retained.orderId,
    quote: { quoteId: retained.quoteId },
  };
  let active: unknown = inactive;
  const evidence = new Evidence();
  const callbacks = {
    passengerId,
    readHistory: vi.fn(async (): Promise<unknown> => history),
    readActive: vi.fn(async (): Promise<unknown> => active),
    readOwn: vi.fn(async (): Promise<unknown> => order),
    cancel: vi.fn(async (): Promise<unknown> => {
      order = { ...order, status: "cancelled" };
      return { orderId: retained.orderId, status: "cancelled" };
    }),
    dispatch: vi.fn(async (): Promise<unknown> => {
      order = {
        ...order,
        status: "exception_hold",
        reservationHoldStatus: "exception_hold",
      };
      return { orderId: retained.orderId };
    }),
    resolve: vi.fn(async (): Promise<unknown> => {
      order = { ...order, status: "cancelled" };
      return { orderId: retained.orderId, status: "cancelled" };
    }),
    claim: vi.fn<(orderId: string) => void>(),
    evidence,
  };
  return {
    callbacks,
    setOrder: (patch: Record<string, unknown>) => {
      order = { ...order, ...patch };
    },
    setHistory: (value: unknown) => {
      history = value;
    },
    setActive: (value: unknown) => {
      active = value;
    },
  };
}

function noCommands(f: ReturnType<typeof fixture>) {
  expect(f.callbacks.cancel).not.toHaveBeenCalled();
  expect(f.callbacks.dispatch).not.toHaveBeenCalled();
  expect(f.callbacks.resolve).not.toHaveBeenCalled();
}

describe("retained original Referral order recovery", () => {
  it.each([
    "history order",
    "history quote",
    "canonical order",
    "canonical entry",
    "canonical passenger",
    "foreign active",
  ])("rejects a foreign %s before claim or commands", async (mismatch) => {
    const f = fixture();
    if (mismatch === "history order")
      f.setHistory({
        orderId: "foreign",
        quote: { quoteId: retained.quoteId },
      });
    if (mismatch === "history quote")
      f.setHistory({
        orderId: retained.orderId,
        quote: { quoteId: "foreign" },
      });
    if (mismatch === "canonical order") f.setOrder({ orderId: "foreign" });
    if (mismatch === "canonical entry")
      f.setOrder({ partnerEntrySlug: "foreign" });
    if (mismatch === "canonical passenger")
      f.setOrder({ passenger: { passengerId: "foreign" } });
    if (mismatch === "foreign active")
      f.setActive({ active: true, trip: { orderId: "foreign" } });

    await expect(
      recoverRetainedReferralOrder(f.callbacks),
    ).rejects.toBeInstanceOf(JourneyFailure);
    noCommands(f);
    expect(f.callbacks.claim).not.toHaveBeenCalled();
  });

  it.each(["cancelled", "completed"])(
    "reads back an already %s original without mutation",
    async (status) => {
      const f = fixture();
      f.setOrder({ status });
      await expect(recoverRetainedReferralOrder(f.callbacks)).resolves.toEqual({
        orderId: retained.orderId,
        status,
      });
      noCommands(f);
      expect(f.callbacks.claim).toHaveBeenCalledExactlyOnceWith(
        retained.orderId,
      );
      expect(f.callbacks.readOwn).toHaveBeenCalledTimes(2);
      expect(f.callbacks.readActive).toHaveBeenCalledTimes(2);
    },
  );

  it("allows the retained order active, then verifies normal cancellation", async () => {
    const f = fixture();
    f.callbacks.readActive
      .mockResolvedValueOnce({
        active: true,
        trip: { orderId: retained.orderId },
      })
      .mockResolvedValueOnce(inactive);
    await expect(recoverRetainedReferralOrder(f.callbacks)).resolves.toEqual({
      orderId: retained.orderId,
      status: "cancelled",
    });
    expect(f.callbacks.cancel).toHaveBeenCalledOnce();
    expect(f.callbacks.dispatch).not.toHaveBeenCalled();
    expect(f.callbacks.resolve).not.toHaveBeenCalled();
    expect(f.callbacks.claim).toHaveBeenCalledExactlyOnceWith(retained.orderId);
  });

  it("dispatches only after the actual typed cancellation denial and resolves a read-back double hold", async () => {
    const f = fixture();
    f.callbacks.cancel.mockRejectedValueOnce(
      new JourneyFailure("synthetic-cancel", 409, "ORDER_NOT_CANCELABLE"),
    );
    await expect(recoverRetainedReferralOrder(f.callbacks)).resolves.toEqual({
      orderId: retained.orderId,
      status: "cancelled",
    });
    expect(f.callbacks.cancel).toHaveBeenCalledOnce();
    expect(f.callbacks.dispatch).toHaveBeenCalledOnce();
    expect(f.callbacks.resolve).toHaveBeenCalledOnce();
    expect(f.callbacks.readOwn).toHaveBeenCalledTimes(3);
    expect(f.callbacks.evidence.events).toContainEqual({
      stage: "retained-order-recovery:normal-cancel-denied",
      status: 409,
      orderId: retained.orderId,
      quoteId: retained.quoteId,
      sha256: retained.bodySha256,
      result: "observed",
    });
  });

  it("resolves an original genuine double hold without another dispatch", async () => {
    const f = fixture();
    f.setOrder({
      status: "exception_hold",
      reservationHoldStatus: "exception_hold",
    });
    await expect(recoverRetainedReferralOrder(f.callbacks)).resolves.toEqual({
      orderId: retained.orderId,
      status: "cancelled",
    });
    expect(f.callbacks.cancel).not.toHaveBeenCalled();
    expect(f.callbacks.dispatch).not.toHaveBeenCalled();
    expect(f.callbacks.resolve).toHaveBeenCalledOnce();
  });

  it.each([
    new JourneyFailure("synthetic-cancel", 403, "ORDER_NOT_CANCELABLE"),
    new JourneyFailure("synthetic-cancel", 409, "CONFLICT"),
    Object.assign(new Error("synthetic-native-denial"), {
      status: 409,
      code: "ORDER_NOT_CANCELABLE",
    }),
  ])(
    "preserves every other cancellation error without dispatch",
    async (error) => {
      const f = fixture();
      f.callbacks.cancel.mockRejectedValueOnce(error);
      await expect(recoverRetainedReferralOrder(f.callbacks)).rejects.toBe(
        error,
      );
      expect(f.callbacks.cancel).toHaveBeenCalledOnce();
      expect(f.callbacks.dispatch).not.toHaveBeenCalled();
      expect(f.callbacks.resolve).not.toHaveBeenCalled();
    },
  );

  it.each([
    { status: "exception_hold", reservationHoldStatus: "requested" },
    { status: "created", reservationHoldStatus: "exception_hold" },
    { status: "assigned", reservationHoldStatus: "assigned" },
  ])("does not resolve a false post-dispatch hold %j", async (state) => {
    const f = fixture();
    f.callbacks.cancel.mockRejectedValueOnce(
      new JourneyFailure("synthetic-cancel", 409, "ORDER_NOT_CANCELABLE"),
    );
    f.callbacks.dispatch.mockImplementationOnce(async () => {
      f.setOrder(state);
      return { orderId: retained.orderId };
    });
    await expect(recoverRetainedReferralOrder(f.callbacks)).rejects.toThrow(
      "dispatch-without-double-hold-preserved",
    );
    expect(f.callbacks.dispatch).toHaveBeenCalledOnce();
    expect(f.callbacks.resolve).not.toHaveBeenCalled();
  });

  it.each(["assigned", "enroute", "arrived", "on_trip"])(
    "preserves a pre-existing %s order without cancellation, dispatch or resolve",
    async (status) => {
      const f = fixture();
      f.setOrder({ status });
      await expect(recoverRetainedReferralOrder(f.callbacks)).rejects.toThrow(
        "unsupported-state-preserved",
      );
      noCommands(f);
    },
  );

  it("does not resolve an original status-only hold", async () => {
    const f = fixture();
    f.setOrder({ status: "exception_hold" });
    await expect(recoverRetainedReferralOrder(f.callbacks)).rejects.toThrow(
      "unsupported-state-preserved",
    );
    noCommands(f);
  });

  it("revalidates canonical ownership after dispatch before resolving", async () => {
    const f = fixture();
    f.callbacks.cancel.mockRejectedValueOnce(
      new JourneyFailure("synthetic-cancel", 409, "ORDER_NOT_CANCELABLE"),
    );
    f.callbacks.dispatch.mockImplementationOnce(async () => {
      f.setOrder({
        passenger: { passengerId: "foreign" },
        status: "exception_hold",
        reservationHoldStatus: "exception_hold",
      });
      return {};
    });
    await expect(recoverRetainedReferralOrder(f.callbacks)).rejects.toThrow(
      "canonical-owner-mismatch",
    );
    expect(f.callbacks.resolve).not.toHaveBeenCalled();
  });

  it("does not treat a cancellation ACK alone as terminal readback", async () => {
    const f = fixture();
    f.callbacks.cancel.mockResolvedValueOnce({ status: "cancelled" });
    await expect(recoverRetainedReferralOrder(f.callbacks)).rejects.toThrow(
      "terminal-readback-required",
    );
    expect(f.callbacks.dispatch).not.toHaveBeenCalled();
    expect(f.callbacks.resolve).not.toHaveBeenCalled();
  });

  it("rejects terminal readback while the retained own order remains active", async () => {
    const f = fixture();
    f.callbacks.readActive
      .mockResolvedValueOnce(inactive)
      .mockResolvedValueOnce({
        active: true,
        trip: { orderId: retained.orderId },
      });
    await expect(recoverRetainedReferralOrder(f.callbacks)).rejects.toThrow(
      "own-still-active",
    );
  });

  it("preserves a later foreign active order without acting on it", async () => {
    const f = fixture();
    f.setOrder({ status: "cancelled" });
    f.callbacks.readActive
      .mockResolvedValueOnce(inactive)
      .mockResolvedValueOnce({
        active: true,
        trip: { orderId: "later-foreign" },
      });
    await expect(recoverRetainedReferralOrder(f.callbacks)).resolves.toEqual({
      orderId: retained.orderId,
      status: "cancelled",
    });
    noCommands(f);
    expect(f.callbacks.claim).toHaveBeenCalledExactlyOnceWith(retained.orderId);
    expect(JSON.stringify(f.callbacks.evidence.events)).not.toContain(
      "later-foreign",
    );
  });
});
