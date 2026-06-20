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

const post = vi.fn();
const recordDriverLocation = vi.fn();
const updateDriverWorkState = vi.fn();
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

let watchCallback: LocationCallback | null = null;
let taskHandler: TaskHandler | null = null;
let taskDefined = false;
let secureStoreValues = new Map<string, string>();

vi.mock("@/lib/api-client", () => ({
  getDriverClient: () => ({
    post,
    recordDriverLocation,
    updateDriverWorkState,
  }),
  getDriverDeviceId: async () => "device-001",
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

vi.mock("expo-secure-store", () => ({
  getItemAsync,
  setItemAsync,
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
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  taskDefined = false;
  taskHandler = null;
  watchCallback = null;
  secureStoreValues = new Map();

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
  post.mockResolvedValue({
    items: [
      {
        eventId: "evt-001",
        accepted: true,
        duplicate: false,
        currentLocationUpdated: true,
        serverReceivedAt: "2026-06-20T12:00:00.000Z",
      },
    ],
  });
  updateDriverWorkState.mockResolvedValue(undefined);
  getItemAsync.mockImplementation(async (key: string) => {
    return secureStoreValues.get(key) ?? null;
  });
  setItemAsync.mockImplementation(async (key: string, value: string) => {
    secureStoreValues.set(key, value);
  });
});

afterEach(async () => {
  if (taskDefined) {
    const heartbeatModule = await import("../../lib/driver-location-heartbeat");
    await heartbeatModule.stopDriverLocationHeartbeat();
  }
});

describe("driver location heartbeat transport", () => {
  it("logs the online available transition with the availability cadence", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const heartbeatModule = await import("../../lib/driver-location-heartbeat");

    await heartbeatModule.syncDriverLocationHeartbeat({
      workState: "online_available",
      taskId: null,
      driverId: "driver-001",
    });
    await flushHeartbeatQueue();

    expect(infoSpy).toHaveBeenCalledWith(
      "Driver heartbeat transition",
      expect.objectContaining({
        workState: "online_available",
        taskId: null,
        transportMode: "background",
        status: "active",
        intervalMs: 30_000,
        distanceM: 100,
      }),
    );
    expect(updateDriverWorkState).toHaveBeenCalledWith("driver-001", {
      workState: "available",
    });
  });

  it("keeps foreground updates for trip metrics while background transport owns heartbeats", async () => {
    const heartbeatModule = await import("../../lib/driver-location-heartbeat");

    const listener = vi.fn();
    heartbeatModule.subscribeToDriverLocationUpdates(listener);

    await heartbeatModule.syncDriverLocationHeartbeat({
      workState: "on_trip",
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
    expect(recordDriverLocation).not.toHaveBeenCalled();

    await taskHandler?.({
      data: {
        locations: [createLocation(16_000)],
      },
    });
    await flushHeartbeatQueue();

    expect(post).toHaveBeenCalledWith(
      "/api/driver/location-heartbeats/batch",
      expect.objectContaining({
        body: {
          items: [
            expect.objectContaining({
              driverId: "driver-001",
              deviceId: "device-001",
              sequenceNo: 1,
              workState: "on_trip",
              taskId: "task-001",
              appState: "background",
              transportMode: "background",
              networkType: "unknown",
              lat: 25.033,
              lng: 121.5654,
            }),
          ],
        },
      }),
    );
    expect(recordDriverLocation).not.toHaveBeenCalled();
  });

  it("uses a throttled foreground fallback when background permission is unavailable", async () => {
    getBackgroundPermissionsAsync.mockResolvedValue({ granted: false });
    requestBackgroundPermissionsAsync.mockResolvedValue({ granted: false });

    const heartbeatModule = await import("../../lib/driver-location-heartbeat");

    const result = await heartbeatModule.syncDriverLocationHeartbeat({
      workState: "on_trip",
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

    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenNthCalledWith(
      1,
      "/api/driver/location-heartbeats/batch",
      expect.objectContaining({
        body: {
          items: [
            expect.objectContaining({
              sequenceNo: 1,
              taskId: "task-001",
              workState: "on_trip",
              appState: "foreground",
              transportMode: "foreground",
              lat: 25.033,
              lng: 121.5654,
            }),
          ],
        },
      }),
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      "/api/driver/location-heartbeats/batch",
      expect.objectContaining({
        body: {
          items: [
            expect.objectContaining({
              sequenceNo: 2,
              taskId: "task-001",
              workState: "on_trip",
              appState: "foreground",
              transportMode: "foreground",
              lat: 25.034,
              lng: 121.5655,
            }),
          ],
        },
      }),
    );
    expect(recordDriverLocation).not.toHaveBeenCalled();
  });

  it("uses the availability cadence for online available tracking", async () => {
    const heartbeatModule = await import("../../lib/driver-location-heartbeat");

    await heartbeatModule.syncDriverLocationHeartbeat({
      workState: "online_available",
      taskId: null,
      driverId: "driver-001",
    });

    expect(watchPositionAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        distanceInterval: 100,
        timeInterval: 30_000,
      }),
      expect.any(Function),
    );
    expect(startLocationUpdatesAsync).toHaveBeenCalledWith(
      "drts-driver-location-heartbeat",
      expect.objectContaining({
        distanceInterval: 100,
        timeInterval: 30_000,
        deferredUpdatesInterval: 30_000,
        foregroundService: expect.objectContaining({
          notificationTitle: "Driver availability active",
        }),
      }),
    );
  });

  it("falls back to the legacy single-heartbeat endpoint when batch ingestion is unavailable", async () => {
    post.mockRejectedValueOnce(
      new Error('API error 404: {"error":{"message":"Not Found"}}'),
    );

    const heartbeatModule = await import("../../lib/driver-location-heartbeat");

    await heartbeatModule.syncDriverLocationHeartbeat({
      workState: "online_available",
      taskId: null,
      driverId: "driver-001",
    });

    await taskHandler?.({
      data: {
        locations: [createLocation(31_000)],
      },
    });
    await flushHeartbeatQueue();

    expect(recordDriverLocation).toHaveBeenCalledWith({
      driverId: "driver-001",
      lat: 25.033,
      lng: 121.5654,
      accuracyM: 8,
      recordedAt: new Date(31_000).toISOString(),
    });
  });

  it("rejects online available tracking when background permission is unavailable", async () => {
    getBackgroundPermissionsAsync.mockResolvedValue({ granted: false });
    requestBackgroundPermissionsAsync.mockResolvedValue({ granted: false });

    const heartbeatModule = await import("../../lib/driver-location-heartbeat");

    const result = await heartbeatModule.syncDriverLocationHeartbeat({
      workState: "online_available",
      taskId: null,
      driverId: "driver-001",
    });
    await flushHeartbeatQueue();

    expect(result).toMatchObject({
      status: "permission_denied",
      message:
        "Background location is required before the driver can stay online and available for dispatch.",
    });
    expect(startLocationUpdatesAsync).not.toHaveBeenCalled();
    expect(updateDriverWorkState).toHaveBeenCalledWith("driver-001", {
      workState: "offline",
    });
  });

  it("uses the incident cadence for emergency tracking", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const heartbeatModule = await import("../../lib/driver-location-heartbeat");

    await heartbeatModule.syncDriverLocationHeartbeat({
      workState: "incident",
      taskId: "incident-001",
      driverId: "driver-001",
    });

    expect(watchPositionAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        distanceInterval: 10,
        timeInterval: 5_000,
      }),
      expect.any(Function),
    );
    expect(startLocationUpdatesAsync).toHaveBeenCalledWith(
      "drts-driver-location-heartbeat",
      expect.objectContaining({
        distanceInterval: 10,
        timeInterval: 5_000,
        deferredUpdatesInterval: 5_000,
        foregroundService: expect.objectContaining({
          notificationTitle: "Emergency tracking active",
        }),
      }),
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "Driver heartbeat transition",
      expect.objectContaining({
        workState: "incident",
        taskId: "incident-001",
        transportMode: "background",
        status: "active",
        intervalMs: 5_000,
        distanceM: 10,
      }),
    );

    await heartbeatModule.stopDriverLocationHeartbeat();
    await flushHeartbeatQueue();

    expect(updateDriverWorkState).toHaveBeenCalledWith("driver-001", {
      workState: "offline",
    });
  });
});
