// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  BOOKING_RECOVERY_KEY,
  readBookingRecovery,
  saveBookingRecovery,
} from "../../../apps/passenger-app-web/components/booking/booking-draft-recovery";
import type { BookingRecovery } from "../../../apps/passenger-app-web/components/booking/booking-draft-recovery";

afterEach(() => sessionStorage.clear());
const point = { lat: 25.0142, lng: 121.4636, address: "合成上車點" };
const draft = {
  origin: point,
  destination: point,
  localTime: "2026-10-19T12:00",
};

describe("per-tab account-bound booking recovery", () => {
  it("restores a draft without treating an old unsent quote or fee checkbox as current consent", () => {
    saveBookingRecovery("account-a", { draft, pending: null });
    expect(readBookingRecovery("account-a")).toEqual({ draft, pending: null });
  });

  it("preserves an unknown acknowledgement's exact key and command even after original quote expiry", () => {
    const original = {
      draft,
      pending: {
        requestId: "c659960c-14fd-4fd5-a005-67c06b7b488a",
        paymentLabel: "合成卡",
        outcomeUnknown: false,
        command: {
          origin: point,
          destination: point,
          scheduledAt: "2026-10-19T04:00:00Z",
          passengerConfirmedAt: "2026-10-19T03:00:00Z",
          paymentMethodId: "owned-method",
          fareSnapshotId: "original-quote",
        },
      },
      quote: {
        serviceAreaResult: "serviceable",
        fareSnapshotId: "original-quote",
        expiresAt: "2000-01-01T00:00:00Z",
      },
    } as BookingRecovery;
    saveBookingRecovery("account-a", original);
    const recovered = readBookingRecovery("account-a");
    expect(recovered?.pending).toEqual({
      ...original.pending,
      outcomeUnknown: true,
    });
    expect(recovered?.quote).toEqual(original.quote);
    expect(recovered?.pending?.command).toEqual(original.pending?.command);
    expect(sessionStorage.getItem(BOOKING_RECOVERY_KEY)).not.toMatch(
      /session|Bearer|otp|cloud/i,
    );
  });

  it("clears another account's draft instead of replaying its key under the new identity", () => {
    saveBookingRecovery("account-a", { draft, pending: null });
    expect(readBookingRecovery("account-b")).toBeNull();
    expect(sessionStorage.getItem(BOOKING_RECOVERY_KEY)).toBeNull();
  });

  it("discards corrupt pending metadata and cannot synthesize a replacement request", () => {
    sessionStorage.setItem(
      BOOKING_RECOVERY_KEY,
      JSON.stringify({
        version: 1,
        accountId: "account-a",
        draft,
        pending: { requestId: "wrong" },
      }),
    );
    expect(readBookingRecovery("account-a")).toBeNull();
    expect(sessionStorage.getItem(BOOKING_RECOVERY_KEY)).toBeNull();
  });
});
