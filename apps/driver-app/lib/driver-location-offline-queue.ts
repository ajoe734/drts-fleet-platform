import * as SQLite from "expo-sqlite";
import type {
  DriverLocationHeartbeatAck,
  DriverLocationHeartbeatBatchResponse,
  DriverLocationHeartbeatEnvelope,
} from "@drts/contracts";

import {
  getDriverClient,
  getDriverDeviceId,
  getDriverId,
  recoverDriverSessionFromApiError,
} from "@/lib/api-client";

const DRIVER_LOCATION_QUEUE_DB = "drts-driver-location-queue.db";
const FLUSH_INTERVAL_MS = 10_000;
const FLUSH_BATCH_SIZE = 50;
const MAX_BACKOFF_MS = 5 * 60 * 1000;
const RETENTION_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_QUEUE_DEPTH = 5_000;
const SEQUENCE_METADATA_KEY = "driver_location_sequence";

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
};

type QueueEventDraft = Omit<
  DriverLocationHeartbeatEnvelope,
  "deviceId" | "driverId" | "eventId" | "sequenceNo"
> & {
  preserveKeyEvent?: boolean;
};

type QueueStore = {
  close?: () => Promise<void>;
  countActiveRows(): Promise<number>;
  deleteEventIds(eventIds: string[]): Promise<void>;
  enqueue(event: QueueEventRow): Promise<void>;
  getReadyBatch(limit: number, nowIso: string): Promise<QueueEventRow[]>;
  getRetentionCandidates(): Promise<QueueEventRow[]>;
  initialize(): Promise<void>;
  markAcked(eventIds: string[]): Promise<void>;
  markPermanentFailures(
    eventIds: string[],
    errorMessage: string,
  ): Promise<void>;
  markRetryableFailures(
    failures: Array<{
      eventId: string;
      nextAttemptAt: string;
      retryCount: number;
      errorMessage: string;
    }>,
  ): Promise<void>;
  markSending(eventIds: string[]): Promise<void>;
  pruneExpired(cutoffIso: string): Promise<void>;
  reserveSequenceNo(): Promise<number>;
  resetSendingToPending(): Promise<void>;
};

type QueueStoreFactory = () => QueueStore | Promise<QueueStore>;

let storeFactory: QueueStoreFactory = () => new SQLiteDriverLocationQueueStore();
let storePromise: Promise<QueueStore> | null = null;
let initializePromise: Promise<void> | null = null;
let flushLoop: Promise<void> = Promise.resolve();
let flushTimer: ReturnType<typeof setInterval> | null = null;
let nowProvider = () => new Date();

function toMinuteBucket(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 16);
}

function isRetryableApiError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  const apiMatch = /^API error (\d+):/s.exec(error.message);
  if (!apiMatch) {
    return true;
  }

  const status = Number.parseInt(apiMatch[1], 10);
  return status < 400 || status >= 500 || status === 401 || status === 403;
}

function formatQueueError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "Unknown driver location queue error.";
}

function buildBackoffMs(retryCount: number): number {
  return Math.min(
    MAX_BACKOFF_MS,
    FLUSH_INTERVAL_MS * 2 ** Math.max(0, Math.min(retryCount - 1, 5)),
  );
}

function addMs(isoTimestamp: string, deltaMs: number): string {
  return new Date(Date.parse(isoTimestamp) + deltaMs).toISOString();
}

function toQueueRow(
  payload: DriverLocationHeartbeatEnvelope,
  preserveKeyEvent: boolean,
): QueueEventRow {
  return {
    eventId: payload.eventId,
    sequenceNo: payload.sequenceNo,
    status: "pending",
    recordedAt: payload.recordedAt,
    workState: payload.workState,
    minuteBucket: toMinuteBucket(payload.recordedAt),
    retryCount: 0,
    isIncident: payload.workState === "incident",
    isKeyEvent: preserveKeyEvent,
    payload,
  };
}

async function getStore(): Promise<QueueStore> {
  if (!storePromise) {
    storePromise = Promise.resolve(storeFactory());
  }

  return storePromise;
}

