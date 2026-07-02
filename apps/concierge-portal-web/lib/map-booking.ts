import type { AddressPayload } from "@drts/contracts";

export type ConciergeMapBookingGate =
  | { canSubmit: true; decision: "coordinates_ready" }
  | {
      canSubmit: false;
      reason: "pickup_coordinates_required" | "dropoff_coordinates_required";
    };

export type ConciergeMapProviderState =
  | "manual_fallback"
  | "provider_unavailable";

export interface ConciergeManualPinAddressInput {
  address: string;
  lat: string;
  lng: string;
  actorId: string;
  selectedAt: string;
  manualOverrideReason?: string | null;
}

export interface ConciergeMapBookingGateInput {
  pickupLat: string;
  pickupLng: string;
  dropoffLat: string;
  dropoffLng: string;
}

export function parseConciergeCoordinate(
  value: string,
  bounds: { min: number; max: number },
) {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (parsed < bounds.min || parsed > bounds.max) {
    return null;
  }
  return parsed;
}

export function hasConciergeCoordinatePair(lat: string, lng: string) {
  return (
    parseConciergeCoordinate(lat, { min: -90, max: 90 }) !== null &&
    parseConciergeCoordinate(lng, { min: -180, max: 180 }) !== null
  );
}

export function getConciergeMapBookingGate({
  pickupLat,
  pickupLng,
  dropoffLat,
  dropoffLng,
}: ConciergeMapBookingGateInput): ConciergeMapBookingGate {
  if (!hasConciergeCoordinatePair(pickupLat, pickupLng)) {
    return { canSubmit: false, reason: "pickup_coordinates_required" };
  }
  if (!hasConciergeCoordinatePair(dropoffLat, dropoffLng)) {
    return { canSubmit: false, reason: "dropoff_coordinates_required" };
  }
  return { canSubmit: true, decision: "coordinates_ready" };
}

export function parseConciergeMapProviderState(
  value: string | null | undefined,
): ConciergeMapProviderState {
  return value === "provider_unavailable"
    ? "provider_unavailable"
    : "manual_fallback";
}

export function buildConciergeManualPinAddress({
  address,
  lat,
  lng,
  actorId,
  selectedAt,
  manualOverrideReason,
}: ConciergeManualPinAddressInput): AddressPayload {
  const trimmedAddress = address.trim();
  const parsedLat = parseConciergeCoordinate(lat, { min: -90, max: 90 });
  const parsedLng = parseConciergeCoordinate(lng, { min: -180, max: 180 });
  if (parsedLat === null || parsedLng === null) {
    return { address: trimmedAddress, surface: "concierge_portal" };
  }

  const reason =
    manualOverrideReason?.trim() || "concierge assisted-entry map pin";

  return {
    address: trimmedAddress,
    lat: parsedLat,
    lng: parsedLng,
    coordinateSource: "manual_pin",
    geocodeConfidence: "manual",
    selectedByActorId: actorId,
    selectedAt,
    pinnedByActorId: actorId,
    pinnedAt: selectedAt,
    manualOverrideReason: reason,
    surface: "concierge_portal",
    coordinateProvenance: {
      coordinateSource: "manual_pin",
      geocodeConfidence: "manual",
      selectedByActorId: actorId,
      selectedAt,
      pinnedByActorId: actorId,
      pinnedAt: selectedAt,
      manualOverrideReason: reason,
      surface: "concierge_portal",
    },
  };
}
