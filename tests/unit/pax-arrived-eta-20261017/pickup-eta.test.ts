import { describe, expect, it } from "vitest";
import type { PassengerRideAuthorityView } from "@drts/contracts";
import { mapPassengerRideAuthorityToFixture } from "../../../apps/passenger-app-web/lib/ride/passenger-live";
import { mapNativePassengerRideAuthorityToFixture } from "../../../packages/passenger-client/src/ride/native-presentation";

// Synthetic authority with the retained assignment ETA seen in the original
// arrived Passenger page. This exercises the production projections, no server.
function authority(
  status: PassengerRideAuthorityView["order"]["status"],
): PassengerRideAuthorityView {
  return {
    order: {
      orderId: "ETA-ORDER",
      orderNo: "ETA-ORDER-NO",
      status,
      timingMode: "scheduled",
      requestedPickupAt: "2026-10-17T04:56:00Z",
      pickup: { address: "Test pickup" },
      dropoff: { address: "Test dropoff" },
      cancelableUntil: null,
      cancelledAt: status === "cancelled" ? "2026-10-17T04:56:02Z" : null,
      completedAt: status === "completed" ? "2026-10-17T05:15:00Z" : null,
    },
    assignment: {
      snapshotId: "ETA-SNAPSHOT",
      runtimeProfileCode: "multi_taxi_direct",
      orderId: "ETA-ORDER",
      bookingId: null,
      dispatchJobId: "ETA-JOB",
      assignmentId: "ETA-ASSIGNMENT",
      assignmentVersion: 1,
      vehicle: {
        vehicleId: "ETA-VEHICLE",
        make: "Test make",
        model: "Test model",
        plateNo: "TEST-ETA",
        modelYear: 2025,
        doorCount: 4,
        color: "Test color",
        profileVersion: 1,
      },
      driver: {
        driverId: "ETA-DRIVER",
        displayName: "Test driver",
        registrationMaskedDisplay: "TEST***01",
        registrationStatus: "verified_active",
        registrationEffectiveUntil: "2027-01-01T00:00:00Z",
        credentialVersion: 1,
      },
      rating: {
        displayState: "new_driver",
        averageRating: null,
        ratingCount: 0,
        aggregateVersion: 1,
      },
      eta: {
        minutes: 30,
        calculatedAt: "2026-10-17T04:53:00Z",
        locationFreshness: "missing",
      },
      routeFare: {
        routeSnapshotId: "ETA-ROUTE",
        quoteSnapshotId: "ETA-QUOTE",
        orderId: "ETA-ORDER",
        pickup: {
          address: "Test pickup",
          lat: 25,
          lng: 121,
          coordinateSource: "manual_pin",
          geocodeConfidence: "manual",
          resolvedAt: "2026-10-17T04:50:00Z",
        },
        dropoff: {
          address: "Test dropoff",
          lat: 25.1,
          lng: 121.1,
          coordinateSource: "manual_pin",
          geocodeConfidence: "manual",
          resolvedAt: "2026-10-17T04:50:00Z",
        },
        estimatedDistanceMeters: 4000,
        estimatedDurationSeconds: 900,
        encodedPolyline: null,
        chargingMode: "meter_estimate",
        estimatedFareMinor: 30000,
        payableFareMinor: 30000,
        currency: "TWD",
        farePolicyId: "ETA-POLICY",
        farePolicyVersion: "1",
        fareChangeRuleId: "ETA-RULE",
        fareChangeRuleVersion: "1",
        fareChangeRuleDisplayText: "Test rule",
        passengerConfirmedAt: "2026-10-17T04:51:00Z",
        generatedAt: "2026-10-17T04:50:00Z",
      },
      createdAt: "2026-10-17T04:53:00Z",
      supersededAt: null,
    },
    rating: null,
    payment: null,
    receipt: null,
    actions: {
      canCancel: status === "arrived_pickup",
      canRate: false,
      canContact: true,
      canReadReceipt: false,
    },
  };
}

for (const [platform, project] of [
  ["Web", mapPassengerRideAuthorityToFixture],
  ["Native", mapNativePassengerRideAuthorityToFixture],
] as const) {
  describe(`${platform} pickup ETA follows the canonical order state`, () => {
    it.each(["assigned", "driver_accepted", "enroute_pickup"] as const)(
      "%s retains the authoritative pickup estimate",
      (status) => {
        const view = authority(status);
        const fixture = project(view, view.order.orderId);
        expect(fixture.etaMain).toBe("預計 30 分鐘抵達");
        expect(fixture.etaSub).toMatch(/^更新於 /);
      },
    );

    it.each(["arrived_pickup", "on_trip", "completed", "cancelled"] as const)(
      "%s removes the old pickup ETA and its update time without changing authority",
      (status) => {
        const view = authority(status);
        const original = structuredClone(view);
        const fixture = project(view, view.order.orderId);
        expect(fixture.etaMain).toBeUndefined();
        expect(fixture.etaSub).toBeUndefined();
        expect(fixture.orderNo).toBe(view.order.orderNo);
        expect(fixture.pickupLabel).toBe("Test pickup");
        expect(fixture.routeDistanceKm).toBe("約 4.0 公里");
        expect(view).toEqual(original);
      },
    );
  });
}
