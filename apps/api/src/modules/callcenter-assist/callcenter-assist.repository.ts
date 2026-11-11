import { Injectable, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";

import { DatabaseService } from "../../common/db";
import type {
  AssistDraftSource,
  AssistExtractor,
  AssistField,
  AssistFieldMap,
  AssistFieldOutcome,
  AssistFieldOutcomeRecord,
  AssistTranscriptSegment,
  CallcenterAssistDraft,
} from "./assist-fields";

type AssistQueryExecutor = Pick<DatabaseService, "query">;

type DraftRow = QueryResultRow & {
  call_id: string;
  source: AssistDraftSource;
  handoff_id: string | null;
  voice_session_id: string | null;
  fields: AssistFieldMap;
  transcript: AssistTranscriptSegment[];
  draft_version: number;
  extractor: AssistExtractor;
  submitted_order_id: string | null;
  submitted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  expires_at: Date | string;
};

export interface AssistOutcomeAggregateRow {
  field: AssistField;
  source: AssistDraftSource;
  outcome: AssistFieldOutcome;
  count: number;
}

const iso = (value: Date | string) => new Date(value).toISOString();

function mapDraftRow(row: DraftRow): CallcenterAssistDraft {
  return {
    callId: row.call_id,
    source: row.source,
    handoffId: row.handoff_id,
    voiceSessionId: row.voice_session_id,
    fields: row.fields ?? {},
    transcript: row.transcript ?? [],
    draftVersion: row.draft_version,
    extractor: row.extractor,
    submittedOrderId: row.submitted_order_id,
    submittedAt: row.submitted_at ? iso(row.submitted_at) : null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    expiresAt: iso(row.expires_at),
  };
}

const clone = <T>(value: T): T => structuredClone(value);

/**
 * crm.callcenter_assist_drafts / crm.callcenter_assist_field_outcomes
 * (V0136). Falls back to process memory when no database is configured
 * (unit tests, local fixtures), with the same per-call serialization.
 */
@Injectable()
export class CallcenterAssistRepository {
  private readonly memoryDrafts = new Map<string, CallcenterAssistDraft>();
  private readonly memoryOutcomes: AssistFieldOutcomeRecord[] = [];
  private readonly memoryLocks = new Map<string, Promise<unknown>>();

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async findDraft(
    callId: string,
    now: Date = new Date(),
  ): Promise<CallcenterAssistDraft | null> {
    if (!this.isEnabled()) {
      const draft = this.memoryDrafts.get(callId);
      return draft && Date.parse(draft.expiresAt) > now.getTime()
        ? clone(draft)
        : null;
    }
    const result = await this.databaseService!.query<DraftRow>(
      `SELECT * FROM crm.callcenter_assist_drafts
       WHERE call_id = $1 AND expires_at > $2`,
      [callId, now.toISOString()],
    );
    return result.rows[0] ? mapDraftRow(result.rows[0]) : null;
  }

  /**
   * Read-modify-write one call's draft under a lock. `work` receives the
   * current (unexpired) draft and returns the draft to store, or null to
   * leave the row untouched. Concurrent transcript batches for the same call
   * are serialized; an expired row is replaced, never revived.
   */
  async updateDraft<T>(
    callId: string,
    work: (
      current: CallcenterAssistDraft | null,
    ) => Promise<{ next: CallcenterAssistDraft | null; result: T }>,
  ): Promise<T> {
    if (!this.isEnabled()) {
      return this.withMemoryLock(callId, async () => {
        const stored = this.memoryDrafts.get(callId);
        const current =
          stored && Date.parse(stored.expiresAt) > Date.now()
            ? clone(stored)
            : null;
        const { next, result } = await work(current);
        if (next) {
          this.memoryDrafts.set(callId, clone(next));
        }
        return result;
      });
    }
    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '3s'");
      await client.query("SET LOCAL statement_timeout = '8s'");
      // Serializes the first insert too, when no row exists to lock yet.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`callcenter-assist:${callId}`],
      );
      const existing = await client.query<DraftRow>(
        `SELECT * FROM crm.callcenter_assist_drafts
         WHERE call_id = $1 FOR UPDATE`,
        [callId],
      );
      const row = existing.rows[0];
      const current =
        row && Date.parse(iso(row.expires_at)) > Date.now()
          ? mapDraftRow(row)
          : null;
      const { next, result } = await work(current);
      if (next) {
        await this.upsertDraft(next, client);
      }
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async upsertDraft(
    draft: CallcenterAssistDraft,
    executor: AssistQueryExecutor,
  ) {
    await executor.query(
      `INSERT INTO crm.callcenter_assist_drafts (
         call_id, source, handoff_id, voice_session_id, fields, transcript,
         draft_version, extractor, submitted_order_id, submitted_at,
         created_at, expires_at
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (call_id) DO UPDATE SET
         source = EXCLUDED.source,
         handoff_id = EXCLUDED.handoff_id,
         voice_session_id = EXCLUDED.voice_session_id,
         fields = EXCLUDED.fields,
         transcript = EXCLUDED.transcript,
         draft_version = EXCLUDED.draft_version,
         extractor = EXCLUDED.extractor,
         submitted_order_id = EXCLUDED.submitted_order_id,
         submitted_at = EXCLUDED.submitted_at,
         created_at = EXCLUDED.created_at,
         expires_at = EXCLUDED.expires_at`,
      [
        draft.callId,
        draft.source,
        draft.handoffId,
        draft.voiceSessionId,
        JSON.stringify(draft.fields),
        JSON.stringify(draft.transcript),
        draft.draftVersion,
        draft.extractor,
        draft.submittedOrderId,
        draft.submittedAt,
        draft.createdAt,
        draft.expiresAt,
      ],
    );
  }

  /** Idempotent per (call, order, field); returns how many rows were new. */
  async insertOutcomes(records: readonly AssistFieldOutcomeRecord[]) {
    if (!records.length) {
      return 0;
    }
    if (!this.isEnabled()) {
      let inserted = 0;
      for (const record of records) {
        const exists = this.memoryOutcomes.some(
          (existing) =>
            existing.callId === record.callId &&
            existing.orderId === record.orderId &&
            existing.field === record.field,
        );
        if (!exists) {
          this.memoryOutcomes.push(clone(record));
          inserted += 1;
        }
      }
      return inserted;
    }
    const values: unknown[] = [];
    const tuples = records.map((record, index) => {
      const base = index * 9;
      values.push(
        record.callId,
        record.orderId,
        record.field,
        record.source,
        record.outcome,
        record.aiStatus,
        record.aiConfidence,
        record.agentId,
        record.recordedAt,
      );
      return `(${Array.from({ length: 9 }, (_, offset) => `$${base + offset + 1}`).join(", ")})`;
    });
    const result = await this.databaseService!.query(
      `INSERT INTO crm.callcenter_assist_field_outcomes (
         call_id, order_id, field, source, outcome, ai_status, ai_confidence,
         agent_id, recorded_at
       ) VALUES ${tuples.join(", ")}
       ON CONFLICT ON CONSTRAINT uq_callcenter_assist_field_outcome DO NOTHING`,
      values,
    );
    return result.rowCount ?? 0;
  }

  async aggregateOutcomes(
    since: Date,
    until: Date,
  ): Promise<AssistOutcomeAggregateRow[]> {
    if (!this.isEnabled()) {
      const counts = new Map<string, AssistOutcomeAggregateRow>();
      for (const record of this.memoryOutcomes) {
        const at = Date.parse(record.recordedAt);
        if (at < since.getTime() || at >= until.getTime()) continue;
        const key = `${record.field}|${record.source}|${record.outcome}`;
        const row = counts.get(key) ?? {
          field: record.field,
          source: record.source,
          outcome: record.outcome,
          count: 0,
        };
        row.count += 1;
        counts.set(key, row);
      }
      return [...counts.values()];
    }
    const result = await this.databaseService!.query<
      QueryResultRow & {
        field: AssistField;
        source: AssistDraftSource;
        outcome: AssistFieldOutcome;
        count: string | number;
      }
    >(
      `SELECT field, source, outcome, count(*) AS count
       FROM crm.callcenter_assist_field_outcomes
       WHERE recorded_at >= $1 AND recorded_at < $2
       GROUP BY field, source, outcome`,
      [since.toISOString(), until.toISOString()],
    );
    return result.rows.map((row) => ({
      field: row.field,
      source: row.source,
      outcome: row.outcome,
      count: Number(row.count),
    }));
  }

  /** Delete expired drafts (caller transcripts are personal data). */
  async purgeExpired(now: Date = new Date(), limit = 500): Promise<number> {
    if (!this.isEnabled()) {
      let removed = 0;
      for (const [callId, draft] of this.memoryDrafts) {
        if (removed >= limit) break;
        if (Date.parse(draft.expiresAt) <= now.getTime()) {
          this.memoryDrafts.delete(callId);
          removed += 1;
        }
      }
      return removed;
    }
    const result = await this.databaseService!.query(
      `DELETE FROM crm.callcenter_assist_drafts
       WHERE call_id IN (
         SELECT call_id FROM crm.callcenter_assist_drafts
         WHERE expires_at <= $1
         ORDER BY expires_at
         LIMIT $2
       )`,
      [now.toISOString(), limit],
    );
    return result.rowCount ?? 0;
  }

  private async withMemoryLock<T>(
    callId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const previous = this.memoryLocks.get(callId) ?? Promise.resolve();
    const run = previous.then(work, work);
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    this.memoryLocks.set(callId, settled);
    try {
      return await run;
    } finally {
      if (this.memoryLocks.get(callId) === settled) {
        this.memoryLocks.delete(callId);
      }
    }
  }
}
