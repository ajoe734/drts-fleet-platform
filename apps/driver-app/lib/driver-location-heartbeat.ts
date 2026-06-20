import * as SecureStore from "expo-secure-store";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import type { TaskManagerTaskBody } from "expo-task-manager";

import { getDriverClient } from "@/lib/api-client";

const DRIVER_LOCATION_TASK_NAME = "drts-driver-location-heartbeat";
const DRIVER_HEARTBEAT_DEVICE_ID_KEY = "drts.driver.heartbeatDeviceId";
const DRIVER_HEARTBEAT_SEQUENCE_KEY = "drts.driver.heartbeatSequence";

export type DriverHeartbeatWorkState =
  | "available"
  | "assigned"
  | "enroute"
  | "arrived"
  | "on_trip"
  | "incident";

export type DriverHeartbeatSyncContext = {
  driverId: string;
  taskId: string | null;
  workState: DriverHeartbeatWorkState;
};

type HeartbeatLocationUpdate = {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  recordedAt: string;
};

type HeartbeatListener = (update: HeartbeatLocationUpdate) => void;

type HeartbeatSyncResult = {
  status: "idle" | "active" | "permission_denied" | "error";
  message: string | null;
  latestUpdate: HeartbeatLocationUpdate | null;
};

type HeartbeatTransportMode = "none" | "foreground" | "background";

type HeartbeatCadence = {
  distanceIntervalM: number;
  foregroundTimeIntervalMs: number;
  backgroundTimeIntervalMs: number;
};

const HEARTBEAT_CADENCE: Record<DriverHeartbeatWorkState, HeartbeatCadence> = {
  available: {
    distanceIntervalM: 100,
    foregroundTimeIntervalMs: 30_000,
    backgroundTimeIntervalMs: 30_000,
  },
  assigned: {
    distanceIntervalM: 25,
    foregroundTimeIntervalMs: 15_000,
    backgroundTimeIntervalMs: 15_000,
  },
  enroute: {
    distanceIntervalM: 25,
    foregroundTimeIntervalMs: 10_000,
    backgroundTimeIntervalMs: 10_000,
  },
  arrived: {
    distanceIntervalM: 0,
    foregroundTimeIntervalMs: 15_000,
    backgroundTimeIntervalMs: 15_000,
  },
  on_trip: {
    distanceIntervalM: 25,
    foregroundTimeIntervalMs: 10_000,
    backgroundTimeIntervalMs: 10_000,
  },
  incident: {
    distanceIntervalM: 10,
    foregroundTimeIntervalMs: 5_000,
    backgroundTimeIntervalMs: 5_000,
  },
};

const listeners = new Set<HeartbeatListener>();

let activeContext: DriverHeartbeatSyncContext | null = null;
let latestUpdate: HeartbeatLocationUpdate | null = null;
let heartbeatQueue = Promise.resolve();
let foregroundLocationSubscription: Location.LocationSubscription | null = null;
let transportMode: HeartbeatTransportMode = "none";
let lastHeartbeatQueuedAtMs: number | null = null;
let currentCadence: HeartbeatCadence | null = null;
let heartbeatDeviceIdPromise: Promise<string> | null = null;
let heartbeatSequencePromise: Promise<number> = Promise.resolve(0);

function emitLocationUpdate(update: HeartbeatLocationUpdate) {
  latestUpdate = update;

  for (const listener of listeners) {
    listener(update);
  }
}

function toHeartbeatLocationUpdate(
  location: Location.LocationObject,
): HeartbeatLocationUpdate {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracyM:
      typeof location.coords.accuracy === "number"
        ? location.coords.accuracy
        : null,
    recordedAt: location.timestamp
      ? new Date(location.timestamp).toISOString()
      : new Date().toISOString(),
  };
}

