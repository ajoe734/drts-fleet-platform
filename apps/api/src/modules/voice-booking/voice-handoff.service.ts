import { randomUUID } from "node:crypto";
import { Injectable, Optional } from "@nestjs/common";
import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import {
  VoiceHandoffQueueService,
  type HandoffQueueItem,
} from "../callcenter/voice-handoff-queue.service";
import type { VoiceHangupReason } from "../callcenter/voice-cti.adapter";
import type {
  VoiceCommandReceiptRecord,
  VoiceSessionRecord,
} from "./voice-booking.repository";
import { VoiceBookingRepository } from "./voice-booking.repository";
import { VoiceSessionRepository } from "./voice-session.repository";
import { VoiceSessionService } from "./voice-session.service";

export interface HandoffDraftSummary {
  draftVersion: number;
  slots: Record<string, unknown>;
  validationErrors?: string[];
}

export interface HandoffConfirmationProof {
  confirmationId: string;
  snapshotHash: string;
  confirmedAt?: string | null | undefined;
}

export interface HandoffRealOrderSummary {
  orderId: string;
  status: string;
  orderSource: string;
}

export interface HandoffUnknownReceiptSummary {
  commandId: string;
  intentId: string;
  action: string;
  status: "pending";
  payloadHash: string;
}

export interface HandoffCandidateSummary {
  field: string;
  rawText: string;
  candidate: string;
  candidates?: unknown[];
}

export interface HandoffSummary {
  handoffId: string;
  voiceSessionId: string;
  callId: string;
  reason: string;
  priority: "normal" | "urgent" | "emergency";
  nextResponsibleParty: string;
  draft: HandoffDraftSummary;
  proof: HandoffConfirmationProof | null;
  realOrder: HandoffRealOrderSummary | null;
  unknownReceipt: HandoffUnknownReceiptSummary | null;
  rawUtterances: string[];
  candidates: HandoffCandidateSummary[];
  createdAt: string;
}

export interface InitiateHandoffCommand {
  voiceSessionId: string;
  expectedSessionVersion: number;
  expectedLeaseEpoch: number;
  reason: string;
  priority?: "normal" | "urgent" | "emergency";
  nextResponsibleParty?: string;
  draft?: Partial<HandoffDraftSummary>;
  activeProof?: HandoffConfirmationProof | null;
  rawUtterances?: string[];
  candidates?: HandoffCandidateSummary[];
  callerPhone?: string;
}

export interface InitiateHandoffResult {
  session: VoiceSessionRecord;
  handoffId: string;
  summary: HandoffSummary;
  queueItem: HandoffQueueItem;
  coordinatorClaims: {
    voiceSessionId: string;
    resourceScopeId: string;
    leaseEpoch: number;
    scopes: string[];
  };
}

export interface LateAiToolResultCommand {
  voiceSessionId: string;
  leaseEpoch: number;
  toolName: string;
  toolResult: unknown;
  callId?: string;
  initiatedAt?: string;
}

export interface LateAiToolResultOutcome {
  accepted: boolean;
  audited: boolean;
  reason?: string;
  auditEventId?: string;
}

export interface RecordHandoffInputCommand {
  voiceSessionId: string;
  expectedSessionVersion: number;
  speechText?: string;
  rawUtterance?: string;
}

export interface RecordHandoffInputResult {
  session: VoiceSessionRecord;
  invalidatedConfirmation: boolean;
  inputEpoch: number;
}

export interface CompleteHandoffCommand {
  voiceSessionId: string;
  handoffId: string;
  expectedSessionVersion: number;
  expectedLeaseEpoch: number;
  agentId: string;
}

export interface PostBridgeDropCommand {
  voiceSessionId: string;
  handoffId: string;
  hangupReason: VoiceHangupReason;
  callerStillConnected: boolean;
  expectedSessionVersion: number;
}

export interface PostBridgeDropResult {
  callerStillConnected: boolean;
  redispatched: boolean;
  sessionClosed: boolean;
  session?: VoiceSessionRecord;
}

/**
 * SD §5.4 / §12.5 Coordinator for human handoff and queue control.
 *
 * Requirements:
 * 1. Owner lease atomic transfer:
 *    - Fencing checks sessionVersion and leaseEpoch.
 *    - Updates controlOwner to "coordinator" and increments leaseEpoch.
 *    - Old AI worker cannot make further mutations.
 * 2. Minimal coordinator capability:
 *    - Only allowed to read, play wait audio, collect callback consent, invalidate confirmation.
 *    - Coordinator CANNOT create booking orders (order_create_bound is strictly excluded).
 * 3. 真人與 AI 不可同時寫:
 *    - Stale AI tool results arriving after handoff are audited for compliance,
 *      but REJECTED from executing commands or mutating state.
 *    - Stale AI cannot mint new epochs.
 * 4. Queue / Unanswered / Post-bridge drop & redispatch:
 *    - CTI bridge uncertainty keeps status pending.
 *    - Unanswered transitions to unanswered.
 *    - Post-bridge drop: if agent hangs up and caller is still connected, redispatches.
 * 5. Comprehensive handoff summary:
 *    - draft, proof, real order, unknown receipt, raw utterances, candidates, next responsible party.
 * 6. Customer speech during handoff safely invalidates confirmation without creating orders.
 */
