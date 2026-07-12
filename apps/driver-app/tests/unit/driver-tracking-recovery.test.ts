import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

import {
  TRACKING_GAP_THRESHOLD_MS,
  __resetTrackingRecoveryForTests,
  __setTrackingMarkerStoreForTests,
  __setTrackingRecoveryNowProviderForTests,
  clearTrackingSession,
  detectTrackingGap,
  evaluateTrackingRecovery,
  formatTrackingGapNotice,
  getTrackingDiagnostic,
  loadTrackingSessionMarker,
  recordTrackingHeartbeat,
  subscribeTrackingDiagnostic,
  type TrackingMarkerStore,
  type TrackingSessionMarker,
} from "../../lib/driver-tracking-recovery";

class MemoryMarkerStore implements TrackingMarkerStore {
  marker: TrackingSessionMarker | null = null;

  async load(): Promise<TrackingSessionMarker | null> {
    return this.marker ? { ...this.marker } : null;
  }

  async save(marker: TrackingSessionMarker): Promise<void> {
    this.marker = { ...marker };
  }

  async clear(): Promise<void> {
    this.marker = null;
  }
}

let store: MemoryMarkerStore;
let now = new Date("2026-06-20T00:00:00.000Z");

function setNow(iso: string) {
  now = new Date(iso);
}

beforeEach(() => {
  store = new MemoryMarkerStore();
  __setTrackingMarkerStoreForTests(store);
  __setTrackingRecoveryNowProviderForTests(() => now);
  setNow("2026-06-20T00:00:00.000Z");
});

afterEach(() => {
  __resetTrackingRecoveryForTests();
});

describe("detectTrackingGap", () => {
  const baseMarker: TrackingSessionMarker = {
    taskId: "task-001",
    driverId: "driver-001",
    vehicleId: "vehicle-001",
    workState: "on_trip",
    lastHeartbeatRecordedAt: "2026-06-20T00:00:00.000Z",
    lastSequenceNo: 42,
    updatedAt: "2026-06-20T00:00:00.000Z",
  };

  it("returns null when there is no marker", () => {
    expect(
      detectTrackingGap({ marker: null, nowIso: "2026-06-20T01:00:00.000Z" }),
    ).toBeNull();
  });

  it("returns null when the last heartbeat is within the threshold", () => {
    const nowIso = new Date(
      Date.parse(baseMarker.lastHeartbeatRecordedAt) +
        TRACKING_GAP_THRESHOLD_MS -
        1,
    ).toISOString();

    expect(detectTrackingGap({ marker: baseMarker, nowIso })).toBeNull();
  });

  it("reports a gap with honest boundaries once the threshold is exceeded", () => {
    const nowIso = "2026-06-20T00:05:00.000Z";
    const gap = detectTrackingGap({ marker: baseMarker, nowIso });

    expect(gap).toEqual({
      detectedAt: nowIso,
      gapStartedAt: baseMarker.lastHeartbeatRecordedAt,
      gapEndedAt: nowIso,
      gapDurationMs: 5 * 60 * 1000,
      lastTaskId: "task-001",
      lastWorkState: "on_trip",
      lastSequenceNo: 42,
    });
  });

  it("returns null for unparseable timestamps", () => {
    expect(
      detectTrackingGap({
        marker: { ...baseMarker, lastHeartbeatRecordedAt: "not-a-date" },
        nowIso: "2026-06-20T01:00:00.000Z",
      }),
    ).toBeNull();
  });
});

describe("recordTrackingHeartbeat", () => {
  it("persists the real fix and marks the session as actively tracking", async () => {
    setNow("2026-06-20T00:00:30.000Z");
    const marker = await recordTrackingHeartbeat({
      taskId: "task-001",
      driverId: "driver-001",
      vehicleId: "vehicle-001",
      workState: "on_trip",
      recordedAt: "2026-06-20T00:00:30.000Z",
      sequenceNo: 7,
    });

    expect(marker.lastHeartbeatRecordedAt).toBe("2026-06-20T00:00:30.000Z");
    expect(await loadTrackingSessionMarker()).toMatchObject({
      taskId: "task-001",
      lastSequenceNo: 7,
    });
    expect(getTrackingDiagnostic()).toMatchObject({
      status: "tracking",
      activeTaskId: "task-001",
      lastHeartbeatRecordedAt: "2026-06-20T00:00:30.000Z",
    });
  });
});

describe("clearTrackingSession", () => {
  it("clears the marker and returns the diagnostic to idle", async () => {
    await recordTrackingHeartbeat({
      taskId: "task-001",
      driverId: "driver-001",
      vehicleId: null,
      workState: "on_trip",
      recordedAt: "2026-06-20T00:00:30.000Z",
      sequenceNo: 1,
    });

    await clearTrackingSession();

    expect(await loadTrackingSessionMarker()).toBeNull();
    expect(getTrackingDiagnostic().status).toBe("idle");
  });
});

