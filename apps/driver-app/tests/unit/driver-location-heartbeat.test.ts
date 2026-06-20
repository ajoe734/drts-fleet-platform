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

const recordDriverLocation = vi.fn();
const recordDriverLocationBatch = vi.fn();
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
const getItemAsync = vi.fn();
const setItemAsync = vi.fn();
const secureStoreState = new Map<string, string>();

let watchCallback: LocationCallback | null = null;
let taskHandler: TaskHandler | null = null;
let taskDefined = false;

vi.mock("@/lib/api-client", () => ({
  getDriverClient: () => ({
    recordDriverLocation,
    recordDriverLocationBatch,
  }),
  getDriverId: () => "driver-001",
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync,
  setItemAsync,
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
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  taskDefined = false;
  taskHandler = null;
  watchCallback = null;
  secureStoreState.clear();
  secureStoreState.set("drts.driver.heartbeatDeviceId", "heartbeat-device-001");
  secureStoreState.set("drts.driver.heartbeatSequence", "0");

  vi.resetModules();
  vi.clearAllMocks();

  watchPositionAsync.mockImplementation(async (_options, callback) => {
    watchCallback = callback;
    return {
      remove: removeSubscription,
    };
  });
  getForegroundPermissionsAsync.mockResolvedValue({ granted: true });
  requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
  getBackgroundPermissionsAsync.mockResolvedValue({ granted: true });
  requestBackgroundPermissionsAsync.mockResolvedValue({ granted: true });
  hasStartedLocationUpdatesAsync.mockResolvedValue(false);
  startLocationUpdatesAsync.mockResolvedValue(undefined);
  stopLocationUpdatesAsync.mockResolvedValue(undefined);
  getLastKnownPositionAsync.mockResolvedValue(null);
  getCurrentPositionAsync.mockResolvedValue(null);
  getItemAsync.mockImplementation(async (key: string) =>
    secureStoreState.get(key) ?? null,
  );
  setItemAsync.mockImplementation(async (key: string, value: string) => {
    secureStoreState.set(key, value);
  });
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
      driverId: "driver-001",
      taskId: "task-001",
      workState: "on_trip",
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
    expect(recordDriverLocationBatch).not.toHaveBeenCalled();

    await taskHandler?.({
      data: {
        locations: [createLocation(16_000)],
      },
    });
    await flushHeartbeatQueue();

    expect(recordDriverLocationBatch).toHaveBeenCalledTimes(1);
    expect(recordDriverLocationBatch).toHaveBeenCalledWith({
      items: [
        expect.objectContaining({
          driverId: "driver-001",
          taskId: "task-001",
          lat: 25.033,
          lng: 121.5654,
          accuracyM: 8,
          recordedAt: new Date(16_000).toISOString(),
          workState: "on_trip",
          transportMode: "background",
        }),
      ],
    });
  });

  it("uses a throttled foreground fallback when background permission is unavailable", async () => {
    getBackgroundPermissionsAsync.mockResolvedValue({ granted: false });
    requestBackgroundPermissionsAsync.mockResolvedValue({ granted: false });

    const heartbeatModule = await import("../../lib/driver-location-heartbeat");

    const result = await heartbeatModule.syncDriverLocationHeartbeat({
      driverId: "driver-001",
      taskId: "task-001",
      workState: "on_trip",
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

    expect(recordDriverLocationBatch).toHaveBeenCalledTimes(2);
    expect(recordDriverLocationBatch).toHaveBeenNthCalledWith(1, {
      items: [
        expect.objectContaining({
          driverId: "driver-001",
          taskId: "task-001",
          lat: 25.033,
          lng: 121.5654,
          accuracyM: 8,
          recordedAt: new Date(1_000).toISOString(),
          workState: "on_trip",
          transportMode: "foreground",
        }),
      ],
    });
    expect(recordDriverLocationBatch).toHaveBeenNthCalledWith(2, {
      items: [
        expect.objectContaining({
          driverId: "driver-001",
          taskId: "task-001",
          lat: 25.034,
          lng: 121.5655,
          accuracyM: 8,
          recordedAt: new Date(11_000).toISOString(),
          workState: "on_trip",
          transportMode: "foreground",
        }),
      ],
    });
  });

  it("uses the online-available cadence when no active task exists but the driver is on shift", async () => {
    const heartbeatModule = await import("../../lib/driver-location-heartbeat");

    await heartbeatModule.syncDriverLocationHeartbeat({
      driverId: "driver-001",
      taskId: null,
      workState: "available",
    });

    expect(watchPositionAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        distanceInterval: 100,
        timeInterval: 30_000,
      }),
      expect.any(Function),
    );
    expect(startLocationUpdatesAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        distanceInterval: 100,
        timeInterval: 30_000,
        foregroundService: expect.objectContaining({
          notificationTitle: "Driver availability tracking active",
        }),
      }),
    );
  });
});
