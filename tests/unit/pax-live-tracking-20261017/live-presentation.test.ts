import { describe, expect, it } from "vitest";
import { mapPassengerRideAuthorityToFixture } from "../../../apps/passenger-app-web/lib/ride/passenger-live";
import {
  getNativePassengerLocationPresentation,
  mapNativePassengerRideAuthorityToFixture,
} from "../../../packages/passenger-client/src/ride/native-presentation";
import { authority, NOW, tracking } from "./fixture";

for (const [platform, project] of [
  ["Web", mapPassengerRideAuthorityToFixture],
  ["Native", mapNativePassengerRideAuthorityToFixture],
] as const) {
  describe(`${platform} current assigned Driver tracking`, () => {
    it("uses the latest location and pickup ETA while preserving the original assignment", () => {
      const view = Object.assign(authority("assigned"), {
        tracking: tracking(),
      });
      const original = structuredClone(view);
      const fixture = project(view, view.order.orderId);
      expect(fixture.mapState).toBe("fresh");
      expect(fixture.etaMain).toBe("預計 3 分鐘抵達");
      expect(fixture).toHaveProperty("tracking", view.tracking);
      expect(view).toEqual(original);
      expect(view.assignment!.eta.locationFreshness).toBe("missing");
    });

    it("marks an old actual position stale even if the assignment snapshot says fresh", () => {
      const view = Object.assign(authority("assigned"), {
        tracking: {
          ...tracking(),
          locationFreshness: "stale",
          pickupEta: null,
        },
      });
      view.assignment!.eta.locationFreshness = "fresh";
      const fixture = project(view, view.order.orderId);
      expect(fixture.mapState).toBe("stale");
      expect(fixture.etaMain).toBeUndefined();
    });

    it("does not reuse the old pickup promise when current location is missing", () => {
      const view = Object.assign(authority("assigned"), {
        tracking: {
          ...tracking(),
          locationFreshness: "missing",
          location: null,
          pickupEta: null,
        },
      });
      const fixture = project(view, view.order.orderId);
      expect(fixture.mapState).toBe("missing");
      expect(fixture.etaMain).toBeUndefined();
    });

    it("clears tracking and pickup ETA on cancellation", () => {
      const view = Object.assign(authority("cancelled"), {
        tracking: tracking(),
      });
      const fixture = project(view, view.order.orderId);
      expect(fixture.mapState).toBe("missing");
      expect(fixture.etaMain).toBeUndefined();
      expect(fixture).toHaveProperty("tracking", null);
    });
  });
}

it("Native ages actual GPS time rather than assignment time or stream receipt time", () => {
  const view = Object.assign(authority("assigned"), { tracking: tracking() });
  const fixture = mapNativePassengerRideAuthorityToFixture(
    view,
    view.order.orderId,
  );
  expect(
    getNativePassengerLocationPresentation(fixture, NOW, "connected"),
  ).toEqual({
    state: "fresh",
    calculatedAtMs: NOW - 5000,
    elapsedSeconds: 5,
  });
  expect(
    getNativePassengerLocationPresentation(fixture, NOW + 60000, "connected")
      .state,
  ).toBe("stale");
  expect(
    getNativePassengerLocationPresentation(fixture, NOW, "disconnected").state,
  ).toBe("stale");
});
