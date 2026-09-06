import { Injectable, Logger, Optional } from "@nestjs/common";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";

import { DatabaseService } from "../../common/db";

/**
 * Read-side records for the voice-booking runtime schema added in
 * UV-EXEC-002 (infra/migrations/V0086-V0088; SD §9.1/§7.5/§7.6).
 *
 * Per SD §15.2 point 1 ("先新增表、actor 型別及相容 readers，再上新 writer"),
 * this repository is reader-only: it exposes the lookups later UV-EXEC-*
 * tasks (session state machine, commit transaction, callback/handoff
 * coordinator) need to reconcile against durable state. Writers land with
 * those tasks, not here.
 */

export type VoiceQueryExecutor = {
  query<T extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
};

export type VoiceSessionRecord = {
  voiceSessionId: string;
  callId: string;
  providerAccountId: string;
  providerCallId: string;
  resourceScopeId: string;
  lineBindingId: string;
  routeProfileId: string;
  routeProfileVersion: number;
  dialogState: string;
  mediaState: string;
  controlOwner: string;
  leaseEpoch: number;
  sessionVersion: number;
  commitStatus: string;
  recordingState: string;
  confirmationState: string;
  outcome: string | null;
  inputEpoch: number;
  pendingInput: boolean;
  lastResolvedInputEpoch: number;
  lastAppliedControlSequence: number;
  createdAt: string;
  updatedAt: string;
};

export type VoiceSessionEventRecord = {
  eventId: string;
  voiceSessionId: string;
  legId: string | null;
  source: string;
  providerAccountId: string | null;
  sourceEventId: string | null;
  occurredAt: string;
  receivedAt: string;
  sequence: number;
  mediaEpoch: number;
  inputEpoch: number;
  leaseEpoch: number;
  eventType: string;
  payload: unknown;
  payloadRef: string | null;
};