@Injectable()
export class VoiceHandoffService {
  constructor(
    private readonly sessionRepository: VoiceSessionRepository,
    private readonly sessionService: VoiceSessionService,
    private readonly bookingRepository: VoiceBookingRepository,
    private readonly handoffQueueService: VoiceHandoffQueueService,
    @Optional() private readonly auditService?: AuditNotificationService,
  ) {}

  /**
   * SD §5.4 / §12.5: Atomically transition control from AI to Handoff Coordinator.
   */
  async initiateHandoff(
    command: InitiateHandoffCommand,
  ): Promise<InitiateHandoffResult> {
    const session = await this.sessionRepository.findSessionById(
      command.voiceSessionId,
    );
    if (!session) {
      throw new ApiRequestError(
        404,
        "VOICE_SESSION_NOT_FOUND",
        `Voice session '${command.voiceSessionId}' not found.`,
      );
    }

    // Fencing checks: caller must match expected lease epoch and session version
    if (session.leaseEpoch !== command.expectedLeaseEpoch) {
      throw new ApiRequestError(
        409,
        "VOICE_SESSION_NOT_OWNER",
        "Lease epoch no longer matches the session owner.",
      );
    }
    if (session.sessionVersion !== command.expectedSessionVersion) {
      throw new ApiRequestError(
        409,
        "VOICE_DRAFT_STALE",
        "Session revision changed; reload before handoff.",
      );
    }
    if (session.controlOwner !== "ai" && session.controlOwner !== "coordinator") {
      throw new ApiRequestError(
        409,
        "VOICE_SESSION_NOT_OWNER",
        `Cannot initiate handoff from controlOwner '${session.controlOwner}'.`,
      );
    }

    const nextLeaseEpoch = session.leaseEpoch + 1;

    // Atomic CAS transfer of controlOwner to coordinator with new leaseEpoch
    const updatedSession = await this.sessionRepository.casUpdateSessionControl(
      session.voiceSessionId,
      session.sessionVersion,
      {
        controlOwner: "coordinator",
        leaseEpoch: nextLeaseEpoch,
        dialogState: "handoff_pending",
        pendingInput: false,
      },
    );

    if (!updatedSession) {
      throw new ApiRequestError(
        409,
        "VOICE_SESSION_NOT_OWNER",
        "Session was modified concurrently during handoff transfer.",
      );
    }

    // Determine active confirmation proof if any
    let proof: HandoffConfirmationProof | null = command.activeProof ?? null;
    if (!proof) {
      const activeConf = await this.bookingRepository.findActiveConfirmation(
        command.voiceSessionId,
        command.draft?.draftVersion ?? 1,
        "create_owned_order",
      );
      if (activeConf) {
        proof = {
          confirmationId: activeConf.confirmationId,
          snapshotHash: activeConf.snapshotHash,
          confirmedAt: activeConf.confirmedAt,
        };
      }
    }

    // Determine pending receipts or existing real order
    const pendingReceipts =
      await this.sessionRepository.findPendingReceiptsForSession(
        session.voiceSessionId,
      );

    let unknownReceipt: HandoffUnknownReceiptSummary | null = null;
    let realOrder: HandoffRealOrderSummary | null = null;

    for (const r of pendingReceipts) {
      if (r.status === "pending") {
        unknownReceipt = {
          commandId: r.commandId,
          intentId: r.intentId,
          action: r.action,
          status: "pending",
          payloadHash: r.payloadHash,
        };
      } else if (r.status === "succeeded" && r.orderId) {
        realOrder = {
          orderId: r.orderId,
          status: "created",
          orderSource: "phone",
        };
      }
    }

    const handoffId = randomUUID();
    const nextResponsibleParty = command.nextResponsibleParty ?? "human_agent";

    // Assemble comprehensive handoff summary (SD §12.5)
    const summary: HandoffSummary = {
      handoffId,
      voiceSessionId: session.voiceSessionId,
      callId: session.callId,
      reason: command.reason,
      priority: command.priority ?? "normal",
      nextResponsibleParty,
      draft: {
        draftVersion: command.draft?.draftVersion ?? 1,
        slots: command.draft?.slots ?? {},
        validationErrors: command.draft?.validationErrors ?? [],
      },
      proof,
      realOrder,
      unknownReceipt,
      rawUtterances: command.rawUtterances ?? [],
      candidates: command.candidates ?? [],
      createdAt: new Date().toISOString(),
    };

    // Enqueue into human handoff queue
    const queueItem = this.handoffQueueService.enqueue({
      handoffId,
      voiceSessionId: session.voiceSessionId,
      callId: session.callId,
      resourceScopeId: session.resourceScopeId,
      priority: command.priority,
      reason: command.reason,
      summary,
    });

    // Minimal coordinator capability scopes (SD §5.4/§12.5)
    // Coordinator can query receipts, request handoff, execute session interactions,
    // but CANNOT create booking orders (order_create_bound strictly excluded!)
    const coordinatorClaims = {
      voiceSessionId: session.voiceSessionId,
      resourceScopeId: session.resourceScopeId,
      leaseEpoch: nextLeaseEpoch,
      scopes: [
        "session_execute",
        "order_read_bound",
        "handoff_request",
      ],
    };

    return {
      session: updatedSession,
      handoffId,
      summary,
      queueItem,
      coordinatorClaims,
    };
  }

