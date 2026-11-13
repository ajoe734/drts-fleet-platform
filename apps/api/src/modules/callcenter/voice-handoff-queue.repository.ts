import { Injectable, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";

import { DatabaseService } from "../../common/db";
import type { VoiceCtiTransferTargetKind } from "./voice-cti.adapter";

export type HandoffQueueStatus =
  | "queued"
  | "assigned"
  | "bridging"
  | "connected"
  | "unanswered"
  | "caller_dropped"
  | "agent_dropped"
  | "failed"
  | "completed";

export interface HandoffQueueItem {
  handoffId: string;
  voiceSessionId: string;
  callId: string;
  resourceScopeId: string;
  priority: "normal" | "urgent" | "emergency";
  reason: string;
  status: HandoffQueueStatus;
  assignedAgentId: string | null;
  targetKind: VoiceCtiTransferTargetKind;
  target: string;
  summary: unknown;
  enqueuedAt: string;
  updatedAt: string;
  redispatchCount: number;
  bridgeAttempts: number;
  lastError: string | null;
}

/** V0086 `voice.handoff.state` is the coarse lifecycle its "one active
 * handoff per session" index relies on; the queue keeps the detailed status
 * in `queue_status` (V0136). Unanswered and agent-dropped items stay active
 * because they can still be redispatched to another agent. */
export function coarseHandoffState(status: HandoffQueueStatus) {
  switch (status) {
    case "queued":
    case "unanswered":
    case "agent_dropped":
      return "queued";
    case "assigned":
    case "bridging":
      return "claimed";
    case "connected":
      return "active";
    case "completed":
      return "completed";
    case "caller_dropped":
    case "failed":
      return "abandoned";
  }
}

export const OPEN_HANDOFF_STATUSES: readonly HandoffQueueStatus[] = [
  "queued",
  "assigned",
  "bridging",
  "connected",
  "unanswered",
  "agent_dropped",
];

const PRIORITY_RANK = { emergency: 0, urgent: 1, normal: 2 } as const;

export function compareHandoffQueueItems(
  left: HandoffQueueItem,
  right: HandoffQueueItem,
) {
  return (
    PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority] ||
    left.enqueuedAt.localeCompare(right.enqueuedAt)
  );
}

type HandoffRow = QueryResultRow & {
  handoff_id: string;
  voice_session_id: string;
  call_id: string | null;
  resource_scope_id: string | null;
  reason: string;
  queue_status: HandoffQueueStatus;
  agent_id: string | null;
  priority: HandoffQueueItem["priority"];
  target_kind: VoiceCtiTransferTargetKind;
  target: string;
  summary: unknown;
  enqueued_at: Date | string;
  updated_at: Date | string;
  redispatch_count: number;
  bridge_attempts: number;
  last_error: string | null;
};

