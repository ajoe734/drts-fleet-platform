import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ApiRequestError } from "../../common/api-envelope";
import {
  type VoiceCtiAdapter,
  type VoiceCtiTransferTargetKind,
  type VoiceHangupReason,
} from "./voice-cti.adapter";

export type HandoffQueueStatus =
  | "queued"
  | "assigned"
  | "bridging"
  | "connected"
  | "unanswered"
  | "caller_dropped"
  | "agent_dropped"
  | "failed";

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
 */
@Injectable()
export class VoiceHandoffQueueService {
  private readonly items = new Map<string, HandoffQueueItem>();

  enqueue(input: EnqueueHandoffInput): HandoffQueueItem {
    const handoffId = input.handoffId ?? randomUUID();
    const now = new Date().toISOString();

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
      enqueuedAt: now,
      updatedAt: now,
      redispatchCount: 0,
      bridgeAttempts: 0,
      lastError: null,
    };

    this.items.set(handoffId, item);
    return { ...item };
  }

  getHandoffItem(handoffId: string): HandoffQueueItem | null {
    const item = this.items.get(handoffId);
    return item ? { ...item } : null;
  }

  listQueuedItems(): HandoffQueueItem[] {
    return [...this.items.values()].map((i) => ({ ...i }));
  }

  assignAgent(handoffId: string, agentId: string): HandoffQueueItem {
    const item = this.requireItem(handoffId);
    if (item.status !== "queued") {
      throw new ApiRequestError(
        409,
        "VOICE_HANDOFF_INVALID_STATE",
        `Cannot assign agent to handoff in '${item.status}' state.`,
      );
    }

    item.assignedAgentId = agentId;
    item.status = "assigned";
    item.updatedAt = new Date().toISOString();
    return { ...item };
  }

  claimSession(input: { callId: string; operatorId: string }): HandoffQueueItem | null {
    const item = [...this.items.values()].find((i) => i.callId === input.callId);
    if (!item) {
      return null;
    }
    item.assignedAgentId = input.operatorId;
    item.status = "assigned";
    item.updatedAt = new Date().toISOString();
    return { ...item };
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
    const item = this.requireItem(handoffId);
    item.status = "bridging";
    item.bridgeAttempts += 1;
    item.updatedAt = new Date().toISOString();

    if (ctiAdapter && requestedProviderName) {
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
          item.lastError = "transfer_rejected_by_provider";
        }
        // Even if transferResult.accepted is true, the media bridge is still
        // pending in the telephony network: retain "bridging" (pending)!
      } catch (err) {
        item.lastError = err instanceof Error ? err.message : "bridge_request_failed";
        // Preserve "bridging" (pending) state rather than asserting connected or cleared
      }
    }

    return { ...item };
  }

  /**
   * Only after CTI confirms the bridge event is the item marked connected.
   */
  confirmBridge(handoffId: string): HandoffQueueItem {
    const item = this.requireItem(handoffId);
    item.status = "connected";
    item.updatedAt = new Date().toISOString();
    return { ...item };
  }

  /**
   * Agent unanswered / queue timeout (未接).
   */
  handleUnanswered(handoffId: string, reason?: string): HandoffQueueItem {
    const item = this.requireItem(handoffId);
    item.status = "unanswered";
    item.lastError = reason ?? "agent_unanswered_timeout";
    item.updatedAt = new Date().toISOString();
    return { ...item };
  }

  /**
   * Call drop handler (接後掉線 / 排隊掛斷).
   * Distinguishes whether caller disconnected or agent disconnected.
   */
  handleCallDrop(
    handoffId: string,
    dropReason: VoiceHangupReason,
    callerStillConnected: boolean,
  ): { item: HandoffQueueItem; redispatchable: boolean } {
    const item = this.requireItem(handoffId);
    const now = new Date().toISOString();
    item.updatedAt = now;

    if (!callerStillConnected) {
      // Caller hung up: handoff terminates
      item.status = "caller_dropped";
      item.lastError = `caller_hangup:${dropReason}`;
      return { item: { ...item }, redispatchable: false };
    }

    // Agent hung up/dropped, but caller is still on the line:
    // This is接後掉線 with caller active -> redispatchable!
    item.status = "agent_dropped";
    item.lastError = `agent_drop:${dropReason}`;
    return { item: { ...item }, redispatchable: true };
  }

  /**
   * Re-dispatch an unanswered or agent-dropped handoff (重新分派).
   */
  redispatch(handoffId: string, newTarget?: string): HandoffQueueItem {
    const item = this.requireItem(handoffId);
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
    item.updatedAt = new Date().toISOString();
    return { ...item };
  }

  private requireItem(handoffId: string): HandoffQueueItem {
    const item = this.items.get(handoffId);
    if (!item) {
      throw new ApiRequestError(
        404,
        "VOICE_HANDOFF_NOT_FOUND",
        `Handoff queue item '${handoffId}' not found.`,
      );
    }
    return item;
  }
}
