/**
 * Pure mapping helpers that bridge the shared `AddressMapPicker` payloads and
 * the tenant address contract. Kept free of React / provider imports (type-only
 * from `@drts/ui-web`) so they stay unit-testable and reusable from both the
 * client field component and the server actions.
 */
import type {
  TenantAddressGeocodeSource,
  TenantAddressRecord,
} from "@drts/contracts";
import type { AddressPayload } from "@drts/ui-web";

export const TENANT_PORTAL_MAP_SURFACE = "tenant_portal" as const;

function isFiniteCoordinate(
  value: number | null | undefined,
  bound: number,
): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= bound;
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
 * Classify a picker `coordinateSource` into the tenant address `geocodeSource`
 * enum (`none | manual | provider`). `saved_address` is ambiguous — it means the
 * pin was not changed during this edit — so the caller passes the record's prior
 * classification as `fallback` to avoid silently relabelling a manual address.
 */
export function geocodeSourceFromCoordinateSource(
  coordinateSource: string | null | undefined,
  fallback: TenantAddressGeocodeSource = "none",
): TenantAddressGeocodeSource {
  switch (coordinateSource) {
    case "manual_pin":
      return "manual";
    case "provider_candidate":
    case "reverse_geocode":
    case "external_platform":
      return "provider";
    case "saved_address":
      return fallback;
    default:
      return "none";
  }
}

/**
 * Build the picker `defaultValue` from a stored address so an existing saved
 * address shows / confirms its pin. A record without coordinates yields a
 * text-only payload (no `coordinateSource`) so the picker starts unpinned and
 * the manual-fallback warning applies.
 */
export function savedAddressToPayload(
  record: Pick<
    TenantAddressRecord,
    "addressName" | "addressText" | "lat" | "lng"
  >,
): AddressPayload {
  const hasCoords = payloadHasCoordinates(record);
  return {
    addressName: record.addressName ?? null,
    address: record.addressText,
    lat: record.lat ?? null,
    lng: record.lng ?? null,
    coordinateSource: hasCoords ? "saved_address" : null,
    surface: TENANT_PORTAL_MAP_SURFACE,
  };
}