function mapRow(row: HandoffRow): HandoffQueueItem {
  return {
    handoffId: row.handoff_id,
    voiceSessionId: row.voice_session_id,
    callId: row.call_id ?? "",
    resourceScopeId: row.resource_scope_id ?? "",
    priority: row.priority,
    reason: row.reason,
    status: row.queue_status,
    assignedAgentId: row.agent_id,
    targetKind: row.target_kind,
    target: row.target,
    summary: row.summary ?? null,
    enqueuedAt: new Date(row.enqueued_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    redispatchCount: row.redispatch_count,
    bridgeAttempts: row.bridge_attempts,
    lastError: row.last_error,
  };
}

type QueueExecutor = Pick<DatabaseService, "query">;

/**
 * Durable storage for the human handoff queue in `voice.handoff`. Before
 * V0136 the queue lived in a per-module in-memory Map: an API restart lost
 * every waiting caller, and the voice module and the callcenter module each
 * held a different Map, so a takeover never found the AI's handoff.
 */
@Injectable()
export class VoiceHandoffQueueRepository {
  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async save(item: HandoffQueueItem): Promise<HandoffQueueItem> {
    const result = await this.databaseService!.query<HandoffRow>(
      `INSERT INTO voice.handoff (
         handoff_id, voice_session_id, call_id, resource_scope_id, reason,
         state, queue_status, agent_id, priority, target_kind, target,
         summary, enqueued_at, redispatch_count, bridge_attempts, last_error
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16)
       ON CONFLICT (handoff_id) DO UPDATE SET
         reason = EXCLUDED.reason,
         state = EXCLUDED.state,
         queue_status = EXCLUDED.queue_status,
         agent_id = EXCLUDED.agent_id,
         priority = EXCLUDED.priority,
         target_kind = EXCLUDED.target_kind,
         target = EXCLUDED.target,
         summary = EXCLUDED.summary,
         redispatch_count = EXCLUDED.redispatch_count,
         bridge_attempts = EXCLUDED.bridge_attempts,
         last_error = EXCLUDED.last_error
       RETURNING *`,
      [
        item.handoffId,
        item.voiceSessionId,
        item.callId || null,
        item.resourceScopeId || null,
        item.reason,
        coarseHandoffState(item.status),
        item.status,
        item.assignedAgentId,
        item.priority,
        item.targetKind,
        item.target,
        JSON.stringify(item.summary ?? null),
        item.enqueuedAt,
        item.redispatchCount,
        item.bridgeAttempts,
        item.lastError,
      ],
    );
    return mapRow(result.rows[0]!);
  }

  async find(
    handoffId: string,
    executor: QueueExecutor = this.databaseService!,
    forUpdate = false,
  ): Promise<HandoffQueueItem | null> {
    const result = await executor.query<HandoffRow>(
      `SELECT * FROM voice.handoff WHERE handoff_id = $1${forUpdate ? " FOR UPDATE" : ""}`,
      [handoffId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findActiveForSession(
    voiceSessionId: string,
  ): Promise<HandoffQueueItem | null> {
    const result = await this.databaseService!.query<HandoffRow>(
      `SELECT * FROM voice.handoff
       WHERE voice_session_id = $1 AND state IN ('queued', 'claimed', 'active')
       LIMIT 1`,
      [voiceSessionId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findOpenByCallId(callId: string): Promise<HandoffQueueItem | null> {
    const result = await this.databaseService!.query<HandoffRow>(
      `SELECT * FROM voice.handoff
       WHERE call_id = $1 AND queue_status = ANY($2::text[])
       ORDER BY enqueued_at DESC
       LIMIT 1`,
      [callId, OPEN_HANDOFF_STATUSES],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async listOpen(limit = 200): Promise<HandoffQueueItem[]> {
    const result = await this.databaseService!.query<HandoffRow>(
      `SELECT * FROM voice.handoff
       WHERE state IN ('queued', 'claimed', 'active')
       ORDER BY CASE priority WHEN 'emergency' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END,
                enqueued_at
       LIMIT $1`,
      [limit],
    );
    return result.rows.map(mapRow);
  }

  /** Atomic read-modify-write of one item; `mutate` may throw to abort. */
  async update(
    handoffId: string,
    mutate: (item: HandoffQueueItem | null) => HandoffQueueItem,
  ): Promise<HandoffQueueItem> {
    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '3s'");
      const current = await this.find(handoffId, client, true);
      const next = mutate(current ? { ...current } : null);
      const result = await client.query<HandoffRow>(
        `UPDATE voice.handoff SET
           state = $2, queue_status = $3, agent_id = $4, target = $5,
           redispatch_count = $6, bridge_attempts = $7, last_error = $8
         WHERE handoff_id = $1
         RETURNING *`,
        [
          handoffId,
          coarseHandoffState(next.status),
          next.status,
          next.assignedAgentId,
          next.target,
          next.redispatchCount,
          next.bridgeAttempts,
          next.lastError,
        ],
      );
      await client.query("COMMIT");
      return mapRow(result.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
