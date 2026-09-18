import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import type {
  ConfirmDriverSosAttachmentUploadCommand,
  CreateDriverSosAttachmentUploadIntentCommand,
  RecordDriverSosOpsAlertRenderedCommand,
  SubmitDriverSosEventCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
  type BootstrapRequestIdentity,
} from "../../common/auth";
import { DriverSosService } from "./driver-sos.service";

@RequireRealms("driver")
@RequireScopes("incident:write")
@Controller("driver/sos-events")
export class DriverSosController {
  constructor(private readonly driverSosService: DriverSosService) {}

  @Post()
  async submitSosEvent(
    @Body() command: SubmitDriverSosEventCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.driverSosService.submitSosEvent(command, identity, requestId),
      requestId,
    );
  }

  @Post(":sosEventId/attachments/upload-intents")
  async createAttachmentUploadIntent(
    @Param("sosEventId") sosEventId: string,
    @Body() command: CreateDriverSosAttachmentUploadIntentCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.driverSosService.createAttachmentUploadIntent(
        sosEventId,
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Post(":sosEventId/attachments/confirm")
  async confirmAttachmentUpload(
    @Param("sosEventId") sosEventId: string,
    @Body() command: ConfirmDriverSosAttachmentUploadCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.driverSosService.confirmAttachmentUpload(
        sosEventId,
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Get(":sosEventId/attachments")
  async listAttachments(
    @Param("sosEventId") sosEventId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.driverSosService.listAttachments(sosEventId, identity),
      requestId,
    );
  }

  @Post(":sosEventId/attachments/:attachmentId/retry-scan")
  async retryAttachmentScan(
    @Param("sosEventId") sosEventId: string,
    @Param("attachmentId") attachmentId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.driverSosService.retryAttachmentScan(
        sosEventId,
        attachmentId,
        identity,
        requestId,
      ),
      requestId,
    );
  }
}

@RequireRealms("ops")
@Controller("ops/driver-sos")
export class OpsDriverSosController {
  constructor(private readonly driverSosService: DriverSosService) {}

  @Post("alerts/rendered")
  async recordAlertsRendered(
    @Body() command: RecordDriverSosOpsAlertRenderedCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.driverSosService.recordOpsAlertsRendered(
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Get("metrics/alert-latency")
  @RequireScopes("incident:read")
  async getAlertLatencySummary(
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.driverSosService.getOpsAlertLatencySummary(
        {
          ...(from !== undefined ? { from } : {}),
          ...(to !== undefined ? { to } : {}),
        },
        identity,
      ),
      requestId,
    );
  }
}
