import { expect, it } from "vitest";
import { getPassengerTrackingMapPositions } from "../../../packages/passenger-client/src/ride/tracking-map";
import { mapNativePassengerRideAuthorityToFixture } from "../../../packages/passenger-client/src/ride/native-presentation";
import { authority, tracking } from "./fixture";

it("the map diagram moves its actual Driver marker between the captured pickup and dropoff", () => {
  const view = Object.assign(authority("assigned"), { tracking: tracking() });
  view.tracking.location.lat = 25.025;
  view.tracking.location.lng = 121.025;
  const one = getPassengerTrackingMapPositions(
    mapNativePassengerRideAuthorityToFixture(view, "ETA-ORDER"),
  )!;
  view.tracking.location.lat = 25.075;
  view.tracking.location.lng = 121.075;
  const two = getPassengerTrackingMapPositions(
    mapNativePassengerRideAuthorityToFixture(view, "ETA-ORDER"),
  )!;
  expect(two.driver.x).toBeGreaterThan(one.driver.x);
  expect(two.driver.y).toBeLessThan(one.driver.y);
  expect(two.target).toEqual(one.target);
});

it("missing or invalid actual GPS never produces an invented vehicle marker", () => {
  const view = Object.assign(authority("assigned"), { tracking: tracking() });
  view.tracking.location.lat = NaN;
  expect(
    getPassengerTrackingMapPositions(
      mapNativePassengerRideAuthorityToFixture(view, "ETA-ORDER"),
    ),
  ).toBeNull();
  expect(
    getPassengerTrackingMapPositions(
      mapNativePassengerRideAuthorityToFixture(
        authority("assigned"),
        "ETA-ORDER",
      ),
    ),
  ).toBeNull();
});

it("an on-trip position diagram points to the destination rather than back to pickup", () => {
  const view = Object.assign(authority("on_trip"), { tracking: tracking() });
  view.tracking.location.lat = 25.05;
  view.tracking.location.lng = 121.05;
  const map = getPassengerTrackingMapPositions(
    mapNativePassengerRideAuthorityToFixture(view, "ETA-ORDER"),
  )!;
  expect(map.targetLabel).toBe("下車點");
  expect(map.target.x).toBeGreaterThan(map.driver.x);
});
