import { Body, Controller, Get, Headers, Post } from "@nestjs/common";

import type {
  ArchiveNotificationsCommand,
  MarkNotificationsReadCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { AuditNotificationService } from "./audit-notification.service";

@Controller("notifications")
export class NotificationsController {
  constructor(
    private readonly auditNotificationService: AuditNotificationService,
  ) {}

  @Get()
  listNotifications(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.auditNotificationService.listNotifications(),
      },
      requestId,
    );
  }

  @Post("read")
  markNotificationsRead(
    @Body() command: MarkNotificationsReadCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.auditNotificationService.markNotificationsRead(command, requestId),
      requestId,
    );
  }

  @Post("archive")
  archiveNotifications(
    @Body() command: ArchiveNotificationsCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.auditNotificationService.archiveNotifications(command, requestId),
      requestId,
    );
  }

  @Get("summary")
  getNotificationSummary(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      this.auditNotificationService.getNotificationSummary(),
      requestId,
    );
  }
}
