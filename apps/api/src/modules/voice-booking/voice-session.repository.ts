import { Injectable, Logger, Optional } from "@nestjs/common";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";

import { DatabaseService } from "../../common/db";
import type {
  VoiceCommandReceiptRecord,
  VoiceConfirmationRecord,
  VoiceSessionEventRecord,
  VoiceSessionRecord,
} from "./voice-booking.repository";

/**
 * Writer-side counterpart to `VoiceBookingRepository` (which is deliberately
 * reader-only, see its module docstring). This repository owns every mutable
 * write to the session state machine and ordered-event ledger described in
 * SD §5/§9.1: control-event ingestion with dedup, the CAS advance of
 * `voice.session`'s control watermarks, dialog-state/lease transitions, and
 * confirmation invalidation. All writes are optimistic-concurrency (CAS) on
 * `session_version`/`lease_epoch` -- there is no blind UPDATE here.
 */

export type VoiceQueryExecutor = {
  query<T extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
};

export type InsertControlEventInput = {
  voiceSessionId: string;
  legId?: string | null;
  source: string;
  providerAccountId?: string | null;
  sourceEventId?: string | null;
  occurredAt: string;
  sequence: number;
  mediaEpoch: number;
  inputEpoch: number;
  leaseEpoch: number;
  eventType: string;
  payload?: unknown;
  payloadRef?: string | null;
};

export type SessionControlPatch = {
  dialogState?: string;
  mediaState?: string;
  controlOwner?: string;
  leaseEpoch?: number;
  commitStatus?: string;
  recordingState?: string;
  confirmationState?: string;
  outcome?: string | null;
  inputEpoch?: number;
  pendingInput?: boolean;
  lastResolvedInputEpoch?: number;
  lastAppliedControlSequence?: number;
};

