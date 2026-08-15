import { Body, Controller, Get, Headers, Post } from "@nestjs/common";

import type { MarkNotificationsReadCommand } from "@drts/contracts";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
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
    @CurrentIdentity() identity?: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (identity?.realm === "driver") {
      const actorId = identity.actorId;
      const notifications = this.auditNotificationService.listNotifications();
      for (const id of command?.notificationIds ?? []) {
        const notif = notifications.find((n) => n.notificationId === id);
        if (
          notif &&
          notif.recipientUserId &&
          notif.recipientUserId !== actorId
        ) {
          throw new ApiRequestError(
            403,
            "NOTIFICATION_ACTOR_MISMATCH",
            "Drivers can only acknowledge notifications assigned to their own identity.",
            {
              notificationId: id,
              actorId,
              recipientUserId: notif.recipientUserId,
            },
          );
        }
      }
    }

    return toApiSuccessEnvelope(
      this.auditNotificationService.markNotificationsRead(command, requestId),
      requestId,
    );
  }
}