  /**
   * SD §5.4 / Acceptance 2:
   * 真人與 AI 不可同時寫；舊工具結果可入 audit 不可再觸發命令，舊 AI 不可自行申請新 epoch。
   */
  async handleLateAiToolResult(
    command: LateAiToolResultCommand,
  ): Promise<LateAiToolResultOutcome> {
    const session = await this.sessionRepository.findSessionById(
      command.voiceSessionId,
    );
    if (!session) {
      throw new ApiRequestError(
        404,
        "VOICE_SESSION_NOT_FOUND",
        "Session not found for late tool result.",
      );
    }

    // Check if session has moved on from the AI's epoch or owner
    const isStale =
      session.controlOwner !== "ai" ||
      session.leaseEpoch !== command.leaseEpoch;

    if (isStale) {
      // The session has been handed off to coordinator or human agent!
      // Must NOT execute any command, mutate draft, or affect order.
      // Safely record to audit log for compliance and auditability.
      const auditEventId = randomUUID();
      if (this.auditService) {
        this.auditService.recordAuditLog({
          auditId: auditEventId,
          tenantId: session.resourceScopeId,
          moduleName: "voice_booking",
          actionName: "late_ai_tool_result_discarded",
          resourceType: "voice_session",
          resourceId: session.voiceSessionId,
          actorId: "voice_ai_worker",
          actorType: "system",
          newValuesSummary: {
            reason: "session_handed_off_owner_changed",
            toolName: command.toolName,
            callingLeaseEpoch: command.leaseEpoch,
            currentLeaseEpoch: session.leaseEpoch,
            currentControlOwner: session.controlOwner,
            toolResult: command.toolResult,
          },
        });
      }

      return {
        accepted: false,
        audited: true,
        reason: "session_handed_off_owner_changed",
        auditEventId,
      };
    }

    // Session is still actively owned by AI at this epoch
    return {
      accepted: true,
      audited: false,
    };
  }

  /**
   * SD §5.4 / Acceptance 2:
   * 舊 AI 不可自行申請新 epoch.
   * If a superseded worker or AI principal tries to request/issue a new epoch,
   * verify that current session owner is AI and current lease epoch matches.
   */
  async assertCanIssueEpoch(
    voiceSessionId: string,
    requestedEpoch: number,
    principalRole: string = "ai",
  ): Promise<VoiceSessionRecord> {
    const session = await this.sessionRepository.findSessionById(voiceSessionId);
    if (!session) {
      throw new ApiRequestError(
        404,
        "VOICE_SESSION_NOT_FOUND",
        "Session not found.",
      );
    }

    if (session.controlOwner !== principalRole) {
      throw new ApiRequestError(
        409,
        "VOICE_SESSION_NOT_OWNER",
        `Principal role '${principalRole}' is not the current session owner ('${session.controlOwner}').`,
      );
    }

    if (session.leaseEpoch !== requestedEpoch) {
      throw new ApiRequestError(
        409,
        "VOICE_SESSION_NOT_OWNER",
        `Requested lease epoch ${requestedEpoch} is stale; current epoch is ${session.leaseEpoch}.`,
      );
    }

    return session;
  }

