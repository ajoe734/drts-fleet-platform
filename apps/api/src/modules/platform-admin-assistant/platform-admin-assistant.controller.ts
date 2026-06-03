import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { CurrentIdentity } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { PlatformAdminAssistantService } from "./platform-admin-assistant.service";
import type {
  CreatePlatformAdminAssistantMessageCommand,
  ExecutePlatformAdminAssistantActionCommand,
  PlatformAdminAssistantActionCommand,
  CreatePlatformAdminAssistantSessionCommand,
  PlatformAdminAssistantSubmitDispatchPacketCommand,
} from "./platform-admin-assistant.types";

@Controller("platform-admin/assistant")
export class PlatformAdminAssistantController {
  constructor(
    private readonly platformAdminAssistantService: PlatformAdminAssistantService,
  ) {}

  @Get("sessions")
  listSessions(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: this.platformAdminAssistantService.listSessions(identity),
      },
      requestId,
    );
  }

  @Post("sessions")
  createSession(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() command: CreatePlatformAdminAssistantSessionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.platformAdminAssistantService.createSession(identity, command),
      requestId,
    );
  }

  @Get("sessions/:sessionId/messages")
  listMessages(
    @Param("sessionId") sessionId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: this.platformAdminAssistantService.listMessages(
          sessionId,
          identity,
        ),
      },
      requestId,
    );
  }

  @Post("sessions/:sessionId/messages")
  async createMessage(
    @Param("sessionId") sessionId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() command: CreatePlatformAdminAssistantMessageCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.platformAdminAssistantService.createMessage(
        sessionId,
        identity,
        command,
      ),
      requestId,
    );
  }

  @Get("sessions/:sessionId/plans")
  listPlans(
    @Param("sessionId") sessionId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: this.platformAdminAssistantService.listPlans(
          sessionId,
          identity,
        ),
      },
      requestId,
    );
  }

  @Post("sessions/:sessionId/actions/preview")
  previewAction(
    @Param("sessionId") sessionId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() command: PlatformAdminAssistantActionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.platformAdminAssistantService.previewAction(
        sessionId,
        identity,
        command,
      ),
      requestId,
    );
  }

  @Post("sessions/:sessionId/actions/execute")
  executeAction(
    @Param("sessionId") sessionId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() command: ExecutePlatformAdminAssistantActionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.platformAdminAssistantService.executeAction(
        sessionId,
        identity,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("sessions/:sessionId/dev/dispatch-packets")
  submitDispatchPacket(
    @Param("sessionId") sessionId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() command: PlatformAdminAssistantSubmitDispatchPacketCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.platformAdminAssistantService.submitDispatchPacket(
        sessionId,
        identity,
        command,
      ),
      requestId,
    );
  }

  @Get("sessions/:sessionId/dev/tasks/:taskId/status")
  getTaskRuntimeStatus(
    @Param("sessionId") sessionId: string,
    @Param("taskId") taskId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.platformAdminAssistantService.getTaskRuntimeStatus(
        sessionId,
        identity,
        taskId,
      ),
      requestId,
    );
  }
}
