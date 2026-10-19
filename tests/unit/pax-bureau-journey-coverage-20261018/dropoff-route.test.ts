import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  DriverTaskRecord,
  DriverTrackingStatus,
  GeoRouteResponse,
  OwnedOrderRecord,
  PassengerDispatchDisclosureSnapshot,
} from "@drts/contracts";
import {
  buildOwnedMobilityServiceForTest,
  createTestPassengerOrder,
} from "../system-remediation/sr-qa-dispatch-001/test-support";
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { authority } from "../pax-live-tracking-20261017/fixture";

const NOW = Date.parse("2026-10-19T15:58:00Z");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());
function setup() {
  const { service, regulatoryRegistryService } =
    buildOwnedMobilityServiceForTest();
  const created = createTestPassengerOrder(service, {
    pickup: { address: "Original pickup", lat: 25, lng: 121 },
    dropoff: { address: "Canonical dropoff", lat: 25.1, lng: 121.1 },
  });
  const memory = service as unknown as {
    orders: OwnedOrderRecord[];
    driverTasks: DriverTaskRecord[];
    passengerDisclosureSnapshots: PassengerDispatchDisclosureSnapshot[];
  };
  const order = memory.orders.find(
    (value) => value.orderId === created.orderId,
  )!;
  order.status = "on_trip";
  order.runtimeProfileCode = "multi_taxi_direct";
  const assignment = structuredClone(authority("on_trip").assignment!);
  assignment.orderId = order.orderId;
  assignment.routeFare.orderId = order.orderId;
  memory.passengerDisclosureSnapshots.push(assignment);
  const task: DriverTaskRecord = {
    taskId: "ETA-TASK",
    orderId: order.orderId,
    dispatchJobId: assignment.dispatchJobId!,
    assignmentId: assignment.assignmentId,
    driverId: assignment.driver.driverId,
    vehicleId: assignment.vehicle.vehicleId,
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
  memory.driverTasks.push(task);
  const position = {
    driverId: task.driverId,
    lat: 25.013,
    lng: 121.464,
    accuracyM: 8 as number | null,
    recordedAt: new Date(NOW).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
  };
  const current: DriverTrackingStatus = {
    driverId: task.driverId,
    currentTaskId: task.taskId,
    currentVehicleId: task.vehicleId,
    currentLocation: position,
    locationFreshness: "fresh",
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
  };
  Object.assign(regulatoryRegistryService, {
    getDriverTrackingStatus: vi.fn(async () => structuredClone(current)),
  });
  const route = vi.fn(
    async (): Promise<GeoRouteResponse> => ({
      provider: "existing-road-provider",
      distanceMeters: 1200,
      durationSeconds: 180,
      generatedAt: new Date(Date.now()).toISOString(),
      encodedPolyline: null,
    }),
  );
  Object.assign(service, { passengerRouteGeoService: { route } });
  const read = () => service.resolvePassengerRideTracking(order, assignment);
  return {
    service,
    current,
    position,
    order,
    assignment,
    task,
    route,
    read,
    memory,
  };
}

it("the real producer uses the assigned GPS to canonical dropoff road route, not the immutable quote", async () => {
  const f = setup();
  const original = structuredClone(f.assignment);
  const [first, second] = await Promise.all([f.read(), f.read()]);
  expect(f.route).toHaveBeenCalledTimes(1);
  expect(f.route).toHaveBeenCalledWith({
    origin: { lat: 25.013, lng: 121.464 },
    destination: { lat: 25.1, lng: 121.1 },
    travelMode: "drive",
    locale: "zh-TW",
  });
  expect(first?.dropoffRoute).toMatchObject({
    source: "geo_route",
    leg: "dropoff",
    provider: "existing-road-provider",
    assignmentId: f.assignment.assignmentId,
    assignmentVersion: 1,
    taskId: f.task.taskId,
    locationRecordedAt: f.position.recordedAt,
    remainingDistanceMeters: 1200,
    remainingDurationSeconds: 180,
    generatedAt: new Date(NOW).toISOString(),
  });
  expect(second).toEqual(first);
  expect(first?.pickupEta).toBeNull();
  expect(f.assignment.routeFare.estimatedDistanceMeters).toBe(4000);
  expect(f.assignment).toEqual(original);
  await vi.advanceTimersByTimeAsync(3000);
  expect((await f.read())?.dropoffRoute).toEqual(first?.dropoffRoute);
  expect(f.route).toHaveBeenCalledTimes(1);
  f.position.recordedAt = new Date(Date.now()).toISOString();
  f.position.lat += 0.001;
  f.route.mockResolvedValue({
    provider: "existing-road-provider",
    distanceMeters: 700,
    durationSeconds: 120,
    generatedAt: f.position.recordedAt,
    encodedPolyline: null,
  });
  expect((await f.read())?.dropoffRoute?.remainingDistanceMeters).toBe(700);
  expect(f.route).toHaveBeenCalledTimes(2);
});

it.each([
  "stale",
  "low_accuracy",
  "old_observation",
  "future_observation",
  "unknown_accuracy",
  "bad_coordinate",
  "missing_dropoff",
  "foreign_driver",
  "foreign_vehicle",
  "foreign_task",
  "task_wrong_order",
  "task_wrong_assignment",
  "task_wrong_driver",
  "task_wrong_vehicle",
  "task_terminal",
] as const)(
  "%s cannot request or fabricate a remaining route",
  async (fault) => {
    const f = setup();
    if (fault === "stale" || fault === "low_accuracy")
      f.current.locationFreshness = fault;
    if (fault === "old_observation")
      f.position.recordedAt = new Date(NOW - 60_000).toISOString();
    if (fault === "future_observation")
      f.position.recordedAt = new Date(NOW + 60_000).toISOString();
    if (fault === "unknown_accuracy") f.position.accuracyM = null;
    if (fault === "bad_coordinate") f.position.lat = NaN;
    if (fault === "missing_dropoff") delete f.order.dropoff.lat;
    if (fault === "foreign_driver") f.position.driverId = "FOREIGN";
    if (fault === "foreign_vehicle") f.current.currentVehicleId = "FOREIGN";
    if (fault === "foreign_task") f.current.currentTaskId = "FOREIGN";
    if (fault === "task_wrong_order") f.task.orderId = "FOREIGN";
    if (fault === "task_wrong_assignment") f.task.assignmentId = "FOREIGN";
    if (fault === "task_wrong_driver") f.task.driverId = "FOREIGN";
    if (fault === "task_wrong_vehicle") f.task.vehicleId = "FOREIGN";
    if (fault === "task_terminal") f.task.status = "completed";
    expect((await f.read())?.dropoffRoute).toBeNull();
    expect(f.route).not.toHaveBeenCalled();
  },
);

it.each([
  "gps",
  "assignment",
  "destination",
  "completed",
  "cancelled",
  "task",
] as const)(
  "a late provider response cannot survive a newer %s authority",
  async (change) => {
    const f = setup();
    let resolve!: (value: GeoRouteResponse) => void;
    f.route.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = f.read();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.route).toHaveBeenCalledTimes(1);
    if (change === "gps")
      f.position.recordedAt = new Date(NOW + 1).toISOString();
    if (change === "assignment") f.assignment.assignmentVersion++;
    if (change === "destination") f.order.dropoff.lat = 25.2;
    if (change === "completed" || change === "cancelled") {
      f.memory.orders[0]!.status = change;
    }
    if (change === "task") f.task.status = "completed";
    resolve({
      provider: "existing-road-provider",
      distanceMeters: 1200,
      durationSeconds: 180,
      generatedAt: new Date(NOW).toISOString(),
      encodedPolyline: null,
    });
    expect((await pending)?.dropoffRoute).toBeNull();
  },
);