  /**
   * SD §5.4 / §12.5: Customer speaks during handoff.
   * 新語句仍可安全失效確認，但 coordinator 不得建單.
   */
  async recordCustomerInputDuringHandoff(
    command: RecordHandoffInputCommand,
  ): Promise<RecordHandoffInputResult> {
    const session = await this.sessionRepository.findSessionById(
      command.voiceSessionId,
    );
    if (!session) {
      throw new ApiRequestError(
        404,
        "VOICE_SESSION_NOT_FOUND",
        "Session not found.",
      );
    }

    if (
      session.controlOwner !== "coordinator" &&
      session.controlOwner !== "human" &&
      session.dialogState !== "handoff_pending"
    ) {
      throw new ApiRequestError(
        409,
        "VOICE_SESSION_NOT_OWNER",
        `Cannot record handoff input for session in owner '${session.controlOwner}', dialogState '${session.dialogState}'.`,
      );
    }

    if (session.sessionVersion !== command.expectedSessionVersion) {
      throw new ApiRequestError(
        409,
        "VOICE_DRAFT_STALE",
        "Session version stale when recording handoff input.",
      );
    }

    // Invalidate active confirmation tickets (SD §5.4: 新語句使確認失效)
    await this.sessionRepository.invalidateActiveConfirmationForSession(
      session.voiceSessionId,
    );

    const nextInputEpoch = session.inputEpoch + 1;

    // CAS update to mark pendingInput and advance inputEpoch
    const updated = await this.sessionRepository.casUpdateSessionControl(
      session.voiceSessionId,
      session.sessionVersion,
      {
        inputEpoch: nextInputEpoch,
        pendingInput: true,
        confirmationState: "invalidated",
      },
    );

    if (!updated) {
      throw new ApiRequestError(
        409,
        "VOICE_DRAFT_STALE",
        "Session revision moved concurrently while recording customer input.",
      );
    }

    return {
      session: updated,
      invalidatedConfirmation: true,
      inputEpoch: nextInputEpoch,
    };
  }

  /**
   * Complete handoff to human agent when CTI confirms bridge.
   * CTI clear/bridge 不確定時保留 pending 而非宣稱已接通.
   */
  async completeHandoffToHuman(
    command: CompleteHandoffCommand,
  ): Promise<VoiceSessionRecord> {
    const session = await this.sessionRepository.findSessionById(
      command.voiceSessionId,
    );
    if (!session) {
      throw new ApiRequestError(
        404,
        "VOICE_SESSION_NOT_FOUND",
        "Session not found.",
      );
    }

    if (session.leaseEpoch !== command.expectedLeaseEpoch) {
      throw new ApiRequestError(
        409,
        "VOICE_SESSION_NOT_OWNER",
        "Lease epoch stale; cannot complete handoff to human.",
      );
    }

    if (session.sessionVersion !== command.expectedSessionVersion) {
      throw new ApiRequestError(
        409,
        "VOICE_DRAFT_STALE",
        "Session revision stale; cannot complete handoff to human.",
      );
    }

    // Advance leaseEpoch and set controlOwner to human
    const updated = await this.sessionRepository.casUpdateSessionControl(
      session.voiceSessionId,
      session.sessionVersion,
      {
        controlOwner: "human",
        leaseEpoch: session.leaseEpoch + 1,
        dialogState: "human_controlled",
      },
    );

    if (!updated) {
      throw new ApiRequestError(
        409,
        "VOICE_SESSION_NOT_OWNER",
        "Failed to transition control owner to human concurrently.",
      );
    }

    // Confirm bridge in queue service
    this.handoffQueueService.confirmBridge(command.handoffId);

    return updated;
  }

  /**
   * Post-bridge drop handling (接後掉線及重新分派).
   * If caller dropped: close session.
   * If agent dropped while caller connected: return control to coordinator, redispatch.
   */
  async handlePostBridgeDrop(
    command: PostBridgeDropCommand,
  ): Promise<PostBridgeDropResult> {
    const session = await this.sessionRepository.findSessionById(
      command.voiceSessionId,
    );
    if (!session) {
      throw new ApiRequestError(
        404,
        "VOICE_SESSION_NOT_FOUND",
        "Session not found for post-bridge drop.",
      );
    }

    const dropOutcome = this.handoffQueueService.handleCallDrop(
      command.handoffId,
      command.hangupReason,
      command.callerStillConnected,
    );

    if (!command.callerStillConnected) {
      // Caller hung up: terminate session
      await this.sessionService.closeSession(
        command.voiceSessionId,
        session.sessionVersion,
      );
      return {
        callerStillConnected: false,
        redispatched: false,
        sessionClosed: true,
      };
    }

    // Agent dropped, but caller is still on the phone:
    // Re-dispatch! Transition session back to coordinator with new leaseEpoch.
    const updated = await this.sessionRepository.casUpdateSessionControl(
      session.voiceSessionId,
      command.expectedSessionVersion,
      {
        controlOwner: "coordinator",
        leaseEpoch: session.leaseEpoch + 1,
        dialogState: "handoff_pending",
      },
    );

    if (!updated) {
      throw new ApiRequestError(
        409,
        "VOICE_DRAFT_STALE",
        "Session revision moved concurrently during agent drop redispatch.",
      );
    }

    this.handoffQueueService.redispatch(command.handoffId);

    return {
      callerStillConnected: true,
      redispatched: true,
      sessionClosed: false,
      session: updated,
    };
  }
}
