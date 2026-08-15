import { Body, Controller, Get, Headers, Post } from "@nestjs/common";

import type { MarkNotificationsReadCommand } from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
  type BootstrapRequestIdentity,
} from "../../common/auth";
import { AuditNotificationService } from "./audit-notification.service";

@Controller("notifications")
export class NotificationsController {
  constructor(
    private readonly auditNotificationService: AuditNotificationService,
  ) {}

  @Get()
  @RequireRealms("system", "platform", "ops")
  @RequireScopes("notifications:read")
  listNotifications(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.auditNotificationService.listNotifications(),
      },
      requestId,
    );
  }

  @Post("read")
  @RequireRealms("system", "platform", "ops", "driver")
  @RequireScopes("notifications:write")
  markNotificationsRead(
    @Body() command: MarkNotificationsReadCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.auditNotificationService.markNotificationsRead(
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }
}
