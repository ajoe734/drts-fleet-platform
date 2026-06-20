/**
 * Driver App restart recovery + tracking-gap detection (MOB-APP-004).
 *
 * Implements SA §6.7/§6.8: after an app restart (process kill, OS termination,
 * force quit) the active tracking session must be restored and re-synced, and
 * any period during which the device was not emitting heartbeats must be
 * detected and surfaced **honestly**. We never fabricate a continuous vehicle
 * trail across the gap — the discontinuity is recorded as diagnostic metadata
 * and the resumed heartbeat keeps its real (new) `recordedAt`, so the gap stays
 * visible cross-surface (App / API / Ops) instead of being interpolated away.
 *
 * The durable session marker is the single piece of state that survives a
 * restart: it records the last heartbeat the device actually persisted. On the
 * next launch we compare that marker against the current wall clock. If more
 * than the gap threshold elapsed while a tracking session was still open (the
 * marker was never cleared by a clean stop), we know the device went dark and
 * report the gap.
 */

import type { DriverLocationHeartbeatEnvelope } from "@drts/contracts";
import * as SecureStore from "expo-secure-store";

type DriverWorkState = DriverLocationHeartbeatEnvelope["workState"];

const TRACKING_MARKER_KEY = "drts.driver.trackingSessionMarker";

/** Device heartbeat cadence, mirrors driver-location-heartbeat.ts. */
const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * A tracking gap is reported when the last persisted heartbeat is older than
 * this threshold while a session is still open. Four heartbeat intervals keeps
 * brief OS suspensions / quick foreground bounces from being flagged as gaps
 * while still catching real process death within a minute.
 */
export const TRACKING_GAP_THRESHOLD_MS = 4 * HEARTBEAT_INTERVAL_MS;

export interface TrackingSessionMarker {
  taskId: string | null;
  driverId: string;
  vehicleId: string | null;
  workState: DriverWorkState;
  /** ISO timestamp of the last heartbeat fix the device actually recorded. */
  lastHeartbeatRecordedAt: string;
  lastSequenceNo: number;
  updatedAt: string;
}

export interface TrackingGap {
  detectedAt: string;
  /** Last heartbeat before the device went dark. */
  gapStartedAt: string;
  /** Moment tracking recovery ran after restart. */
  gapEndedAt: string;
  gapDurationMs: number;
  lastTaskId: string | null;
  lastWorkState: DriverWorkState;
  lastSequenceNo: number;
}

export interface TrackingDiagnosticState {
  status: "idle" | "tracking" | "gap_detected";
  activeTaskId: string | null;
  lastHeartbeatRecordedAt: string | null;
  /**
   * The gap detected for the current session, retained for the lifetime of the
   * session so the UI can keep surfacing "tracking resumed after an N s gap"
   * even once fresh fixes start flowing again.
   */
  gap: TrackingGap | null;
  evaluatedAt: string;
}

export interface TrackingRecoveryInput {
  activeAssignment: { taskId: string; driverId: string } | null;
  nowIso?: string;
  gapThresholdMs?: number;
}

export interface TrackingRecoveryResult {
  marker: TrackingSessionMarker | null;
  gap: TrackingGap | null;
  diagnostic: TrackingDiagnosticState;
}

export interface TrackingHeartbeatInput {
  taskId: string | null;
  driverId: string;
  vehicleId: string | null;
  workState: DriverWorkState;
  recordedAt: string;
  sequenceNo: number;
}

export interface TrackingMarkerStore {
  load(): Promise<TrackingSessionMarker | null>;
  save(marker: TrackingSessionMarker): Promise<void>;
  clear(): Promise<void>;
}

class SecureStoreTrackingMarkerStore implements TrackingMarkerStore {
  async load(): Promise<TrackingSessionMarker | null> {
    const raw = await SecureStore.getItemAsync(TRACKING_MARKER_KEY);
    if (!raw) {
      return null;
    }

    try {
      return parseTrackingSessionMarker(raw);
    } catch {
      await SecureStore.deleteItemAsync(TRACKING_MARKER_KEY);
      return null;
    }
  }