async function compressQueueIfNeeded(): Promise<void> {
  const store = await getStore();
  const count = await store.countActiveRows();
  if (count <= MAX_QUEUE_DEPTH) {
    return;
  }

  const rows = await store.getRetentionCandidates();
  const keepIds = new Set<string>();
  const minuteBucketsKept = new Set<string>();
  let previousState: DriverLocationHeartbeatEnvelope["workState"] | null = null;

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row.isKeyEvent || row.isIncident) {
      keepIds.add(row.eventId);
      continue;
    }

    if (!minuteBucketsKept.has(row.minuteBucket)) {
      keepIds.add(row.eventId);
      minuteBucketsKept.add(row.minuteBucket);
    }
  }

  for (const row of rows) {
    if (previousState !== row.workState) {
      keepIds.add(row.eventId);
      previousState = row.workState;
    }
  }

  const deleteIds = rows
    .filter((row) => !keepIds.has(row.eventId))
    .map((row) => row.eventId);
  if (deleteIds.length > 0) {
    await store.deleteEventIds(deleteIds);
  }
}

async function ensureInitialized(): Promise<void> {
  if (!initializePromise) {
    initializePromise = (async () => {
      const store = await getStore();
      await store.initialize();
      await store.resetSendingToPending();
      await store.pruneExpired(
        new Date(nowProvider().getTime() - RETENTION_WINDOW_MS).toISOString(),
      );
      await compressQueueIfNeeded();
      if (!flushTimer) {
        flushTimer = setInterval(() => {
          void flushDriverLocationQueue();
        }, FLUSH_INTERVAL_MS);
      }
    })();
  }

  await initializePromise;
}

async function applyFlushResponse(
  rows: QueueEventRow[],
  response: DriverLocationHeartbeatBatchResponse,
): Promise<void> {
  const store = await getStore();
  const ackById = new Map<string, DriverLocationHeartbeatAck>();
  for (const ack of response.items) {
    ackById.set(ack.eventId, ack);
  }

  const ackedIds: string[] = [];
  const retryableFailures: Array<{
    eventId: string;
    nextAttemptAt: string;
    retryCount: number;
    errorMessage: string;
  }> = [];

  const nowIso = nowProvider().toISOString();
  for (const row of rows) {
    const ack = ackById.get(row.eventId);
    if (ack?.accepted) {
      ackedIds.push(row.eventId);
      continue;
    }

    const nextRetryCount = row.retryCount + 1;
    retryableFailures.push({
      eventId: row.eventId,
      retryCount: nextRetryCount,
      nextAttemptAt: addMs(nowIso, buildBackoffMs(nextRetryCount)),
      errorMessage: "Heartbeat batch response did not acknowledge this event.",
    });
  }

  if (ackedIds.length > 0) {
    await store.markAcked(ackedIds);
    await store.deleteEventIds(ackedIds);
  }

  if (retryableFailures.length > 0) {
    await store.markRetryableFailures(retryableFailures);
  }
}

async function failBatch(
  rows: QueueEventRow[],
  error: unknown,
): Promise<void> {
  const store = await getStore();
  const nowIso = nowProvider().toISOString();
  const errorMessage = formatQueueError(error);

  if (!isRetryableApiError(error)) {
    await store.markPermanentFailures(
      rows.map((row) => row.eventId),
      errorMessage,
    );
    return;
  }

  await store.markRetryableFailures(
    rows.map((row) => {
      const retryCount = row.retryCount + 1;
      return {
        eventId: row.eventId,
        retryCount,
        nextAttemptAt: addMs(nowIso, buildBackoffMs(retryCount)),
        errorMessage,
      };
    }),
  );
}

export async function initializeDriverLocationOfflineQueue(): Promise<void> {
  await ensureInitialized();
}

export function flushDriverLocationQueue(): Promise<void> {
  flushLoop = flushLoop
    .catch(() => undefined)
    .then(async () => {
      await ensureInitialized();

      const store = await getStore();
      await store.pruneExpired(
        new Date(nowProvider().getTime() - RETENTION_WINDOW_MS).toISOString(),
      );

      const nowIso = nowProvider().toISOString();
      const batch = await store.getReadyBatch(FLUSH_BATCH_SIZE, nowIso);
      if (batch.length === 0) {
        return;
      }

      await store.markSending(batch.map((row) => row.eventId));

      try {
        const response = await getDriverClient().recordDriverLocationBatch({
          items: batch.map((row) => row.payload),
        });
        await applyFlushResponse(batch, response);
      } catch (error) {
        await recoverDriverSessionFromApiError(error).catch(() => false);
        await failBatch(batch, error);
      }

      await compressQueueIfNeeded();
    });

  return flushLoop;
}

export async function enqueueDriverLocationEvent(
  draft: QueueEventDraft,
): Promise<DriverLocationHeartbeatEnvelope> {
  await ensureInitialized();

  const store = await getStore();
  const deviceId = await getDriverDeviceId();
  const driverId = getDriverId();
  const sequenceNo = await store.reserveSequenceNo();
  const eventId = `${deviceId}:${sequenceNo}`;

  const payload: DriverLocationHeartbeatEnvelope = {
    ...draft,
    deviceId,
    driverId,
    eventId,
    sequenceNo,
  };

  await store.enqueue(toQueueRow(payload, draft.preserveKeyEvent === true));
  await compressQueueIfNeeded();
  void flushDriverLocationQueue();

  return payload;
}

