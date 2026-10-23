import { afterEach, expect, it, vi } from "vitest";
import type {
  DriverTaskRecord,
  DriverTrackingStatus,
  GeoRouteResponse,
  OwnedOrderRecord,
  PassengerRideAccessGrant,
} from "@drts/contracts";
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { authority, NOW, tracking } from "./fixture";

afterEach(() => vi.useRealTimers());

function fixture(status: OwnedOrderRecord["status"] = "assigned") {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const view = authority(status);
  const original = structuredClone(view.assignment);
  const position = {
    ...tracking().location,
    driverId: "ETA-DRIVER",
    updatedAt: new Date(NOW).toISOString(),
  };
  const registry = {
    getDriverTrackingStatus: vi.fn(
      async (): Promise<DriverTrackingStatus> => ({
        driverId: "ETA-DRIVER",
        locationFreshness: "fresh",
        currentLocation: position,
        currentVehicleId: "ETA-VEHICLE",
        currentTaskId: "ETA-TASK",
        trackingState: null,
        appState: null,
        transportMode: null,
        networkType: null,
        lastEventId: null,
        lastDeviceId: null,
        lastSequenceNo: null,
        lastHeartbeatRecordedAt: position.recordedAt,
        lastHeartbeatReceivedAt: position.updatedAt,
        lastSuccessfulUploadAt: position.updatedAt,
      }),
    ),
    getDriverEta: vi.fn(async () => ({
      driverId: "ETA-DRIVER",
      etaMinutes: 3,
      calculatedAt: new Date(NOW).toISOString(),
      driverLocation: position,
      destination: { lat: 25, lng: 121 },
    })),
  };
  const owned = new OwnedMobilityService(
    registry as never,
    {} as never,
    {} as never,
    {} as never,
  );
  vi.spyOn(owned, "resolvePersistedOrder").mockResolvedValue({
    ...view.order,
    runtimeProfileCode: "multi_taxi_direct",
    reservationWindowStart: view.order.requestedPickupAt,
  } as unknown as OwnedOrderRecord);
  vi.spyOn(
    owned,
    "resolvePersistedPassengerAssignmentDisclosure",
  ).mockResolvedValue(view.assignment);
  return {
    service: new MultiTaxiService(owned),
    registry,
    view,
    original,
    position,
    owned,
  };
}

it("account Passenger authority reads the assigned Driver live location without overwriting the atomic disclosure", async () => {
  const f = fixture();
  const result = await f.service.getPassengerRideById(
    "ETA-ORDER",
    "test-owner",
  );
  expect(result).toHaveProperty("tracking", tracking());
  expect(f.registry.getDriverTrackingStatus).toHaveBeenCalledWith("ETA-DRIVER");
  expect(f.registry.getDriverEta).toHaveBeenCalledWith("ETA-DRIVER", 25, 121);
  expect(result.assignment).toEqual(f.original);
});

it("the same mounted account stream emits a new actual location with unchanged assignment version", async () => {
  const f = fixture();
  const received: unknown[] = [];
  const subscription = f.service
    .streamTrustedPassengerEvents("ETA-ORDER", "test-owner")
    .subscribe((event) => received.push(event.data));
  try {
    await vi.advanceTimersByTimeAsync(1);
    expect(received).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(received).toHaveLength(1);
    f.position.lat = 25.014;
    f.position.recordedAt = new Date(NOW + 2000).toISOString();
    await vi.advanceTimersByTimeAsync(3000);
    expect(received).toHaveLength(2);
    expect(received[1]).toHaveProperty("data.tracking.location.lat", 25.014);
    expect(received[1]).toHaveProperty("assignmentVersion", 1);
    expect(received[1]).toHaveProperty("eventType", "driver_location_updated");
    expect(f.view.assignment).toEqual(f.original);
  } finally {
    subscription.unsubscribe();
  }
});