describe("evaluateTrackingRecovery (restart resume)", () => {
  async function seedDeadSession() {
    // App was tracking, then killed: the marker survives the restart.
    setNow("2026-06-20T00:00:00.000Z");
    await recordTrackingHeartbeat({
      taskId: "task-001",
      driverId: "driver-001",
      vehicleId: "vehicle-001",
      workState: "on_trip",
      recordedAt: "2026-06-20T00:00:00.000Z",
      sequenceNo: 12,
    });
  }

  it("restores the active session and detects the gap after a long restart", async () => {
    await seedDeadSession();

    // Restart five minutes later with the same active task still open.
    setNow("2026-06-20T00:05:00.000Z");
    const result = await evaluateTrackingRecovery({
      activeAssignment: { taskId: "task-001", driverId: "driver-001" },
    });

    expect(result.gap).not.toBeNull();
    expect(result.gap?.gapDurationMs).toBe(5 * 60 * 1000);
    expect(result.diagnostic.status).toBe("gap_detected");
    expect(result.diagnostic.activeTaskId).toBe("task-001");
    // Marker is preserved so the first resumed fix can re-baseline it.
    expect(await loadTrackingSessionMarker()).not.toBeNull();
  });

  it("resumes without a gap when the restart is quick", async () => {
    await seedDeadSession();

    setNow("2026-06-20T00:00:20.000Z");
    const result = await evaluateTrackingRecovery({
      activeAssignment: { taskId: "task-001", driverId: "driver-001" },
    });

    expect(result.gap).toBeNull();
    expect(result.diagnostic.status).toBe("tracking");
  });

  it("does not fabricate continuity: the resumed fix keeps its own real timestamp", async () => {
    await seedDeadSession();

    setNow("2026-06-20T00:05:00.000Z");
    const recovery = await evaluateTrackingRecovery({
      activeAssignment: { taskId: "task-001", driverId: "driver-001" },
    });
    expect(recovery.gap?.gapStartedAt).toBe("2026-06-20T00:00:00.000Z");

    // The next real fix is recorded with its own (post-gap) timestamp; nothing
    // back-fills the missing window.
    setNow("2026-06-20T00:05:05.000Z");
    const resumed = await recordTrackingHeartbeat({
      taskId: "task-001",
      driverId: "driver-001",
      vehicleId: "vehicle-001",
      workState: "on_trip",
      recordedAt: "2026-06-20T00:05:05.000Z",
      sequenceNo: 13,
    });

    expect(resumed.lastHeartbeatRecordedAt).toBe("2026-06-20T00:05:05.000Z");
    expect(resumed.lastSequenceNo).toBe(13);
    // The detected gap is retained for the session even after resuming.
    expect(getTrackingDiagnostic().gap?.gapStartedAt).toBe(
      "2026-06-20T00:00:00.000Z",
    );
    expect(getTrackingDiagnostic().status).toBe("tracking");
  });

  it("retires the session and surfaces the gap once when no task is active", async () => {
    await seedDeadSession();

    setNow("2026-06-20T00:05:00.000Z");
    const result = await evaluateTrackingRecovery({ activeAssignment: null });

    expect(result.gap).not.toBeNull();
    expect(result.diagnostic.status).toBe("gap_detected");
    expect(await loadTrackingSessionMarker()).toBeNull();
  });

  it("is a no-op idle when there is no prior session", async () => {
    const result = await evaluateTrackingRecovery({
      activeAssignment: { taskId: "task-002", driverId: "driver-001" },
    });

    expect(result.marker).toBeNull();
    expect(result.gap).toBeNull();
    expect(result.diagnostic.status).toBe("idle");
  });
});

describe("subscribeTrackingDiagnostic", () => {
  it("pushes the current state immediately and on subsequent changes", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeTrackingDiagnostic(listener);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ status: "idle" }),
    );

    await recordTrackingHeartbeat({
      taskId: "task-001",
      driverId: "driver-001",
      vehicleId: null,
      workState: "on_trip",
      recordedAt: "2026-06-20T00:00:30.000Z",
      sequenceNo: 1,
    });

    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "tracking" }),
    );

    unsubscribe();
    await clearTrackingSession();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("formatTrackingGapNotice", () => {
  it("states the outage and that continuity is not fabricated", () => {
    const notice = formatTrackingGapNotice({
      detectedAt: "2026-06-20T00:05:00.000Z",
      gapStartedAt: "2026-06-20T00:00:00.000Z",
      gapEndedAt: "2026-06-20T00:05:00.000Z",
      gapDurationMs: 5 * 60 * 1000,
      lastTaskId: "task-001",
      lastWorkState: "on_trip",
      lastSequenceNo: 1,
    });

    expect(notice).toContain("5 分");
    expect(notice).toContain("不會補造");
  });
});
