import type { PassengerBookingSettingsResponse } from "@drts/contracts";

/** Missing settings are unavailable, never an implicit business-policy default. */
export function validateBookingSettings(
  value: unknown,
): PassengerBookingSettingsResponse {
  if (
    !value ||
    typeof value !== "object" ||
    !("minLeadTimeMinutes" in value) ||
    typeof value.minLeadTimeMinutes !== "number" ||
    !Number.isFinite(value.minLeadTimeMinutes) ||
    value.minLeadTimeMinutes < 0 ||
    !("requireSmsVerification" in value) ||
    typeof value.requireSmsVerification !== "boolean"
  ) {
    throw new Error("booking_settings_unavailable");
  }
  return {
    minLeadTimeMinutes: value.minLeadTimeMinutes,
    requireSmsVerification: value.requireSmsVerification,
  };
}

/** datetime-local has no offset. Use local fields, not a sliced UTC ISO string. */
export function toLocalDateTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid_booking_time");
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalDateTime(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error("invalid_booking_time");
  }
  const date = new Date(value);
  // Reject nonexistent local times (DST gaps), rollover dates and invalid input.
  if (
    !Number.isFinite(date.getTime()) ||
    toLocalDateTime(date.toISOString()) !== value
  ) {
    throw new Error("invalid_booking_time");
  }
  return date.toISOString();
}

/** Round UP to the first representable local minute satisfying the actual lead. */
export function earliestBookingTime(
  settings: PassengerBookingSettingsResponse,
  now: number = Date.now(),
): string {
  const { minLeadTimeMinutes } = validateBookingSettings(settings);
  const earliest = now + minLeadTimeMinutes * 60_000;
  if (!Number.isFinite(earliest)) throw new Error("invalid_booking_time");
  // A datetime-local control cannot distinguish the two occurrences of a
  // DST-fold minute. Skip unrepresentable second occurrences: parsing the
  // displayed wall minute must satisfy the same actual UTC lead boundary.
  for (let minute = Math.ceil(earliest / 60_000) * 60_000; ; minute += 60_000) {
    const local = toLocalDateTime(new Date(minute).toISOString());
    if (Date.parse(fromLocalDateTime(local)) >= earliest) return local;
  }
}

/**
 * Minutes the time the app proposes keeps above the lead. The lead is checked
 * again at the quote and at the submit, and a proposal exactly on it fails both
 * from the next whole minute, before anyone can finish the booking. Only the
 * proposal moves: a passenger can still pick any time the lead allows.
 */
export const BOOKING_PROPOSAL_MARGIN_MINUTES = 5;

/** The time to offer a passenger who has not picked one. */
export function proposedBookingTime(
  settings: PassengerBookingSettingsResponse,
  now: number = Date.now(),
): string {
  return earliestBookingTime(
    settings,
    now + BOOKING_PROPOSAL_MARGIN_MINUTES * 60_000,
  );
}

/** Revalidate at every quote and submit boundary, using the current clock. */
export function isBookingTimeAllowed(
  iso: string,
  settings: PassengerBookingSettingsResponse,
  now: number = Date.now(),
): boolean {
  const { minLeadTimeMinutes } = validateBookingSettings(settings);
  const scheduled = new Date(iso).getTime();
  return (
    Number.isFinite(scheduled) && scheduled >= now + minLeadTimeMinutes * 60_000
  );
}
