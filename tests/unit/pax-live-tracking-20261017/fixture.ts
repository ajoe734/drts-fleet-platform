import type { PassengerRideAuthorityView } from "@drts/contracts";

export function authority(
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

export const NOW = Date.parse("2026-10-17T05:24:00Z");
export function tracking() {
  return {
    assignmentId: "ETA-ASSIGNMENT",
    driverId: "ETA-DRIVER",
    vehicleId: "ETA-VEHICLE",
    locationFreshness: "fresh" as const,
    location: {
      lat: 25.013,
      lng: 121.464,
      accuracyM: 8,
      recordedAt: new Date(NOW - 5000).toISOString(),
    },
    pickupEta: { minutes: 3, calculatedAt: new Date(NOW).toISOString() },
  };
}
