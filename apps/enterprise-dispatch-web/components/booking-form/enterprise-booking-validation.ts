/**
 * Pure, fixture-free reservation-window and passenger-identity checks for
 * the enterprise booking form (SR-ENTERPRISE-FORM-001, R20/R21).
 *
 * This module intentionally has no "@/..." aliased imports (it uses a
 * relative import for translations instead) so it can be unit-tested
 * directly under the repo-root vitest config, which pins the "@" alias to
 * a different app. `lib/enterprise-booking-draft.ts` imports and re-exports
 * these functions as the single source of truth for the rest of the app.
 */
import { t as translate } from "../../lib/translations";

const RESERVATION_TIMEZONE_OFFSET = "+08:00";
const RESERVATION_TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000;

export type EnterpriseReservationWindowInput = {
  reservationDate: string;
  reservationTime: string;
};

export type EnterprisePassengerNameInput = {
  passengerMode: "self" | "other";
  passenger: string;
  bookedBy: string;
};

export type EnterpriseDraftCompletenessInput =
  EnterpriseReservationWindowInput &
    EnterprisePassengerNameInput & {
      pickup: string;
      dropoff: string;
      onsiteContactPhone: string;
      costCenterCode: string;
      costCenterLabel: string;
    };

function parseReservationStart(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return null;
  }

  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(3, 5));
  const calendarDate = new Date(Date.UTC(year, month - 1, day));

  // `new Date()` silently normalizes impossible values (for example,
  // 2026-02-30 becomes March 2). A non-existent wall-clock timestamp must
  // never become a later, submittable reservation by accident.
  if (
    hour > 23 ||
    minute > 59 ||
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    return null;
  }

  const parsed = new Date(`${date}T${time}:00${RESERVATION_TIMEZONE_OFFSET}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isReservationWindowInFuture(
  draft: EnterpriseReservationWindowInput,
  now = new Date(),
): boolean {
  const reservationStart = parseReservationStart(
    draft.reservationDate,
    draft.reservationTime,
  );

  return (
    reservationStart !== null && reservationStart.getTime() > now.getTime()
  );
}

export function requireFutureReservationStart(
  draft: EnterpriseReservationWindowInput,
  now = new Date(),
): Date {
  const start = parseReservationStart(
    draft.reservationDate,
    draft.reservationTime,
  );
  if (start === null || start.getTime() <= now.getTime()) {
    throw new Error(
      translate(
        "review.blocked.pastReservation",
        {
          earliest: getEarliestBookableLabel("zh", now),
        },
        "zh",
      ),
    );
  }
  return start;
}

export function getEarliestBookableLabel(
  locale: "zh" | "en",
  now = new Date(),
) {
  const localWallClock = new Date(
    now.getTime() + RESERVATION_TIMEZONE_OFFSET_MS,
  ).toISOString();
  const date = localWallClock.slice(5, 10).replace("-", "/");
  const time = localWallClock.slice(11, 16);

  return translate("booking.earliestBookable", { date, time }, locale);
}

export function getEnterprisePassengerDisplayName(
  draft: EnterprisePassengerNameInput,
) {
  return (
    draft.passengerMode === "self" ? draft.bookedBy : draft.passenger
  ).trim();
}

export function isEnterpriseDraftComplete(
  draft: EnterpriseDraftCompletenessInput,
  now = new Date(),
) {
  const hasRequiredFields = [
    getEnterprisePassengerDisplayName(draft),
    draft.bookedBy,
    draft.pickup,
    draft.dropoff,
    draft.reservationDate,
    draft.reservationTime,
    draft.onsiteContactPhone,
    draft.costCenterCode,
    draft.costCenterLabel,
  ].every((value) => value.trim().length > 0);

  return hasRequiredFields && isReservationWindowInFuture(draft, now);
}