export type VoiceIntentRecord = {
  intentId: string;
  voiceSessionId: string;
  action: string;
  currentDraftVersion: number;
  boundOrderId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type VoiceDraftRevisionRecord = {
  intentId: string;
  draftVersion: number;
  slots: Record<string, unknown>;
  validationRefs: string[];
  canonicalSnapshot: Record<string, unknown> | null;
  snapshotHash: string;
  createdAt: string;
};

export type VoiceConfirmationRecord = {
  confirmationId: string;
  voiceSessionId: string;
  intentId: string;
  draftVersion: number;
  action: string;
  confirmationMethod: "speech" | "dtmf";
  snapshotHash: string;
  readbackPlaybackId: string;
  readbackCompletedEventId: string | null;
  inputEpoch: number;
  mediaEpoch: number;
  controlSequence: number;
  leaseEpoch: number;
  recordingCheckpointId: string | null;
  evidence: unknown;
  state: string;
  consumedCommandId: string | null;
  confirmedAt: string | null;
  expiresAt: string;
};

export type VoiceCommandReceiptRecord = {
  commandId: string;
  intentId: string;
  brandId: string;
  callId: string;
  action: string;
  payloadHash: string;
  status: "pending" | "succeeded" | "rejected";
  orderId: string | null;
  resultVersion: number;
  errorCode: string | null;
  errorReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VoiceCallbackTaskRecord = {
  taskId: string;
  voiceSessionId: string;
  contactPhoneLookupToken: string;
  consentSnapshotHash: string;
  status: string;
  scheduledAt: string | null;
  dueAt: string | null;
  priority: string | null;
  reason: string | null;
  resourceScopeId: string | null;
  ownerClaimLease: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type VoiceHandoffRecord = {
  handoffId: string;
  voiceSessionId: string;
  reason: string;
  queueId: string | null;
  state: string;
  agentId: string | null;
  ownerEpoch: number;
  summaryRef: string | null;
  callbackId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VoiceResourceScopeRecord = {
  scopeId: string;
  brandId: string;
  operatingUnitId: string | null;
  runtimeMapping: Record<string, unknown>;
  grantedBy: string;
  status: string;
  version: number;
};

export type VoiceRecordingCheckpointRecord = {
  checkpointId: string;
  callId: string;
  recordingId: string | null;
  manifestVersion: number;
  manifest: unknown;
  manifestHash: string;
  coverage: unknown;
  policyVersion: string;
  verifiedAt: string | null;
};

export type DispatchResourceReservationRecord = {
  reservationId: string;
  resourceType: "driver" | "vehicle";
  resourceId: string;
  orderId: string;
  assignmentId: string | null;
  reservationGroupId: string;
  status: "held" | "occupied" | "released";
  expiresAt: string | null;
  version: number;
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
    controlOwner: row.control_owner,
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

type VoiceIntentRow = QueryResultRow & {
  intent_id: string;
  voice_session_id: string;
  action: string;
  current_draft_version: number;
  bound_order_id: string | null;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
};

function mapIntentRow(row: VoiceIntentRow): VoiceIntentRecord {
  return {
    intentId: row.intent_id,
    voiceSessionId: row.voice_session_id,
    action: row.action,
    currentDraftVersion: row.current_draft_version,
    boundOrderId: row.bound_order_id,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

type VoiceDraftRevisionRow = QueryResultRow & {
  intent_id: string;
  draft_version: number;
  slots: unknown;
  validation_refs: unknown;
  canonical_snapshot: unknown;
  snapshot_hash: string;
  created_at: Date | string;
};

function mapDraftRevisionRow(
  row: VoiceDraftRevisionRow,
): VoiceDraftRevisionRecord {
  return {
    intentId: row.intent_id,
    draftVersion: row.draft_version,
    slots: (row.slots ?? {}) as Record<string, unknown>,
    validationRefs: (row.validation_refs ?? []) as string[],
    canonicalSnapshot: row.canonical_snapshot as Record<string, unknown> | null,
    snapshotHash: row.snapshot_hash,
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

type VoiceCallbackTaskRow = QueryResultRow & {
  task_id: string;
  voice_session_id: string;
  contact_phone_lookup_token: string;
  consent_snapshot_hash: string;
  status: string;
  scheduled_at: Date | string | null;
  due_at: Date | string | null;
  priority: string | null;
  reason: string | null;
  resource_scope_id: string | null;
  owner_claim_lease: string | null;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

function mapCallbackTaskRow(
  row: VoiceCallbackTaskRow,
): VoiceCallbackTaskRecord {
  return {
    taskId: row.task_id,
    voiceSessionId: row.voice_session_id,
    contactPhoneLookupToken: row.contact_phone_lookup_token,
    consentSnapshotHash: row.consent_snapshot_hash,
    status: row.status,
    scheduledAt: row.scheduled_at
      ? new Date(row.scheduled_at).toISOString()
      : null,
    dueAt: row.due_at ? new Date(row.due_at).toISOString() : null,
    priority: row.priority,
    reason: row.reason,
    resourceScopeId: row.resource_scope_id,
    ownerClaimLease: row.owner_claim_lease,
    version: row.version,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

type VoiceHandoffRow = QueryResultRow & {
  handoff_id: string;
  voice_session_id: string;
  reason: string;
  queue_id: string | null;
  state: string;
  agent_id: string | null;
  owner_epoch: number;
  summary_ref: string | null;
  callback_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function mapHandoffRow(row: VoiceHandoffRow): VoiceHandoffRecord {
  return {
    handoffId: row.handoff_id,
    voiceSessionId: row.voice_session_id,
    reason: row.reason,
    queueId: row.queue_id,
    state: row.state,
    agentId: row.agent_id,
    ownerEpoch: row.owner_epoch,
    summaryRef: row.summary_ref,
    callbackId: row.callback_id,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

type VoiceResourceScopeRow = QueryResultRow & {
  scope_id: string;
  brand_id: string;
  operating_unit_id: string | null;
  runtime_mapping: unknown;
  granted_by: string;
  status: string;
  version: number;
};

function mapResourceScopeRow(
  row: VoiceResourceScopeRow,
): VoiceResourceScopeRecord {
  return {
    scopeId: row.scope_id,
    brandId: row.brand_id,
    operatingUnitId: row.operating_unit_id,
    runtimeMapping: (row.runtime_mapping ?? {}) as Record<string, unknown>,
    grantedBy: row.granted_by,
    status: row.status,
    version: row.version,
  };
}

export type VoiceLineBindingRecord = {
  lineBindingId: string;
  providerAccountId: string;
  dnis: string;
  brandId: string;
  operatingProfileId: string;
  queueId: string | null;
  enabled: boolean;
  version: number;
};

type VoiceLineBindingRow = QueryResultRow & {
  line_binding_id: string;
  provider_account_id: string;
  dnis: string;
  brand_id: string;
  operating_profile_id: string;
  queue_id: string | null;
  enabled: boolean;
  version: number;
};

function mapLineBindingRow(row: VoiceLineBindingRow): VoiceLineBindingRecord {
  return {
    lineBindingId: row.line_binding_id,
    providerAccountId: row.provider_account_id,
    dnis: row.dnis,
    brandId: row.brand_id,
    operatingProfileId: row.operating_profile_id,
    queueId: row.queue_id,
    enabled: row.enabled,
    version: row.version,
  };
}

type VoiceRecordingCheckpointRow = QueryResultRow & {
  checkpoint_id: string;
  call_id: string;
  recording_id: string | null;
  manifest_version: number;
  manifest: unknown;
  manifest_hash: string;
  coverage: unknown;
  policy_version: string;
  verified_at: Date | string | null;
};

function mapRecordingCheckpointRow(
  row: VoiceRecordingCheckpointRow,
): VoiceRecordingCheckpointRecord {
  return {
    checkpointId: row.checkpoint_id,
    callId: row.call_id,
    recordingId: row.recording_id,
    manifestVersion: row.manifest_version,
    manifest: row.manifest,
    manifestHash: row.manifest_hash,
    coverage: row.coverage,
    policyVersion: row.policy_version,
    verifiedAt: row.verified_at
      ? new Date(row.verified_at).toISOString()
      : null,
  };
}

type DispatchResourceReservationRow = QueryResultRow & {
  reservation_id: string;
  resource_type: "driver" | "vehicle";
  resource_id: string;
  order_id: string;
  assignment_id: string | null;
  reservation_group_id: string;
  status: "held" | "occupied" | "released";
  expires_at: Date | string | null;
  version: number;
};

function mapReservationRow(
  row: DispatchResourceReservationRow,
): DispatchResourceReservationRecord {
  return {
    reservationId: row.reservation_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    orderId: row.order_id,
    assignmentId: row.assignment_id,
    reservationGroupId: row.reservation_group_id,
    status: row.status,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    version: row.version,
  };
}

@Injectable()
export class VoiceBookingRepository {
  private readonly logger = new Logger(VoiceBookingRepository.name);

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
          `Voice-booking transaction rollback failed: ${
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

  async findSessionById(
    voiceSessionId: string,
    executor?: VoiceQueryExecutor,
  ): Promise<VoiceSessionRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<VoiceSessionRow>(
      `SELECT * FROM voice.session WHERE voice_session_id = $1 LIMIT 1`,
      [voiceSessionId],
    );
    const row = result.rows[0];
    return row ? mapSessionRow(row) : null;
  }

  async findSessionByCallId(
    callId: string,
    executor?: VoiceQueryExecutor,
  ): Promise<VoiceSessionRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<VoiceSessionRow>(
      `SELECT * FROM voice.session WHERE call_id = $1 LIMIT 1`,
      [callId],
    );
    const row = result.rows[0];
    return row ? mapSessionRow(row) : null;
  }

  async findSessionByProviderCall(
    providerAccountId: string,
    providerCallId: string,
    executor?: VoiceQueryExecutor,
  ): Promise<VoiceSessionRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<VoiceSessionRow>(
      `
        SELECT * FROM voice.session
        WHERE provider_account_id = $1 AND provider_call_id = $2
        LIMIT 1
      `,
      [providerAccountId, providerCallId],
    );
    const row = result.rows[0];
    return row ? mapSessionRow(row) : null;
  }

  async listSessionEvents(
    voiceSessionId: string,
    sinceSequence = 0,
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
        WHERE voice_session_id = $1 AND sequence > $2
        ORDER BY sequence ASC
      `,
      [voiceSessionId, sinceSequence],
    );
    return result.rows.map(mapSessionEventRow);
  }

  async findActiveCreateIntent(
    voiceSessionId: string,
    executor?: VoiceQueryExecutor,
  ): Promise<VoiceIntentRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<VoiceIntentRow>(
      `
        SELECT * FROM voice.intent
        WHERE voice_session_id = $1 AND action = 'create_owned_order'
        LIMIT 1
      `,
      [voiceSessionId],
    );
    const row = result.rows[0];
    return row ? mapIntentRow(row) : null;
  }

  async findIntentById(
    intentId: string,
    executor?: VoiceQueryExecutor,
  ): Promise<VoiceIntentRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<VoiceIntentRow>(
      `SELECT * FROM voice.intent WHERE intent_id = $1 LIMIT 1`,
      [intentId],
    );
    const row = result.rows[0];
    return row ? mapIntentRow(row) : null;
  }

  async findLatestDraftRevision(
    intentId: string,
    executor?: VoiceQueryExecutor,
  ): Promise<VoiceDraftRevisionRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<VoiceDraftRevisionRow>(
      `
        SELECT * FROM voice.draft_revision
        WHERE intent_id = $1
        ORDER BY draft_version DESC
        LIMIT 1
      `,
      [intentId],
    );
    const row = result.rows[0];
    return row ? mapDraftRevisionRow(row) : null;
  }

  async findDraftRevision(
    intentId: string,
    draftVersion: number,
    executor?: VoiceQueryExecutor,
  ): Promise<VoiceDraftRevisionRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<VoiceDraftRevisionRow>(
      `
        SELECT * FROM voice.draft_revision
        WHERE intent_id = $1 AND draft_version = $2
        LIMIT 1
      `,
      [intentId, draftVersion],
    );
    const row = result.rows[0];
    return row ? mapDraftRevisionRow(row) : null;
  }

  async findActiveConfirmation(
    intentId: string,
    draftVersion: number,
    action: string,
    executor?: VoiceQueryExecutor,
  ): Promise<VoiceConfirmationRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<VoiceConfirmationRow>(
      `
        SELECT * FROM voice.confirmation
        WHERE intent_id = $1 AND draft_version = $2 AND action = $3
          AND state IN ('readback_playing', 'awaiting_answer', 'accepted')
        LIMIT 1
      `,
      [intentId, draftVersion, action],
    );
    const row = result.rows[0];
    return row ? mapConfirmationRow(row) : null;
  }

  /**
   * SD §7.2: reconciliation lookup by the durable action key, so a caller
   * that lost the original response can recover the receipt without a
   * commandId (`GET .../sessions/{sessionId}/intents/{intentId}/actions/{action}`).
   */
  async findReceiptByActionKey(
    brandId: string,
    callId: string,
    intentId: string,
    action: string,
    executor?: VoiceQueryExecutor,
  ): Promise<VoiceCommandReceiptRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<VoiceCommandReceiptRow>(
      `
        SELECT * FROM voice.command_receipt
        WHERE brand_id = $1 AND call_id = $2 AND intent_id = $3 AND action = $4
        LIMIT 1
      `,
      [brandId, callId, intentId, action],
    );
    const row = result.rows[0];
    return row ? mapCommandReceiptRow(row) : null;
  }

  async findReceiptById(
    commandId: string,
    executor?: VoiceQueryExecutor,
  ): Promise<VoiceCommandReceiptRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<VoiceCommandReceiptRow>(
      `SELECT * FROM voice.command_receipt WHERE command_id = $1 LIMIT 1`,
      [commandId],
    );
    const row = result.rows[0];
    return row ? mapCommandReceiptRow(row) : null;
  }

  async findActiveCallbackTaskForSession(
    voiceSessionId: string,
    executor?: VoiceQueryExecutor,
  ): Promise<VoiceCallbackTaskRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<VoiceCallbackTaskRow>(
      `
        SELECT * FROM voice.callback_task
        WHERE voice_session_id = $1
          AND status NOT IN ('completed', 'cancelled', 'unreachable')
        LIMIT 1
      `,
      [voiceSessionId],
    );
    const row = result.rows[0];
    return row ? mapCallbackTaskRow(row) : null;
  }

  async findActiveHandoffForSession(
    voiceSessionId: string,
    executor?: VoiceQueryExecutor,
  ): Promise<VoiceHandoffRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<VoiceHandoffRow>(
      `
        SELECT * FROM voice.handoff
        WHERE voice_session_id = $1 AND state IN ('queued', 'claimed', 'active')
        LIMIT 1
      `,
      [voiceSessionId],
    );
    const row = result.rows[0];
    return row ? mapHandoffRow(row) : null;
  }

  async findResourceScopeById(
    scopeId: string,
    executor?: VoiceQueryExecutor,
  ): Promise<VoiceResourceScopeRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<VoiceResourceScopeRow>(
      `SELECT * FROM voice.resource_scope WHERE scope_id = $1 LIMIT 1`,
      [scopeId],
    );
    const row = result.rows[0];
    return row ? mapResourceScopeRow(row) : null;
  }

  async findActiveResourceScopeForBrand(
    brandId: string,
    operatingUnitId: string | null,
    executor?: VoiceQueryExecutor,
  ): Promise<VoiceResourceScopeRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<VoiceResourceScopeRow>(
      `
        SELECT * FROM voice.resource_scope
        WHERE brand_id = $1
          AND COALESCE(operating_unit_id, '') = COALESCE($2, '')
          AND status = 'active'
        LIMIT 1
      `,
      [brandId, operatingUnitId],
    );
    const row = result.rows[0];
    return row ? mapResourceScopeRow(row) : null;
  }

  /**
   * SD §4.1/§4.3: the only trusted line-scope lookup. Callers must pass the
   * *provider-verified* destination number (DNIS) and provider account, never
   * the caller's asserted ANI -- `voice.line_binding` has no column for the
   * caller's number at all, so there is no way to smuggle it in here.
   *
   * Returns every enabled row for the pair (normally 0 or 1; the DB partial
   * unique index `uq_voice_line_binding_active` already forbids more than
   * one) so the caller can fail closed on an unexpected multi-match instead
   * of silently picking one.
   */
  async findEnabledLineBindings(
    providerAccountId: string,
    dnis: string,
    executor?: VoiceQueryExecutor,
  ): Promise<VoiceLineBindingRecord[]> {
    if (!this.isEnabled()) {
      return [];
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<VoiceLineBindingRow>(
      `
        SELECT * FROM voice.line_binding
        WHERE provider_account_id = $1 AND dnis = $2 AND enabled
      `,
      [providerAccountId, dnis],
    );
    return result.rows.map(mapLineBindingRow);
  }

  async findRecordingCheckpointById(
    checkpointId: string,
    executor?: VoiceQueryExecutor,
  ): Promise<VoiceRecordingCheckpointRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<VoiceRecordingCheckpointRow>(
      `SELECT * FROM voice.recording_checkpoint WHERE checkpoint_id = $1 LIMIT 1`,
      [checkpointId],
    );
    const row = result.rows[0];
    return row ? mapRecordingCheckpointRow(row) : null;
  }

  async findLatestRecordingCheckpointForCall(
    callId: string,
    executor?: VoiceQueryExecutor,
  ): Promise<VoiceRecordingCheckpointRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<VoiceRecordingCheckpointRow>(
      `
        SELECT * FROM voice.recording_checkpoint
        WHERE call_id = $1
        ORDER BY manifest_version DESC
        LIMIT 1
      `,
      [callId],
    );
    const row = result.rows[0];
    return row ? mapRecordingCheckpointRow(row) : null;
  }

  /**
   * SD §7.6: active (held/occupied) reservations for an order, across every
   * writer that competes for the same driver/vehicle -- not just voice.
   */
  async findActiveReservationsForOrder(
    orderId: string,
    executor?: VoiceQueryExecutor,
  ): Promise<DispatchResourceReservationRecord[]> {
    if (!this.isEnabled()) {
      return [];
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<DispatchResourceReservationRow>(
      `
        SELECT * FROM ops.dispatch_resource_reservations
        WHERE order_id = $1 AND status IN ('held', 'occupied')
        ORDER BY updated_at DESC
      `,
      [orderId],
    );
    return result.rows.map(mapReservationRow);
  }

  async findActiveReservationForResource(
    resourceType: "driver" | "vehicle",
    resourceId: string,
    executor?: VoiceQueryExecutor,
  ): Promise<DispatchResourceReservationRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const result = await (
      executor ?? this.requireDatabase()
    ).query<DispatchResourceReservationRow>(
      `
        SELECT * FROM ops.dispatch_resource_reservations
        WHERE resource_type = $1 AND resource_id = $2
          AND status IN ('held', 'occupied')
        LIMIT 1
      `,
      [resourceType, resourceId],
    );
    const row = result.rows[0];
    return row ? mapReservationRow(row) : null;
  }

  private requireDatabase(): VoiceQueryExecutor {
    if (!this.isEnabled()) {
      throw new Error("DATABASE_URL is not configured");
    }
    return this.databaseService!;
  }
}