it.each(["completed", "cancelled", "redispatch_required"] as const)(
  "%s stops live Driver tracking",
  async (status) => {
    const f = fixture(status);
    const result = await f.service.getPassengerRideById(
      "ETA-ORDER",
      "test-owner",
    );
    expect(result).toHaveProperty("tracking", null);
    expect(f.registry.getDriverTrackingStatus).not.toHaveBeenCalled();
    expect(f.registry.getDriverEta).not.toHaveBeenCalled();
  },
);

it("stale or inaccurate Driver location has no live pickup ETA", async () => {
  const f = fixture();
  for (const freshness of ["stale", "low_accuracy"] as const) {
    const current = await f.registry.getDriverTrackingStatus();
    f.registry.getDriverTrackingStatus.mockResolvedValue({
      ...current,
      locationFreshness: freshness,
    });
    const result = await f.service.getPassengerRideById(
      "ETA-ORDER",
      "test-owner",
    );
    expect(result.tracking?.locationFreshness).toBe(freshness);
    expect(result.tracking?.pickupEta).toBeNull();
  }
  expect(f.registry.getDriverEta).not.toHaveBeenCalled();
});

it("a GPS fix buffered minutes ago has no live pickup ETA even though it was just received", async () => {
  const f = fixture();
  const current = await f.registry.getDriverTrackingStatus();
  f.registry.getDriverTrackingStatus.mockResolvedValue({
    ...current,
    locationFreshness: "fresh",
    currentLocation: {
      ...current.currentLocation!,
      recordedAt: new Date(NOW - 600_000).toISOString(),
      updatedAt: new Date(NOW).toISOString(),
    },
  });
  const result = await f.service.getPassengerRideById(
    "ETA-ORDER",
    "test-owner",
  );
  expect(result.tracking?.locationFreshness).toBe("stale");
  expect(result.tracking?.pickupEta).toBeNull();
  expect(result.tracking?.location?.lat).toBe(current.currentLocation!.lat);
  expect(result.assignment).toEqual(f.original);
  expect(f.registry.getDriverEta).not.toHaveBeenCalled();
});

it("a GPS fix recorded seconds ago keeps the live pickup ETA (fresh control)", async () => {
  const f = fixture();
  const current = await f.registry.getDriverTrackingStatus();
  f.registry.getDriverTrackingStatus.mockResolvedValue({
    ...current,
    locationFreshness: "fresh",
    currentLocation: {
      ...current.currentLocation!,
      recordedAt: new Date(NOW - 5_000).toISOString(),
      updatedAt: new Date(NOW).toISOString(),
    },
  });
  const result = await f.service.getPassengerRideById(
    "ETA-ORDER",
    "test-owner",
  );
  expect(result.tracking?.locationFreshness).toBe("fresh");
  expect(result.tracking?.pickupEta).toEqual({
    minutes: 3,
    calculatedAt: new Date(NOW).toISOString(),
  });
});

it("a GPS fix that ages past the window while the ETA lookup is in flight loses the live pickup ETA", async () => {
  const f = fixture();
  const current = await f.registry.getDriverTrackingStatus();
  f.registry.getDriverTrackingStatus.mockResolvedValue({
    ...current,
    locationFreshness: "fresh",
    currentLocation: {
      ...current.currentLocation!,
      recordedAt: new Date(NOW - 59_000).toISOString(),
      updatedAt: new Date(NOW).toISOString(),
    },
  });
  // Simulate a Registry authority storage lock that makes the ETA lookup take
  // long enough for this same GPS fix to cross the 60s observation window
  // between the pre-await freshness check and this call resolving.
  f.registry.getDriverEta.mockImplementation(async () => {
    vi.setSystemTime(NOW + 2_000);
    return {
      driverId: "ETA-DRIVER",
      etaMinutes: 3,
      calculatedAt: new Date(NOW + 2_000).toISOString(),
      driverLocation: f.position,
      destination: { lat: 25, lng: 121 },
    };
  });
  const result = await f.service.getPassengerRideById(
    "ETA-ORDER",
    "test-owner",
  );
  expect(f.registry.getDriverEta).toHaveBeenCalledWith("ETA-DRIVER", 25, 121);
  expect(result.tracking?.pickupEta).toBeNull();
  expect(result.tracking?.locationFreshness).toBe("stale");
  expect(result.tracking?.location?.lat).toBe(current.currentLocation!.lat);
  expect(result.assignment).toEqual(f.original);
});

