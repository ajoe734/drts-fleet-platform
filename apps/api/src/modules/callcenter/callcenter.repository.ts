import { Injectable, Logger, Optional } from "@nestjs/common";

import type { CallSessionRecord } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

@Injectable()
export class CallcenterRepository {
  private readonly logger = new Logger(CallcenterRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadSessions() {
    if (!this.isEnabled()) {
      return [] as CallSessionRecord[];
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `
        SELECT record
        FROM crm.phase1_call_sessions
        ORDER BY updated_at DESC, started_at DESC
      `,
    );

    return result.rows.map((row) =>
      this.parseRecord<CallSessionRecord>(
        row.record,
        "crm.phase1_call_sessions",
      ),
    );
  }

  async upsertSession(session: CallSessionRecord) {
    if (!this.isEnabled()) {
      return;
    }

    const updatedAt = session.endedAt ?? new Date().toISOString();

    await this.databaseService!.query(
      `
        INSERT INTO crm.phase1_call_sessions (
          call_id,
          status,
          started_at,
          updated_at,
          record
        ) VALUES (
          $1, $2, $3, $4, $5::jsonb
        )
        ON CONFLICT (call_id) DO UPDATE SET
          status = EXCLUDED.status,
          started_at = EXCLUDED.started_at,
          updated_at = EXCLUDED.updated_at,
          record = EXCLUDED.record
      `,
      [
        session.callId,
        session.status,
        session.startedAt,
        updatedAt,
        JSON.stringify(session),
      ],
    );
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Callcenter persistence skipped during ${context}: ${detail}`,
    );
  }

  async enqueueFinalizeRecording(params: {
    callId: string;
    brandId?: string | null | undefined;
    recordingId?: string | null | undefined;
    linkedOrderId?: string | null | undefined;
    endedAt?: string | null | undefined;
  }): Promise<{ enqueued: boolean; deduped: boolean }> {
    if (!this.isEnabled()) {
      return { enqueued: false, deduped: false };
    }

    const dedupeKey = `finalize_recording:call:${params.callId}`;

    const existing = await this.databaseService!.query<{
      work_id: string;
      payload_ref: string | null;
      status: string;
    }>(
      `SELECT work_id, payload_ref, status FROM voice.work_item WHERE dedupe_key = $1 LIMIT 1`,
      [dedupeKey],
    );

    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (row.payload_ref) {
        try {
          const parsed = JSON.parse(row.payload_ref);
          if (
            params.recordingId &&
            parsed.recordingId &&
            params.recordingId !== parsed.recordingId
          ) {
            throw new ApiRequestError(
              409,
              "VOICE_ACTION_PAYLOAD_CONFLICT",
              "Recording ID differs from existing finalize_recording work item for this call.",
            );
          }
          if (
            params.linkedOrderId &&
            parsed.linkedOrderId &&
            params.linkedOrderId !== parsed.linkedOrderId
          ) {
            throw new ApiRequestError(
              409,
              "VOICE_ACTION_PAYLOAD_CONFLICT",
              "Linked order ID differs from existing finalize_recording work item for this call.",
            );
          }
        } catch (e) {
          if (e instanceof ApiRequestError) throw e;
        }
      }
      return { enqueued: false, deduped: true };
    }

    const payloadRef = JSON.stringify({
      callId: params.callId,
      brandId: params.brandId ?? null,
      recordingId: params.recordingId ?? null,
      linkedOrderId: params.linkedOrderId ?? null,
      closedAt: params.endedAt ?? new Date().toISOString(),
    });

    const insertResult = await this.databaseService!.query(
      `INSERT INTO voice.work_item (
        command_id, voice_session_id, work_type, dedupe_key, payload_ref, run_after
      ) VALUES (NULL, NULL, 'finalize_recording', $1, $2, now())
      ON CONFLICT (dedupe_key) DO NOTHING
      RETURNING work_id`,
      [dedupeKey, payloadRef],
    );

    const enqueued = Boolean(insertResult.rowCount && insertResult.rowCount > 0);
    return { enqueued, deduped: !enqueued };
  }

  async recoverPendingRecordingCalls(): Promise<{
    scanned: number;
    enqueued: number;
  }> {
    if (!this.isEnabled()) {
      return { scanned: 0, enqueued: 0 };
    }

    const candidates = await this.databaseService!.query<{
      call_id: string;
      record: unknown;
    }>(
      `SELECT c.call_id, c.record
      FROM crm.phase1_call_sessions c
      LEFT JOIN voice.work_item w
        ON w.dedupe_key = ('finalize_recording:call:' || c.call_id)
      WHERE (
        c.status = 'closed'
        OR (c.record->'flags')::jsonb ? 'recording_pending'
        OR (c.record->'flags')::jsonb ? 'recording_pending_callback'
      )
      AND (
        (c.record->>'recordingState') IS NULL
        OR (c.record->>'recordingState') != 'bound'
        OR NOT ((c.record->'flags')::jsonb ? 'recording_bound')
      )
      AND (w.work_id IS NULL OR w.status IN ('failed', 'dead_letter'))
      ORDER BY c.started_at ASC
      LIMIT 100`,
    );

    let enqueued = 0;
    for (const row of candidates.rows) {
      const call =
        typeof row.record === "string"
          ? JSON.parse(row.record)
          : ((row.record ?? {}) as Record<string, unknown>);
      const dedupeKey = `finalize_recording:call:${row.call_id}`;
      const payloadRef = JSON.stringify({
        callId: row.call_id,
        brandId: call.brandId ?? null,
        recordingId: call.recordingId ?? null,
        linkedOrderId: call.linkedOrderId ?? null,
        recoveredAt: new Date().toISOString(),
      });

      const res = await this.databaseService!.query(
        `INSERT INTO voice.work_item (command_id, voice_session_id, work_type, dedupe_key, payload_ref, run_after)
        VALUES (NULL, NULL, 'finalize_recording', $1, $2, now())
        ON CONFLICT (dedupe_key) DO NOTHING
        RETURNING work_id`,
        [dedupeKey, payloadRef],
      );
      if (res.rowCount && res.rowCount > 0) {
        enqueued++;
      }
    }

    return { scanned: candidates.rows.length, enqueued };
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    return record as T;
  }
}
