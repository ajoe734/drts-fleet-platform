import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockLocationObject = {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
  };
  timestamp: number;
};

type LocationCallback = (location: MockLocationObject) => void;
type TaskHandler = (body: {
  data?: { locations?: MockLocationObject[] };
  error?: { message: string };
}) => Promise<void> | void;

const watchPositionAsync = vi.fn();
const removeSubscription = vi.fn();
const getForegroundPermissionsAsync = vi.fn();
const requestForegroundPermissionsAsync = vi.fn();
const getBackgroundPermissionsAsync = vi.fn();
const requestBackgroundPermissionsAsync = vi.fn();
const hasStartedLocationUpdatesAsync = vi.fn();
const startLocationUpdatesAsync = vi.fn();
const stopLocationUpdatesAsync = vi.fn();
const getLastKnownPositionAsync = vi.fn();
const getCurrentPositionAsync = vi.fn();
const enqueueDriverLocationEvent = vi.fn();
const flushDriverLocationQueue = vi.fn();
const initializeDriverLocationOfflineQueue = vi.fn();
const recordTrackingHeartbeat = vi.fn();
const clearTrackingSession = vi.fn();

let watchCallback: LocationCallback | null = null;
let taskHandler: TaskHandler | null = null;
let taskDefined = false;

vi.mock("@/lib/driver-location-offline-queue", () => ({
  enqueueDriverLocationEvent,
  flushDriverLocationQueue,
  initializeDriverLocationOfflineQueue,
}));

vi.mock("@/lib/driver-tracking-recovery", () => ({
  recordTrackingHeartbeat,
  clearTrackingSession,
}));

function createEnvelope(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    eventId: "device-001:1",
    deviceId: "device-001",
    driverId: "driver-001",
    vehicleId: null,
    taskId: "task-001",
    sequenceNo: 1,
    recordedAt: new Date(16_000).toISOString(),
    lat: 25.033,
    lng: 121.5654,
    accuracyM: 8,
    workState: "on_trip",
    appState: "background",
    transportMode: "background",
    networkType: "unknown",
    ...overrides,
  };
}

vi.mock("expo-location", () => ({
  Accuracy: {
    Balanced: "balanced",
  },
  ActivityType: {
    AutomotiveNavigation: "automotive-navigation",
  },
  getForegroundPermissionsAsync,
  requestForegroundPermissionsAsync,
  getBackgroundPermissionsAsync,
  requestBackgroundPermissionsAsync,
  hasStartedLocationUpdatesAsync,
  startLocationUpdatesAsync,
  stopLocationUpdatesAsync,
  getLastKnownPositionAsync,
  getCurrentPositionAsync,
  watchPositionAsync,
}));

vi.mock("expo-task-manager", () => ({
  isTaskDefined: vi.fn(() => taskDefined),
  defineTask: vi.fn((name: string, handler: TaskHandler) => {
    taskDefined = true;
    taskHandler = handler;
  }),
}));

function createLocation(
  timestamp: number,
  latitude = 25.033,
  longitude = 121.5654,
): MockLocationObject {
  return {
    coords: {
      latitude,
      longitude,
      accuracy: 8,
    },
    timestamp,
  };
}

async function flushHeartbeatQueue() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  taskDefined = false;
  taskHandler = null;
  watchCallback = null;

  vi.resetModules();
  vi.clearAllMocks();

  watchPositionAsync.mockImplementation(async (_options, callback) => {
    watchCallback = callback;
    return {
      remove: removeSubscription,
    };
  });
  enqueueDriverLocationEvent.mockImplementation(async (draft) =>
    createEnvelope({
      taskId: draft.taskId ?? null,
      recordedAt: draft.recordedAt,
      lat: draft.lat,
      lng: draft.lng,
      accuracyM: draft.accuracyM,
      workState: draft.workState,
      appState: draft.appState,
      transportMode: draft.transportMode,
    }),
  );
  flushDriverLocationQueue.mockResolvedValue(undefined);
  initializeDriverLocationOfflineQueue.mockResolvedValue(undefined);
  recordTrackingHeartbeat.mockResolvedValue(undefined);
  clearTrackingSession.mockResolvedValue(undefined);
  getForegroundPermissionsAsync.mockResolvedValue({ granted: true });
  requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
  getBackgroundPermissionsAsync.mockResolvedValue({ granted: true });
  requestBackgroundPermissionsAsync.mockResolvedValue({ granted: true });
  hasStartedLocationUpdatesAsync.mockResolvedValue(false);
  startLocationUpdatesAsync.mockResolvedValue(undefined);
  stopLocationUpdatesAsync.mockResolvedValue(undefined);
  getLastKnownPositionAsync.mockResolvedValue(null);
  getCurrentPositionAsync.mockResolvedValue(null);
});

