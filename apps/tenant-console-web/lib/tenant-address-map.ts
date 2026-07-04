/**
 * Pure mapping helpers bridging the shared `AddressMapPicker` payloads and the
 * tenant booking draft. Type-only imports from `@drts/ui-web` keep these
 * runtime-light and unit-testable.
 */
import type { TenantAddressRecord } from "@drts/contracts";
import type { AddressPayload } from "@drts/ui-web";

export const TENANT_CONSOLE_MAP_SURFACE = "tenant_console" as const;

function isFiniteCoordinate(
  value: number | null | undefined,
  bound: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= bound
  );
}

/** True when the payload carries a usable pinned coordinate pair. */
export function payloadHasCoordinates(
  payload: Pick<AddressPayload, "lat" | "lng"> | null | undefined,
): boolean {
  return Boolean(
    payload &&
      isFiniteCoordinate(payload.lat, 90) &&
      isFiniteCoordinate(payload.lng, 180),
  );
}

/**
 * Build a picker payload from a saved tenant address so selecting a saved
 * pickup / drop-off seeds the map with a confirmed pin. A record without
 * coordinates yields a text-only payload so the picker starts unpinned.
 */
export function savedAddressToPayload(
  record: Pick<
    TenantAddressRecord,
    "addressId" | "addressName" | "addressText" | "lat" | "lng"
  >,
): AddressPayload {
  const hasCoords = payloadHasCoordinates(record);
  return {
    addressId: record.addressId,
    addressName: record.addressName ?? null,
    address: record.addressText,
    lat: record.lat ?? null,
    lng: record.lng ?? null,
    coordinateSource: hasCoords ? "saved_address" : null,
    surface: TENANT_CONSOLE_MAP_SURFACE,
  };
}

/** Coordinate string ("" when unset) for a booking draft field. */
export function coordinateToDraftString(
  value: number | null | undefined,
): string {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : "";
}
