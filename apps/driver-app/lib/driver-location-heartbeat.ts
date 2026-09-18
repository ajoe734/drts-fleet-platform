import type {
  DriverLocationHeartbeatEnvelope,
  DriverTaskRecord,
} from "@drts/contracts";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import type { TaskManagerTaskBody } from "expo-task-manager";

import { formatDriverError, sanitizeLogMessage } from "@/lib/api-client";
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

export type HeartbeatBlockReason =
  | "LOCATION_PERMISSION_DENIED"
  | "BACKGROUND_LOCATION_REQUIRED";

type HeartbeatSyncResult = {
  status: "idle" | "active" | "permission_denied" | "error";
  message: string | null;
  latestUpdate: HeartbeatLocationUpdate | null;
  /**
   * Set when `status` is `permission_denied` to distinguish a missing
   * foreground permission (`LOCATION_PERMISSION_DENIED`) from a missing
   * background permission that blocks `online_available` per SA §6.3
   * (`BACKGROUND_LOCATION_REQUIRED`).
   */
  reason?: HeartbeatBlockReason;
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
let lastHeartbeatQueuedCoord: { latitude: number; longitude: number } | null =
  null;
let appliedBackgroundCadenceKey: string | null = null;

type EnvelopeWorkState = DriverLocationHeartbeatEnvelope["workState"];

type CadenceConfig = {
  /**
   * Minimum spacing between emitted heartbeats and the OS update interval, set
   * to the spec's least-frequent acceptable cadence (upper bound of a range) so
   * heartbeats never exceed the maximum allowed staleness — except `incident`,
   * which uses the high-frequency floor because incident prioritizes freshness.
   */
  intervalMs: number;
  /**
   * Distance trigger in metres; a move of at least this far emits a heartbeat
   * before `intervalMs` elapses ("30 秒或 100 公尺"). `0` disables it.
   */
  distanceM: number;
};

/**
 * Per-state location cadence from SA §6.2 目標狀態模型
 * (phase1_delta_sa_supply_eligibility_mobile_reporting_20260619.md), keyed by
 * the heartbeat envelope work state:
 *
 * | 狀態 (envelope)  | SA 狀態            | 建議節奏           |
 * | available         | online_available   | 30 秒或 100 公尺   |
 * | assigned          | assigned           | 15 秒或 25 公尺    |
 * | enroute           | enroute_to_pickup  | 10–15 秒或 25 公尺 |
 * | arrived           | arrived_pickup     | 15 秒              |
 * | on_trip           | on_trip            | 10–15 秒或 25 公尺 |
 * | incident          | incident           | 5–10 秒            |
 *
 * `offline` does not track.
 */
function getCadenceForWorkState(workState: EnvelopeWorkState): CadenceConfig {
  switch (workState) {
    case "available":
      return { intervalMs: 30_000, distanceM: 100 };
    case "assigned":
      return { intervalMs: 15_000, distanceM: 25 };
    case "enroute":
      return { intervalMs: 15_000, distanceM: 25 };
    case "arrived":
      return { intervalMs: 15_000, distanceM: 0 };
    case "on_trip":
      return { intervalMs: 15_000, distanceM: 25 };
    case "incident":
      return { intervalMs: 5_000, distanceM: 0 };
    default:
      return { intervalMs: HEARTBEAT_INTERVAL_MS, distanceM: 25 };
  }
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Equirectangular approximation of the distance in metres between two
 * coordinates — accurate enough for the small intra-heartbeat distances (tens
 * to hundreds of metres) used by the cadence distance trigger.
 */
function distanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const earthRadiusM = 6_371_000;
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLng = toRadians(to.longitude - from.longitude);
  const meanLat = toRadians((from.latitude + to.latitude) / 2);
  const x = deltaLng * Math.cos(meanLat);
  const y = deltaLat;
  return Math.sqrt(x * x + y * y) * earthRadiusM;
}

function shouldQueueHeartbeat(
  update: HeartbeatLocationUpdate,
  recordedAtMs: number,
  cadence: CadenceConfig,
): boolean {
  if (lastHeartbeatQueuedAtMs === null) {
    return true;
  }

  if (recordedAtMs - lastHeartbeatQueuedAtMs >= cadence.intervalMs) {
    return true;
  }

  if (cadence.distanceM > 0 && lastHeartbeatQueuedCoord) {
    const movedM = distanceMeters(lastHeartbeatQueuedCoord, update);
    if (movedM >= cadence.distanceM) {
      return true;
    }
  }

  return false;
}

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
  if (!options?.preserveKeyEvent) {
    const cadence = getCadenceForWorkState(
      resolveHeartbeatWorkState(activeTaskStatus),
    );
    if (!shouldQueueHeartbeat(update, recordedAtMs, cadence)) {
      return;
    }
  }

  lastHeartbeatQueuedAtMs = recordedAtMs;
  lastHeartbeatQueuedCoord = {
    latitude: update.latitude,
    longitude: update.longitude,
  };
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
      console.error(
        "Driver location heartbeat queueing failed",
        formatDriverError(error, "Queueing failed"),
      );
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
        console.error(
          "Driver location task error",
          sanitizeLogMessage(error.message) ?? formatDriverError(error, "Task error"),
        );
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

async function ensureLocationPermissions(
  requireBackground: boolean,
): Promise<HeartbeatSyncResult> {
  const foregroundPermission =
    await Location.getForegroundPermissionsAsync().catch(() => null);

  const foregroundGranted = foregroundPermission?.granted
    ? true
    : (await Location.requestForegroundPermissionsAsync()).granted;

  if (!foregroundGranted) {
    return {
      status: "permission_denied",
      reason: "LOCATION_PERMISSION_DENIED",
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
    if (requireBackground) {
      // SA §6.3: background permission missing → the driver may not enter
      // online_available and may not accept tasks needing background tracking.
      return {
        status: "permission_denied",
        reason: "BACKGROUND_LOCATION_REQUIRED",
        message:
          "Background location access is required to stay online and available for dispatch.",
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
  lastHeartbeatQueuedCoord = null;
  appliedBackgroundCadenceKey = null;
  stopForegroundLocationSubscription();

  const started = await Location.hasStartedLocationUpdatesAsync(
    DRIVER_LOCATION_TASK_NAME,
  ).catch(() => false);

  if (started) {
    await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK_NAME);
  }

  await flushDriverLocationQueue();
}

type TrackingTarget = {
  taskId: string | null;
  taskStatus: string | null;
  requireBackground: boolean;
};

/**
 * Shared tracking core. Drives the device location module from a desired
 * target work state (derived from `taskStatus`; `null` → `available` for
 * online_available). Used by both active-task tracking and online_available
 * continuous tracking.
 */
async function applyHeartbeatTracking(
  target: TrackingTarget,
): Promise<HeartbeatSyncResult> {
  await initializeDriverLocationOfflineQueue();

  const permissionResult = await ensureLocationPermissions(
    target.requireBackground,
  );
  if (permissionResult.status === "permission_denied") {
    transportMode = "none";
    stopForegroundLocationSubscription();
    appliedBackgroundCadenceKey = null;
    const wasStarted = await Location.hasStartedLocationUpdatesAsync(
      DRIVER_LOCATION_TASK_NAME,
    ).catch(() => false);
    if (wasStarted) {
      await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK_NAME).catch(
        () => undefined,
      );
    }
    console.warn(
      "[driver-location-heartbeat] tracking blocked",
      sanitizeLogMessage(permissionResult.reason) ?? permissionResult.reason,
    );
    return permissionResult;
  }

  const workState = resolveHeartbeatWorkState(target.taskStatus);
  const cadence = getCadenceForWorkState(workState);
  const cadenceKey = `${cadence.intervalMs}:${cadence.distanceM}`;
  const nextTransportMode =
    permissionResult.message === null ? "background" : "foreground";
  const targetChanged =
    activeTaskId !== target.taskId || activeTaskStatus !== target.taskStatus;
  if (targetChanged || transportMode !== nextTransportMode) {
    lastHeartbeatQueuedAtMs = null;
    lastHeartbeatQueuedCoord = null;
  }
  if (targetChanged && transportMode !== "none") {
    queueStateSnapshot(target.taskStatus, transportMode);
  }
  activeTaskId = target.taskId;
  activeTaskStatus = target.taskStatus;
  transportMode = nextTransportMode;
  stopForegroundLocationSubscription();

  foregroundLocationSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: cadence.distanceM,
      timeInterval: cadence.intervalMs,
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

  if (permissionResult.message === null) {
    // Restart background updates when the cadence changes so the OS picks up the
    // new interval / distance filter (e.g. available 30s → on_trip 15s).
    const cadenceChanged = appliedBackgroundCadenceKey !== cadenceKey;
    if (!started || cadenceChanged) {
      if (started) {
        await Location.stopLocationUpdatesAsync(
          DRIVER_LOCATION_TASK_NAME,
        ).catch(() => undefined);
      }

      const isAvailability = workState === "available";
      await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        activityType: Location.ActivityType.AutomotiveNavigation,
        deferredUpdatesInterval: cadence.intervalMs,
        distanceInterval: cadence.distanceM,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        timeInterval: cadence.intervalMs,
        foregroundService: {
          notificationTitle: isAvailability
            ? "On duty — available for dispatch"
            : "Trip tracking active",
          notificationBody: isAvailability
            ? "DRTS is sharing your location so dispatch can offer you nearby jobs."
            : "DRTS is sending driver location heartbeats for the active trip.",
          killServiceOnDestroy: false,
        },
      });
      appliedBackgroundCadenceKey = cadenceKey;
    }
  } else if (started) {
    await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK_NAME).catch(
      () => undefined,
    );
    appliedBackgroundCadenceKey = null;
  }

  await seedLatestLocation();
  if (targetChanged && latestUpdate) {
    queueHeartbeat(latestUpdate, nextTransportMode, {
      preserveKeyEvent: true,
    });
  }

  console.info("[driver-location-heartbeat] tracking active", {
    workState,
    transportMode: nextTransportMode,
    taskId: target.taskId,
    intervalMs: cadence.intervalMs,
    distanceM: cadence.distanceM,
  });

  return {
    status: "active",
    message: permissionResult.message,
    latestUpdate,
  };
}

