import type {
  CreatePassengerRideCommand,
  FareQuoteResponse,
} from "@drts/contracts";
import type { BookingDraft } from "./booking-form";

type ServiceableQuote = Extract<
  FareQuoteResponse,
  { serviceAreaResult: "serviceable" }
>;
export interface PendingBooking {
  command: CreatePassengerRideCommand;
  requestId: string;
  paymentLabel: string;
  outcomeUnknown: boolean;
}
export interface BookingRecovery {
  draft: BookingDraft;
  pending: PendingBooking | null;
  quote?: ServiceableQuote | undefined;
}
export const BOOKING_RECOVERY_KEY = "drts.passenger.booking-recovery.v1";
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

function tabStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}
export function clearBookingRecovery(storage = tabStorage()) {
  try {
    storage?.removeItem(BOOKING_RECOVERY_KEY);
  } catch {
    /* Private storage may be unavailable. */
  }
}

/** No session, OTP or cloud credential is stored. The server still validates
 * ownership, quote expiry and the original immutable command on every retry.
 */
export function saveBookingRecovery(
  accountId: string,
  value: BookingRecovery,
  storage = tabStorage(),
) {
  try {
    storage?.setItem(
      BOOKING_RECOVERY_KEY,
      JSON.stringify({
        version: 1,
        accountId,
        draft: value.draft,
        // A reload during the HTTP request cannot establish that it did not commit.
        pending: value.pending
          ? { ...value.pending, outcomeUnknown: true }
          : null,
        ...(value.pending ? { quote: value.quote } : {}),
      }),
    );
  } catch {
    /* Same-mount recovery remains available when tab storage is blocked. */
  }
}

export function readBookingRecovery(
  accountId: string,
  storage = tabStorage(),
): BookingRecovery | null {
  try {
    const raw = storage?.getItem(BOOKING_RECOVERY_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    const point = (p: unknown) =>
      p === null ||
      (typeof p === "object" &&
        p !== null &&
        Number.isFinite((p as { lat?: number }).lat) &&
        Number.isFinite((p as { lng?: number }).lng) &&
        typeof (p as { address?: string }).address === "string");
    if (
      value.version !== 1 ||
      value.accountId !== accountId ||
      !value.draft ||
      typeof value.draft.localTime !== "string" ||
      !point(value.draft.origin) ||
      !point(value.draft.destination)
    )
      throw new Error("invalid_draft");
    if (value.pending) {
      const pending = value.pending;
      const command = pending.command;
      if (
        typeof pending.requestId !== "string" ||
        !/^[0-9a-f-]{36}$/.test(pending.requestId) ||
        typeof pending.paymentLabel !== "string" ||
        !command ||
        typeof command.fareSnapshotId !== "string" ||
        typeof command.paymentMethodId !== "string" ||
        !Number.isFinite(Date.parse(command.scheduledAt)) ||
        !Number.isFinite(Date.parse(command.passengerConfirmedAt)) ||
        !command.origin ||
        !command.destination ||
        !point(command.origin) ||
        !point(command.destination) ||
        !value.quote ||
        value.quote.serviceAreaResult !== "serviceable" ||
        value.quote.fareSnapshotId !== command.fareSnapshotId ||
        !Number.isFinite(Date.parse(value.quote.expiresAt))
      )
        throw new Error("invalid_pending");
      return {
        draft: value.draft,
        pending: { ...pending, outcomeUnknown: true },
        quote: value.quote,
      };
    }
    // An unsent draft always needs a fresh quote and explicit new fee confirmation.
    return { draft: value.draft, pending: null };
  } catch {
    clearBookingRecovery(storage);
    return null;
  }
}
