import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import type {
  ApproveRegulatoryNotificationCommand,
  AcknowledgeRegulatoryNotificationCommand,
  CreateRegulatoryNotificationCommand,
  SubmitRegulatoryNotificationCommand,
  SubmitRegulatoryNotificationReviewCommand,
} from "@drts/contracts";

import { toApiListData, toApiSuccessEnvelope } from "../../common/api-envelope";
import { CurrentIdentity, RequireRealms } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { RegulatoryReportingService } from "./regulatory-reporting.service";

@Controller("regulatory")
@RequireRealms("platform", "ops")
export class RegulatoryReportingController {
  constructor(
    private readonly regulatoryReportingService: RegulatoryReportingService,
  ) {}

  @Get("notifications")
  listNotifications(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      toApiListData(this.regulatoryReportingService.listNotifications()),
      requestId,
    );
  }

  @Get("notifications/:notificationId")
  getNotification(
    @Param("notificationId") notificationId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryReportingService.getNotification(notificationId),
      requestId,
    );
  }

  @Post("notifications")
  createNotification(
    @Body() command: CreateRegulatoryNotificationCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryReportingService.createNotification(
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Post("notifications/:notificationId/submit-review")
  submitReview(
    @Param("notificationId") notificationId: string,
    @Body() command: SubmitRegulatoryNotificationReviewCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryReportingService.submitReview(
        notificationId,
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Post("notifications/:notificationId/approve")
  approveReview(
    @Param("notificationId") notificationId: string,
    @Body() command: ApproveRegulatoryNotificationCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryReportingService.approveReview(
        notificationId,
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Post("notifications/:notificationId/submit")
  submitNotification(
    @Param("notificationId") notificationId: string,
    @Body() command: SubmitRegulatoryNotificationCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryReportingService.submitNotification(
        notificationId,
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Post("notifications/:notificationId/acknowledge")
  acknowledgeNotification(
    @Param("notificationId") notificationId: string,
    @Body() command: AcknowledgeRegulatoryNotificationCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryReportingService.acknowledgeNotification(
        notificationId,
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }
}