function getHeartbeatRecordedAtMs(update: HeartbeatLocationUpdate): number {
  const parsed = Date.parse(update.recordedAt);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function queueHeartbeat(
  update: HeartbeatLocationUpdate,
  source: Exclude<HeartbeatTransportMode, "none">,
) {
  if (transportMode !== source || activeContext === null || currentCadence === null) {
    return;
  }

  const recordedAtMs = getHeartbeatRecordedAtMs(update);
  if (
    lastHeartbeatQueuedAtMs !== null &&
    recordedAtMs - lastHeartbeatQueuedAtMs <
      currentCadence.backgroundTimeIntervalMs
  ) {
    return;
  }

  lastHeartbeatQueuedAtMs = recordedAtMs;
  const context = activeContext;
  heartbeatQueue = heartbeatQueue
    .catch(() => undefined)
    .then(async () => {
      if (!context) {
        return;
      }

      const client = getDriverClient();
      const deviceId = await getHeartbeatDeviceId();
      const sequenceNo = await getNextHeartbeatSequenceNo();

      await client.recordDriverLocationBatch({
        items: [
          {
            eventId: `${deviceId}:${sequenceNo}`,
            deviceId,
            driverId: context.driverId,
            vehicleId: null,
            taskId: context.taskId,
            sequenceNo,
            recordedAt: update.recordedAt,
            lat: update.latitude,
            lng: update.longitude,
            accuracyM: update.accuracyM,
            workState: context.workState,
            appState: source === "background" ? "background" : "foreground",
            transportMode: source,
            networkType: "unknown",
          },
        ],
      });
    })
    .catch((error: unknown) => {
      console.error("Driver location heartbeat failed", error);
    });
}

function stopForegroundLocationSubscription() {
  foregroundLocationSubscription?.remove();
  foregroundLocationSubscription = null;
}

function createLocalId(prefix: string): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getCadenceForContext(
  context: DriverHeartbeatSyncContext,
): HeartbeatCadence {
  return HEARTBEAT_CADENCE[context.workState];
}

async function getHeartbeatDeviceId(): Promise<string> {
  if (!heartbeatDeviceIdPromise) {
    heartbeatDeviceIdPromise = (async () => {
      const existing = await SecureStore.getItemAsync(
        DRIVER_HEARTBEAT_DEVICE_ID_KEY,
      );
      if (existing?.trim()) {
        return existing;
      }

      const created = createLocalId("heartbeat-device");
      await SecureStore.setItemAsync(DRIVER_HEARTBEAT_DEVICE_ID_KEY, created);
      return created;
    })();
  }

  return heartbeatDeviceIdPromise;
}

async function getNextHeartbeatSequenceNo(): Promise<number> {
  heartbeatSequencePromise = heartbeatSequencePromise.then(async () => {
    const raw = await SecureStore.getItemAsync(DRIVER_HEARTBEAT_SEQUENCE_KEY);
    const current = raw ? Number.parseInt(raw, 10) : 0;
    const next = Number.isFinite(current) ? current + 1 : 1;
    await SecureStore.setItemAsync(
      DRIVER_HEARTBEAT_SEQUENCE_KEY,
      String(next),
    );
    return next;
  });

  return heartbeatSequencePromise;
}

if (!TaskManager.isTaskDefined(DRIVER_LOCATION_TASK_NAME)) {
  TaskManager.defineTask<{
    locations?: Location.LocationObject[];
  }>(
    DRIVER_LOCATION_TASK_NAME,
    async ({
      data,
      error,
    }: TaskManagerTaskBody<{
      locations?: Location.LocationObject[];
    }>) => {
      if (error) {
        console.error("Driver location task error", error.message);
        return;
      }

      const taskLocations = data?.locations;
      if (!taskLocations || taskLocations.length === 0) {
        return;
      }

      const update = toHeartbeatLocationUpdate(
        taskLocations[taskLocations.length - 1],
      );
      emitLocationUpdate(update);
      queueHeartbeat(update, "background");
    },
  );
}

export function initializeDriverLocationHeartbeat() {
  return DRIVER_LOCATION_TASK_NAME;
}

export function getLatestDriverLocationUpdate(): HeartbeatLocationUpdate | null {
  return latestUpdate;
}

export function subscribeToDriverLocationUpdates(
  listener: HeartbeatListener,
): () => void {
  listeners.add(listener);

  if (latestUpdate) {
    listener(latestUpdate);
  }

  return () => {
    listeners.delete(listener);
  };
}

async function ensureLocationPermissions(): Promise<HeartbeatSyncResult> {
  const foregroundPermission =
    await Location.getForegroundPermissionsAsync().catch(() => null);

  const foregroundGranted = foregroundPermission?.granted
    ? true
    : (await Location.requestForegroundPermissionsAsync()).granted;

  if (!foregroundGranted) {
    return {
      status: "permission_denied",
      message:
        "Foreground location access is required to start trip tracking and driver heartbeat updates.",
      latestUpdate,
    };
  }

  const backgroundPermission =
    await Location.getBackgroundPermissionsAsync().catch(() => null);

  const backgroundGranted = backgroundPermission?.granted
    ? true
    : (await Location.requestBackgroundPermissionsAsync()).granted;

  if (!backgroundGranted) {
    return {
      status: "active",
      message:
        "Foreground trip tracking is active. Allow background location if you want heartbeats to continue while the app is backgrounded.",
      latestUpdate,
    };
  }

  return {
    status: "active",
    message: null,
    latestUpdate,
  };
}

async function seedLatestLocation() {
  const knownLocation = await Location.getLastKnownPositionAsync({
    maxAge: currentCadence?.backgroundTimeIntervalMs ?? 15_000,
    requiredAccuracy: 100,
  }).catch(() => null);

  if (knownLocation) {
    emitLocationUpdate(toHeartbeatLocationUpdate(knownLocation));
    return;
  }

  const currentLocation = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  }).catch(() => null);

  if (currentLocation) {
    emitLocationUpdate(toHeartbeatLocationUpdate(currentLocation));
  }
}

