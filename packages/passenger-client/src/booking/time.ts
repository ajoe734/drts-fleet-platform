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
  return toLocalDateTime(
    new Date(Math.ceil(earliest / 60_000) * 60_000).toISOString(),
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
