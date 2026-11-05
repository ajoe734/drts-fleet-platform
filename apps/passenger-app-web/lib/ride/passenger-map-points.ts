import {
  getPassengerTrackingMapPositions,
  type PassengerRideFixture,
} from "@drts/passenger-client";

export interface PassengerMapPoint {
  lat: number;
  lng: number;
}

function validPoint(
  value: { lat?: unknown; lng?: unknown } | null | undefined,
): PassengerMapPoint | null {
  if (!value) return null;
  const { lat, lng } = value;
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  )
    return null;
  return { lat, lng };
}

/**
 * Geographic points for the real ride map, chosen exactly like the schematic
 * diagram: the driver marker only exists when the schematic would draw the
 * assigned driver's actual GPS fix, and the target is the pickup, or the
 * drop-off once the ride is on its way there.
 */
export function getPassengerRideMapPoints(fixture: PassengerRideFixture): {
  driver: PassengerMapPoint | null;
  target: PassengerMapPoint | null;
  targetIsDropoff: boolean;
} {
  const pickup = validPoint(fixture.assignment?.routeFare?.pickup);
  const dropoff = validPoint(fixture.assignment?.routeFare?.dropoff);
  const targetIsDropoff = fixture.status === "行程進行中" && dropoff !== null;
  const driver = getPassengerTrackingMapPositions(fixture)
    ? validPoint(fixture.tracking?.location)
    : null;
  return {
    driver,
    target: targetIsDropoff ? dropoff : pickup,
    targetIsDropoff,
  };
}
