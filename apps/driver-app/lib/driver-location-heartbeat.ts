import type {
  DriverLocationHeartbeatEnvelope,
  DriverTaskRecord,
} from "@drts/contracts";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import type { TaskManagerTaskBody } from "expo-task-manager";

import {
  enqueueDriverLocationEvent,
  flushDriverLocationQueue,
  initializeDriverLocationOfflineQueue,
} from "@/lib/driver-location-offline-queue";

const DRIVER_LOCATION_TASK_NAME = "drts-driver-location-heartbeat";
const HEARTBEAT_INTERVAL_MS = 15_000;
const TRACKED_TASK_STATUSES = new Set([
  "accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
]);

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
type HeartbeatAssignment = Pick<DriverTaskRecord, "taskId" | "driverId"> & {
  status?: string | null;
};

const listeners = new Set<HeartbeatListener>();

let activeTaskId: string | null = null;
let activeTaskStatus: string | null = null;
let latestUpdate: HeartbeatLocationUpdate | null = null;
let heartbeatQueue = Promise.resolve();
let foregroundLocationSubscription: Location.LocationSubscription | null = null;
let transportMode: HeartbeatTransportMode = "none";
let lastHeartbeatQueuedAtMs: number | null = null;

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

function resolveHeartbeatWorkState(
  taskStatus: string | null,
): DriverLocationHeartbeatEnvelope["workState"] {
  switch (taskStatus) {
    case "accepted":
      return "assigned";
    case "enroute_pickup":
      return "enroute";
    case "arrived_pickup":
      return "arrived";
    case "on_trip":
    case "proof_pending":
      return "on_trip";
    default:
      return "available";
  }
}

function shouldTrackTask(taskStatus: string | null | undefined): boolean {
  return taskStatus != null && TRACKED_TASK_STATUSES.has(taskStatus);
}

function queueHeartbeat(
  update: HeartbeatLocationUpdate,
  source: Exclude<HeartbeatTransportMode, "none">,
  options?: {
    preserveKeyEvent?: boolean;
    workStateOverride?: DriverLocationHeartbeatEnvelope["workState"];
  },
) {
  if (!options?.preserveKeyEvent && transportMode !== source) {
    return;
  }

  const recordedAtMs = getHeartbeatRecordedAtMs(update);
  if (
    !options?.preserveKeyEvent &&
    lastHeartbeatQueuedAtMs !== null &&
    recordedAtMs - lastHeartbeatQueuedAtMs < HEARTBEAT_INTERVAL_MS
  ) {
    return;
  }

  lastHeartbeatQueuedAtMs = recordedAtMs;
  heartbeatQueue = heartbeatQueue
    .catch(() => undefined)
    .then(async () => {
      await enqueueDriverLocationEvent({
        taskId: activeTaskId,
        recordedAt: update.recordedAt,
        lat: update.latitude,
        lng: update.longitude,
        accuracyM: update.accuracyM,
        workState:
          options?.workStateOverride ??
          resolveHeartbeatWorkState(activeTaskStatus),
        appState: source === "background" ? "background" : "foreground",
        transportMode: source,
        networkType: "unknown",
        preserveKeyEvent: options?.preserveKeyEvent ?? false,
      });
      await flushDriverLocationQueue();
    })
    .catch((error: unknown) => {
      console.error("Driver location heartbeat queueing failed", error);
    });
}

function queueStateSnapshot(
  nextTaskStatus: string | null,
  source: Exclude<HeartbeatTransportMode, "none">,
) {
  if (!latestUpdate) {
    return;
  }

  const previousWorkState = resolveHeartbeatWorkState(activeTaskStatus);
  const nextWorkState = resolveHeartbeatWorkState(nextTaskStatus);
  if (previousWorkState === nextWorkState) {
    return;
  }

  queueHeartbeat(latestUpdate, source, {
    preserveKeyEvent: true,
    workStateOverride: nextWorkState,
  });
}

function stopForegroundLocationSubscription() {
  foregroundLocationSubscription?.remove();
  foregroundLocationSubscription = null;
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
  void initializeDriverLocationOfflineQueue();
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
    maxAge: HEARTBEAT_INTERVAL_MS,
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
  if (transportMode !== "none") {
    queueStateSnapshot(
      null,
      transportMode === "background" ? "background" : "foreground",
    );
  }

  activeTaskId = null;
  activeTaskStatus = null;
  transportMode = "none";
  lastHeartbeatQueuedAtMs = null;
  stopForegroundLocationSubscription();

  const started = await Location.hasStartedLocationUpdatesAsync(
    DRIVER_LOCATION_TASK_NAME,
  ).catch(() => false);

  if (started) {
    await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK_NAME);
  }

  await flushDriverLocationQueue();
}

export async function syncDriverLocationHeartbeat(
  task: HeartbeatAssignment | null,
): Promise<HeartbeatSyncResult> {
  const nextTaskStatus = task?.status?.trim() || (task ? "on_trip" : null);
  if (!task || !shouldTrackTask(nextTaskStatus)) {
    await stopDriverLocationHeartbeat();
    return {
      status: "idle",
      message: null,
      latestUpdate,
    };
  }

  await initializeDriverLocationOfflineQueue();

  const permissionResult = await ensureLocationPermissions();
  if (permissionResult.status === "permission_denied") {
    transportMode = "none";
    stopForegroundLocationSubscription();
    return permissionResult;
  }

  const nextTransportMode =
    permissionResult.message === null ? "background" : "foreground";
  const taskChanged =
    activeTaskId !== task.taskId || activeTaskStatus !== nextTaskStatus;
  if (taskChanged || transportMode !== nextTransportMode) {
    lastHeartbeatQueuedAtMs = null;
  }
  if (taskChanged && transportMode !== "none") {
    queueStateSnapshot(nextTaskStatus, transportMode);
  }
  activeTaskId = task.taskId;
  activeTaskStatus = nextTaskStatus;
  transportMode = nextTransportMode;
  stopForegroundLocationSubscription();

  foregroundLocationSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 25,
      timeInterval: 10_000,
    },
    (position) => {
      const update = toHeartbeatLocationUpdate(position);
      emitLocationUpdate(update);
      queueHeartbeat(update, "foreground");
    },
  );

  const started = await Location.hasStartedLocationUpdatesAsync(
    DRIVER_LOCATION_TASK_NAME,
  ).catch(() => false);

  if (permissionResult.message === null && !started) {
    await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      activityType: Location.ActivityType.AutomotiveNavigation,
      deferredUpdatesInterval: HEARTBEAT_INTERVAL_MS,
      distanceInterval: 0,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      timeInterval: HEARTBEAT_INTERVAL_MS,
      foregroundService: {
        notificationTitle: "Trip tracking active",
        notificationBody:
          "DRTS is sending driver location heartbeats for the active trip.",
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
  if (taskChanged && latestUpdate) {
    queueHeartbeat(latestUpdate, nextTransportMode, {
      preserveKeyEvent: true,
    });
  }

  return {
    status: "active",
    message: permissionResult.message,
    latestUpdate,
  };
}

export function getActiveDriverHeartbeatTaskId(): string | null {
  return activeTaskId;
}