it("an on_trip observation that ages past the window during the dropoff route lookup is labeled stale, not fresh", async () => {
  const f = fixture("on_trip");
  // The dropoff leg needs real coordinates to be eligible for a route lookup;
  // the presentation-layer fixture order only carries a display address.
  vi.spyOn(f.owned, "resolvePersistedOrder").mockResolvedValue({
    ...f.view.order,
    runtimeProfileCode: "multi_taxi_direct",
    reservationWindowStart: f.view.order.requestedPickupAt,
    dropoff: { ...f.view.order.dropoff, lat: 25.1, lng: 121.1 },
  } as unknown as OwnedOrderRecord);
  const current = await f.registry.getDriverTrackingStatus();
  f.registry.getDriverTrackingStatus.mockResolvedValue({
    ...current,
    locationFreshness: "fresh",
    currentLocation: {
      ...current.currentLocation!,
      recordedAt: new Date(NOW - 59_000).toISOString(),
      updatedAt: new Date(NOW).toISOString(),
    },
    currentTaskId: "ETA-TASK",
  });
  const task: DriverTaskRecord = {
    taskId: "ETA-TASK",
    orderId: "ETA-ORDER",
    dispatchJobId: "ETA-JOB",
    assignmentId: "ETA-ASSIGNMENT",
    driverId: "ETA-DRIVER",
    vehicleId: "ETA-VEHICLE",
    sourcePlatform: null,
    routeProvided: true,
    waypoints: [],
    status: "on_trip",
    acceptedAt: null,
    departedAt: null,
    arrivedPickupAt: null,
    startedAt: new Date(NOW).toISOString(),
    completedAt: null,
    actualDistanceKm: null,
    actualDurationSec: null,
    fare: null,
    proof: null,
  };
  f.owned.findDriverTaskForRead = vi.fn(async () => task);
  // Simulate a route-provider lookup that takes long enough for this same GPS
  // fix to cross the 60s observation window between the pre-await freshness
  // check and this return, mirroring the pickup-await race above.
  Object.assign(f.owned, {
    passengerRouteGeoService: {
      route: vi.fn(async (): Promise<GeoRouteResponse> => {
        vi.setSystemTime(NOW + 2_000);
        return {
          provider: "controlled-provider",
          distanceMeters: 1000,
          durationSeconds: 300,
          generatedAt: new Date(NOW + 2_000).toISOString(),
          encodedPolyline: null,
        };
      }),
    },
  });
  const result = await f.service.getPassengerRideById(
    "ETA-ORDER",
    "test-owner",
  );
  expect(result.tracking?.locationFreshness).toBe("stale");
  expect(result.tracking?.pickupEta).toBeNull();
  expect(result.tracking).toHaveProperty("dropoffRoute", null);
  expect(result.tracking?.location?.lat).toBe(current.currentLocation!.lat);
  expect(result.assignment).toEqual(f.original);
});

it("an old receipt with an old GPS fix stays stale (old receipt control)", async () => {
  const f = fixture();
  const current = await f.registry.getDriverTrackingStatus();
  f.registry.getDriverTrackingStatus.mockResolvedValue({
    ...current,
    locationFreshness: "stale",
    currentLocation: {
      ...current.currentLocation!,
      recordedAt: new Date(NOW - 600_000).toISOString(),
      updatedAt: new Date(NOW - 100_000).toISOString(),
    },
  });
  const result = await f.service.getPassengerRideById(
    "ETA-ORDER",
    "test-owner",
  );
  expect(result.tracking?.locationFreshness).toBe("stale");
  expect(result.tracking?.pickupEta).toBeNull();
  expect(f.registry.getDriverEta).not.toHaveBeenCalled();
});

