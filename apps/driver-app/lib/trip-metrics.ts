export interface TripCoordinate {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function calculateHaversineDistanceKm(
  from: TripCoordinate,
  to: TripCoordinate,
): number {
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    2 *
    EARTH_RADIUS_KM *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

export function accumulateTripDistanceKm(
  currentDistanceKm: number,
  previousPoint: TripCoordinate | null,
  nextPoint: TripCoordinate,
): number {
  if (!previousPoint) {
    return currentDistanceKm;
  }

  return (
    currentDistanceKm + calculateHaversineDistanceKm(previousPoint, nextPoint)
  );
}

export function calculateTripDurationSec(
  startedAtMs: number | null,
  nowMs: number = Date.now(),
): number {
  if (startedAtMs == null || !Number.isFinite(startedAtMs)) {
    return 0;
  }

  return Math.max(0, Math.round((nowMs - startedAtMs) / 1000));
}

export function roundTripDistanceKm(distanceKm: number): number {
  return Math.round(distanceKm * 100) / 100;
}

export function formatTripDistance(distanceKm: number): string {
  return `${roundTripDistanceKm(distanceKm).toFixed(2)} km`;
}

export function formatTripDuration(durationSec: number): string {
  const totalSeconds = Math.max(0, Math.round(durationSec));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
}
