import {
  Body,
  Controller,
  Get,
  Headers,
  Optional,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import type {
  AnnounceCallAgentIdentityCommand,
  AttachCallRecordingCommand,
  CloseCallSessionCommand,
  CompleteCallbackTaskCommand,
  CreateCallbackTaskCommand,
  LinkCallOrderCommand,
  OpenCallSessionCommand,
  QuoteCallEtaCommand,
  TransferCallToComplaintCommand,
  TransferCallToIncidentCommand,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { CurrentIdentity, RequireRealms } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { CallcenterAssistService } from "../callcenter-assist/callcenter-assist.service";
import { ComplaintService } from "../complaint/complaint.service";
import { SandboxWebhookAdapter } from "./sandbox-webhook.adapter";
import { IncidentService } from "../incident/incident.service";
import { CallcenterService } from "./callcenter.service";
import { VoiceHandoffQueueService } from "./voice-handoff-queue.service";

@Controller("callcenter")
export class CallcenterController {
  constructor(
    private readonly callcenterService: CallcenterService,
    private readonly complaintService: ComplaintService,
    private readonly incidentService: IncidentService,
    private readonly sandboxWebhookAdapter: SandboxWebhookAdapter,
    @Optional() private readonly assistService?: CallcenterAssistService,
    @Optional() private readonly handoffQueue?: VoiceHandoffQueueService,
  ) {}

  private requireAssist() {
    if (!this.assistService) {
      throw new ApiRequestError(
        503,
        "CALLCENTER_ASSIST_UNAVAILABLE",
        "The AI booking assist is not configured on this API.",
      );
    }
    return this.assistService;
  }

  /**
   * CALLCENTER-AI-ASSIST-20261111: calls the voice AI handed to a human and
   * that are still open, most urgent first, limited to calls this operator
   * may read. Each item carries the AI's handoff summary.
   */
  @Get("handoffs")
  @RequireRealms("platform", "ops")
  async listHandoffs(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = this.handoffQueue
      ? await this.handoffQueue.listQueuedItems()
      : [];
    const readable = new Set(
      (
        await this.callcenterService.listCallSessionsForRead(
          requestId,
          identity,
        )
      ).map((session) => session.callId),
    );
    return toApiSuccessEnvelope(
      { items: items.filter((item) => readable.has(item.callId)) },
      requestId,
    );
  }

  /** The AI-prefilled booking draft for a call (null when none exists). */
  @Get("sessions/:callId/assist")
  @RequireRealms("platform", "ops")
  async getAssistDraft(
    @Param("callId") callId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    // Same read authorization as the call itself.
    await this.callcenterService.getCallSessionForRead(
      callId,
      requestId,
      identity,
    );
    return toApiSuccessEnvelope(
      { draft: await this.requireAssist().getDraft(callId) },
      requestId,
    );
  }

  /**
   * Final speech-recognition segments of a live call, sent by the voice
   * media worker while a human agent talks with the caller (service
   * identity only). The AI re-extracts the booking fields after each batch.
   */
  @Post("sessions/:callId/assist/transcript")
  @RequireRealms("system")
  async ingestAssistTranscript(
    @Param("callId") callId: string,
    @Body() body: unknown,
    @Headers("x-request-id") requestId?: string,
  ) {
    const draft = await this.requireAssist().ingestTranscript(callId, body);
    return toApiSuccessEnvelope(
      {
        callId: draft.callId,
        draftVersion: draft.draftVersion,
        extractor: draft.extractor,
      },
      requestId,
    );
  }

  /** Which AI-filled fields the agent kept or corrected on the submitted order. */
  @Post("sessions/:callId/assist/outcomes")
  @RequireRealms("platform", "ops")
  async recordAssistOutcomes(
    @Param("callId") callId: string,
    @Body() body: Record<string, unknown>,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    await this.callcenterService.getCallSessionForRead(
      callId,
      requestId,
      identity,
    );
    return toApiSuccessEnvelope(
      await this.requireAssist().recordOutcomes(callId, {
        ...body,
        agentId: body?.agentId ?? identity?.actorId ?? null,
      }),
      requestId,
    );
  }

  /** How often agents keep the AI's values, per field and per source. */
  @Get("assist/accuracy")
  @RequireRealms("platform", "ops")
  async getAssistAccuracy(
    @Query("since") since?: string,
    @Query("until") until?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.requireAssist().getAccuracy({ since, until }),
      requestId,
    );
  }

  @Post("webhooks/sandbox")
  async ingestSandboxWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.sandboxWebhookAdapter.ingestForWrite(
        payload as never,
        requestId,
      ),
      requestId,
    );
  }

  @Get("sessions")
  @RequireRealms("platform", "ops")
  async listCallSessions(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: await this.callcenterService.listCallSessionsForRead(
          requestId,
          identity,
        ),
      },
      requestId,
    );
  }

  @Post("sessions")
  async openCallSession(
    @Body() command: OpenCallSessionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.callcenterService.openCallSessionForWrite(command, requestId),
      requestId,
    );
  }

  @Get("sessions/:callId")
  @RequireRealms("platform", "ops")
  async getCallSession(
    @Param("callId") callId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.callcenterService.getCallSessionForRead(
        callId,
        requestId,
        identity,
      ),
      requestId,
    );
  }

  @Post("sessions/:callId/announce-identity")
  async announceAgentIdentity(
    @Param("callId") callId: string,
    @Body() command: AnnounceCallAgentIdentityCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.callcenterService.announceAgentIdentityForWrite(
        callId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("sessions/:callId/close")
  async closeCallSession(
    @Param("callId") callId: string,
    @Body() command: CloseCallSessionCommand = {},
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.callcenterService.closeCallSessionForWrite(
        callId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("sessions/:callId/eta")
  async quoteCallEta(
    @Param("callId") callId: string,
    @Body() command: QuoteCallEtaCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.callcenterService.quoteEtaForWrite(callId, command, requestId),
      requestId,
    );
  }

  @Post("sessions/:callId/link-order")
  async linkCallOrder(
    @Param("callId") callId: string,
    @Body() command: LinkCallOrderCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.callcenterService.linkOrderToExistingSession(
        callId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("sessions/:callId/recording-callback")
  async attachRecordingCallback(
    @Param("callId") callId: string,
    @Body() command: AttachCallRecordingCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.callcenterService.attachRecordingCallbackForWrite(
        callId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Get("callbacks")
  async listCallbackTasks(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: await this.callcenterService.listCallbackTasksForRead(),
      },
      requestId,
    );
  }

  @Post("sessions/:callId/callbacks")
  async createCallbackTask(
    @Param("callId") callId: string,
    @Body() command: CreateCallbackTaskCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.callcenterService.createCallbackTaskForWrite(
        callId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("callbacks/:callbackTaskId/complete")
  async completeCallbackTask(
    @Param("callbackTaskId") callbackTaskId: string,
    @Body() command: CompleteCallbackTaskCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.callcenterService.completeCallbackTaskForWrite(
        callbackTaskId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("callbacks/:callbackTaskId/claim")
  async claimCallbackTask(
    @Param("callbackTaskId") callbackTaskId: string,
    @Body() command: { operatorId: string; expectedVersion?: number },
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.callcenterService.claimCallbackTaskForWrite(
        callbackTaskId,
        command.operatorId,
        command.expectedVersion,
        requestId,
      ),
      requestId,
    );
  }

  @Post("callbacks/:callbackTaskId/attempt")
  async recordCallbackAttempt(
    @Param("callbackTaskId") callbackTaskId: string,
    @Body()
    command: {
      operatorId: string;
      outcome: string;
      notes?: string;
      hangupConfirmed?: boolean;
    },
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.callcenterService.recordCallbackAttemptForWrite(
        callbackTaskId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("callbacks/:callbackTaskId/cancel")
  async cancelCallbackTask(
    @Param("callbackTaskId") callbackTaskId: string,
    @Body()
    command: {
      reason: string;
      expectedVersion?: number;
      operatorId?: string;
    },
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.callcenterService.cancelCallbackTaskForWrite(
        callbackTaskId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("sessions/:callId/takeover")
  async takeoverAiCallSession(
    @Param("callId") callId: string,
    @Body() command: { operatorId: string; reason?: string },
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.callcenterService.takeoverAiCallSession(
        callId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("sessions/:callId/transfer-to-complaint")
  async transferCallToComplaint(
    @Param("callId") callId: string,
    @Body() command: TransferCallToComplaintCommand,
    @Headers("x-request-id") requestId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const session = await this.callcenterService.getCallSessionForRead(callId);
    // A real caller that resends the same transfer-to-complaint command
    // (e.g. after a call timeout) must have its retry recognized across an
    // API restart or a different replica, not only within this process's
    // memory; see ComplaintService.refreshSettlementCases.
    await this.complaintService.refreshSettlementCases();
    const created = await this.complaintService.createComplaintCase(
      {
        caseSource: "phone",
        relatedOrderId: command.relatedOrderId ?? session.linkedOrderId,
        relatedCallId: callId,
        category: command.category,
        severity: command.severity,
        description: command.description,
      },
      requestId,
      {
        captureAudit: true,
        commandIdentity: {
          scope: `callcenter:${callId}:transfer-to-complaint`,
          // The original caller has a stable call identity even without an
          // explicit key. Different supplied keys are distinct transfer intents.
          key:
            idempotencyKey?.trim() ||
            JSON.stringify([
              command.category,
              command.severity,
              command.description,
              command.relatedOrderId ?? session.linkedOrderId ?? null,
            ]),
        },
      },
    );
    const complaintCase = created.data;
    await this.complaintService.awaitSettlementPersistence(
      complaintCase.caseNo,
    );

    return toApiSuccessEnvelope(
      {
        session: await this.callcenterService.linkCaseToCallSession(
          callId,
          complaintCase.caseNo,
          requestId,
        ),
        complaintCase,
      },
      requestId,
    );
  }

  @Post("sessions/:callId/transfer-to-incident")
  async transferCallToIncident(
    @Param("callId") callId: string,
    @Body() command: TransferCallToIncidentCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const session = this.callcenterService.getCallSession(callId);
    const createIncidentInput: Parameters<
      typeof this.incidentService.createIncident
    >[0] = {
      title: command.title,
      description: command.description,
      category: command.category,
      severity: command.severity,
      reportedBy: session.agentId ?? "callcenter",
    };
    const effectiveOrderId = command.relatedOrderId ?? session.linkedOrderId;
    if (effectiveOrderId) {
      createIncidentInput.relatedOrderId = effectiveOrderId;
    }
    if (command.relatedVehicleId) {
      createIncidentInput.relatedVehicleId = command.relatedVehicleId;
    }
    if (command.relatedDriverId) {
      createIncidentInput.relatedDriverId = command.relatedDriverId;
    }
    const createdIncident = await this.incidentService.createIncidentForCommit(
      createIncidentInput,
      requestId,
    );
    const incident = session.agentId
      ? await this.incidentService.updateIncidentForCommit(
          createdIncident.incidentId,
          {
            assignedTo: session.agentId,
          },
          requestId,
        )
      : createdIncident;
    const updatedSession = this.callcenterService.recordIncidentTransfer(
      callId,
      incident.incidentId,
      requestId,
    );

    return toApiSuccessEnvelope(
      { session: updatedSession, incident },
      requestId,
    );
  }
}