  async save(marker: TrackingSessionMarker): Promise<void> {
    await SecureStore.setItemAsync(TRACKING_MARKER_KEY, JSON.stringify(marker));
  }

  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(TRACKING_MARKER_KEY);
  }
}

function parseTrackingSessionMarker(raw: string): TrackingSessionMarker {
  const parsed = JSON.parse(raw) as Partial<TrackingSessionMarker>;
  if (
    typeof parsed.driverId !== "string" ||
    !parsed.driverId.trim() ||
    typeof parsed.lastHeartbeatRecordedAt !== "string" ||
    Number.isNaN(Date.parse(parsed.lastHeartbeatRecordedAt)) ||
    typeof parsed.workState !== "string"
  ) {
    throw new Error("Tracking session marker payload is incomplete.");
  }

  return {
    taskId: typeof parsed.taskId === "string" ? parsed.taskId : null,
    driverId: parsed.driverId,
    vehicleId: typeof parsed.vehicleId === "string" ? parsed.vehicleId : null,
    workState: parsed.workState as DriverWorkState,
    lastHeartbeatRecordedAt: parsed.lastHeartbeatRecordedAt,
    lastSequenceNo:
      typeof parsed.lastSequenceNo === "number" ? parsed.lastSequenceNo : 0,
    updatedAt:
      typeof parsed.updatedAt === "string"
        ? parsed.updatedAt
        : parsed.lastHeartbeatRecordedAt,
  };
}

let markerStore: TrackingMarkerStore = new SecureStoreTrackingMarkerStore();
let nowProvider = () => new Date();

const IDLE_DIAGNOSTIC: TrackingDiagnosticState = {
  status: "idle",
  activeTaskId: null,
  lastHeartbeatRecordedAt: null,
  gap: null,
  evaluatedAt: "1970-01-01T00:00:00.000Z",
};

let diagnostic: TrackingDiagnosticState = IDLE_DIAGNOSTIC;
const diagnosticListeners = new Set<(state: TrackingDiagnosticState) => void>();

function publishDiagnostic(next: TrackingDiagnosticState): void {
  diagnostic = next;
  for (const listener of diagnosticListeners) {
    listener(next);
  }
}

/**
 * Pure gap detector. Returns a {@link TrackingGap} only when an open session
 * marker is older than the threshold; otherwise `null`. Never mutates state.
 */
export function detectTrackingGap(params: {
  marker: TrackingSessionMarker | null;
  nowIso: string;
  gapThresholdMs?: number;
}): TrackingGap | null {
  const { marker, nowIso } = params;
  const gapThresholdMs = params.gapThresholdMs ?? TRACKING_GAP_THRESHOLD_MS;

  if (!marker) {
    return null;
  }

  const lastMs = Date.parse(marker.lastHeartbeatRecordedAt);
  const nowMs = Date.parse(nowIso);
  if (Number.isNaN(lastMs) || Number.isNaN(nowMs)) {
    return null;
  }

  const gapDurationMs = nowMs - lastMs;
  if (gapDurationMs < gapThresholdMs) {
    return null;
  }

  return {
    detectedAt: nowIso,
    gapStartedAt: marker.lastHeartbeatRecordedAt,
    gapEndedAt: nowIso,
    gapDurationMs,
    lastTaskId: marker.taskId,
    lastWorkState: marker.workState,
    lastSequenceNo: marker.lastSequenceNo,
  };
}

/**
 * Persist the durable session marker after the device records a real heartbeat
 * fix. Once a fresh fix flows the session is considered actively tracking; any
 * previously detected gap is retained on the diagnostic so the UI can keep
 * showing that this session resumed after a discontinuity.
 */
export async function recordTrackingHeartbeat(
  input: TrackingHeartbeatInput,
): Promise<TrackingSessionMarker> {
  const nowIso = nowProvider().toISOString();
  const marker: TrackingSessionMarker = {
    taskId: input.taskId,
    driverId: input.driverId,
    vehicleId: input.vehicleId,
    workState: input.workState,
    lastHeartbeatRecordedAt: input.recordedAt,
    lastSequenceNo: input.sequenceNo,
    updatedAt: nowIso,
  };

  await markerStore.save(marker);

  publishDiagnostic({
    status: "tracking",
    activeTaskId: input.taskId,
    lastHeartbeatRecordedAt: input.recordedAt,
    gap: diagnostic.gap,
    evaluatedAt: nowIso,
  });

  return marker;
}

