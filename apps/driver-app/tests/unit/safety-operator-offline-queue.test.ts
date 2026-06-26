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

describe("safety operator offline queue", () => {
  beforeEach(() => {
    secureStore.memory.clear();
    vi.clearAllMocks();
  });

  it("dedupes by clientGeneratedId and marks duplicate replay as synced", async () => {
    await enqueueSafetyOperatorItem(
      "takeover_report",
      { occurredAt: "2026-06-26T10:00:00.000Z" },
      "takeover-001",
    );
    await enqueueSafetyOperatorItem(
      "takeover_report",
      { occurredAt: "2026-06-26T10:05:00.000Z" },
      "takeover-001",
    );

    let snapshot = await getSafetyOperatorQueueSnapshot();
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.queuedCount).toBe(1);
    expect(snapshot.items[0]?.payload).toEqual({
      occurredAt: "2026-06-26T10:05:00.000Z",
    });

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
