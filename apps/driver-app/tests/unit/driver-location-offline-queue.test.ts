import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DriverLocationHeartbeatBatchRequest,
  DriverLocationHeartbeatBatchResponse,
  DriverLocationHeartbeatEnvelope,
} from "@drts/contracts";

const recordDriverLocationBatch = vi.fn<
  (request: DriverLocationHeartbeatBatchRequest) => Promise<DriverLocationHeartbeatBatchResponse>
>();
const getDriverDeviceId = vi.fn<() => Promise<string>>();
const getDriverId = vi.fn<() => string>();
const recoverDriverSessionFromApiError = vi.fn<
  (error: unknown) => Promise<boolean>
>();

vi.mock("@/lib/api-client", () => ({
  getDriverClient: () => ({
    recordDriverLocationBatch,
  }),
  getDriverDeviceId,
  getDriverId,
  recoverDriverSessionFromApiError,
}));

type QueueStatus =
  | "pending"
  | "sending"
  | "acked"
  | "failed_retryable"
  | "failed_permanent";

type QueueEventRow = {
  eventId: string;
  sequenceNo: number;
  status: QueueStatus;
  recordedAt: string;
  workState: DriverLocationHeartbeatEnvelope["workState"];
  minuteBucket: string;
  retryCount: number;
  isIncident: boolean;
  isKeyEvent: boolean;
  payload: DriverLocationHeartbeatEnvelope;
  nextAttemptAt: string | null;
  lastError: string | null;
};

class MemoryQueueStore {
  private sequenceNo = 0;
  private rows = new Map<string, QueueEventRow>();

  async countActiveRows(): Promise<number> {
    return [...this.rows.values()].filter((row) => row.status !== "acked")
      .length;
  }

  async deleteEventIds(eventIds: string[]): Promise<void> {
    for (const eventId of eventIds) {
      this.rows.delete(eventId);
    }
  }

  async enqueue(event: QueueEventRow): Promise<void> {
    this.rows.set(event.eventId, {
      ...event,
      nextAttemptAt: null,
      lastError: null,
    });
  }

  async getReadyBatch(limit: number, nowIso: string): Promise<QueueEventRow[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          (row.status === "pending" || row.status === "failed_retryable") &&
          (row.nextAttemptAt == null || row.nextAttemptAt <= nowIso),
      )
      .sort((left, right) => left.sequenceNo - right.sequenceNo)
      .slice(0, limit);
  }

  async getRetentionCandidates(): Promise<QueueEventRow[]> {
    return [...this.rows.values()]
      .filter((row) => row.status !== "acked")
      .sort((left, right) => left.sequenceNo - right.sequenceNo);
  }

  async initialize(): Promise<void> {}

  async markAcked(eventIds: string[]): Promise<void> {
    for (const eventId of eventIds) {
      const row = this.rows.get(eventId);
      if (row) {
        row.status = "acked";
      }
    }
  }

  async markPermanentFailures(
    eventIds: string[],
    errorMessage: string,
  ): Promise<void> {
    for (const eventId of eventIds) {
      const row = this.rows.get(eventId);
      if (row) {
        row.status = "failed_permanent";
        row.lastError = errorMessage;
      }
    }
  }

  async markRetryableFailures(
    failures: Array<{
      eventId: string;
      nextAttemptAt: string;
      retryCount: number;
      errorMessage: string;
    }>,
  ): Promise<void> {
    for (const failure of failures) {
      const row = this.rows.get(failure.eventId);
      if (row) {
        row.status = "failed_retryable";
        row.retryCount = failure.retryCount;
        row.nextAttemptAt = failure.nextAttemptAt;
        row.lastError = failure.errorMessage;
      }
    }
  }

  async markSending(eventIds: string[]): Promise<void> {
    for (const eventId of eventIds) {
      const row = this.rows.get(eventId);
      if (row) {
        row.status = "sending";
      }
    }
  }

  async pruneExpired(cutoffIso: string): Promise<void> {
    for (const [eventId, row] of this.rows.entries()) {
      if (row.recordedAt < cutoffIso) {
        this.rows.delete(eventId);
      }
    }
  }

  async reserveSequenceNo(): Promise<number> {
    this.sequenceNo += 1;
    return this.sequenceNo;
  }

  async resetSendingToPending(): Promise<void> {
    for (const row of this.rows.values()) {
      if (row.status === "sending") {
        row.status = "pending";
      }
    }
  }

  snapshot(): QueueEventRow[] {
    return [...this.rows.values()].sort(
      (left, right) => left.sequenceNo - right.sequenceNo,
    );
  }
}