/**
 * Active-task tracking. A bare task (no status) maps to `on_trip`. Stops
 * tracking when there is no trackable task.
 */
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

  return applyHeartbeatTracking({
    taskId: task.taskId,
    taskStatus: nextTaskStatus,
    requireBackground: false,
  });
}

/**
 * online_available continuous background tracking (MOB-APP-001 / SA §6.2).
 * Emits background heartbeats with no active task at the `available` cadence
 * (30 秒或 100 公尺) so dispatch can find available drivers by position.
 * Requires background permission (SA §6.3); returns a
 * `BACKGROUND_LOCATION_REQUIRED` block otherwise.
 */
export async function syncDriverOnlineAvailableHeartbeat(): Promise<HeartbeatSyncResult> {
  return applyHeartbeatTracking({
    taskId: null,
    taskStatus: null,
    requireBackground: true,
  });
}

export function getActiveDriverHeartbeatTaskId(): string | null {
  return activeTaskId;
}

/**
 * The work state the heartbeat module is currently emitting, or `null` when
 * tracking is stopped. `available` indicates online_available continuous
 * tracking; any non-null active-task state means a trip owns tracking.
 */
export function getActiveDriverHeartbeatWorkState(): EnvelopeWorkState | null {
  return transportMode === "none"
    ? null
    : resolveHeartbeatWorkState(activeTaskStatus);
}
