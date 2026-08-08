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

let watchCallback: LocationCallback | null = null;
let taskHandler: TaskHandler | null = null;
let taskDefined = false;

vi.mock("@/lib/driver-location-offline-queue", () => ({
  enqueueDriverLocationEvent,
  flushDriverLocationQueue,
  initializeDriverLocationOfflineQueue,
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}));

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {},
    },
  },
}));

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
  enqueueDriverLocationEvent.mockResolvedValue(undefined);
  flushDriverLocationQueue.mockResolvedValue(undefined);
  initializeDriverLocationOfflineQueue.mockResolvedValue(undefined);
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

  it("keeps active trip heartbeat running after external navigation handoff", async () => {
    const heartbeatModule = await import("../../lib/driver-location-heartbeat");
    const navigationModule = await import("../../lib/driver-navigation");
    const openURL = vi.fn().mockResolvedValue(undefined);

    await heartbeatModule.syncDriverLocationHeartbeat({
      taskId: "task-001",
      driverId: "driver-001",
      status: "on_trip",
    });

    const navigationResult = await navigationModule.openDriverNavigation({
      stop: {
        label: "上車點",
        coordinate: {
          latitude: 25.0478,
          longitude: 121.517,
        },
      },
      provider: "system",
      platform: "android",
      linking: {
        canOpenURL: vi.fn().mockResolvedValue(true),
        openURL,
      },
    });

    expect(navigationResult).toMatchObject({
      status: "opened",
      provider: "system",
    });
    expect(openURL).toHaveBeenCalledWith(
      "google.navigation:q=25.0478,121.517&mode=d",
    );
    expect(heartbeatModule.getActiveDriverHeartbeatTaskId()).toBe("task-001");
    expect(heartbeatModule.getActiveDriverHeartbeatWorkState()).toBe("on_trip");

    await taskHandler?.({
      data: {
        locations: [createLocation(16_000)],
      },
    });
    await flushHeartbeatQueue();

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

    // Stationary coordinates isolate the on_trip time throttle (15s): the
    // second fire is dropped, the third clears the interval. (A moving driver
    // would also emit on the 25m distance trigger — see the cadence tests.)
    watchCallback?.(createLocation(1_000));
    await flushHeartbeatQueue();
    watchCallback?.(createLocation(11_000));
    await flushHeartbeatQueue();
    watchCallback?.(createLocation(16_500));
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
      lat: 25.033,
      lng: 121.5654,
      recordedAt: new Date(16_500).toISOString(),
      accuracyM: 8,
      workState: "on_trip",
      appState: "foreground",
      transportMode: "foreground",
      networkType: "unknown",
      preserveKeyEvent: false,
    });
  });
});

describe("driver online_available continuous tracking", () => {
  it("emits background heartbeats at the 30s / 100m online_available cadence", async () => {
    const heartbeatModule = await import("../../lib/driver-location-heartbeat");

    const result = await heartbeatModule.syncDriverOnlineAvailableHeartbeat();

    expect(result.status).toBe("active");
    expect(heartbeatModule.getActiveDriverHeartbeatWorkState()).toBe(
      "available",
    );
    expect(heartbeatModule.getActiveDriverHeartbeatTaskId()).toBeNull();
    expect(startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
    expect(taskHandler).not.toBeNull();

    // t=1s emits immediately.
    await taskHandler?.({ data: { locations: [createLocation(1_000)] } });
    await flushHeartbeatQueue();
    // t=21s dropped (< 30s later, no 100m move).
    await taskHandler?.({ data: { locations: [createLocation(21_000)] } });
    await flushHeartbeatQueue();
    // t=31s clears the 30s interval.
    await taskHandler?.({ data: { locations: [createLocation(31_000)] } });
    await flushHeartbeatQueue();
    // t=36s is only 5s later but moved ~167m (> 100m): distance trigger emits.
    await taskHandler?.({
      data: { locations: [createLocation(36_000, 25.0345, 121.5654)] },
    });
    await flushHeartbeatQueue();

    const availabilityCalls = enqueueDriverLocationEvent.mock.calls.filter(
      ([event]) => !event.preserveKeyEvent,
    );
    expect(availabilityCalls).toHaveLength(3);
    expect(availabilityCalls[0][0]).toMatchObject({
      taskId: null,
      lat: 25.033,
      lng: 121.5654,
      recordedAt: new Date(1_000).toISOString(),
      workState: "available",
      appState: "background",
      transportMode: "background",
    });
    expect(availabilityCalls[1][0]).toMatchObject({
      recordedAt: new Date(31_000).toISOString(),
      workState: "available",
    });
    expect(availabilityCalls[2][0]).toMatchObject({
      lat: 25.0345,
      recordedAt: new Date(36_000).toISOString(),
      workState: "available",
    });
  });

  it("blocks online_available when background permission is denied", async () => {
    getBackgroundPermissionsAsync.mockResolvedValue({ granted: false });
    requestBackgroundPermissionsAsync.mockResolvedValue({ granted: false });

    const heartbeatModule = await import("../../lib/driver-location-heartbeat");

    const result = await heartbeatModule.syncDriverOnlineAvailableHeartbeat();

    expect(result.status).toBe("permission_denied");
    expect(result.reason).toBe("BACKGROUND_LOCATION_REQUIRED");
    expect(heartbeatModule.getActiveDriverHeartbeatWorkState()).toBeNull();
    expect(startLocationUpdatesAsync).not.toHaveBeenCalled();
  });
});