it.each([
  "rejected",
  "nan_distance",
  "negative_duration",
  "invalid_generation",
] as const)(
  "%s provider output leaves the order readable with no invented estimate",
  async (fault) => {
    const f = setup();
    if (fault === "rejected")
      f.route.mockRejectedValue(new Error("provider unavailable"));
    else
      f.route.mockResolvedValue({
        provider: "existing-road-provider",
        distanceMeters: fault === "nan_distance" ? NaN : 1200,
        durationSeconds: fault === "negative_duration" ? -1 : 180,
        generatedAt:
          fault === "invalid_generation"
            ? "invalid"
            : new Date(NOW).toISOString(),
        encodedPolyline: null,
      });
    expect((await f.read())?.dropoffRoute).toBeNull();
    expect(f.order.status).toBe("on_trip");
    await f.read();
    expect(f.route).toHaveBeenCalledTimes(1);
  },
);

it("provider waits, pending work and cache memory stay bounded", async () => {
  const f = setup();
  f.route.mockImplementation(() => new Promise(() => {}));
  const first = f.read();
  await vi.advanceTimersByTimeAsync(2500);
  expect((await first)?.dropoffRoute).toBeNull();
  for (let index = 1; index <= 12; index++) {
    f.position.lat = 25 + index / 1000;
    const pending = f.read();
    await vi.advanceTimersByTimeAsync(2500);
    expect((await pending)?.dropoffRoute).toBeNull();
  }
  expect(f.route).toHaveBeenCalledTimes(8);
  const cache = (
    f.service as unknown as { passengerDropoffRoutes: Map<string, unknown> }
  ).passengerDropoffRoutes;
  expect(cache.size).toBeLessThanOrEqual(128);
});

it("the actual account SSE emits new route metrics/generation even with unchanged GPS and minutes", async () => {
  const f = setup();
  const service = new MultiTaxiService(f.service);
  const events: any[] = [];
  const subscription = service
    .streamTrustedPassengerEvents(f.order.orderId, "test-owner")
    .subscribe((event) => events.push(event.data));
  try {
    await vi.advanceTimersByTimeAsync(1);
    expect(events).toHaveLength(1);
    expect(events[0]?.data.tracking.dropoffRoute.remainingDistanceMeters).toBe(
      1200,
    );
    await vi.advanceTimersByTimeAsync(26_999);
    f.route.mockResolvedValue({
      provider: "existing-road-provider",
      distanceMeters: 1100,
      durationSeconds: 180,
      generatedAt: new Date(Date.now()).toISOString(),
      encodedPolyline: null,
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      eventType: "eta_changed",
      assignmentVersion: 1,
      data: { tracking: { dropoffRoute: { remainingDistanceMeters: 1100 } } },
    });
    expect(events[1].eventVersion).toBeGreaterThan(events[0].eventVersion);
  } finally {
    subscription.unsubscribe();
  }
});

it("the bounded cache evicts older observations without reusing a foreign route", async () => {
  const f = setup();
  const original = { ...f.position };
  for (let index = 0; index < 130; index++) {
    f.position.lat = 25 + index / 10000;
    f.position.recordedAt = new Date(NOW + index).toISOString();
    expect((await f.read())?.dropoffRoute?.origin.lat).toBe(f.position.lat);
  }
  expect(f.route).toHaveBeenCalledTimes(130);
  Object.assign(f.position, original);
  expect((await f.read())?.dropoffRoute?.origin.lat).toBe(original.lat);
  expect(f.route).toHaveBeenCalledTimes(131);
});
