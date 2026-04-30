import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

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
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { CurrentIdentity, RequireRealms } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { ComplaintService } from "../complaint/complaint.service";
import { CallcenterService } from "./callcenter.service";

@Controller("callcenter")
export class CallcenterController {
  constructor(
    private readonly callcenterService: CallcenterService,
    private readonly complaintService: ComplaintService,
  ) {}

  @Get("sessions")
  @RequireRealms("platform", "ops")
  listCallSessions(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      { items: this.callcenterService.listCallSessions(requestId, identity) },
      requestId,
    );
  }

  @Post("sessions")
  openCallSession(
    @Body() command: OpenCallSessionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.callcenterService.openCallSession(command, requestId),
      requestId,
    );
  }

  @Get("sessions/:callId")
  @RequireRealms("platform", "ops")
  getCallSession(
    @Param("callId") callId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.callcenterService.getCallSession(callId, requestId, identity),
      requestId,
    );
  }

  @Post("sessions/:callId/announce-identity")
  announceAgentIdentity(
    @Param("callId") callId: string,
    @Body() command: AnnounceCallAgentIdentityCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.callcenterService.announceAgentIdentity(callId, command, requestId),
      requestId,
    );
  }

  @Post("sessions/:callId/close")
  closeCallSession(
    @Param("callId") callId: string,
    @Body() command: CloseCallSessionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.callcenterService.closeCallSession(callId, command, requestId),
      requestId,
    );
  }

  @Post("sessions/:callId/eta")
  quoteCallEta(
    @Param("callId") callId: string,
    @Body() command: QuoteCallEtaCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.callcenterService.quoteEta(callId, command, requestId),
      requestId,
    );
  }

  @Post("sessions/:callId/link-order")
  linkCallOrder(
    @Param("callId") callId: string,
    @Body() command: LinkCallOrderCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.callcenterService.linkOrderToExistingSession(
        callId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("sessions/:callId/recording-callback")
  attachRecordingCallback(
    @Param("callId") callId: string,
    @Body() command: AttachCallRecordingCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.callcenterService.attachRecordingCallback(
        callId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Get("callbacks")
  listCallbackTasks(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.callcenterService.listCallbackTasks(),
      },
      requestId,
    );
  }

  @Post("sessions/:callId/callbacks")
  createCallbackTask(
    @Param("callId") callId: string,
    @Body() command: CreateCallbackTaskCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.callcenterService.createCallbackTask(callId, command, requestId),
      requestId,
    );
  }

  @Post("callbacks/:callbackTaskId/complete")
  completeCallbackTask(
    @Param("callbackTaskId") callbackTaskId: string,
    @Body() command: CompleteCallbackTaskCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.callcenterService.completeCallbackTask(
        callbackTaskId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("sessions/:callId/transfer-to-complaint")
  transferCallToComplaint(
    @Param("callId") callId: string,
    @Body() command: TransferCallToComplaintCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const session = this.callcenterService.getCallSession(callId);
    const complaintCase = this.complaintService.createComplaintCase(
      {
        caseSource: "phone",
        relatedOrderId: command.relatedOrderId ?? session.linkedOrderId,
        relatedCallId: callId,
        category: command.category,
        severity: command.severity,
        description: command.description,
      },
      requestId,
    );

    return toApiSuccessEnvelope(
      {
        session: this.callcenterService.linkCaseToCallSession(
          callId,
          complaintCase.caseNo,
          requestId,
        ),
        complaintCase,
      },
      requestId,
    );
  }
}
