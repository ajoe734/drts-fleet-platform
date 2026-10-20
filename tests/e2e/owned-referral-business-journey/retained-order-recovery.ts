import {
  JourneyFailure,
  assertNoForeignActive,
  object,
  requireFact,
  text,
  type Evidence,
  type ObjectData,
} from "./protocol";

export const RETAINED_REFERRAL_ORDER = Object.freeze({
  originalRun: 39388535233,
  orderId: "a117bf7f-2c75-428b-88ef-295933e4ee9d",
  quoteId: "3fc29df0-0d00-493c-acc3-3dd6725a1abd",
  bodySha256:
    "b968fd46291d48270bc134889361a6f15fc35380ae0ae320603fb37711804a0c",
  entrySlug: "yuhe-residence",
});

export type RetainedReferralOrderRecovery = {
  retained?: Readonly<{
    originalRun: number;
    orderId: string;
    quoteId: string;
    bodySha256: string;
    entrySlug: string;
  }>;
  passengerId: string;
  readHistory: () => Promise<unknown>;
  readActive: () => Promise<unknown>;
  readOwn: () => Promise<unknown>;
  cancel: () => Promise<unknown>;
  dispatch: () => Promise<unknown>;
  resolve: () => Promise<unknown>;
  claim: (orderId: string) => void;
  evidence: Evidence;
};

function isTerminal(status: unknown): status is "cancelled" | "completed" {
  return status === "cancelled" || status === "completed";
}

function hasExceptionHold(order: ObjectData) {
  return (
    order.status === "exception_hold" &&
    order.reservationHoldStatus === "exception_hold"
  );
}

/** Recover only this retained original order; no callback creates a booking. */
export async function recoverRetainedReferralOrder(
  callbacks: RetainedReferralOrderRecovery,
): Promise<{ orderId: string; status: "cancelled" | "completed" }> {
  const retained = callbacks.retained ?? RETAINED_REFERRAL_ORDER;
  const passengerId = text(
    callbacks.passengerId,
    "retained-order-recovery:passenger-required",
  );
  const record = (stage: string, status?: number) => {
    callbacks.evidence.record({
      stage,
      ...(status === undefined ? {} : { status }),
      orderId: retained.orderId,
      quoteId: retained.quoteId,
      sha256: retained.bodySha256,
      result: "observed",
    });
  };
  const own = (value: unknown) => {
    const order = object(value);
    requireFact(
      order.orderId === retained.orderId &&
        order.partnerEntrySlug === retained.entrySlug &&
        object(order.passenger).passengerId === passengerId,
      "retained-order-recovery:canonical-owner-mismatch",
    );
    return order;
  };

  // The same subject may have this retained order active, never another one.
  assertNoForeignActive(await callbacks.readActive(), retained.orderId);
  const history = object(await callbacks.readHistory());
  requireFact(
    history.orderId === retained.orderId &&
      object(history.quote).quoteId === retained.quoteId,
    "retained-order-recovery:history-quote-mismatch",
  );
  const before = own(await callbacks.readOwn());
  callbacks.claim(retained.orderId);
  record("retained-order-recovery:scope-verified");

  if (isTerminal(before.status)) {
    record("retained-order-recovery:already-terminal");
  } else if (hasExceptionHold(before)) {
    await callbacks.resolve();
    record("retained-order-recovery:existing-hold-resolved");
  } else {
    requireFact(
      before.status === "created",
      "retained-order-recovery:unsupported-state-preserved",
    );
    try {
      await callbacks.cancel();
      record("retained-order-recovery:normal-cancel-ack");
    } catch (error) {
      if (
        !(error instanceof JourneyFailure) ||
        error.status !== 409 ||
        error.code !== "ORDER_NOT_CANCELABLE"
      )
        throw error;
      record("retained-order-recovery:normal-cancel-denied", 409);
      await callbacks.dispatch();
      const dispatched = own(await callbacks.readOwn());
      requireFact(
        hasExceptionHold(dispatched),
        "retained-order-recovery:dispatch-without-double-hold-preserved",
      );
      record("retained-order-recovery:normal-dispatch-double-hold");
      await callbacks.resolve();
      record("retained-order-recovery:dispatched-hold-resolved");
    }
  }

  const after = own(await callbacks.readOwn());
  requireFact(
    isTerminal(after.status),
    "retained-order-recovery:terminal-readback-required",
  );
  const activeValue = await callbacks.readActive();
  if (activeValue !== null) {
    const active = object(activeValue);
    if (!(active.active === false && active.trip === null)) {
      requireFact(
        active.active === true,
        "retained-order-recovery:active-readback-shape",
      );
      const activeOrderId = text(object(active.trip).orderId);
      requireFact(
        activeOrderId !== retained.orderId,
        "retained-order-recovery:own-still-active",
      );
      // A later different order is preserved; it is never claimed or mutated.
    }
  }
  record("retained-order-recovery:terminal-and-not-active");
  return { orderId: retained.orderId, status: after.status };
}
