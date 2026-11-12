/**
 * CALLCENTER-AI-ASSIST-20261111: pickup places this phone number used on
 * earlier trips, so fewer addresses have to be recognised from speech.
 *
 * Privacy boundary (voice SD §4 item 5, SA §4): the caller ID is only an
 * asserted lookup hint, never proof of identity. These places may be shown
 * to staff and may re-rank address candidates the caller already said, but
 * the AI must not read a stored address out to an unverified caller.
 */

export interface FrequentPickupAddress {
  address: string;
  addressName?: string | null;
  normalizedAddress?: string | null;
  lat: number;
  lng: number;
  placeId?: string | null;
  geocodeProvider?: string | null;
  coordinateSource?: string | null;
  sensitive?: boolean;
}

export interface FrequentPickupPlace {
  label: string;
  address: FrequentPickupAddress;
  tripCount: number;
  lastUsedAt: string;
}

export interface PickupHistoryRow {
  pickup: unknown;
  createdAt: string;
}

/** Order statuses where the pickup was really used by a dispatched trip. */
export const FREQUENT_PLACE_ORDER_STATUSES = [
  "assigned",
  "driver_accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
  "completed",
] as const;

export const FREQUENT_PLACE_LOOKBACK_DAYS = 365;
export const FREQUENT_PLACE_LIMIT = 3;
/** Pickups closer than this are the same place (entrances, GPS jitter). */
export const SAME_PLACE_RADIUS_M = 60;

/**
 * Spellings of one Taiwanese number as stored by different channels:
 * +886912345678 / 886912345678 / 0912345678, with or without separators.
 * Returns [] for anything that is not a plausible number (hidden caller ID,
 * "anonymous", short codes), so no lookup happens for it.
 */
export function taiwanPhoneVariants(phone: string | null | undefined) {
  const raw = phone?.trim() ?? "";
  const digits = raw.replace(/\D/g, "");
  let national: string | null = null;
  if (/^8860?\d{8,9}$/.test(digits)) {
    national = `0${digits.slice(3).replace(/^0/, "")}`;
  } else if (/^0\d{8,9}$/.test(digits)) {
    national = digits;
  }
  if (!national) {
    return [] as string[];
  }
  const international = `+886${national.slice(1)}`;
  return [
    ...new Set([raw, digits, national, international, international.slice(1)]),
  ].filter(Boolean);
}

function asAddress(value: unknown): FrequentPickupAddress | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const lat = candidate.lat;
  const lng = candidate.lng;
  if (
    typeof candidate.address !== "string" ||
    !candidate.address.trim() ||
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    candidate.sensitive === true
  ) {
    return null;
  }
  const text = (key: string) =>
    typeof candidate[key] === "string" ? (candidate[key] as string) : null;
  return {
    address: candidate.address,
    addressName: text("addressName"),
    normalizedAddress: text("normalizedAddress"),
    lat,
    lng,
    placeId: text("placeId"),
    geocodeProvider: text("geocodeProvider"),
    coordinateSource: text("coordinateSource"),
  };
}

export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

function samePlace(a: FrequentPickupAddress, b: FrequentPickupAddress) {
  if (a.placeId && b.placeId && a.placeId === b.placeId) return true;
  return distanceMeters(a, b) <= SAME_PLACE_RADIUS_M;
}

/** Group past pickups into places, most used (then most recent) first. */
export function aggregateFrequentPlaces(
  rows: readonly PickupHistoryRow[],
  limit = FREQUENT_PLACE_LIMIT,
): FrequentPickupPlace[] {
  const places: Array<FrequentPickupPlace & { latestAt: number }> = [];
  for (const row of rows) {
    const address = asAddress(row.pickup);
    const at = Date.parse(row.createdAt);
    if (!address || !Number.isFinite(at)) continue;
    const existing = places.find((place) => samePlace(place.address, address));
    if (existing) {
      existing.tripCount += 1;
      if (at > existing.latestAt) {
        // The most recent trip's wording and pin represent the place.
        existing.latestAt = at;
        existing.lastUsedAt = new Date(at).toISOString();
        existing.address = address;
        existing.label = address.addressName?.trim() || address.address;
      }
      continue;
    }
    places.push({
      label: address.addressName?.trim() || address.address,
      address,
      tripCount: 1,
      lastUsedAt: new Date(at).toISOString(),
      latestAt: at,
    });
  }
  return places
    .sort((a, b) => b.tripCount - a.tripCount || b.latestAt - a.latestAt)
    .slice(0, limit)
    .map((place) => ({
      label: place.label,
      address: place.address,
      tripCount: place.tripCount,
      lastUsedAt: place.lastUsedAt,
    }));
}

/**
 * Move address-provider candidates that are one of the caller's frequent
 * pickups to the front. Nothing is added or removed: the candidates are
 * still the provider's results for what the caller said.
 */
export function rankByFrequentPlaces<
  T extends {
    placeId?: string | null;
    location?: { lat: number; lng: number } | null;
  },
>(candidates: readonly T[], places: readonly FrequentPickupPlace[]): T[] {
  if (!places.length) return [...candidates];
  const matches = (candidate: T) =>
    places.some(
      (place) =>
        (candidate.placeId && candidate.placeId === place.address.placeId) ||
        (candidate.location &&
          distanceMeters(candidate.location, place.address) <=
            SAME_PLACE_RADIUS_M),
    );
  return [
    ...candidates.filter(matches),
    ...candidates.filter((candidate) => !matches(candidate)),
  ];
}
