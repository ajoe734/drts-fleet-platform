import { randomUUID } from "node:crypto";
import { Injectable, Optional } from "@nestjs/common";
import { ApiRequestError } from "../../common/api-envelope";
import {
  type VoiceCtiAdapter,
  type VoiceCtiTransferTargetKind,
  type VoiceHangupReason,
} from "./voice-cti.adapter";
import {
  compareHandoffQueueItems,
  type HandoffQueueItem,
  type HandoffQueueStatus,
  OPEN_HANDOFF_STATUSES,
  VoiceHandoffQueueRepository,
} from "./voice-handoff-queue.repository";

export type { HandoffQueueItem, HandoffQueueStatus };

export interface EnqueueHandoffInput {
  handoffId?: string | undefined;
  voiceSessionId: string;
  callId: string;
  resourceScopeId: string;
  priority?: "normal" | "urgent" | "emergency" | undefined;
  reason: string;
  targetKind?: VoiceCtiTransferTargetKind | undefined;
  target?: string | undefined;
  summary?: unknown;
}

/**
 * SD §5.4 / §12.5 Callcenter handoff queue and control transfer manager.
 *
 * Rules:
 * - Maintains queue for incoming human handoffs.
 * - CTI clear/bridge 不確定時保留 pending 而非宣稱已接通.
 * - Handles queue timeout / unanswered (未接).
 * - Handles post-bridge drop (接後掉線): if agent drops while caller is still on the line,
 *   allows re-dispatching (重新分派) back to queue or coordinator.
 *
 * CALLCENTER-AI-ASSIST-20261111: items are stored in `voice.handoff` when a
 * database is configured, so a waiting caller survives an API restart and
 * every API instance and module sees the same queue. Without a database
 * (unit tests, fixtures) the same rules run over an in-process Map.
 */
@Injectable()
export class VoiceHandoffQueueService {
  private readonly items = new Map<string, HandoffQueueItem>();

  constructor(
    @Optional() private readonly repository?: VoiceHandoffQueueRepository,
  ) {}

  private get durable() {
    return this.repository?.isEnabled() ?? false;
  }

  async enqueue(input: EnqueueHandoffInput): Promise<HandoffQueueItem> {
    const handoffId = input.handoffId ?? randomUUID();
    const now = new Date().toISOString();
    const existing = await this.getHandoffItem(handoffId);

    const item: HandoffQueueItem = {
      handoffId,
      voiceSessionId: input.voiceSessionId,
      callId: input.callId,
      resourceScopeId: input.resourceScopeId,
      priority: input.priority ?? "normal",
      reason: input.reason,
      status: "queued",
      assignedAgentId: null,
      targetKind: input.targetKind ?? "human_queue",
      target: input.target ?? "ops-default-queue",
      summary: input.summary ?? null,
      // Re-enqueueing the same handoff (a second AI handoff request for a
      // session that is still waiting) keeps its place in the queue.
      enqueuedAt: existing?.enqueuedAt ?? now,
      updatedAt: now,
      redispatchCount: existing?.redispatchCount ?? 0,
      bridgeAttempts: existing?.bridgeAttempts ?? 0,
      lastError: null,
    };

    if (this.durable) {
      return this.repository!.save(item);
    }
    this.items.set(handoffId, item);
    return { ...item };
  }

  async getHandoffItem(handoffId: string): Promise<HandoffQueueItem | null> {
    if (this.durable) {
      return this.repository!.find(handoffId);
    }
    const item = this.items.get(handoffId);
    return item ? { ...item } : null;
  }

  /** The open handoff a session already has, so a repeated request reuses it. */
  async findActiveForSession(
    voiceSessionId: string,
  ): Promise<HandoffQueueItem | null> {
    if (this.durable) {
      return this.repository!.findActiveForSession(voiceSessionId);
    }
    const item = [...this.items.values()].find(
      (candidate) =>
        candidate.voiceSessionId === voiceSessionId &&
        OPEN_HANDOFF_STATUSES.includes(candidate.status),
    );
    return item ? { ...item } : null;
  }

  /** Open items (waiting, being bridged or connected), most urgent first. */
  async listQueuedItems(): Promise<HandoffQueueItem[]> {
    if (this.durable) {
      return this.repository!.listOpen();
    }
    return [...this.items.values()]
      .filter((item) => OPEN_HANDOFF_STATUSES.includes(item.status))
      .sort(compareHandoffQueueItems)
      .map((item) => ({ ...item }));
  }

  async assignAgent(
    handoffId: string,
    agentId: string,
  ): Promise<HandoffQueueItem> {
    return this.mutate(handoffId, (item) => {
      if (item.status !== "queued") {
        throw new ApiRequestError(
          409,
          "VOICE_HANDOFF_INVALID_STATE",
          `Cannot assign agent to handoff in '${item.status}' state.`,
        );
      }
      item.assignedAgentId = agentId;
      item.status = "assigned";
      return item;
    });
  }

