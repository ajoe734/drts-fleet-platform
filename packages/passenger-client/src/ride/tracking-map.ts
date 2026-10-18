import type { PassengerRideFixture } from "./view-model";

type Point = { lat: number; lng: number };
function valid(point: Point | null | undefined): point is Point {
  return (
    !!point &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
  );
}

/** A geographic position diagram for an unavailable external map renderer.
 * The Driver marker always comes from the actual assigned Driver GPS fix. */
export function getPassengerTrackingMapPositions(
  fixture: PassengerRideFixture,
) {
  const driver = fixture.tracking?.location;
  const pickup = fixture.assignment?.routeFare?.pickup;
  if (!valid(driver) || !valid(pickup) || fixture.mapState === "missing")
    return null;
  const dropoff = fixture.assignment?.routeFare?.dropoff;
  const points = [driver, pickup, ...(valid(dropoff) ? [dropoff] : [])];
  const minLat = Math.min(...points.map((point) => point.lat));
  const maxLat = Math.max(...points.map((point) => point.lat));
  const minLng = Math.min(...points.map((point) => point.lng));
  const maxLng = Math.max(...points.map((point) => point.lng));
  const targetIsDropoff = fixture.status === "行程進行中" && valid(dropoff);
  const target = targetIsDropoff ? dropoff : pickup;
  const project = (point: Point) => ({
    x:
      maxLng === minLng
        ? 50
        : 10 + (80 * (point.lng - minLng)) / (maxLng - minLng),
    y:
      maxLat === minLat
        ? 50
        : 10 + (80 * (maxLat - point.lat)) / (maxLat - minLat),
  });
  return {
    driver: project(driver),
    target: project(target),
    targetLabel: targetIsDropoff ? "下車點" : "上車點",
  };
}
