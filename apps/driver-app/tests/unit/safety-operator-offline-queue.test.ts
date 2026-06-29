import { beforeEach, describe, expect, it, vi } from "vitest";

const secureStore = vi.hoisted(() => {
  const memory = new Map<string, string>();
  return {
    memory,
    getItemAsync: vi.fn(async (key: string) => memory.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, value: string) => {
      memory.set(key, value);
    }),
    deleteItemAsync: vi.fn(async (key: string) => {
      memory.delete(key);
    }),
  };
});

vi.mock("expo-secure-store", () => secureStore);

import {
  clearSafetyOperatorSyncedQueueEntries,
  enqueueSafetyOperatorItem,
  getSafetyOperatorQueueSnapshot,
  markSafetyOperatorQueueFailed,
  markSafetyOperatorQueueSynced,
} from "@/lib/safety-operator-offline-queue";
import { buildSafetyOperatorQueuedTakeoverReport } from "@/lib/safety-operator-takeover-draft";

describe("safety operator offline queue", () => {
  beforeEach(() => {
    secureStore.memory.clear();
    vi.clearAllMocks();
  });

  it("dedupes by clientGeneratedId and marks duplicate replay as synced", async () => {
    const firstPayload = buildSafetyOperatorQueuedTakeoverReport(
      {
        clientGeneratedReportId: "takeover-001",
        safetyOperatorId: "so-1",
        vehicleId: "AV-7720",
        orderId: "order-1",
        sandboxProgramId: "sandbox-1",
        shiftId: "shift-1",
        assignmentId: "assignment-1",
        correlationId: "corr-1",
        trigger: "safety_operator",
        reasonCode: "obstacle",
        disposition: "continued_manual",
        fsdResumed: false,
        bookmarkId: "bookmark-1",
        incidentId: "incident-1",
        evidenceArtifactIds: ["artifact-1"],
        notes: "first",
        occurredAt: "2026-06-26T10:00:00.000Z",
      },
      {
        originalSystemOccurredAt: "2026-06-26T09:59:30.000Z",
        correctedOccurredAt: "2026-06-26T10:00:00.000Z",
        corrections: [],
      },
    );
    const secondPayload = buildSafetyOperatorQueuedTakeoverReport(
      {
        clientGeneratedReportId: "takeover-001",
        safetyOperatorId: "so-1",
        vehicleId: "AV-7720",
        orderId: "order-1",
        sandboxProgramId: "sandbox-1",
        shiftId: "shift-1",
        assignmentId: "assignment-1",
        correlationId: "corr-1",
        trigger: "safety_operator",
        reasonCode: "obstacle",
        disposition: "continued_manual",
        fsdResumed: false,
        bookmarkId: "bookmark-1",
        incidentId: "incident-1",
        evidenceArtifactIds: ["artifact-1"],
        notes: "second",
        occurredAt: "2026-06-26T10:05:00.000Z",
      },
      {
        originalSystemOccurredAt: "2026-06-26T10:01:00.000Z",
        correctedOccurredAt: "2026-06-26T10:05:00.000Z",
        corrections: [
          {
            editedAt: "2026-06-26T10:05:30.000Z",
            previousOccurredAt: "2026-06-26T10:01:00.000Z",
            nextOccurredAt: "2026-06-26T10:05:00.000Z",
          },
        ],
      },
    );

    await enqueueSafetyOperatorItem(
      "takeover_report",
      firstPayload,
      "takeover-001",
    );
    await enqueueSafetyOperatorItem(
      "takeover_report",
      secondPayload,
      "takeover-001",
    );

    let snapshot = await getSafetyOperatorQueueSnapshot();
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.queuedCount).toBe(1);
    expect(snapshot.items[0]?.payload).toEqual(secondPayload);

    await markSafetyOperatorQueueSynced(
      "takeover-001",
      { reportId: "report-001" },
      true,
    );

    snapshot = await getSafetyOperatorQueueSnapshot();
    expect(snapshot.items[0]?.status).toBe("synced");
    expect(snapshot.items[0]?.duplicateAccepted).toBe(true);
  });

  it("preserves failed entries and clears synced entries only", async () => {
    await enqueueSafetyOperatorItem(
      "incident_upload",
      { note: "queued" },
      "i-1",
    );
    await enqueueSafetyOperatorItem(
      "shift_handover",
      { note: "queued" },
      "h-1",
    );

    await markSafetyOperatorQueueFailed("i-1", "network down");
    await markSafetyOperatorQueueSynced("h-1", { closeoutId: "c-1" });

    await clearSafetyOperatorSyncedQueueEntries();

    const snapshot = await getSafetyOperatorQueueSnapshot();
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]?.clientGeneratedId).toBe("i-1");
    expect(snapshot.failedCount).toBe(1);
  });
});