  async claimSession(input: {
    callId: string;
    operatorId: string;
  }): Promise<HandoffQueueItem | null> {
    const open = this.durable
      ? await this.repository!.findOpenByCallId(input.callId)
      : ([...this.items.values()].find(
          (i) =>
            i.callId === input.callId &&
            OPEN_HANDOFF_STATUSES.includes(i.status),
        ) ?? null);
    if (!open) {
      return null;
    }
    return this.mutate(open.handoffId, (item) => {
      item.assignedAgentId = input.operatorId;
      // A human who already holds the call keeps it; only waiting items move.
      if (item.status !== "connected" && item.status !== "bridging") {
        item.status = "assigned";
      }
      return item;
    });
  }

  /**
   * Request CTI warm transfer / bridge to agent leg.
   * Acceptance rule: CTI clear/bridge 不確定時保留 pending 而非宣稱已接通.
   * Even after requestTransfer returns accepted, status remains "bridging" (pending)
   * until confirmBridge is explicitly called upon bridge establishment verification.
   */
  async requestBridge(
    handoffId: string,
    ctiAdapter?: VoiceCtiAdapter,
    requestedProviderName?: string,
    fromCallLegId?: string,
  ): Promise<HandoffQueueItem> {
    const item = await this.mutate(handoffId, (current) => {
      current.status = "bridging";
      current.bridgeAttempts += 1;
      return current;
    });

    if (!ctiAdapter || !requestedProviderName) {
      return item;
    }
    let lastError: string | null = null;
    try {
      const transferResult = await ctiAdapter.requestTransfer(
        requestedProviderName,
        {
          callId: item.callId,
          fromCallLegId: fromCallLegId ?? `leg-${item.callId}-customer`,
          targetKind: item.targetKind,
          target: item.target,
        },
      );
      if (!transferResult.accepted) {
        // Transfer was rejected by provider
        lastError = "transfer_rejected_by_provider";
      }
      // Even if transferResult.accepted is true, the media bridge is still
      // pending in the telephony network: retain "bridging" (pending)!
    } catch (err) {
      lastError = err instanceof Error ? err.message : "bridge_request_failed";
      // Preserve "bridging" (pending) state rather than asserting connected or cleared
    }
    if (lastError === null) {
      return item;
    }
    return this.mutate(handoffId, (current) => {
      current.lastError = lastError;
      return current;
    });
  }

  /**
   * Only after CTI confirms the bridge event is the item marked connected.
   */
  async confirmBridge(handoffId: string): Promise<HandoffQueueItem> {
    return this.mutate(handoffId, (item) => {
      item.status = "connected";
      return item;
    });
  }

  /**
   * Agent unanswered / queue timeout (未接).
   */
  async handleUnanswered(
    handoffId: string,
    reason?: string,
  ): Promise<HandoffQueueItem> {
    return this.mutate(handoffId, (item) => {
      item.status = "unanswered";
      item.lastError = reason ?? "agent_unanswered_timeout";
      return item;
    });
  }

  /**
   * Call drop handler (接後掉線 / 排隊掛斷).
   * Distinguishes whether caller disconnected or agent disconnected.
   */
  async handleCallDrop(
    handoffId: string,
    dropReason: VoiceHangupReason,
    callerStillConnected: boolean,
  ): Promise<{ item: HandoffQueueItem; redispatchable: boolean }> {
    const item = await this.mutate(handoffId, (current) => {
      if (!callerStillConnected) {
        // Caller hung up: handoff terminates
        current.status = "caller_dropped";
        current.lastError = `caller_hangup:${dropReason}`;
      } else {
        // Agent hung up/dropped, but caller is still on the line:
        // This is接後掉線 with caller active -> redispatchable!
        current.status = "agent_dropped";
        current.lastError = `agent_drop:${dropReason}`;
      }
      return current;
    });
    return { item, redispatchable: callerStillConnected };
  }

  /**
   * Re-dispatch an unanswered or agent-dropped handoff (重新分派).
   */
  async redispatch(
    handoffId: string,
    newTarget?: string,
  ): Promise<HandoffQueueItem> {
    return this.mutate(handoffId, (item) => {
      if (item.status !== "agent_dropped" && item.status !== "unanswered") {
        throw new ApiRequestError(
          409,
          "VOICE_HANDOFF_NOT_REDISPATCHABLE",
          `Cannot redispatch handoff in '${item.status}' status; only agent_dropped or unanswered handoffs can be redispatched.`,
        );
      }
      item.status = "queued";
      item.assignedAgentId = null;
      item.redispatchCount += 1;
      if (newTarget) {
        item.target = newTarget;
      }
      return item;
    });
  }

  /** The agent finished the call (order submitted or call closed). */
  async complete(handoffId: string): Promise<HandoffQueueItem> {
    return this.mutate(handoffId, (item) => {
      item.status = "completed";
      return item;
    });
  }

  private async mutate(
    handoffId: string,
    change: (item: HandoffQueueItem) => HandoffQueueItem,
  ): Promise<HandoffQueueItem> {
    const apply = (current: HandoffQueueItem | null) => {
      if (!current) {
        throw new ApiRequestError(
          404,
          "VOICE_HANDOFF_NOT_FOUND",
          `Handoff queue item '${handoffId}' not found.`,
        );
      }
      const next = change({ ...current });
      next.updatedAt = new Date().toISOString();
      return next;
    };
    if (this.durable) {
      return this.repository!.update(handoffId, apply);
    }
    const next = apply(this.items.get(handoffId) ?? null);
    this.items.set(handoffId, next);
    return { ...next };
  }
}