type VoiceSessionRow = QueryResultRow & {
  voice_session_id: string;
  call_id: string;
  provider_account_id: string;
  provider_call_id: string;
  resource_scope_id: string;
  line_binding_id: string;
  route_profile_id: string;
  route_profile_version: number;
  dialog_state: string;
  media_state: string;
  control_owner: string;
  lease_epoch: number;
  session_version: number;
  commit_status: string;
  recording_state: string;
  confirmation_state: string;
  outcome: string | null;
  input_epoch: number;
  pending_input: boolean;
  last_resolved_input_epoch: number;
  last_applied_control_sequence: number;
  dialogue_snapshot_fence_version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

function mapSessionRow(row: VoiceSessionRow): VoiceSessionRecord {
  return {
    voiceSessionId: row.voice_session_id,
    callId: row.call_id,
    providerAccountId: row.provider_account_id,
    providerCallId: row.provider_call_id,
    resourceScopeId: row.resource_scope_id,
    lineBindingId: row.line_binding_id,
    routeProfileId: row.route_profile_id,
    routeProfileVersion: row.route_profile_version,
    dialogState: row.dialog_state,
    mediaState: row.media_state,
    controlOwner:
      row.control_owner === "handoff" && row.dialog_state === "handoff_pending"
        ? "coordinator"
        : row.control_owner,
    leaseEpoch: row.lease_epoch,
    sessionVersion: row.session_version,
    commitStatus: row.commit_status,
    recordingState: row.recording_state,
    confirmationState: row.confirmation_state,
    outcome: row.outcome,
    inputEpoch: row.input_epoch,
    pendingInput: row.pending_input,
    lastResolvedInputEpoch: row.last_resolved_input_epoch,
    lastAppliedControlSequence: row.last_applied_control_sequence,
    dialogueSnapshotFenceVersion: row.dialogue_snapshot_fence_version,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

type VoiceSessionEventRow = QueryResultRow & {
  event_id: string;
  voice_session_id: string;
  leg_id: string | null;
  source: string;
  provider_account_id: string | null;
  source_event_id: string | null;
  occurred_at: Date | string;
  received_at: Date | string;
  sequence: string | number;
  media_epoch: number;
  input_epoch: number;
  lease_epoch: number;
  event_type: string;
  payload: unknown;
  payload_ref: string | null;
};

function mapSessionEventRow(
  row: VoiceSessionEventRow,
): VoiceSessionEventRecord {
  return {
    eventId: row.event_id,
    voiceSessionId: row.voice_session_id,
    legId: row.leg_id,
    source: row.source,
    providerAccountId: row.provider_account_id,
    sourceEventId: row.source_event_id,
    occurredAt: new Date(row.occurred_at).toISOString(),
    receivedAt: new Date(row.received_at).toISOString(),
    sequence: Number(row.sequence),
    mediaEpoch: row.media_epoch,
    inputEpoch: row.input_epoch,
    leaseEpoch: row.lease_epoch,
    eventType: row.event_type,
    payload: row.payload,
    payloadRef: row.payload_ref,
  };
}

export type InsertDialogueSnapshotInput = {
  voiceSessionId: string;
  sessionVersion: number;
  resourceScopeId: string;
  routeProfileVersion: number;
  leaseEpoch: number;
  inputEpoch: number;
  mediaEpoch: number;
  turnId: string;
  contentKeyVersion: string;
  contentNonce: Buffer;
  contentCiphertext: Buffer;
  contentAuthTag: Buffer;
  retentionExpiresAt: string;
};

export type DialogueSnapshotRow = {
  snapshotId: string;
  voiceSessionId: string;
  sessionVersion: number;
  resourceScopeId: string;
  routeProfileVersion: number;
  leaseEpoch: number;
  inputEpoch: number;
  mediaEpoch: number;
  turnId: string;
  contentKeyVersion: string;
  contentNonce: Buffer;
  contentCiphertext: Buffer;
  contentAuthTag: Buffer;
  retentionExpiresAt: string;
  createdAt: string;
};

type VoiceDialogueSnapshotRow = QueryResultRow & {
  snapshot_id: string;
  voice_session_id: string;
  session_version: number;
  resource_scope_id: string;
  route_profile_version: number;
  lease_epoch: number;
  input_epoch: number;
  media_epoch: number;
  turn_id: string;
  content_key_version: string;
  content_nonce: Buffer;
  content_ciphertext: Buffer;
  content_auth_tag: Buffer;
  retention_expires_at: Date | string;
  created_at: Date | string;
};

function mapDialogueSnapshotRow(
  row: VoiceDialogueSnapshotRow,
): DialogueSnapshotRow {
  return {
    snapshotId: row.snapshot_id,
    voiceSessionId: row.voice_session_id,
    sessionVersion: row.session_version,
    resourceScopeId: row.resource_scope_id,
    routeProfileVersion: row.route_profile_version,
    leaseEpoch: row.lease_epoch,
    inputEpoch: row.input_epoch,
    mediaEpoch: row.media_epoch,
    turnId: row.turn_id,
    contentKeyVersion: row.content_key_version,
    contentNonce: row.content_nonce,
    contentCiphertext: row.content_ciphertext,
    contentAuthTag: row.content_auth_tag,
    retentionExpiresAt: new Date(row.retention_expires_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

type VoiceConfirmationRow = QueryResultRow & {
  confirmation_id: string;
  voice_session_id: string;
  intent_id: string;
  draft_version: number;
  action: string;
  confirmation_method: "speech" | "dtmf";
  snapshot_hash: string;
  readback_playback_id: string;
  readback_completed_event_id: string | null;
  input_epoch: number;
  media_epoch: number;
  control_sequence: number;
  lease_epoch: number;
  recording_checkpoint_id: string | null;
  evidence: unknown;
  state: string;
  consumed_command_id: string | null;
  confirmed_at: Date | string | null;
  expires_at: Date | string;
};

function mapConfirmationRow(
  row: VoiceConfirmationRow,
): VoiceConfirmationRecord {
  return {
    confirmationId: row.confirmation_id,
    voiceSessionId: row.voice_session_id,
    intentId: row.intent_id,
    draftVersion: row.draft_version,
    action: row.action,
    confirmationMethod: row.confirmation_method,
    snapshotHash: row.snapshot_hash,
    readbackPlaybackId: row.readback_playback_id,
    readbackCompletedEventId: row.readback_completed_event_id,
    inputEpoch: row.input_epoch,
    mediaEpoch: row.media_epoch,
    controlSequence: row.control_sequence,
    leaseEpoch: row.lease_epoch,
    recordingCheckpointId: row.recording_checkpoint_id,
    evidence: row.evidence,
    state: row.state,
    consumedCommandId: row.consumed_command_id,
    confirmedAt: row.confirmed_at
      ? new Date(row.confirmed_at).toISOString()
      : null,
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

type VoiceCommandReceiptRow = QueryResultRow & {
  command_id: string;
  intent_id: string;
  brand_id: string;
  call_id: string;
  action: string;
  payload_hash: string;
  status: "pending" | "succeeded" | "rejected";
  order_id: string | null;
  result_version: number;
  error_code: string | null;
  error_reason: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function mapCommandReceiptRow(
  row: VoiceCommandReceiptRow,
): VoiceCommandReceiptRecord {
  return {
    commandId: row.command_id,
    intentId: row.intent_id,
    brandId: row.brand_id,
    callId: row.call_id,
    action: row.action,
    payloadHash: row.payload_hash,
    status: row.status,
    orderId: row.order_id,
    resultVersion: row.result_version,
    errorCode: row.error_code,
    errorReason: row.error_reason,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

@Injectable()
export class VoiceSessionRepository {
  private readonly logger = new Logger(VoiceSessionRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async withTransaction<T>(work: (executor: PoolClient) => Promise<T>) {
    if (!this.isEnabled()) {
      throw new Error("DATABASE_URL is not configured");
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        this.logger.warn(
          `Voice-session transaction rollback failed: ${
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError)
          }`,
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * `forUpdate` (AUDIT-VOICE-APPLICATION-WIRING-20261003 R4, reviewer WIP
   * feedback 2026-10-03T14:20Z): locks the row for the duration of the
   * caller's transaction, so a concurrent `casUpdateSessionControl` cannot
   * advance scope/route/lease/epoch state in between this read and a
   * later write in the SAME transaction (`VoiceSessionService.
   * persistDialogueSnapshot`'s own fence-check-then-insert). Only
   * meaningful when `executor` is itself a transaction-scoped client
   * (`withTransaction`'s own callback argument) -- `FOR UPDATE` outside an
   * explicit transaction releases its lock immediately after the
   * statement, same as any other single-statement implicit transaction.
   */
  async findSessionById(
    voiceSessionId: string,
    executor?: VoiceQueryExecutor,
    forUpdate = false,
  ): Promise<VoiceSessionRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<VoiceSessionRow>(
      `SELECT * FROM voice.session WHERE voice_session_id = $1 LIMIT 1${
        forUpdate ? " FOR UPDATE" : ""
      }`,
      [voiceSessionId],
    );
    const row = result.rows[0];
    return row ? mapSessionRow(row) : null;
  }

  /**
   * SD §9.1/§5.4 dedup: `(source, providerAccountId, sourceEventId)` covers a
   * provider resending the exact same event; `(voiceSessionId, sequence)`
   * (the DB's `uq_voice_session_event_sequence` index) covers a retry that
   * omitted `sourceEventId`, lost process state across a restart, or
   * otherwise arrives with a DIFFERENT `sourceEventId` for the same logical
   * sequence slot than whatever attempt actually landed the row (R4-control,
   * Codex reopen round 19, canonical 2026-10-03T17:41:28Z: an earlier version
   * of this comment claimed a worker that never saw its own `/events` ack
   * "has no way to know it already succeeded" and therefore "must" retry
   * with a new identity -- that is not true. `call-turn-coordinator.ts`'s
   * `TurnSession.pendingSpeechStarts`/`pendingMediaEpochTransitionId` are
   * self-generated by the worker, not received from anywhere, so the worker
   * always CAN retain and reuse one across retries of the same
   * still-unapplied slot, and now does; this
   * fallback lookup exists for the cases retention does not cover -- a
   * process restart, a caller that never retains it, or the `sourceEventId`
   * omitted entirely -- not because retry-with-a-fresh-id is unavoidable).
   * `ON CONFLICT DO NOTHING` fires on EITHER unique index without telling us
   * which one, so the fallback lookup must be able to find the row under
   * either constraint: first by the caller's own
   * (source, providerAccountId, sourceEventId) identity (the literal-retry
   * case), and if that finds nothing, by (voiceSessionId, sequence) (the
   * lost-response case, where the existing row's sourceEventId differs from
   * the one just submitted). Skipping the second lookup is exactly the bug
   * that previously threw "insert conflicted but no existing row could be
   * located" and permanently wedged the attachment -- the caller's retry
   * could never be told the sequence was already durably applied.
   *
   * `provider_account_id` is nullable (this worker never supplies it, see
   * `voice-booking.controller.ts`'s `/events` handler) and ordinary SQL
   * equality (`provider_account_id = $2`) is never true when $2 is NULL, so
   * both lookups use `IS NOT DISTINCT FROM` to stay NULL-safe.
   */
  async insertControlEvent(
    input: InsertControlEventInput,
    executor?: VoiceQueryExecutor,
  ): Promise<{ event: VoiceSessionEventRecord; deduped: boolean }> {
    const exec = executor ?? this.requireDatabase();
    const insertResult = await exec.query<VoiceSessionEventRow>(
      `
        INSERT INTO voice.session_event (
          voice_session_id, leg_id, source, provider_account_id,
          source_event_id, occurred_at, sequence, media_epoch, input_epoch,
          lease_epoch, event_type, payload, payload_ref
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT DO NOTHING
        RETURNING *
      `,
      [
        input.voiceSessionId,
        input.legId ?? null,
        input.source,
        input.providerAccountId ?? null,
        input.sourceEventId ?? null,
        input.occurredAt,
        input.sequence,
        input.mediaEpoch,
        input.inputEpoch,
        input.leaseEpoch,
        input.eventType,
        input.payload ?? null,
        input.payloadRef ?? null,
      ],
    );

    const insertedRow = insertResult.rows[0];
    if (insertedRow) {
      return { event: mapSessionEventRow(insertedRow), deduped: false };
    }

    let existingRow: VoiceSessionEventRow | undefined;
    if (input.sourceEventId) {
      const bySourceEvent = await exec.query<VoiceSessionEventRow>(
        `
          SELECT * FROM voice.session_event
          WHERE source = $1
            AND provider_account_id IS NOT DISTINCT FROM $2
            AND source_event_id = $3
          LIMIT 1
        `,
        [input.source, input.providerAccountId ?? null, input.sourceEventId],
      );
      existingRow = bySourceEvent.rows[0];
    }
    if (!existingRow) {
      const bySequence = await exec.query<VoiceSessionEventRow>(
        `
          SELECT * FROM voice.session_event
          WHERE voice_session_id = $1 AND sequence = $2
          LIMIT 1
        `,
        [input.voiceSessionId, input.sequence],
      );
      existingRow = bySequence.rows[0];
    }

    if (!existingRow) {
      throw new Error(
        "voice.session_event insert conflicted but no existing row could be located",
      );
    }
    return { event: mapSessionEventRow(existingRow), deduped: true };
  }

  async findControlEventsAfter(
    voiceSessionId: string,
    mediaEpoch: number,
    afterSequence: number,
    limit = 200,
    executor?: VoiceQueryExecutor,
  ): Promise<VoiceSessionEventRecord[]> {
    if (!this.isEnabled()) {
      return [];
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<VoiceSessionEventRow>(
      `
        SELECT * FROM voice.session_event
        WHERE voice_session_id = $1 AND media_epoch = $2 AND sequence > $3
        ORDER BY sequence ASC
        LIMIT $4
      `,
      [voiceSessionId, mediaEpoch, afterSequence, limit],
    );
    return result.rows.map(mapSessionEventRow);
  }

  /**
   * The media epoch of the most recently *applied* control event, i.e. the
   * epoch the session's `last_applied_control_sequence` watermark belongs
   * to. Returns `null` when no control event has ever been applied yet
   * (fresh session) -- callers must not conflate that with epoch `0`.
   */
  async findAppliedMediaEpoch(
    voiceSessionId: string,
    executor?: VoiceQueryExecutor,
  ): Promise<number | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const result = await (executor ?? this.requireDatabase()).query<{
      epoch: number | null;
    }>(
      `
        SELECT se.media_epoch AS epoch
        FROM voice.session_event se
        JOIN voice.session s
          ON s.voice_session_id = se.voice_session_id
        WHERE se.voice_session_id = $1
          AND s.last_applied_control_sequence > 0
          AND se.sequence = s.last_applied_control_sequence
        LIMIT 1
      `,
      [voiceSessionId],
    );
    const epoch = result.rows[0]?.epoch;
    return epoch === undefined || epoch === null ? null : Number(epoch);
  }

  /**
   * CAS advance of the session's control-plane state. Every field is
   * optional and left untouched (via `COALESCE`) when omitted; the row is
   * only ever mutated when `session_version` still matches `expected` --
   * this is the single fencing point that keeps a stale worker/epoch from
   * overwriting a newer draft or control state (SD §5.3). Returns `null`
   * (never throws) on a CAS miss so callers can decide the right error.
   */
  async casUpdateSessionControl(
    voiceSessionId: string,
    expectedSessionVersion: number,
    patch: SessionControlPatch,
    executor?: VoiceQueryExecutor,
  ): Promise<VoiceSessionRecord | null> {
    const exec = executor ?? this.requireDatabase();
    const result = await exec.query<VoiceSessionRow>(
      `
        UPDATE voice.session SET
          dialog_state = COALESCE($3, dialog_state),
          media_state = COALESCE($4, media_state),
          control_owner = COALESCE($5, control_owner),
          lease_epoch = COALESCE($6, lease_epoch),
          commit_status = COALESCE($7, commit_status),
          recording_state = COALESCE($8, recording_state),
          confirmation_state = COALESCE($9, confirmation_state),
          outcome = COALESCE($10, outcome),
          input_epoch = COALESCE($11, input_epoch),
          pending_input = COALESCE($12, pending_input),
          last_resolved_input_epoch = COALESCE($13, last_resolved_input_epoch),
          last_applied_control_sequence = COALESCE($14, last_applied_control_sequence),
          session_version = session_version + 1
        WHERE voice_session_id = $1 AND session_version = $2
        RETURNING *
      `,
      [
        voiceSessionId,
        expectedSessionVersion,
        patch.dialogState ?? null,
        patch.mediaState ?? null,
        patch.controlOwner
          ? patch.controlOwner === "coordinator"
            ? "handoff"
            : patch.controlOwner
          : null,
        patch.leaseEpoch ?? null,
        patch.commitStatus ?? null,
        patch.recordingState ?? null,
        patch.confirmationState ?? null,
        patch.outcome ?? null,
        patch.inputEpoch ?? null,
        patch.pendingInput ?? null,
        patch.lastResolvedInputEpoch ?? null,
        patch.lastAppliedControlSequence ?? null,
      ],
    );
    const row = result.rows[0];
    return row ? mapSessionRow(row) : null;
  }

  /**
   * SD §5.4: a substantive correction invalidates whatever confirmation is
   * currently in flight for the session. Scoped to the still-active states
   * only, so an already-consumed or already-invalidated ticket is untouched.
   */
  async invalidateActiveConfirmationForSession(
    voiceSessionId: string,
    executor?: VoiceQueryExecutor,
  ): Promise<VoiceConfirmationRecord | null> {
    const exec = executor ?? this.requireDatabase();
    const result = await exec.query<VoiceConfirmationRow>(
      `
        UPDATE voice.confirmation
        SET state = 'invalidated'
        WHERE voice_session_id = $1
          AND state IN ('readback_playing', 'awaiting_answer', 'accepted')
        RETURNING *
      `,
      [voiceSessionId],
    );
    const row = result.rows[0];
    return row ? mapConfirmationRow(row) : null;
  }

  /**
   * SD §7.3 restart/lease-reaper recovery: pending commands are keyed by
   * durable receipts, not by session/dialog liveness, so this intentionally
   * has no `dialog_state` filter and returns results even for a session
   * that is already `closed`.
   */
  async findPendingReceiptsForSession(
    voiceSessionId: string,
    executor?: VoiceQueryExecutor,
  ): Promise<VoiceCommandReceiptRecord[]> {
    if (!this.isEnabled()) {
      return [];
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<VoiceCommandReceiptRow>(
      `
        SELECT cr.* FROM voice.command_receipt cr
        JOIN voice.intent i ON i.intent_id = cr.intent_id
        WHERE i.voice_session_id = $1 AND cr.status = 'pending'
        ORDER BY cr.created_at ASC
      `,
      [voiceSessionId],
    );
    return result.rows.map(mapCommandReceiptRow);
  }

  /**
   * Dedup key is `(voice_session_id, session_version)` -- a snapshot is only
   * ever written immediately after a `resolveInput` CAS advances the
   * session's revision for the turn whose content this row records, so a
   * retried write for the same already-advanced revision is a safe no-op
   * (same convention as `insertControlEvent`'s `ON CONFLICT DO NOTHING`
   * above), never a duplicate or a silently-discarded second attempt.
   */
  async insertDialogueSnapshot(
    input: InsertDialogueSnapshotInput,
    executor?: VoiceQueryExecutor,
  ): Promise<{ snapshot: DialogueSnapshotRow; deduped: boolean }> {
    const exec = executor ?? this.requireDatabase();
    const insertResult = await exec.query<VoiceDialogueSnapshotRow>(
      `
        INSERT INTO voice.dialogue_snapshot (
          voice_session_id, session_version, resource_scope_id,
          route_profile_version, lease_epoch, input_epoch, media_epoch,
          turn_id, content_key_version, content_nonce, content_ciphertext,
          content_auth_tag, retention_expires_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (voice_session_id, session_version) DO NOTHING
        RETURNING *
      `,
      [
        input.voiceSessionId,
        input.sessionVersion,
        input.resourceScopeId,
        input.routeProfileVersion,
        input.leaseEpoch,
        input.inputEpoch,
        input.mediaEpoch,
        input.turnId,
        input.contentKeyVersion,
        input.contentNonce,
        input.contentCiphertext,
        input.contentAuthTag,
        input.retentionExpiresAt,
      ],
    );

    const insertedRow = insertResult.rows[0];
    if (insertedRow) {
      return { snapshot: mapDialogueSnapshotRow(insertedRow), deduped: false };
    }

    const existing = await exec.query<VoiceDialogueSnapshotRow>(
      `
        SELECT * FROM voice.dialogue_snapshot
        WHERE voice_session_id = $1 AND session_version = $2
        LIMIT 1
      `,
      [input.voiceSessionId, input.sessionVersion],
    );
    const existingRow = existing.rows[0];
    if (!existingRow) {
      throw new Error(
        "voice.dialogue_snapshot insert conflicted but no existing row could be located",
      );
    }
    return { snapshot: mapDialogueSnapshotRow(existingRow), deduped: true };
  }

  /**
   * Excludes a row whose `retention_expires_at` has already passed
   * (reviewer WIP feedback 2026-10-03T14:20Z: "current latest-snapshot read
   * ignores expiry") -- a restoration read must fail closed to "no
   * snapshot" for content past its own retention window, not resurrect it,
   * even if the append-only table has not been purged yet.
   */
  async findLatestDialogueSnapshot(
    voiceSessionId: string,
    executor?: VoiceQueryExecutor,
  ): Promise<DialogueSnapshotRow | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<VoiceDialogueSnapshotRow>(
      `
        SELECT * FROM voice.dialogue_snapshot
        WHERE voice_session_id = $1 AND retention_expires_at > now()
        ORDER BY session_version DESC
        LIMIT 1
      `,
      [voiceSessionId],
    );
    const row = result.rows[0];
    return row ? mapDialogueSnapshotRow(row) : null;
  }

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist late-acceptance
   * fence: exact-version lookup (never "latest") for
   * `VoiceSessionService.resolveDialogueSnapshotOutcome`'s own atomic
   * adjudication -- distinct from `findLatestDialogueSnapshot` above,
   * which answers "what is current" rather than "did THIS exact pending
   * write already land." Deliberately includes an already-expired row
   * (unlike `findLatestDialogueSnapshot`): a write that durably landed and
   * only later expired still proves this exact commit was ACCEPTED, which
   * is the only question this lookup answers.
   */
  async findDialogueSnapshotByVersion(
    voiceSessionId: string,
    sessionVersion: number,
    executor?: VoiceQueryExecutor,
  ): Promise<DialogueSnapshotRow | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<VoiceDialogueSnapshotRow>(
      `
        SELECT * FROM voice.dialogue_snapshot
        WHERE voice_session_id = $1 AND session_version = $2
        LIMIT 1
      `,
      [voiceSessionId, sessionVersion],
    );
    const row = result.rows[0];
    return row ? mapDialogueSnapshotRow(row) : null;
  }

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist late-acceptance
   * fence: the only writer of `voice.session.dialogue_snapshot_fence_version`
   * (see that column's own doc in `V0106__voice_dialogue_snapshot.sql`).
   * Monotonic (`GREATEST`) so a concurrent call fencing an OLDER version
   * can never un-fence a newer one a different call already raised.
   * Callers must already hold this session row `FOR UPDATE` in the SAME
   * transaction as whatever existence check preceded this (see
   * `VoiceSessionService.resolveDialogueSnapshotOutcome`) -- this call's
   * own `UPDATE` re-acquires that same row's write lock regardless, which
   * is what makes the check-then-fence sequence atomic with respect to a
   * concurrent `insertDialogueSnapshot` doing its own check-then-insert
   * against the exact same row.
   */
  async raiseDialogueSnapshotFence(
    voiceSessionId: string,
    sessionVersion: number,
    executor?: VoiceQueryExecutor,
  ): Promise<void> {
    const exec = executor ?? this.requireDatabase();
    await exec.query(
      `
        UPDATE voice.session
        SET dialogue_snapshot_fence_version =
          GREATEST(dialogue_snapshot_fence_version, $2)
        WHERE voice_session_id = $1
      `,
      [voiceSessionId, sessionVersion],
    );
  }

  /**
   * Governed purge candidate scan (reviewer WIP feedback 2026-10-03T14:20Z:
   * "a retention_expires_at label alone is not bounded retention ... a
   * governed purge path"). Returns rows past their own retention window for
   * `VoiceSessionService.purgeExpiredDialogueSnapshots` to run through the
   * existing `VoiceRetentionService.executePurge` legal-hold-aware policy
   * engine before this repository ever deletes anything.
   */
  async findExpiredDialogueSnapshots(
    asOf: string,
    limit = 200,
    executor?: VoiceQueryExecutor,
  ): Promise<DialogueSnapshotRow[]> {
    if (!this.isEnabled()) {
      return [];
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<VoiceDialogueSnapshotRow>(
      `
        SELECT * FROM voice.dialogue_snapshot
        WHERE retention_expires_at <= $1
        ORDER BY retention_expires_at ASC
        LIMIT $2
      `,
      [asOf, limit],
    );
    return result.rows.map(mapDialogueSnapshotRow);
  }

  /**
   * The only caller of this must be `VoiceSessionService.
   * purgeExpiredDialogueSnapshots`, after `VoiceRetentionService.
   * executePurge` has already decided (legal-hold-aware) that THIS exact
   * row is eligible. `voice.dialogue_snapshot` is append-only
   * (`voice._make_append_only`, V0106) -- `DELETE` is rejected by
   * `voice.raise_append_only()` unless the SAME privileged session setting
   * `V0093__voice_retention_and_legal_hold.sql` already defined for
   * `voice.retention_execution_log`'s own lawful purge sweeps is set in
   * THIS transaction boundary; `SET LOCAL` requires `executor` to be a
   * transaction-scoped client, never the bare pool.
   */
  async deleteDialogueSnapshot(
    voiceSessionId: string,
    sessionVersion: number,
    executor?: VoiceQueryExecutor,
  ): Promise<boolean> {
    const run = async (exec: VoiceQueryExecutor) => {
      await exec.query(`SET LOCAL voice.allow_retention_archival = 'on'`);
      const result = await exec.query(
        `DELETE FROM voice.dialogue_snapshot WHERE voice_session_id = $1 AND session_version = $2`,
        [voiceSessionId, sessionVersion],
      );
      return (result.rowCount ?? 0) > 0;
    };
    if (executor) {
      return run(executor);
    }
    return this.withTransaction((tx) => run(tx));
  }

  private requireDatabase(): VoiceQueryExecutor {
    if (!this.isEnabled()) {
      throw new Error("DATABASE_URL is not configured");
    }
    return this.databaseService!;
  }
}
