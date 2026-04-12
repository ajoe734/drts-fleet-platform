import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import type {
  AttachCallRecordingCommand,
  CloseCallSessionCommand,
  OpenCallSessionCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { CallcenterService } from "./callcenter.service";

@Controller("callcenter")
export class CallcenterController {
  constructor(private readonly callcenterService: CallcenterService) {}

  @Get("sessions")
  listCallSessions(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      { items: this.callcenterService.listCallSessions() },
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
  getCallSession(
    @Param("callId") callId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.callcenterService.getCallSession(callId),
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
}