/**
 * Clear the durable session marker on a clean tracking stop (task completed /
 * no active task). After this a subsequent restart will not falsely report a
 * gap, because there is no open session to resume.
 */
export async function clearTrackingSession(): Promise<void> {
  await markerStore.clear();
  publishDiagnostic({
    ...IDLE_DIAGNOSTIC,
    evaluatedAt: nowProvider().toISOString(),
  });
}

/**
 * Restart-recovery entry point. Loads the persisted marker, detects any gap
 * relative to now, and publishes a diagnostic. When there is no active task to
 * resume the marker is cleared (the session is over); when a task is still
 * active the marker is kept so the first resumed fix re-baselines it.
 *
 * Crucially this performs **no backfill** — it never enqueues synthetic
 * location points to bridge the gap, so continuity is never fabricated.
 */
export async function evaluateTrackingRecovery(
  input: TrackingRecoveryInput,
): Promise<TrackingRecoveryResult> {
  const nowIso = input.nowIso ?? nowProvider().toISOString();
  const marker = await markerStore.load();
  const gap = detectTrackingGap({
    marker,
    nowIso,
    gapThresholdMs: input.gapThresholdMs,
  });

  if (!input.activeAssignment) {
    // Nothing to resume: retire the session but still surface the gap once so a
    // late-arriving cancellation does not silently swallow the discontinuity.
    if (marker) {
      await markerStore.clear();
    }
    const next: TrackingDiagnosticState = {
      status: gap ? "gap_detected" : "idle",
      activeTaskId: null,
      lastHeartbeatRecordedAt: marker?.lastHeartbeatRecordedAt ?? null,
      gap,
      evaluatedAt: nowIso,
    };
    publishDiagnostic(next);
    return { marker, gap, diagnostic: next };
  }

  const next: TrackingDiagnosticState = {
    status: gap ? "gap_detected" : marker ? "tracking" : "idle",
    activeTaskId: input.activeAssignment.taskId,
    lastHeartbeatRecordedAt: marker?.lastHeartbeatRecordedAt ?? null,
    gap,
    evaluatedAt: nowIso,
  };
  publishDiagnostic(next);
  return { marker, gap, diagnostic: next };
}

export async function loadTrackingSessionMarker(): Promise<TrackingSessionMarker | null> {
  return markerStore.load();
}

/**
 * Honest, driver-facing summary of a detected tracking gap. It states the
 * outage plainly and explicitly tells the driver the missing window was NOT
 * back-filled, so nobody mistakes the resumed trail for continuous coverage.
 */
export function formatTrackingGapNotice(gap: TrackingGap): string {
  const totalSeconds = Math.max(0, Math.round(gap.gapDurationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const duration =
    minutes > 0 ? `約 ${minutes} 分 ${seconds} 秒` : `約 ${seconds} 秒`;

  return `偵測到定位中斷${duration}（App 重啟前車跡未上傳）。系統不會補造這段連續車跡，已如實標記為缺漏，恢復後將從目前位置重新記錄。`;
}

export function getTrackingDiagnostic(): TrackingDiagnosticState {
  return diagnostic;
}

export function subscribeTrackingDiagnostic(
  listener: (state: TrackingDiagnosticState) => void,
): () => void {
  diagnosticListeners.add(listener);
  listener(diagnostic);
  return () => {
    diagnosticListeners.delete(listener);
  };
}

export function __setTrackingMarkerStoreForTests(
  store: TrackingMarkerStore,
): void {
  markerStore = store;
}

export function __setTrackingRecoveryNowProviderForTests(
  provider: () => Date,
): void {
  nowProvider = provider;
}

export function __resetTrackingRecoveryForTests(): void {
  markerStore = new SecureStoreTrackingMarkerStore();
  nowProvider = () => new Date();
  diagnostic = IDLE_DIAGNOSTIC;
  diagnosticListeners.clear();
}