export async function __resetDriverLocationOfflineQueueForTests(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }

  initializePromise = null;
  storePromise = null;
  flushLoop = Promise.resolve();
  nowProvider = () => new Date();
}

export function __setDriverLocationQueueStoreFactoryForTests(
  factory: QueueStoreFactory,
): void {
  storeFactory = factory;
}

export function __setDriverLocationQueueNowProviderForTests(
  provider: () => Date,
): void {
  nowProvider = provider;
}

class SQLiteDriverLocationQueueStore implements QueueStore {
  private databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

  async close(): Promise<void> {
    const database = await this.getDatabase();
    await database.closeAsync();
  }

  async countActiveRows(): Promise<number> {
    const database = await this.getDatabase();
    const row = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM pending_location_events WHERE status != 'acked'",
    );
    return row?.count ?? 0;
  }

  async deleteEventIds(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) {
      return;
    }

    const database = await this.getDatabase();
    const placeholders = eventIds.map(() => "?").join(", ");
    await database.runAsync(
      `DELETE FROM pending_location_events WHERE event_id IN (${placeholders})`,
      eventIds,
    );
  }

  async enqueue(event: QueueEventRow): Promise<void> {
    const database = await this.getDatabase();
    await database.runAsync(
      `INSERT INTO pending_location_events (
        event_id,
        sequence_no,
        recorded_at,
        work_state,
        status,
        retry_count,
        next_attempt_at,
        last_error,
        is_incident,
        is_key_event,
        minute_bucket,
        payload_json,
        updated_at
      ) VALUES (?, ?, ?, ?, 'pending', 0, NULL, NULL, ?, ?, ?, ?, ?)`,
      [
        event.eventId,
        event.sequenceNo,
        event.recordedAt,
        event.workState,
        event.isIncident ? 1 : 0,
        event.isKeyEvent ? 1 : 0,
        event.minuteBucket,
        JSON.stringify(event.payload),
        nowProvider().toISOString(),
      ],
    );
  }

  async getReadyBatch(limit: number, nowIso: string): Promise<QueueEventRow[]> {
    const database = await this.getDatabase();
    const rows = await database.getAllAsync<{
      event_id: string;
      sequence_no: number;
      recorded_at: string;
      work_state: DriverLocationHeartbeatEnvelope["workState"];
      status: QueueStatus;
      retry_count: number;
      is_incident: number;
      is_key_event: number;
      minute_bucket: string;
      payload_json: string;
    }>(
      `SELECT
        event_id,
        sequence_no,
        recorded_at,
        work_state,
        status,
        retry_count,
        is_incident,
        is_key_event,
        minute_bucket,
        payload_json
      FROM pending_location_events
      WHERE status IN ('pending', 'failed_retryable')
        AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      ORDER BY sequence_no ASC
      LIMIT ?`,
      [nowIso, limit],
    );

    return rows.map((row) => ({
      eventId: row.event_id,
      sequenceNo: row.sequence_no,
      recordedAt: row.recorded_at,
      workState: row.work_state,
      status: row.status,
      retryCount: row.retry_count,
      isIncident: row.is_incident === 1,
      isKeyEvent: row.is_key_event === 1,
      minuteBucket: row.minute_bucket,
      payload: JSON.parse(row.payload_json) as DriverLocationHeartbeatEnvelope,
    }));
  }

  async getRetentionCandidates(): Promise<QueueEventRow[]> {
    const database = await this.getDatabase();
    const rows = await database.getAllAsync<{
      event_id: string;
      sequence_no: number;
      recorded_at: string;
      work_state: DriverLocationHeartbeatEnvelope["workState"];
      status: QueueStatus;
      retry_count: number;
      is_incident: number;
      is_key_event: number;
      minute_bucket: string;
      payload_json: string;
    }>(
      `SELECT
        event_id,
        sequence_no,
        recorded_at,
        work_state,
        status,
        retry_count,
        is_incident,
        is_key_event,
        minute_bucket,
        payload_json
      FROM pending_location_events
      WHERE status != 'acked'
      ORDER BY sequence_no ASC`,
    );

    return rows.map((row) => ({
      eventId: row.event_id,
      sequenceNo: row.sequence_no,
      recordedAt: row.recorded_at,
      workState: row.work_state,
      status: row.status,
      retryCount: row.retry_count,
      isIncident: row.is_incident === 1,
      isKeyEvent: row.is_key_event === 1,
      minuteBucket: row.minute_bucket,
      payload: JSON.parse(row.payload_json) as DriverLocationHeartbeatEnvelope,
    }));
  }

  async initialize(): Promise<void> {
    const database = await this.getDatabase();
    await database.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS pending_location_events (
        event_id TEXT PRIMARY KEY NOT NULL,
        sequence_no INTEGER NOT NULL UNIQUE,
        recorded_at TEXT NOT NULL,
        work_state TEXT NOT NULL,
        status TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT,
        last_error TEXT,
        is_incident INTEGER NOT NULL DEFAULT 0,
        is_key_event INTEGER NOT NULL DEFAULT 0,
        minute_bucket TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_pending_location_events_ready
      ON pending_location_events (status, next_attempt_at, sequence_no);
      CREATE INDEX IF NOT EXISTS idx_pending_location_events_retention
      ON pending_location_events (recorded_at, sequence_no);
      CREATE TABLE IF NOT EXISTS queue_metadata (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
  }

  async markAcked(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) {
      return;
    }

    const database = await this.getDatabase();
    const placeholders = eventIds.map(() => "?").join(", ");
    await database.runAsync(
      `UPDATE pending_location_events
      SET status = 'acked', updated_at = ?
      WHERE event_id IN (${placeholders})`,
      [nowProvider().toISOString(), ...eventIds],
    );
  }

  async markPermanentFailures(
    eventIds: string[],
    errorMessage: string,
  ): Promise<void> {
    if (eventIds.length === 0) {
      return;
    }

    const database = await this.getDatabase();
    const placeholders = eventIds.map(() => "?").join(", ");
    await database.runAsync(
      `UPDATE pending_location_events
      SET status = 'failed_permanent',
          last_error = ?,
          updated_at = ?
      WHERE event_id IN (${placeholders})`,
      [errorMessage, nowProvider().toISOString(), ...eventIds],
    );
  }

  async markRetryableFailures(
    failures: Array<{
      eventId: string;
      nextAttemptAt: string;
      retryCount: number;
      errorMessage: string;
    }>,
  ): Promise<void> {
    const database = await this.getDatabase();
    for (const failure of failures) {
      await database.runAsync(
        `UPDATE pending_location_events
        SET status = 'failed_retryable',
            retry_count = ?,
            next_attempt_at = ?,
            last_error = ?,
            updated_at = ?
        WHERE event_id = ?`,
        [
          failure.retryCount,
          failure.nextAttemptAt,
          failure.errorMessage,
          nowProvider().toISOString(),
          failure.eventId,
        ],
      );
    }
  }

  async markSending(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) {
      return;
    }

    const database = await this.getDatabase();
    const placeholders = eventIds.map(() => "?").join(", ");
    await database.runAsync(
      `UPDATE pending_location_events
      SET status = 'sending', updated_at = ?
      WHERE event_id IN (${placeholders})`,
      [nowProvider().toISOString(), ...eventIds],
    );
  }

  async pruneExpired(cutoffIso: string): Promise<void> {
    const database = await this.getDatabase();
    await database.runAsync(
      `DELETE FROM pending_location_events
      WHERE recorded_at < ?`,
      [cutoffIso],
    );
  }

  async reserveSequenceNo(): Promise<number> {
    const database = await this.getDatabase();
    await database.execAsync("BEGIN IMMEDIATE");
    try {
      const metadata = await database.getFirstAsync<{ value: string }>(
        "SELECT value FROM queue_metadata WHERE key = ?",
        [SEQUENCE_METADATA_KEY],
      );
      const nextSequenceNo = Number.parseInt(metadata?.value ?? "0", 10) + 1;
      await database.runAsync(
        `INSERT INTO queue_metadata (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [SEQUENCE_METADATA_KEY, String(nextSequenceNo)],
      );
      await database.execAsync("COMMIT");
      return nextSequenceNo;
    } catch (error) {
      await database.execAsync("ROLLBACK");
      throw error;
    }
  }

  async resetSendingToPending(): Promise<void> {
    const database = await this.getDatabase();
    await database.runAsync(
      `UPDATE pending_location_events
      SET status = 'pending', updated_at = ?
      WHERE status = 'sending'`,
      [nowProvider().toISOString()],
    );
  }

  private async getDatabase(): Promise<SQLite.SQLiteDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = SQLite.openDatabaseAsync(DRIVER_LOCATION_QUEUE_DB);
    }

    return this.databasePromise;
  }
}