export async function stopDriverLocationHeartbeat(): Promise<void> {
  activeContext = null;
  currentCadence = null;
  transportMode = "none";
  lastHeartbeatQueuedAtMs = null;
  stopForegroundLocationSubscription();

  const started = await Location.hasStartedLocationUpdatesAsync(
    DRIVER_LOCATION_TASK_NAME,
  ).catch(() => false);

  if (started) {
    await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK_NAME);
  }
}

export async function syncDriverLocationHeartbeat(
  context: DriverHeartbeatSyncContext | null,
): Promise<HeartbeatSyncResult> {
  if (!context) {
    await stopDriverLocationHeartbeat();
    return {
      status: "idle",
      message: null,
      latestUpdate,
    };
  }

  const permissionResult = await ensureLocationPermissions();
  if (permissionResult.status === "permission_denied") {
    transportMode = "none";
    activeContext = null;
    currentCadence = null;
    stopForegroundLocationSubscription();
    return permissionResult;
  }

  const nextCadence = getCadenceForContext(context);
  const nextTransportMode =
    permissionResult.message === null ? "background" : "foreground";
  const contextChanged =
    activeContext?.taskId !== context.taskId ||
    activeContext?.driverId !== context.driverId ||
    activeContext?.workState !== context.workState;
  const cadenceChanged =
    currentCadence?.distanceIntervalM !== nextCadence.distanceIntervalM ||
    currentCadence?.foregroundTimeIntervalMs !==
      nextCadence.foregroundTimeIntervalMs ||
    currentCadence?.backgroundTimeIntervalMs !==
      nextCadence.backgroundTimeIntervalMs;

  if (contextChanged || transportMode !== nextTransportMode || cadenceChanged) {
    lastHeartbeatQueuedAtMs = null;
  }
  activeContext = context;
  currentCadence = nextCadence;
  transportMode = nextTransportMode;
  stopForegroundLocationSubscription();

  const started = await Location.hasStartedLocationUpdatesAsync(
    DRIVER_LOCATION_TASK_NAME,
  ).catch(() => false);

  if (started) {
    await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK_NAME).catch(
      () => undefined,
    );
  }

  foregroundLocationSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: nextCadence.distanceIntervalM,
      timeInterval: nextCadence.foregroundTimeIntervalMs,
    },
    (position) => {
      const update = toHeartbeatLocationUpdate(position);
      emitLocationUpdate(update);
      queueHeartbeat(update, "foreground");
    },
  );

  if (permissionResult.message === null) {
    await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      activityType: Location.ActivityType.AutomotiveNavigation,
      deferredUpdatesInterval: nextCadence.backgroundTimeIntervalMs,
      distanceInterval: nextCadence.distanceIntervalM,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      timeInterval: nextCadence.backgroundTimeIntervalMs,
      foregroundService: {
        notificationTitle:
          context.workState === "available"
            ? "Driver availability tracking active"
            : "Trip tracking active",
        notificationBody:
          context.workState === "available"
            ? "DRTS is sharing background location while you are online and available for dispatch."
            : "DRTS is sending driver location heartbeats for the active trip.",
        killServiceOnDestroy: false,
      },
    });
  }

  if (permissionResult.message !== null && started) {
    await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK_NAME).catch(
      () => undefined,
    );
  }

  await seedLatestLocation();

  return {
    status: "active",
    message: permissionResult.message,
    latestUpdate,
  };
}

export function getActiveDriverHeartbeatTaskId(): string | null {
  return activeContext?.taskId ?? null;
}
