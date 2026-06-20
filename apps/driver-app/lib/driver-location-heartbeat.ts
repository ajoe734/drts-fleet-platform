import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import type { TaskManagerTaskBody } from "expo-task-manager";

import { getDriverClient, getDriverId } from "@/lib/api-client";

const DRIVER_LOCATION_TASK_NAME = "drts-driver-location-heartbeat";
const HEARTBEAT_INTERVAL_MS = 15_000;
const AVAILABILITY_HEARTBEAT_INTERVAL_MS = 30_000;
const INCIDENT_HEARTBEAT_INTERVAL_MS = 5_000;

export type DriverHeartbeatWorkState =
  | "online_available"
  | "assigned"
  | "enroute_to_pickup"
  | "arrived_pickup"
  | "on_trip"
  | "incident";

export type DriverLocationHeartbeatProfile = {
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
  timeIntervalMs: number;
  distanceIntervalM: number;
  foregroundServiceTitle: string;
  foregroundServiceBody: string;
  requiresBackgroundPermission: boolean;
};

const listeners = new Set<HeartbeatListener>();

let activeHeartbeatProfile: DriverLocationHeartbeatProfile | null = null;
let latestUpdate: HeartbeatLocationUpdate | null = null;
let heartbeatQueue = Promise.resolve();
let foregroundLocationSubscription: Location.LocationSubscription | null = null;
let transportMode: HeartbeatTransportMode = "none";
let lastHeartbeatQueuedAtMs: number | null = null;
let activeHeartbeatIntervalMs = HEARTBEAT_INTERVAL_MS;

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
  if (transportMode !== source) {
    return;
  }

  const recordedAtMs = getHeartbeatRecordedAtMs(update);
  if (
    lastHeartbeatQueuedAtMs !== null &&
    recordedAtMs - lastHeartbeatQueuedAtMs < activeHeartbeatIntervalMs
  ) {
    return;
  }

  lastHeartbeatQueuedAtMs = recordedAtMs;
  heartbeatQueue = heartbeatQueue
    .catch(() => undefined)
    .then(async () => {
      const client = getDriverClient();
      await client.recordDriverLocation({
        driverId: getDriverId(),
        lat: update.latitude,
        lng: update.longitude,
        accuracyM: update.accuracyM ?? undefined,
        recordedAt: update.recordedAt,
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

async function ensureLocationPermissions(
  cadence: HeartbeatCadence,
): Promise<HeartbeatSyncResult> {
  const foregroundPermission =
    await Location.getForegroundPermissionsAsync().catch(() => null);

  const foregroundGranted = foregroundPermission?.granted
    ? true
    : (await Location.requestForegroundPermissionsAsync()).granted;

  if (!foregroundGranted) {
    return {
      status: "permission_denied",
      message:
        "Foreground location access is required to start driver location heartbeat updates.",
      latestUpdate,
    };
  }

  const backgroundPermission =
    await Location.getBackgroundPermissionsAsync().catch(() => null);

  const backgroundGranted = backgroundPermission?.granted
    ? true
    : (await Location.requestBackgroundPermissionsAsync()).granted;

  if (!backgroundGranted) {
    if (cadence.requiresBackgroundPermission) {
      return {
        status: "permission_denied",
        message:
          "Background location is required before the driver can stay online and available for dispatch.",
        latestUpdate,
      };
    }

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
    maxAge: activeHeartbeatIntervalMs,
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
  activeHeartbeatProfile = null;
  transportMode = "none";
  lastHeartbeatQueuedAtMs = null;
  activeHeartbeatIntervalMs = HEARTBEAT_INTERVAL_MS;
  stopForegroundLocationSubscription();

  const started = await Location.hasStartedLocationUpdatesAsync(
    DRIVER_LOCATION_TASK_NAME,
  ).catch(() => false);

  if (started) {
    await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK_NAME);
  }
}

function getHeartbeatCadence(
  profile: DriverLocationHeartbeatProfile,
): HeartbeatCadence {
  switch (profile.workState) {
    case "online_available":
      return {
        timeIntervalMs: AVAILABILITY_HEARTBEAT_INTERVAL_MS,
        distanceIntervalM: 100,
        foregroundServiceTitle: "Driver availability active",
        foregroundServiceBody:
          "DRTS is sharing your location so dispatch can find nearby available drivers.",
        requiresBackgroundPermission: true,
      };
    case "assigned":
      return {
        timeIntervalMs: HEARTBEAT_INTERVAL_MS,
        distanceIntervalM: 25,
        foregroundServiceTitle: "Driver assignment active",
        foregroundServiceBody:
          "DRTS is sharing your location while this assignment is in progress.",
        requiresBackgroundPermission: false,
      };
    case "enroute_to_pickup":
    case "on_trip":
      return {
        timeIntervalMs: 10_000,
        distanceIntervalM: 25,
        foregroundServiceTitle: "Trip tracking active",
        foregroundServiceBody:
          "DRTS is sending driver location heartbeats for the active trip.",
        requiresBackgroundPermission: false,
      };
    case "arrived_pickup":
      return {
        timeIntervalMs: HEARTBEAT_INTERVAL_MS,
        distanceIntervalM: 25,
        foregroundServiceTitle: "Pickup tracking active",
        foregroundServiceBody:
          "DRTS is keeping the driver location fresh while pickup is in progress.",
        requiresBackgroundPermission: false,
      };
    case "incident":
      return {
        timeIntervalMs: INCIDENT_HEARTBEAT_INTERVAL_MS,
        distanceIntervalM: 10,
        foregroundServiceTitle: "Emergency tracking active",
        foregroundServiceBody:
          "DRTS is sending higher-frequency driver location updates during the incident.",
        requiresBackgroundPermission: false,
      };
  }
}

export async function syncDriverLocationHeartbeat(
  profile: DriverLocationHeartbeatProfile | null,
): Promise<HeartbeatSyncResult> {
  if (!profile) {
    await stopDriverLocationHeartbeat();
    return {
      status: "idle",
      message: null,
      latestUpdate,
    };
  }

  const previousProfile = activeHeartbeatProfile;
  const previousTransportMode = transportMode;
  const cadence = getHeartbeatCadence(profile);
  activeHeartbeatIntervalMs = cadence.timeIntervalMs;

  const permissionResult = await ensureLocationPermissions(cadence);
  if (permissionResult.status === "permission_denied") {
    transportMode = "none";
    stopForegroundLocationSubscription();
    return permissionResult;
  }

  const nextTransportMode =
    permissionResult.message === null ? "background" : "foreground";
  const profileChanged =
    previousProfile?.taskId !== profile.taskId ||
    previousProfile?.workState !== profile.workState;
  if (
    profileChanged ||
    previousTransportMode !== nextTransportMode
  ) {
    lastHeartbeatQueuedAtMs = null;
  }
  activeHeartbeatProfile = profile;
  transportMode = nextTransportMode;
  stopForegroundLocationSubscription();

  foregroundLocationSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: cadence.distanceIntervalM,
      timeInterval: cadence.timeIntervalMs,
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

  if (
    permissionResult.message === null &&
    started &&
    (profileChanged || previousTransportMode !== nextTransportMode)
  ) {
    await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK_NAME).catch(
      () => undefined,
    );
  }

  if (
    permissionResult.message === null &&
    (!started || profileChanged || previousTransportMode !== nextTransportMode)
  ) {
    await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      activityType: Location.ActivityType.AutomotiveNavigation,
      deferredUpdatesInterval: cadence.timeIntervalMs,
      distanceInterval: cadence.distanceIntervalM,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      timeInterval: cadence.timeIntervalMs,
      foregroundService: {
        notificationTitle: cadence.foregroundServiceTitle,
        notificationBody: cadence.foregroundServiceBody,
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
  return activeHeartbeatProfile?.taskId ?? null;
}