describe("driver location offline queue", () => {
  let now = new Date("2026-06-20T08:00:00.000Z");
  let store: MemoryQueueStore;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    store = new MemoryQueueStore();
    getDriverDeviceId.mockResolvedValue("device-001");
    getDriverId.mockReturnValue("driver-001");
    recoverDriverSessionFromApiError.mockResolvedValue(false);
    recordDriverLocationBatch.mockImplementation(async (request) => ({
      items: request.items.map((item) => ({
        eventId: item.eventId,
        accepted: true,
        duplicate: false,
        currentLocationUpdated: true,
        serverReceivedAt: now.toISOString(),
      })),
    }));

    const queueModule = await import("../../lib/driver-location-offline-queue");
    await queueModule.__resetDriverLocationOfflineQueueForTests();
    queueModule.__setDriverLocationQueueStoreFactoryForTests(() => store);
    queueModule.__setDriverLocationQueueNowProviderForTests(() => now);
  });

  afterEach(async () => {
    const queueModule = await import("../../lib/driver-location-offline-queue");
    await queueModule.__resetDriverLocationOfflineQueueForTests();
  });

  it("replays persisted rows in sequence order after a restart reset", async () => {
    const queueModule = await import("../../lib/driver-location-offline-queue");
    recordDriverLocationBatch.mockImplementation(() => new Promise(() => {}));

    await queueModule.enqueueDriverLocationEvent({
      taskId: "task-001",
      recordedAt: "2026-06-20T08:00:05.000Z",
      lat: 25.03,
      lng: 121.56,
      accuracyM: 8,
      workState: "assigned",
      appState: "foreground",
      transportMode: "foreground",
      networkType: "unknown",
      preserveKeyEvent: true,
    });
    await queueModule.enqueueDriverLocationEvent({
      taskId: "task-001",
      recordedAt: "2026-06-20T08:00:04.000Z",
      lat: 25.031,
      lng: 121.561,
      accuracyM: 8,
      workState: "on_trip",
      appState: "foreground",
      transportMode: "foreground",
      networkType: "unknown",
      preserveKeyEvent: true,
    });
    await queueModule.__resetDriverLocationOfflineQueueForTests();
    queueModule.__setDriverLocationQueueStoreFactoryForTests(() => store);
    queueModule.__setDriverLocationQueueNowProviderForTests(() => now);
    recordDriverLocationBatch.mockImplementation(async (request) => ({
      items: request.items.map((item) => ({
        eventId: item.eventId,
        accepted: true,
        duplicate: false,
        currentLocationUpdated: true,
        serverReceivedAt: now.toISOString(),
      })),
    }));

    await queueModule.flushDriverLocationQueue();

    expect(recordDriverLocationBatch).toHaveBeenCalledTimes(1);
    expect(recordDriverLocationBatch.mock.calls[0][0].items.map((item) => item.sequenceNo)).toEqual([1, 2]);
    expect(store.snapshot()).toHaveLength(0);
  });

  it("applies exponential backoff to retryable failures before replaying", async () => {
    const queueModule = await import("../../lib/driver-location-offline-queue");
    recordDriverLocationBatch.mockImplementation(() => new Promise(() => {}));

    await queueModule.enqueueDriverLocationEvent({
      taskId: "task-001",
      recordedAt: "2026-06-20T08:00:10.000Z",
      lat: 25.03,
      lng: 121.56,
      accuracyM: 8,
      workState: "on_trip",
      appState: "background",
      transportMode: "background",
      networkType: "unknown",
    });

    await queueModule.__resetDriverLocationOfflineQueueForTests();
    queueModule.__setDriverLocationQueueStoreFactoryForTests(() => store);
    queueModule.__setDriverLocationQueueNowProviderForTests(() => now);
    recordDriverLocationBatch.mockRejectedValueOnce(new Error("API error 503: unavailable"));
    await queueModule.flushDriverLocationQueue();

    expect(store.snapshot()[0]).toMatchObject({
      status: "failed_retryable",
      retryCount: 1,
      nextAttemptAt: "2026-06-20T08:00:10.000Z",
    });

    await queueModule.flushDriverLocationQueue();
    expect(recordDriverLocationBatch).toHaveBeenCalledTimes(1);

    now = new Date("2026-06-20T08:00:10.000Z");
    await queueModule.flushDriverLocationQueue();
    expect(recordDriverLocationBatch).toHaveBeenCalledTimes(2);
    expect(store.snapshot()).toHaveLength(0);
  });

  it("compresses oversized queues while preserving key state changes and minute samples", async () => {
    const queueModule = await import("../../lib/driver-location-offline-queue");
    recordDriverLocationBatch.mockImplementation(() => new Promise(() => {}));

    for (let index = 0; index < 5_002; index += 1) {
      const minute = String(index % 3).padStart(2, "0");
      await queueModule.enqueueDriverLocationEvent({
        taskId: "task-001",
        recordedAt: `2026-06-20T08:${minute}:00.000Z`,
        lat: 25.03 + index / 10_000,
        lng: 121.56 + index / 10_000,
        accuracyM: 8,
        workState: index === 0 ? "assigned" : index === 1 ? "arrived" : "on_trip",
        appState: "foreground",
        transportMode: "foreground",
        networkType: "unknown",
        preserveKeyEvent: index <= 1,
      });
    }

    const snapshot = store.snapshot();
    expect(snapshot.length).toBeLessThan(5_002);
    expect(snapshot.some((row) => row.workState === "assigned")).toBe(true);
    expect(snapshot.some((row) => row.workState === "arrived")).toBe(true);
    expect(
      new Set(snapshot.map((row) => row.minuteBucket)).size,
    ).toBeGreaterThanOrEqual(3);
  });
});
