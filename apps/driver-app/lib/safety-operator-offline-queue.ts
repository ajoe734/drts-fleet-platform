import * as SecureStore from "expo-secure-store";

const SAFETY_OPERATOR_QUEUE_KEY = "drts.safetyOperator.queue";

export type SafetyOperatorQueueKind =
  | "pretrip"
  | "takeover_report"
  | "incident_upload"
  | "shift_handover";

export type SafetyOperatorQueueStatus =
  | "queued"
  | "syncing"
  | "failed"
  | "synced";

export interface SafetyOperatorQueueEntry<TPayload = unknown> {
  id: string;
  clientGeneratedId: string;
  kind: SafetyOperatorQueueKind;
  status: SafetyOperatorQueueStatus;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
  errorMessage: string | null;
  duplicateAccepted: boolean;
  payload: TPayload;
  receipt: unknown | null;
}

export interface SafetyOperatorQueueSnapshot {
  items: SafetyOperatorQueueEntry[];
  queuedCount: number;
  failedCount: number;
  syncingCount: number;
  lastSyncedAt: string | null;
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

async function persistQueue(items: SafetyOperatorQueueEntry[]): Promise<void> {
  await SecureStore.setItemAsync(SAFETY_OPERATOR_QUEUE_KEY, JSON.stringify(items));
}

export async function loadSafetyOperatorQueue(): Promise<SafetyOperatorQueueEntry[]> {
  const raw = await SecureStore.getItemAsync(SAFETY_OPERATOR_QUEUE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as SafetyOperatorQueueEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    await SecureStore.deleteItemAsync(SAFETY_OPERATOR_QUEUE_KEY);
    return [];
  }
}

export async function getSafetyOperatorQueueSnapshot(): Promise<SafetyOperatorQueueSnapshot> {
  const items = await loadSafetyOperatorQueue();
  const sorted = [...items].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
  const syncedItems = sorted.filter((item) => item.syncedAt);
  return {
    items: sorted,
    queuedCount: sorted.filter((item) => item.status === "queued").length,
    failedCount: sorted.filter((item) => item.status === "failed").length,
    syncingCount: sorted.filter((item) => item.status === "syncing").length,
    lastSyncedAt: syncedItems[0]?.syncedAt ?? null,
  };
}

export async function enqueueSafetyOperatorItem<TPayload>(
  kind: SafetyOperatorQueueKind,
  payload: TPayload,
  clientGeneratedId = createLocalId(kind),
): Promise<SafetyOperatorQueueEntry<TPayload>> {
  const now = new Date().toISOString();
  const entry: SafetyOperatorQueueEntry<TPayload> = {
    id: createLocalId("so-queue"),
    clientGeneratedId,
    kind,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    syncedAt: null,
    errorMessage: null,
    duplicateAccepted: false,
    payload,
    receipt: null,
  };

  const items = await loadSafetyOperatorQueue();
  const deduped = items.filter(
    (item) => item.clientGeneratedId !== clientGeneratedId,
  );
  deduped.unshift(entry);
  await persistQueue(deduped);
  return entry;
}

export async function updateSafetyOperatorQueueEntry(
  clientGeneratedId: string,
  updater: (
    current: SafetyOperatorQueueEntry,
  ) => SafetyOperatorQueueEntry | null,
): Promise<SafetyOperatorQueueEntry | null> {
  const items = await loadSafetyOperatorQueue();
  let updatedEntry: SafetyOperatorQueueEntry | null = null;
  const updatedItems = items.flatMap((item) => {
    if (item.clientGeneratedId !== clientGeneratedId) {
      return [item];
    }

    const next = updater(item);
    if (!next) {
      return [];
    }
    updatedEntry = next;
    return [next];
  });

  await persistQueue(updatedItems);
  return updatedEntry;
}

export async function markSafetyOperatorQueueSyncing(
  clientGeneratedId: string,
): Promise<SafetyOperatorQueueEntry | null> {
  return updateSafetyOperatorQueueEntry(clientGeneratedId, (current) => ({
    ...current,
    status: "syncing",
    updatedAt: new Date().toISOString(),
    errorMessage: null,
  }));
}

export async function markSafetyOperatorQueueFailed(
  clientGeneratedId: string,
  errorMessage: string,
): Promise<SafetyOperatorQueueEntry | null> {
  return updateSafetyOperatorQueueEntry(clientGeneratedId, (current) => ({
    ...current,
    status: "failed",
    updatedAt: new Date().toISOString(),
    errorMessage,
  }));
}

export async function markSafetyOperatorQueueSynced(
  clientGeneratedId: string,
  receipt: unknown,
  duplicateAccepted = false,
): Promise<SafetyOperatorQueueEntry | null> {
  return updateSafetyOperatorQueueEntry(clientGeneratedId, (current) => ({
    ...current,
    status: "synced",
    updatedAt: new Date().toISOString(),
    syncedAt: new Date().toISOString(),
    errorMessage: null,
    duplicateAccepted,
    receipt,
  }));
}

export async function clearSafetyOperatorSyncedQueueEntries(): Promise<void> {
  const items = await loadSafetyOperatorQueue();
  await persistQueue(items.filter((item) => item.status !== "synced"));
}