it("redispatch with no current assignment stops tracking the old Driver", async () => {
  const f = fixture("redispatch_required");
  f.owned.resolvePersistedPassengerAssignmentDisclosure = vi.fn(
    async () => null,
  );
  const result = await f.service.getPassengerRideById(
    "ETA-ORDER",
    "test-owner",
  );
  expect(result.assignment).toBeNull();
  expect(result.tracking).toBeNull();
  expect(f.registry.getDriverTrackingStatus).not.toHaveBeenCalled();
});

it("a temporary tracking read failure leaves the real ride readable without a stale pickup promise", async () => {
  const f = fixture();
  f.registry.getDriverTrackingStatus.mockRejectedValue(
    new Error("tracking temporarily unavailable"),
  );
  const result = await f.service.getPassengerRideById(
    "ETA-ORDER",
    "test-owner",
  );
  expect(result.order.orderId).toBe("ETA-ORDER");
  expect(result.tracking).toMatchObject({
    locationFreshness: "missing",
    location: null,
    pickupEta: null,
  });
  expect(result.actions.canCancel).toBe(true);
});

it("a pickup ETA calculation failure keeps the actual position and does not reuse the assignment ETA", async () => {
  const f = fixture();
  f.registry.getDriverEta.mockRejectedValue(new Error("ETA unavailable"));
  const result = await f.service.getPassengerRideById(
    "ETA-ORDER",
    "test-owner",
  );
  expect(result.tracking?.location?.lat).toBe(f.position.lat);
  expect(result.tracking?.pickupEta).toBeNull();
  expect(result.assignment).toEqual(f.original);
});

it.each(["driver", "vehicle"] as const)(
  "a persisted disclosure missing %s stays readable without inventing tracking identity",
  async (field) => {
    const f = fixture();
    Reflect.deleteProperty(f.view.assignment!, field);
    const result = await f.service.getPassengerRideById(
      "ETA-ORDER",
      "test-owner",
    );
    expect(result.order.orderId).toBe("ETA-ORDER");
    expect(result.assignment).toBe(f.view.assignment);
    expect(result.tracking).toBeNull();
    expect(result.actions.canCancel).toBe(true);
    expect(f.registry.getDriverTrackingStatus).not.toHaveBeenCalled();
  },
);

it("missing route data preserves actual Driver location without inventing a pickup estimate", async () => {
  const f = fixture();
  Reflect.deleteProperty(f.view.assignment!, "routeFare");
  const result = await f.service.getPassengerRideById(
    "ETA-ORDER",
    "test-owner",
  );
  expect(result.tracking?.location).toEqual(tracking().location);
  expect(result.tracking?.pickupEta).toBeNull();
  expect(f.registry.getDriverEta).not.toHaveBeenCalled();
});

it("the existing token entry receives live tracking and named location updates too", async () => {
  const f = fixture();
  // Exercise the real existing token grant/validation without an HTTP server.
  const issuer = f.service as unknown as {
    issueRideAccessGrant(order: OwnedOrderRecord): PassengerRideAccessGrant;
  };
  const grant = issuer.issueRideAccessGrant({
    ...f.view.order,
    runtimeProfileCode: "multi_taxi_direct",
    passenger: { passengerId: "test-owner", name: "Test", phone: "0000000000" },
  } as unknown as OwnedOrderRecord);
  const result = await f.service.getPassengerRide(grant.accessToken);
  expect(result.tracking?.location).toEqual(tracking().location);
  const received: unknown[] = [];
  const subscription = f.service
    .streamPassengerRide(grant.accessToken)
    .subscribe((event) => received.push(event.data));
  try {
    await vi.advanceTimersByTimeAsync(1);
    f.position.lng = 121.465;
    f.position.recordedAt = new Date(NOW + 2000).toISOString();
    await vi.advanceTimersByTimeAsync(3000);
    expect(received).toHaveLength(2);
    expect(received[1]).toHaveProperty("eventType", "driver_location_updated");
    expect(received[1]).toHaveProperty("data.tracking.location.lng", 121.465);
  } finally {
    subscription.unsubscribe();
  }
});