afterEach(async () => {
  if (taskDefined) {
    const heartbeatModule = await import("../../lib/driver-location-heartbeat");
    await heartbeatModule.stopDriverLocationHeartbeat();
  }
});

describe("driver location heartbeat transport", () => {
  it("keeps foreground updates for trip metrics while background transport owns heartbeats", async () => {
    const heartbeatModule = await import("../../lib/driver-location-heartbeat");

    const listener = vi.fn();
    heartbeatModule.subscribeToDriverLocationUpdates(listener);

    await heartbeatModule.syncDriverLocationHeartbeat({
      taskId: "task-001",
      driverId: "driver-001",
    });

    expect(taskHandler).not.toBeNull();
    expect(watchCallback).not.toBeNull();

    watchCallback?.(createLocation(1_000));
    await flushHeartbeatQueue();

    expect(listener).toHaveBeenCalledWith({
      latitude: 25.033,
      longitude: 121.5654,
      accuracyM: 8,
      recordedAt: new Date(1_000).toISOString(),
    });
    expect(enqueueDriverLocationEvent).not.toHaveBeenCalled();

    await taskHandler?.({
      data: {
        locations: [createLocation(16_000)],
      },
    });
    await flushHeartbeatQueue();

    expect(enqueueDriverLocationEvent).toHaveBeenCalledTimes(1);
    expect(enqueueDriverLocationEvent).toHaveBeenCalledWith({
      taskId: "task-001",
      lat: 25.033,
      lng: 121.5654,
      recordedAt: new Date(16_000).toISOString(),
      accuracyM: 8,
      workState: "on_trip",
      appState: "background",
      transportMode: "background",
      networkType: "unknown",
      preserveKeyEvent: false,
    });
  });

  it("uses a throttled foreground fallback when background permission is unavailable", async () => {
    getBackgroundPermissionsAsync.mockResolvedValue({ granted: false });
    requestBackgroundPermissionsAsync.mockResolvedValue({ granted: false });

    const heartbeatModule = await import("../../lib/driver-location-heartbeat");

    const result = await heartbeatModule.syncDriverLocationHeartbeat({
      taskId: "task-001",
      driverId: "driver-001",
    });

    expect(result).toMatchObject({
      status: "active",
      message:
        "Foreground trip tracking is active. Allow background location if you want heartbeats to continue while the app is backgrounded.",
    });
    expect(startLocationUpdatesAsync).not.toHaveBeenCalled();
    expect(watchCallback).not.toBeNull();

    watchCallback?.(createLocation(1_000));
    await flushHeartbeatQueue();
    watchCallback?.(createLocation(11_000, 25.034, 121.5655));
    await flushHeartbeatQueue();
    watchCallback?.(createLocation(16_500, 25.035, 121.5656));
    await flushHeartbeatQueue();

    expect(enqueueDriverLocationEvent).toHaveBeenCalledTimes(2);
    expect(enqueueDriverLocationEvent).toHaveBeenNthCalledWith(1, {
      taskId: "task-001",
      lat: 25.033,
      lng: 121.5654,
      recordedAt: new Date(1_000).toISOString(),
      accuracyM: 8,
      workState: "on_trip",
      appState: "foreground",
      transportMode: "foreground",
      networkType: "unknown",
      preserveKeyEvent: false,
    });
    expect(enqueueDriverLocationEvent).toHaveBeenNthCalledWith(2, {
      taskId: "task-001",
      lat: 25.035,
      lng: 121.5656,
      recordedAt: new Date(16_500).toISOString(),
      accuracyM: 8,
      workState: "on_trip",
      appState: "foreground",
      transportMode: "foreground",
      networkType: "unknown",
      preserveKeyEvent: false,
    });
  });

  it("persists the restart-recovery marker per heartbeat and clears it on a clean stop", async () => {
    const heartbeatModule = await import("../../lib/driver-location-heartbeat");

    await heartbeatModule.syncDriverLocationHeartbeat({
      taskId: "task-001",
      driverId: "driver-001",
    });

    await taskHandler?.({
      data: {
        locations: [createLocation(16_000)],
      },
    });
    await flushHeartbeatQueue();

    expect(recordTrackingHeartbeat).toHaveBeenCalledWith({
      taskId: "task-001",
      driverId: "driver-001",
      vehicleId: null,
      workState: "on_trip",
      recordedAt: new Date(16_000).toISOString(),
      sequenceNo: 1,
    });

    await heartbeatModule.stopDriverLocationHeartbeat();
    expect(clearTrackingSession).toHaveBeenCalledTimes(1);
  });
});
